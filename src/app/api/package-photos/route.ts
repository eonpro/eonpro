import { instantToCalendarDate } from '@/lib/utils/platform-calendar';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { withPharmacyAccessAuth, type AuthUser } from '@/lib/auth/middleware';
import { prisma, basePrisma, withoutClinicFilter, getClinicContext } from '@/lib/db';
import { handleApiError } from '@/domains/shared/errors';
import { uploadToS3, generateSignedUrl } from '@/lib/integrations/aws/s3Service';
import { FileCategory, isS3Enabled } from '@/lib/integrations/aws/s3Config';
import { logger } from '@/lib/logger';
import { decryptPHI } from '@/lib/security/phi-encryption';
import {
  getTimezoneAwareBoundaries,
  midnightInTz,
  getDatePartsInTz,
  dbDateToString,
  toCalendarDateStringInTz,
} from '@/lib/utils/timezone';
import { z } from 'zod';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];
const DEFAULT_TIMEZONE = 'America/New_York';

const PHARMACY_ACCESS_ROLES_FILTER = Prisma.sql`AND u."role"::text IN (${Prisma.join(['SUPER_ADMIN', 'ADMIN', 'STAFF', 'PHARMACY_REP'])})`;

const VALID_IANA_TZ = /^[A-Za-z_/+-]+$/;
function tzLiteral(tz: string): Prisma.Sql {
  if (!VALID_IANA_TZ.test(tz)) return Prisma.raw(`'America/New_York'`);
  return Prisma.raw(`'${tz}'`);
}

async function resolveClinicTimezone(clinicId: number | null | undefined): Promise<string> {
  if (!clinicId) return DEFAULT_TIMEZONE;
  try {
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { timezone: true },
    });
    return clinic?.timezone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function resolveRequestClinicId(user: AuthUser): number | undefined {
  // Prefer request-scoped active clinic (subdomain/session), then user default clinic.
  // This avoids accidentally widening to global datasets when clinic context is absent.
  return getClinicContext() ?? user.clinicId;
}

function isGlobalScope(url: URL): boolean {
  return (url.searchParams.get('scope') ?? '').toLowerCase() === 'global';
}

// ---------------------------------------------------------------------------
// Tracking Resolution — check Order, ShippingUpdate, ShipmentLabel
// ---------------------------------------------------------------------------

interface TrackingInfo {
  trackingNumber: string;
  trackingSource: string;
}

async function resolveTracking(
  orderId: number | null,
  lifefileId: string,
  patientId: number | null
): Promise<TrackingInfo | null> {
  return withoutClinicFilter(async () => {
    // 1. Order.trackingNumber (set by LifeFile or manually)
    if (orderId) {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { trackingNumber: true },
      });
      if (order?.trackingNumber) {
        return { trackingNumber: order.trackingNumber, trackingSource: 'order' };
      }
    }

    // 2. PatientShippingUpdate — LifeFile webhook or manual shipping entries
    const shippingUpdate = await prisma.patientShippingUpdate.findFirst({
      where: {
        OR: [{ lifefileOrderId: lifefileId }, ...(orderId ? [{ orderId }] : [])],
      },
      orderBy: { createdAt: 'desc' },
      select: { trackingNumber: true, source: true },
    });
    if (shippingUpdate?.trackingNumber) {
      return {
        trackingNumber: shippingUpdate.trackingNumber,
        trackingSource:
          shippingUpdate.source === 'lifefile' ? 'lifefile_webhook' : 'shipping_update',
      };
    }

    // 3. ShipmentLabel — FedEx integration labels
    if (patientId && orderId) {
      const label = await prisma.shipmentLabel.findFirst({
        where: { patientId, orderId },
        orderBy: { createdAt: 'desc' },
        select: { trackingNumber: true },
      });
      if (label?.trackingNumber) {
        return { trackingNumber: label.trackingNumber, trackingSource: 'fedex_label' };
      }
    } else if (patientId) {
      const label = await prisma.shipmentLabel.findFirst({
        where: { patientId },
        orderBy: { createdAt: 'desc' },
        select: { trackingNumber: true },
      });
      if (label?.trackingNumber) {
        return { trackingNumber: label.trackingNumber, trackingSource: 'fedex_label' };
      }
    }

    return null;
  });
}

// ---------------------------------------------------------------------------
// Performance Report Response Builder
// ---------------------------------------------------------------------------

interface PerformanceInterval {
  label: string;
  date?: string;
  hour?: number;
  total: number;
  matched: number;
  unmatched: number;
  matchRate: number;
  reps: Array<{ userId: number; name: string; total: number; matched: number }>;
}

function buildPerformanceResponse(
  intervals: PerformanceInterval[],
  grandTotal: number,
  grandMatched: number,
  granularity: string,
  rangeStart: Date,
  rangeEnd: Date,
  repRows: Array<{
    captured_by_id: number;
    first_name: string;
    last_name: string;
    total: bigint;
    matched: bigint;
  }>
) {
  const repTotals = new Map<
    number,
    { userId: number; name: string; total: number; matched: number }
  >();
  for (const r of repRows) {
    const existing = repTotals.get(r.captured_by_id);
    if (existing) {
      existing.total += Number(r.total);
      existing.matched += Number(r.matched);
    } else {
      repTotals.set(r.captured_by_id, {
        userId: r.captured_by_id,
        name: `${r.first_name} ${r.last_name}`,
        total: Number(r.total),
        matched: Number(r.matched),
      });
    }
  }

  const reps = Array.from(repTotals.values())
    .map((r) => ({ ...r, matchRate: r.total > 0 ? Math.round((r.matched / r.total) * 100) : 0 }))
    .sort((a, b) => b.total - a.total);

  const topRep = reps[0] ?? null;
  const intervalsWithData = intervals.filter((i) => i.total > 0).length;

  return NextResponse.json({
    success: true,
    data: {
      intervals,
      summary: {
        totalPackages: grandTotal,
        totalMatched: grandMatched,
        totalUnmatched: grandTotal - grandMatched,
        matchRate: grandTotal > 0 ? Math.round((grandMatched / grandTotal) * 100) : 0,
        avgPerInterval: intervalsWithData > 0 ? Math.round(grandTotal / intervalsWithData) : 0,
        totalReps: reps.length,
        topRep,
      },
      reps,
      range: {
        from: instantToCalendarDate(rangeStart),
        to: instantToCalendarDate(new Date(rangeEnd.getTime() - 86400000)),
      },
      granularity,
    },
  });
}

