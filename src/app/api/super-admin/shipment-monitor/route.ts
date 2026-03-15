import { NextRequest, NextResponse } from 'next/server';
import { withSuperAdminAuth, type AuthUser } from '@/lib/auth/middleware';
import { basePrisma } from '@/lib/db';
import { handleApiError } from '@/domains/shared/errors';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { ShippingStatus, Prisma } from '@prisma/client';

function safeDecrypt(val: string | null | undefined): string | null {
  if (!val) return null;
  try { return decryptPHI(val) || val; } catch { return val; }
}

async function backfillPackagePhotoTracking(): Promise<number> {
  try {
    const photosWithTracking = await basePrisma.packagePhoto.findMany({
      where: { trackingNumber: { not: null } },
      select: { id: true, trackingNumber: true, lifefileId: true, clinicId: true, patientId: true, orderId: true, createdAt: true },
      take: 500,
    });

    if (photosWithTracking.length === 0) return 0;

    const trackingNumbers = photosWithTracking
      .map((p: any) => p.trackingNumber)
      .filter((tn: string | null): tn is string => !!tn);

    const existingUpdates = await basePrisma.patientShippingUpdate.findMany({
      where: { trackingNumber: { in: trackingNumbers } },
      select: { trackingNumber: true },
      distinct: ['trackingNumber'],
    });
    const existingSet = new Set(existingUpdates.map((u: any) => u.trackingNumber));

    let created = 0;
    for (const photo of photosWithTracking) {
      if (!photo.trackingNumber || existingSet.has(photo.trackingNumber)) continue;

      try {
        await basePrisma.patientShippingUpdate.create({
          data: {
            clinicId: photo.clinicId,
            patientId: photo.patientId,
            orderId: photo.orderId,
            trackingNumber: photo.trackingNumber,
            carrier: 'FedEx',
            status: 'SHIPPED',
            statusNote: 'Package photo captured by pharmacy',
            source: 'package_photo',
            lifefileOrderId: photo.lifefileId,
            shippedAt: photo.createdAt,
            matchedAt: new Date(),
            matchStrategy: 'package_photo_backfill',
            processedAt: new Date(),
          },
        });
        existingSet.add(photo.trackingNumber);
        created++;
      } catch {
        // Ignore duplicates
      }
    }

    if (created > 0) {
      logger.info('[Shipment Monitor] Backfilled PackagePhoto tracking numbers', { created });
    }
    return created;
  } catch (err) {
    logger.warn('[Shipment Monitor] PackagePhoto backfill failed (non-blocking)', {
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

const TABS = [
  'label_created',
  'shipped',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'issues',
] as const;

type Tab = (typeof TABS)[number];

const TAB_STATUS_MAP: Record<Tab, ShippingStatus[]> = {
  label_created: [ShippingStatus.PENDING, ShippingStatus.LABEL_CREATED],
  shipped: [ShippingStatus.SHIPPED],
  in_transit: [ShippingStatus.IN_TRANSIT],
  out_for_delivery: [ShippingStatus.OUT_FOR_DELIVERY],
  delivered: [ShippingStatus.DELIVERED],
  issues: [ShippingStatus.RETURNED, ShippingStatus.EXCEPTION, ShippingStatus.CANCELLED],
};

const ISSUE_STATUSES: ShippingStatus[] = [
  ShippingStatus.RETURNED,
  ShippingStatus.EXCEPTION,
  ShippingStatus.CANCELLED,
];

function parseDateRange(range: string | undefined): { dateFrom?: Date; dateTo?: Date } {
  if (!range) return {};
  const now = new Date();
  switch (range) {
    case '7d':
      return { dateFrom: new Date(now.getTime() - 7 * 86400000) };
    case '30d':
      return { dateFrom: new Date(now.getTime() - 30 * 86400000) };
    case '90d':
      return { dateFrom: new Date(now.getTime() - 90 * 86400000) };
    default: {
      const d = new Date(range);
      return isNaN(d.getTime()) ? {} : { dateFrom: d };
    }
  }
}

const querySchema = z.object({
  tab: z.enum(TABS).default('in_transit'),
  search: z.string().optional(),
  clinicId: z.coerce.number().int().positive().optional(),
  dateRange: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

async function handleGet(req: NextRequest, _user: AuthUser) {
  try {
    // Backfill PackagePhoto tracking numbers into PatientShippingUpdate (non-blocking)
    await backfillPackagePhotoTracking();

    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const { tab, search, clinicId, dateRange, page, limit } = parsed.data;
    const skip = (page - 1) * limit;
    const statusFilter = TAB_STATUS_MAP[tab];
    const { dateFrom } = parseDateRange(dateRange);

    const baseFilter: any = {};
    if (clinicId) baseFilter.clinicId = clinicId;
    if (dateFrom) baseFilter.createdAt = { gte: dateFrom };

    const where: any = { ...baseFilter, status: { in: statusFilter } };

    if (search?.trim()) {
      const term = search.trim();
      where.OR = [
        { trackingNumber: { contains: term, mode: 'insensitive' } },
        { lifefileOrderId: { contains: term, mode: 'insensitive' } },
      ];
    }

    const shipmentSelect = {
      id: true,
      trackingNumber: true,
      carrier: true,
      status: true,
      statusNote: true,
      lifefileOrderId: true,
      shippedAt: true,
      estimatedDelivery: true,
      actualDelivery: true,
      source: true,
      createdAt: true,
      updatedAt: true,
      clinicId: true,
      patientId: true,
      orderId: true,
      medicationName: true,
      medicationStrength: true,
      rawPayload: true,
      clinic: { select: { id: true, name: true } },
      patient: { select: { id: true, firstName: true, lastName: true } },
      order: { select: { id: true, lifefileOrderId: true } },
    };

    const [rawShipments, ...rest] = await Promise.all([
      basePrisma.patientShippingUpdate.findMany({
        where,
        distinct: ['trackingNumber'],
        orderBy: tab === 'issues'
          ? { updatedAt: 'desc' }
          : tab === 'delivered'
            ? { actualDelivery: 'desc' }
            : { createdAt: 'desc' },
        select: shipmentSelect,
      }),
      // Per-tab counts (deduplicated by tracking number via groupBy)
      ...TABS.map((t) =>
        basePrisma.patientShippingUpdate.groupBy({
          by: ['trackingNumber'],
          where: { ...baseFilter, status: { in: TAB_STATUS_MAP[t] } },
        }).then((groups: any[]) => groups.length)
      ),
      // Analytics: avg delivery days (raw SQL for efficiency)
      basePrisma.$queryRaw<[{ avg_days: number | null; on_time: number | null; total_delivered: number | null }]>(
        Prisma.sql`
          SELECT
            AVG(EXTRACT(EPOCH FROM ("actualDelivery" - "shippedAt")) / 86400)::numeric(10,1) AS avg_days,
            SUM(CASE WHEN "actualDelivery" <= "estimatedDelivery" THEN 1 ELSE 0 END)::int AS on_time,
            COUNT(*)::int AS total_delivered
          FROM "PatientShippingUpdate"
          WHERE status = 'DELIVERED'
            AND "actualDelivery" IS NOT NULL
            AND "shippedAt" IS NOT NULL
            ${clinicId ? Prisma.sql`AND "clinicId" = ${clinicId}` : Prisma.empty}
            ${dateFrom ? Prisma.sql`AND "createdAt" >= ${dateFrom}` : Prisma.empty}
        `
      ),
      // Shipped this week
      basePrisma.patientShippingUpdate.count({
        where: {
          ...baseFilter,
          shippedAt: { gte: new Date(Date.now() - 7 * 86400000) },
        },
      }),
      // Distinct clinics for filter dropdown
      basePrisma.patientShippingUpdate.findMany({
        where: dateFrom ? { createdAt: { gte: dateFrom } } : {},
        select: { clinicId: true, clinic: { select: { id: true, name: true } } },
        distinct: ['clinicId'],
        orderBy: { clinicId: 'asc' },
      }),
    ]);

    // Paginate the deduplicated results in-memory
    const total = rawShipments.length;
    const shipments = rawShipments.slice(skip, skip + limit);

    const counts: Record<Tab, number> = {} as any;
    TABS.forEach((t, i) => {
      counts[t] = rest[i] as number;
    });

    const analyticsRaw = rest[TABS.length] as [{ avg_days: number | null; on_time: number | null; total_delivered: number | null }];
    const shippedThisWeek = rest[TABS.length + 1] as number;
    // rest[TABS.length + 2] was grandTotal but we now derive it from deduplicated counts
    const clinicRows = rest[TABS.length + 2] as Array<{ clinicId: number; clinic: { id: number; name: string } | null }>;

    const row = analyticsRaw?.[0];
    const totalDelivered = Number(row?.total_delivered) || 0;
    const issueCount = (counts.issues || 0);
    const grandTotal = Object.values(counts).reduce((a, b) => a + b, 0) || 0;

    const analytics = {
      avgDeliveryDays: row?.avg_days != null ? Number(Number(row.avg_days).toFixed(1)) : null,
      onTimeRate: totalDelivered > 0 && row?.on_time != null
        ? Number(((Number(row.on_time) / totalDelivered) * 100).toFixed(1))
        : null,
      shippedThisWeek,
      issueRate: grandTotal > 0 ? Number(((issueCount / grandTotal) * 100).toFixed(2)) : 0,
      totalShipments: grandTotal,
    };

    const clinics = clinicRows
      .filter((c) => c.clinic)
      .map((c) => ({ id: c.clinic!.id, name: c.clinic!.name }));

    return NextResponse.json({
      success: true,
      tab,
      shipments: shipments.map((s: any) => {
        const firstName = safeDecrypt(s.patient?.firstName);
        const lastName = safeDecrypt(s.patient?.lastName);
        const patientName = [firstName, lastName].filter(Boolean).join(' ') || null;

        return {
          id: s.id,
          trackingNumber: s.trackingNumber,
          carrier: s.carrier,
          status: s.status,
          statusNote: s.statusNote,
          lifefileOrderId: s.lifefileOrderId || s.order?.lifefileOrderId || null,
          shippedAt: s.shippedAt,
          estimatedDelivery: s.estimatedDelivery,
          actualDelivery: s.actualDelivery,
          source: s.source,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          clinicName: s.clinic?.name || null,
          clinicId: s.clinicId,
          patientId: s.patientId,
          patientName,
          orderId: s.orderId,
          signedBy: (s.rawPayload as any)?.signedBy || null,
          deliveryPhotoUrl: (s.rawPayload as any)?.photoUrl || null,
          deliveryDetails: (s.rawPayload as any)?.fedexDeliveryDetails || null,
        };
      }),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      counts,
      analytics,
      clinics,
    });
  } catch (error) {
    return handleApiError(error, { route: 'GET /api/super-admin/shipment-monitor' });
  }
}

export const GET = withSuperAdminAuth(handleGet);