// ---------------------------------------------------------------------------
// POST — Upload a package photo with LifeFile ID lookup + tracking resolution
// ---------------------------------------------------------------------------

async function postHandler(req: NextRequest, user: AuthUser) {
  try {
    const formData = (await req.formData()) as unknown as globalThis.FormData;
    const lifefileId = formData.get('lifefileId') as string | null;
    const photo = formData.get('photo') as File | null;
    const notes = formData.get('notes') as string | null;
    const manualTracking = formData.get('trackingNumber') as string | null;

    if (!user.clinicId) {
      return NextResponse.json(
        { error: 'Clinic context required. Please select a clinic.' },
        { status: 400 }
      );
    }

    if (!lifefileId || !lifefileId.trim()) {
      return NextResponse.json({ error: 'LifeFile ID is required' }, { status: 400 });
    }

    if (!photo) {
      return NextResponse.json({ error: 'Photo is required' }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.includes(photo.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload JPEG, PNG, or WebP images.' },
        { status: 400 }
      );
    }

    if (photo.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum size is 10MB.' }, { status: 400 });
    }

    const trimmedId = lifefileId.trim();

    // --- Match LifeFile ID globally across all clinics ---
    const {
      matchedOrder,
      matchedPatientId: resolvedPatientId,
      matchStrategy: resolvedStrategy,
    } = await withoutClinicFilter(async () => {
      const order = await prisma.order.findFirst({
        where: { lifefileOrderId: trimmedId },
        select: { id: true, patientId: true, clinicId: true, trackingNumber: true },
      });

      if (order) {
        return {
          matchedOrder: order,
          matchedPatientId: order.patientId,
          matchStrategy: 'lifefileOrderId' as const,
        };
      }

      const patient = await prisma.patient.findFirst({
        where: { lifefileId: trimmedId },
        select: { id: true },
      });

      if (patient) {
        return {
          matchedOrder: null,
          matchedPatientId: patient.id,
          matchStrategy: 'patientLifefileId' as const,
        };
      }

      return { matchedOrder: null, matchedPatientId: null, matchStrategy: null };
    });

    let matchedPatientId = resolvedPatientId;
    let matchStrategy: string | null = resolvedStrategy;

    // --- Resolve tracking number ---
    let trackingNumber: string | null = null;
    let trackingSource: string | null = null;

    if (manualTracking?.trim()) {
      trackingNumber = manualTracking.trim();
      trackingSource = 'manual';
    } else {
      const resolved = await resolveTracking(matchedOrder?.id ?? null, trimmedId, matchedPatientId);
      if (resolved) {
        trackingNumber = resolved.trackingNumber;
        trackingSource = resolved.trackingSource;
      }
    }

    // --- Upload photo to S3 ---
    const buffer = Buffer.from(await photo.arrayBuffer());
    const s3Result = await uploadToS3({
      file: buffer,
      fileName: `pkg-${trimmedId}-${Date.now()}.${photo.type.split('/')[1] || 'jpg'}`,
      category: FileCategory.PACKAGE_PHOTOS,
      patientId: matchedPatientId ?? undefined,
      contentType: photo.type,
      metadata: {
        lifefileId: trimmedId,
        capturedById: String(user.id),
      },
    });

    // --- Create database record ---
    const packagePhoto = await prisma.packagePhoto.create({
      data: {
        clinicId: user.clinicId,
        lifefileId: trimmedId,
        trackingNumber,
        trackingSource,
        patientId: matchedPatientId,
        orderId: matchedOrder?.id ?? null,
        s3Key: s3Result.key,
        s3Url: s3Result.url,
        contentType: photo.type,
        fileSize: photo.size,
        capturedById: user.id,
        matched: !!matchedPatientId,
        matchedAt: matchedPatientId ? new Date() : null,
        matchStrategy,
        notes: notes?.trim() || null,
      },
    });

    logger.info('[PackagePhoto] Photo captured', {
      packagePhotoId: packagePhoto.id,
      lifefileId: trimmedId,
      trackingNumber: trackingNumber ?? 'none',
      trackingSource: trackingSource ?? 'none',
      matched: !!matchedPatientId,
      matchStrategy,
      capturedById: user.id,
      clinicId: user.clinicId,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: packagePhoto.id,
        lifefileId: trimmedId,
        trackingNumber,
        trackingSource,
        matched: !!matchedPatientId,
        matchStrategy,
        patientId: matchedPatientId,
        orderId: matchedOrder?.id ?? null,
        s3Url: s3Result.url,
        createdAt: packagePhoto.createdAt,
      },
    });
  } catch (error: unknown) {
    return handleApiError(error, { context: { route: 'POST /api/package-photos' } });
  }
}

export const POST = withPharmacyAccessAuth(postHandler);

// ---------------------------------------------------------------------------
// GET — List/search package photos with filters
// ---------------------------------------------------------------------------

const searchSchema = z.object({
  search: z.string().optional(),
  matched: z.enum(['true', 'false', 'all']).optional().default('all'),
  assignedClinicId: z.coerce.number().int().positive().optional(),
  assignedFilter: z.enum(['all', 'unassigned', 'assigned']).optional().default('all'),
  period: z
    .enum(['today', 'yesterday', 'last7', 'last30', 'week', 'month', 'custom', 'all'])
    .optional()
    .default('all'),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  sortBy: z.enum(['createdAt', 'lifefileId']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

async function getHandler(req: NextRequest, user: AuthUser) {
  try {
    const url = new URL(req.url);

    // Assignable clinics mode — returns active clinics for unmatched package assignment
    if (url.searchParams.get('assignable-clinics') === 'true') {
      const clinics = await basePrisma.clinic.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true, subdomain: true },
        orderBy: { name: 'asc' },
      });
      return NextResponse.json({ success: true, data: clinics });
    }

    // Stats mode — aggregate counts for the audit dashboard
    if (url.searchParams.get('stats') === 'true') {
      const clinicId = isGlobalScope(url) ? undefined : resolveRequestClinicId(user);
      const clinicWhere = clinicId ? { clinicId } : {};
      const tz = await resolveClinicTimezone(clinicId);
      const buildStats = async (whereBase: Record<string, unknown>, timezone: string) => {
        const { todayStart, yesterdayStart, weekStart, monthStart } =
          getTimezoneAwareBoundaries(timezone);
        const [today, yesterday, thisWeek, thisMonth, matched, total] = await Promise.all([
          prisma.packagePhoto.count({ where: { ...whereBase, createdAt: { gte: todayStart } } }),
          prisma.packagePhoto.count({
            where: { ...whereBase, createdAt: { gte: yesterdayStart, lt: todayStart } },
          }),
          prisma.packagePhoto.count({ where: { ...whereBase, createdAt: { gte: weekStart } } }),
          prisma.packagePhoto.count({ where: { ...whereBase, createdAt: { gte: monthStart } } }),
          prisma.packagePhoto.count({ where: { ...whereBase, matched: true } }),
          prisma.packagePhoto.count({ where: whereBase }),
        ]);
        return {
          today,
          yesterday,
          thisWeek,
          thisMonth,
          matched,
          total,
          matchRate: total > 0 ? Math.round((matched / total) * 100) : 0,
          unmatched: total - matched,
        };
      };

      const scopedStats = await buildStats(clinicWhere, tz);
      const globalStats = await buildStats({}, await resolveClinicTimezone(undefined));

      return NextResponse.json({
        success: true,
        data: {
          ...scopedStats,
          global: globalStats,
        },
      });
    }

    // Demographics mode — detailed breakdowns for the analytics dashboard
    if (url.searchParams.get('demographics') === 'true') {
      const clinicId = isGlobalScope(url) ? undefined : resolveRequestClinicId(user);
      const clinicFilterSql = clinicId ? Prisma.sql`AND "clinicId" = ${clinicId}` : Prisma.empty;
      const clinicFilterSqlPP = clinicId
        ? Prisma.sql`AND pp."clinicId" = ${clinicId}`
        : Prisma.empty;
      const tz = await resolveClinicTimezone(clinicId);
      const tzSql = tzLiteral(tz);
      const { todayStart, monthStart, year, month, day } = getTimezoneAwareBoundaries(tz);
      const now = new Date();

      const fourteenDaysAgo = midnightInTz(year, month, day - 13, tz);

      const [
        dailyVolumeRaw,
        repBreakdownRaw,
        trackingSourceRaw,
        matchedThisMonth,
        unmatchedThisMonth,
        hourlyRaw,
      ] = await Promise.all([
        // Daily volume for last 14 days (clinic-tz aware)
        // Return date as text to avoid JS Date parsing timezone drift
        prisma.$queryRaw<Array<{ day: string; total: bigint; matched: bigint }>>`
          SELECT
            TO_CHAR(DATE("createdAt" AT TIME ZONE ${tzSql}), 'YYYY-MM-DD') as day,
            COUNT(*)::bigint as total,
            COUNT(*) FILTER (WHERE matched = true)::bigint as matched
          FROM "PackagePhoto"
          WHERE "createdAt" >= ${fourteenDaysAgo}
            ${clinicFilterSql}
          GROUP BY 1
          ORDER BY 1 ASC
        `,

        // Per-rep breakdown (this month) — only pharmacy-access roles
        prisma.$queryRaw<
          Array<{
            captured_by_id: number;
            first_name: string;
            last_name: string;
            total: bigint;
            matched: bigint;
          }>
        >`
          SELECT
            pp."capturedById" as captured_by_id,
            u."firstName" as first_name,
            u."lastName" as last_name,
            COUNT(*)::bigint as total,
            COUNT(*) FILTER (WHERE pp.matched = true)::bigint as matched
          FROM "PackagePhoto" pp
          JOIN "User" u ON u.id = pp."capturedById"
          WHERE pp."createdAt" >= ${monthStart}
            ${clinicFilterSqlPP}
            ${PHARMACY_ACCESS_ROLES_FILTER}
          GROUP BY pp."capturedById", u."firstName", u."lastName"
          ORDER BY total DESC
          LIMIT 20
        `,

        // Tracking source breakdown (this month)
        prisma.$queryRaw<Array<{ source: string | null; total: bigint }>>`
          SELECT
            "trackingSource" as source,
            COUNT(*)::bigint as total
          FROM "PackagePhoto"
          WHERE "createdAt" >= ${monthStart}
            ${clinicFilterSql}
          GROUP BY "trackingSource"
          ORDER BY total DESC
        `,

        // Matched this month
        prisma.packagePhoto.count({
          where: {
            ...(clinicId ? { clinicId } : {}),
            createdAt: { gte: monthStart },
            matched: true,
          },
        }),

        // Unmatched this month
        prisma.packagePhoto.count({
          where: {
            ...(clinicId ? { clinicId } : {}),
            createdAt: { gte: monthStart },
            matched: false,
          },
        }),

        // Hourly distribution (today, clinic-tz aware)
        prisma.$queryRaw<Array<{ hour: number; total: bigint }>>`
          SELECT
            EXTRACT(HOUR FROM "createdAt" AT TIME ZONE ${tzSql})::int as hour,
            COUNT(*)::bigint as total
          FROM "PackagePhoto"
          WHERE "createdAt" >= ${todayStart}
            AND "createdAt" < ${now}
            ${clinicFilterSql}
          GROUP BY 1
          ORDER BY 1 ASC
        `,
      ]);

      // Fill in missing days with zeros for the daily chart
      const dailyVolume: Array<{
        date: string;
        total: number;
        matched: number;
        unmatched: number;
      }> = [];
      const dayMap = new Map(
        dailyVolumeRaw.map((r) => [r.day, { total: Number(r.total), matched: Number(r.matched) }])
      );

      for (let i = 0; i < 14; i++) {
        const offsetDays = day - 13 + i;
        const dayMidnight = midnightInTz(year, month, offsetDays, tz);
        const key = toCalendarDateStringInTz(
          new Date(dayMidnight.getTime() + 12 * 60 * 60 * 1000),
          tz
        );
        const data = dayMap.get(key) ?? { total: 0, matched: 0 };
        dailyVolume.push({
          date: key,
          total: data.total,
          matched: data.matched,
          unmatched: data.total - data.matched,
        });
      }

      // Calculate avg daily volume (last 14 days)
      const totalLast14 = dailyVolume.reduce((s, d) => s + d.total, 0);
      const avgDaily = Math.round(totalLast14 / 14);

      // Fill hourly distribution (0-23)
      const hourMap = new Map(hourlyRaw.map((r) => [r.hour, Number(r.total)]));
      const hourlyDistribution = Array.from({ length: 24 }, (_, h) => ({
        hour: h,
        total: hourMap.get(h) ?? 0,
      }));

      // Peak hour
      const peakHour = hourlyDistribution.reduce(
        (max, h) => (h.total > max.total ? h : max),
        hourlyDistribution[0]
      );

      return NextResponse.json({
        success: true,
        data: {
          dailyVolume,
          avgDaily,
          repBreakdown: repBreakdownRaw.map((r) => ({
            userId: r.captured_by_id,
            name: `${r.first_name} ${r.last_name}`,
            total: Number(r.total),
            matched: Number(r.matched),
            matchRate:
              Number(r.total) > 0 ? Math.round((Number(r.matched) / Number(r.total)) * 100) : 0,
          })),
          trackingSourceBreakdown: trackingSourceRaw.map((r) => ({
            source: r.source ?? 'unknown',
            total: Number(r.total),
          })),
          monthlyMatchRate: {
            matched: matchedThisMonth,
            unmatched: unmatchedThisMonth,
            total: matchedThisMonth + unmatchedThisMonth,
            rate:
              matchedThisMonth + unmatchedThisMonth > 0
                ? Math.round((matchedThisMonth / (matchedThisMonth + unmatchedThisMonth)) * 100)
                : 0,
          },
          hourlyDistribution,
          peakHour: { hour: peakHour.hour, count: peakHour.total },
        },
      });
    }

    // Performance report mode — hourly/daily/weekly granularity with per-rep drill-down
    if (url.searchParams.get('performance-report') === 'true') {
      const clinicId = isGlobalScope(url) ? undefined : resolveRequestClinicId(user);
      const clinicFilterSql = clinicId ? Prisma.sql`AND "clinicId" = ${clinicId}` : Prisma.empty;
      const clinicFilterSqlPP = clinicId
        ? Prisma.sql`AND pp."clinicId" = ${clinicId}`
        : Prisma.empty;
      const tz = await resolveClinicTimezone(clinicId);
      const tzSql = tzLiteral(tz);
      const bounds = getTimezoneAwareBoundaries(tz);

      const granularity = (url.searchParams.get('granularity') ?? 'daily') as
        | 'hourly'
        | 'daily'
        | 'weekly';
      const fromParam = url.searchParams.get('from');
      const toParam = url.searchParams.get('to');
      const repIdParam = url.searchParams.get('repId');
      const repId = repIdParam ? parseInt(repIdParam, 10) : null;

      let rangeStart: Date;
      let rangeEnd: Date;

      if (fromParam) {
        const [fy, fm, fd] = fromParam.split('-').map(Number);
        rangeStart = midnightInTz(fy, fm - 1, fd, tz);
      } else {
        if (granularity === 'hourly') {
          rangeStart = bounds.todayStart;
        } else if (granularity === 'weekly') {
          rangeStart = midnightInTz(bounds.year, bounds.month, bounds.day - 27, tz);
        } else {
          rangeStart = midnightInTz(bounds.year, bounds.month, bounds.day - 6, tz);
        }
      }

      if (toParam) {
        const [ty, tm, td] = toParam.split('-').map(Number);
        rangeEnd = midnightInTz(ty, tm - 1, td + 1, tz);
      } else {
        rangeEnd = midnightInTz(bounds.year, bounds.month, bounds.day + 1, tz);
      }

      const repFilter = repId ? Prisma.sql`AND pp."capturedById" = ${repId}` : Prisma.empty;
      const repFilterSimple = repId ? Prisma.sql`AND "capturedById" = ${repId}` : Prisma.empty;

      if (granularity === 'hourly') {
        const [intervalRows, repRows] = await Promise.all([
          prisma.$queryRaw<Array<{ hour: number; day: Date; total: bigint; matched: bigint }>>`
            SELECT
              DATE("createdAt" AT TIME ZONE ${tzSql}) as day,
              EXTRACT(HOUR FROM "createdAt" AT TIME ZONE ${tzSql})::int as hour,
              COUNT(*)::bigint as total,
              COUNT(*) FILTER (WHERE matched = true)::bigint as matched
            FROM "PackagePhoto"
            WHERE "createdAt" >= ${rangeStart} AND "createdAt" < ${rangeEnd}
              ${clinicFilterSql}
              ${repFilterSimple}
            GROUP BY 1, 2
            ORDER BY 1 ASC, 2 ASC
          `,
          prisma.$queryRaw<
            Array<{
              hour: number;
              day: Date;
              captured_by_id: number;
              first_name: string;
              last_name: string;
              total: bigint;
              matched: bigint;
            }>
          >`
            SELECT
              DATE(pp."createdAt" AT TIME ZONE ${tzSql}) as day,
              EXTRACT(HOUR FROM pp."createdAt" AT TIME ZONE ${tzSql})::int as hour,
              pp."capturedById" as captured_by_id,
              u."firstName" as first_name,
              u."lastName" as last_name,
              COUNT(*)::bigint as total,
              COUNT(*) FILTER (WHERE pp.matched = true)::bigint as matched
            FROM "PackagePhoto" pp
            JOIN "User" u ON u.id = pp."capturedById"
            WHERE pp."createdAt" >= ${rangeStart} AND pp."createdAt" < ${rangeEnd}
              ${clinicFilterSqlPP}
              ${PHARMACY_ACCESS_ROLES_FILTER} ${repFilter}
            GROUP BY 1, 2, pp."capturedById", u."firstName", u."lastName"
            ORDER BY 1 ASC, 2 ASC, total DESC
          `,
        ]);

        const repsByKey = new Map<
          string,
          Array<{ userId: number; name: string; total: number; matched: number }>
        >();
        for (const r of repRows) {
          const key = `${dbDateToString(new Date(r.day))}-${r.hour}`;
          if (!repsByKey.has(key)) repsByKey.set(key, []);
          repsByKey.get(key)!.push({
            userId: r.captured_by_id,
            name: `${r.first_name} ${r.last_name}`,
            total: Number(r.total),
            matched: Number(r.matched),
          });
        }

        const intervals = intervalRows.map((row) => {
          const dayKey = dbDateToString(new Date(row.day));
          const t = Number(row.total);
          const m = Number(row.matched);
          const h = row.hour;
          const ampm = h < 12 ? 'AM' : 'PM';
          const h12 = h % 12 || 12;
          return {
            label: `${h12}${ampm}–${(h12 % 12) + 1}${h < 11 || h === 23 ? ampm : h === 11 ? 'PM' : 'AM'}`,
            date: dayKey,
            hour: h,
            total: t,
            matched: m,
            unmatched: t - m,
            matchRate: t > 0 ? Math.round((m / t) * 100) : 0,
            reps: repsByKey.get(`${dayKey}-${h}`) ?? [],
          };
        });

        const grandTotal = intervals.reduce((s, i) => s + i.total, 0);
        const grandMatched = intervals.reduce((s, i) => s + i.matched, 0);

        return buildPerformanceResponse(
          intervals,
          grandTotal,
          grandMatched,
          granularity,
          rangeStart,
          rangeEnd,
          repRows
        );
      }

      if (granularity === 'weekly') {
        const [intervalRows, repRows] = await Promise.all([
          prisma.$queryRaw<Array<{ week_start: Date; total: bigint; matched: bigint }>>`
            SELECT
              DATE_TRUNC('week', "createdAt" AT TIME ZONE ${tzSql})::date as week_start,
              COUNT(*)::bigint as total,
              COUNT(*) FILTER (WHERE matched = true)::bigint as matched
            FROM "PackagePhoto"
            WHERE "createdAt" >= ${rangeStart} AND "createdAt" < ${rangeEnd}
              ${clinicFilterSql}
              ${repFilterSimple}
            GROUP BY 1
            ORDER BY 1 ASC
          `,
          prisma.$queryRaw<
            Array<{
              week_start: Date;
              captured_by_id: number;
              first_name: string;
              last_name: string;
              total: bigint;
              matched: bigint;
            }>
          >`
            SELECT
              DATE_TRUNC('week', pp."createdAt" AT TIME ZONE ${tzSql})::date as week_start,
              pp."capturedById" as captured_by_id,
              u."firstName" as first_name,
              u."lastName" as last_name,
              COUNT(*)::bigint as total,
              COUNT(*) FILTER (WHERE pp.matched = true)::bigint as matched
            FROM "PackagePhoto" pp
            JOIN "User" u ON u.id = pp."capturedById"
            WHERE pp."createdAt" >= ${rangeStart} AND pp."createdAt" < ${rangeEnd}
              ${clinicFilterSqlPP}
              ${PHARMACY_ACCESS_ROLES_FILTER} ${repFilter}
            GROUP BY 1, pp."capturedById", u."firstName", u."lastName"
            ORDER BY 1 ASC, total DESC
          `,
        ]);

        const repsByWeek = new Map<
          string,
          Array<{ userId: number; name: string; total: number; matched: number }>
        >();
        for (const r of repRows) {
          const key = dbDateToString(new Date(r.week_start));
          if (!repsByWeek.has(key)) repsByWeek.set(key, []);
          repsByWeek.get(key)!.push({
            userId: r.captured_by_id,
            name: `${r.first_name} ${r.last_name}`,
            total: Number(r.total),
            matched: Number(r.matched),
          });
        }

        const intervals = intervalRows.map((row) => {
          const ws = new Date(row.week_start);
          const we = new Date(ws.getTime() + 6 * 86400000);
          const t = Number(row.total);
          const m = Number(row.matched);
          const fmt = (d: Date) =>
            d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const weekKey = dbDateToString(ws);
          return {
            label: `${fmt(ws)} – ${fmt(we)}`,
            date: weekKey,
            total: t,
            matched: m,
            unmatched: t - m,
            matchRate: t > 0 ? Math.round((m / t) * 100) : 0,
            reps: repsByWeek.get(weekKey) ?? [],
          };
        });

        const grandTotal = intervals.reduce((s, i) => s + i.total, 0);
        const grandMatched = intervals.reduce((s, i) => s + i.matched, 0);

        return buildPerformanceResponse(
          intervals,
          grandTotal,
          grandMatched,
          granularity,
          rangeStart,
          rangeEnd,
          repRows
        );
      }

      // Default: daily granularity
      const [intervalRows, repRows] = await Promise.all([
        prisma.$queryRaw<Array<{ day: Date; total: bigint; matched: bigint }>>`
          SELECT
            DATE("createdAt" AT TIME ZONE ${tzSql}) as day,
            COUNT(*)::bigint as total,
            COUNT(*) FILTER (WHERE matched = true)::bigint as matched
          FROM "PackagePhoto"
          WHERE "createdAt" >= ${rangeStart} AND "createdAt" < ${rangeEnd}
            ${clinicFilterSql}
            ${repFilterSimple}
          GROUP BY 1
          ORDER BY 1 ASC
        `,
        prisma.$queryRaw<
          Array<{
            day: Date;
            captured_by_id: number;
            first_name: string;
            last_name: string;
            total: bigint;
            matched: bigint;
          }>
        >`
          SELECT
            DATE(pp."createdAt" AT TIME ZONE ${tzSql}) as day,
            pp."capturedById" as captured_by_id,
            u."firstName" as first_name,
            u."lastName" as last_name,
            COUNT(*)::bigint as total,
            COUNT(*) FILTER (WHERE pp.matched = true)::bigint as matched
          FROM "PackagePhoto" pp
          JOIN "User" u ON u.id = pp."capturedById"
          WHERE pp."createdAt" >= ${rangeStart} AND pp."createdAt" < ${rangeEnd}
            ${clinicFilterSqlPP}
            ${PHARMACY_ACCESS_ROLES_FILTER} ${repFilter}
          GROUP BY 1, pp."capturedById", u."firstName", u."lastName"
          ORDER BY 1 ASC, total DESC
        `,
      ]);

      const repsByDay = new Map<
        string,
        Array<{ userId: number; name: string; total: number; matched: number }>
      >();
      for (const r of repRows) {
        const key = dbDateToString(new Date(r.day));
        if (!repsByDay.has(key)) repsByDay.set(key, []);
        repsByDay.get(key)!.push({
          userId: r.captured_by_id,
          name: `${r.first_name} ${r.last_name}`,
          total: Number(r.total),
          matched: Number(r.matched),
        });
      }

      const intervals = intervalRows.map((row) => {
        const dayKey = dbDateToString(new Date(row.day));
        const t = Number(row.total);
        const m = Number(row.matched);
        return {
          label: new Date(row.day).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          }),
          date: dayKey,
          total: t,
          matched: m,
          unmatched: t - m,
          matchRate: t > 0 ? Math.round((m / t) * 100) : 0,
          reps: repsByDay.get(dayKey) ?? [],
        };
      });

      const grandTotal = intervals.reduce((s, i) => s + i.total, 0);
      const grandMatched = intervals.reduce((s, i) => s + i.matched, 0);

      return buildPerformanceResponse(
        intervals,
        grandTotal,
        grandMatched,
        granularity,
        rangeStart,
        rangeEnd,
        repRows
      );
    }

    // Daily report mode — per-day breakdown for a date range with rep details
    if (url.searchParams.get('daily-report') === 'true') {
      const clinicId = isGlobalScope(url) ? undefined : resolveRequestClinicId(user);
      const clinicFilterSql = clinicId ? Prisma.sql`AND "clinicId" = ${clinicId}` : Prisma.empty;
      const clinicFilterSqlPP = clinicId
        ? Prisma.sql`AND pp."clinicId" = ${clinicId}`
        : Prisma.empty;
      const tz = await resolveClinicTimezone(clinicId);
      const tzSql = tzLiteral(tz);
      const bounds = getTimezoneAwareBoundaries(tz);

      const fromParam = url.searchParams.get('from');
      const toParam = url.searchParams.get('to');
      const repIdParam = url.searchParams.get('repId');
      const repId = repIdParam ? parseInt(repIdParam, 10) : null;

      let rangeStart: Date;
      let rangeEnd: Date;

      if (fromParam) {
        const [fy, fm, fd] = fromParam.split('-').map(Number);
        rangeStart = midnightInTz(fy, fm - 1, fd, tz);
      } else {
        rangeStart = midnightInTz(bounds.year, bounds.month, bounds.day - 29, tz);
      }

      if (toParam) {
        const [ty, tm, td] = toParam.split('-').map(Number);
        rangeEnd = midnightInTz(ty, tm - 1, td + 1, tz);
      } else {
        rangeEnd = midnightInTz(bounds.year, bounds.month, bounds.day + 1, tz);
      }

      const repFilterSimple = repId ? Prisma.sql`AND "capturedById" = ${repId}` : Prisma.empty;
      const repFilter = repId ? Prisma.sql`AND pp."capturedById" = ${repId}` : Prisma.empty;

      const queries: [
        Promise<Array<{ day: Date; total: bigint; matched: bigint; unmatched: bigint }>>,
        Promise<
          Array<{
            day: Date;
            captured_by_id: number;
            first_name: string;
            last_name: string;
            total: bigint;
            matched: bigint;
          }>
        >,
        Promise<Array<{ hour: number; total: bigint }>> | null,
        Promise<{ first_name: string; last_name: string } | null> | null,
      ] = [
        prisma.$queryRaw`
          SELECT
            DATE("createdAt" AT TIME ZONE ${tzSql}) as day,
            COUNT(*)::bigint as total,
            COUNT(*) FILTER (WHERE matched = true)::bigint as matched,
            COUNT(*) FILTER (WHERE matched = false)::bigint as unmatched
          FROM "PackagePhoto"
          WHERE "createdAt" >= ${rangeStart} AND "createdAt" < ${rangeEnd}
            ${clinicFilterSql}
            ${repFilterSimple}
          GROUP BY 1
          ORDER BY 1 DESC
        `,
        prisma.$queryRaw`
          SELECT
            DATE(pp."createdAt" AT TIME ZONE ${tzSql}) as day,
            pp."capturedById" as captured_by_id,
            u."firstName" as first_name,
            u."lastName" as last_name,
            COUNT(*)::bigint as total,
            COUNT(*) FILTER (WHERE pp.matched = true)::bigint as matched
          FROM "PackagePhoto" pp
          JOIN "User" u ON u.id = pp."capturedById"
          WHERE pp."createdAt" >= ${rangeStart} AND pp."createdAt" < ${rangeEnd}
            ${clinicFilterSqlPP}
            ${PHARMACY_ACCESS_ROLES_FILTER} ${repFilter}
          GROUP BY 1, pp."capturedById", u."firstName", u."lastName"
          ORDER BY 1 DESC, total DESC
        `,
        repId
          ? prisma.$queryRaw<Array<{ hour: number; total: bigint }>>`
              SELECT
                EXTRACT(HOUR FROM "createdAt" AT TIME ZONE ${tzSql})::int as hour,
                COUNT(*)::bigint as total
              FROM "PackagePhoto"
              WHERE "createdAt" >= ${rangeStart} AND "createdAt" < ${rangeEnd}
                ${clinicFilterSql}
                AND "capturedById" = ${repId}
              GROUP BY 1
              ORDER BY 1 ASC
            `
          : null,
        repId
          ? prisma.user
              .findUnique({ where: { id: repId }, select: { firstName: true, lastName: true } })
              .then((u) => (u ? { first_name: u.firstName, last_name: u.lastName } : null))
          : null,
      ];

      const [dailyRows, repDailyRows, hourlyRows, repUser] = (await Promise.all(
        queries.map((q) => q ?? Promise.resolve(null))
      )) as [
        Array<{ day: Date; total: bigint; matched: bigint; unmatched: bigint }>,
        Array<{
          day: Date;
          captured_by_id: number;
          first_name: string;
          last_name: string;
          total: bigint;
          matched: bigint;
        }>,
        Array<{ hour: number; total: bigint }> | null,
        { first_name: string; last_name: string } | null,
      ];

      const repsByDay = new Map<string, Array<{ name: string; total: number; matched: number }>>();
      for (const row of repDailyRows) {
        const dayKey = dbDateToString(new Date(row.day));
        if (!repsByDay.has(dayKey)) repsByDay.set(dayKey, []);
        repsByDay.get(dayKey)!.push({
          name: `${row.first_name} ${row.last_name}`,
          total: Number(row.total),
          matched: Number(row.matched),
        });
      }

      const grandTotal = dailyRows.reduce((s, r) => s + Number(r.total), 0);
      const grandMatched = dailyRows.reduce((s, r) => s + Number(r.matched), 0);
      const daysWithData = dailyRows.length;

      const days = dailyRows.map((row) => {
        const dayKey = dbDateToString(new Date(row.day));
        const t = Number(row.total);
        const m = Number(row.matched);
        return {
          date: dayKey,
          total: t,
          matched: m,
          unmatched: Number(row.unmatched),
          matchRate: t > 0 ? Math.round((m / t) * 100) : 0,
          reps: repsByDay.get(dayKey) ?? [],
        };
      });

      // Build hourly distribution when filtering by individual rep
      let hourlyDistribution: Array<{ hour: number; total: number }> | undefined;
      let peakHour: { hour: number; count: number } | undefined;
      if (repId && hourlyRows) {
        const hourMap = new Map(
          (hourlyRows as Array<{ hour: number; total: bigint }>).map((r) => [
            r.hour,
            Number(r.total),
          ])
        );
        hourlyDistribution = Array.from({ length: 24 }, (_, h) => ({
          hour: h,
          total: hourMap.get(h) ?? 0,
        }));
        const peak = hourlyDistribution.reduce(
          (max, h) => (h.total > max.total ? h : max),
          hourlyDistribution[0]
        );
        peakHour = { hour: peak.hour, count: peak.total };
      }

      // Best and worst day for individual rep
      let bestDay: { date: string; total: number } | undefined;
      let worstDay: { date: string; total: number } | undefined;
      if (repId && days.length > 0) {
        const sorted = [...days].sort((a, b) => b.total - a.total);
        bestDay = { date: sorted[0].date, total: sorted[0].total };
        worstDay = { date: sorted[sorted.length - 1].date, total: sorted[sorted.length - 1].total };
      }

      return NextResponse.json({
        success: true,
        data: {
          days,
          summary: {
            totalDays: daysWithData,
            totalPackages: grandTotal,
            totalMatched: grandMatched,
            totalUnmatched: grandTotal - grandMatched,
            matchRate: grandTotal > 0 ? Math.round((grandMatched / grandTotal) * 100) : 0,
            avgPerDay: daysWithData > 0 ? Math.round(grandTotal / daysWithData) : 0,
          },
          range: {
            from: fromParam ?? instantToCalendarDate(rangeStart),
            to: toParam ?? instantToCalendarDate(new Date(rangeEnd.getTime() - 86400000)),
          },
          ...(repId
            ? {
                rep: {
                  id: repId,
                  name: repUser ? `${repUser.first_name} ${repUser.last_name}` : 'Unknown',
                },
                hourlyDistribution,
                peakHour,
                bestDay,
                worstDay,
              }
            : {}),
        },
      });
    }

    const params = searchSchema.parse(Object.fromEntries(url.searchParams));
    const {
      search,
      matched,
      assignedClinicId,
      assignedFilter,
      period,
      from,
      to,
      page,
      limit,
      sortBy,
      sortOrder,
    } = params;
    const clinicId = isGlobalScope(url) ? undefined : resolveRequestClinicId(user);

    const where: Record<string, unknown> = {};
    // When querying by assignedClinicId, skip the origin clinicId filter —
    // assigned packages were created by the pharmacy, not the destination clinic.
    if (clinicId && !assignedClinicId) {
      where.clinicId = clinicId;
    }

    if (search) {
      where.OR = [
        { lifefileId: { contains: search, mode: 'insensitive' } },
        { trackingNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (matched === 'true') {
      where.matched = true;
    } else if (matched === 'false') {
      where.matched = false;
    }

    if (assignedClinicId) {
      where.assignedClinicId = assignedClinicId;
    } else if (assignedFilter === 'unassigned') {
      where.assignedClinicId = null;
      where.matched = false;
    } else if (assignedFilter === 'assigned') {
      where.assignedClinicId = { not: null };
    }

    if (period !== 'all') {
      const tz = await resolveClinicTimezone(clinicId);
      const bounds = getTimezoneAwareBoundaries(tz);

      if (period === 'today') {
        where.createdAt = { gte: bounds.todayStart };
      } else if (period === 'yesterday') {
        where.createdAt = { gte: bounds.yesterdayStart, lt: bounds.todayStart };
      } else if (period === 'last7') {
        const sevenDaysAgo = midnightInTz(bounds.year, bounds.month, bounds.day - 6, tz);
        where.createdAt = { gte: sevenDaysAgo };
      } else if (period === 'last30') {
        const thirtyDaysAgo = midnightInTz(bounds.year, bounds.month, bounds.day - 29, tz);
        where.createdAt = { gte: thirtyDaysAgo };
      } else if (period === 'week') {
        where.createdAt = { gte: bounds.weekStart };
      } else if (period === 'month') {
        where.createdAt = { gte: bounds.monthStart };
      } else if (period === 'custom' && from) {
        const [fy, fm, fd] = from.split('-').map(Number);
        const customStart = midnightInTz(fy, fm - 1, fd, tz);
        if (to) {
          const [ty, tm, td] = to.split('-').map(Number);
          const customEnd = midnightInTz(ty, tm - 1, td + 1, tz);
          where.createdAt = { gte: customStart, lt: customEnd };
        } else {
          where.createdAt = { gte: customStart };
        }
      }
    }

    const [photos, total] = await Promise.all([
      prisma.packagePhoto.findMany({
        where,
        include: {
          capturedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          patient: { select: { id: true, firstName: true, lastName: true } },
          order: {
            select: { id: true, lifefileOrderId: true, status: true, trackingNumber: true },
          },
          assignedClinic: { select: { id: true, name: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.packagePhoto.count({ where }),
    ]);

    // Generate fresh signed URLs (stored URLs expire after 1 hour)
    const s3Active = isS3Enabled();
    if (!s3Active && photos.length > 0) {
      logger.warn(
        '[PackagePhoto] S3 is NOT enabled — photos are stored in mock mode. Set NEXT_PUBLIC_ENABLE_AWS_S3_STORAGE=true in env vars.'
      );
    }
    const decryptedPhotos = await Promise.all(
      photos.map(async (photo) => {
        let freshUrl: string | null = photo.s3Url;

        if (s3Active && photo.s3Key) {
          try {
            freshUrl = await generateSignedUrl(photo.s3Key, 'GET', 3600);
          } catch {
            logger.warn('[PackagePhoto] Failed to generate signed URL', {
              photoId: photo.id,
              s3Key: photo.s3Key,
            });
          }
        }

        // Don't send mock URLs to the client — they'll show broken images
        if (freshUrl?.includes('mock-s3')) {
          freshUrl = null;
        }

        return {
          ...photo,
          s3Url: freshUrl,
          patient: photo.patient
            ? {
                ...photo.patient,
                firstName: decryptPHI(photo.patient.firstName) || photo.patient.firstName,
                lastName: decryptPHI(photo.patient.lastName) || photo.patient.lastName,
              }
            : null,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: decryptedPhotos,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: unknown) {
    return handleApiError(error, { context: { route: 'GET /api/package-photos' } });
  }
}

export const GET = withPharmacyAccessAuth(getHandler);
