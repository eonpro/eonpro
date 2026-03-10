import { NextRequest, NextResponse } from 'next/server';
import { withPharmacyAccessAuth, type AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/domains/shared/errors';
import { uploadToS3 } from '@/lib/integrations/aws/s3Service';
import { FileCategory } from '@/lib/integrations/aws/s3Config';
import { logger } from '@/lib/logger';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { z } from 'zod';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

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
  patientId: number | null,
): Promise<TrackingInfo | null> {
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
      OR: [
        { lifefileOrderId: lifefileId },
        ...(orderId ? [{ orderId }] : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
    select: { trackingNumber: true, source: true },
  });
  if (shippingUpdate?.trackingNumber) {
    return {
      trackingNumber: shippingUpdate.trackingNumber,
      trackingSource: shippingUpdate.source === 'lifefile' ? 'lifefile_webhook' : 'shipping_update',
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
}

// ---------------------------------------------------------------------------
// POST — Upload a package photo with LifeFile ID lookup + tracking resolution
// ---------------------------------------------------------------------------

async function postHandler(req: NextRequest, user: AuthUser) {
  try {
    const formData = await req.formData();
    const lifefileId = formData.get('lifefileId') as string | null;
    const photo = formData.get('photo') as File | null;
    const notes = formData.get('notes') as string | null;
    const manualTracking = formData.get('trackingNumber') as string | null;

    if (!lifefileId || !lifefileId.trim()) {
      return NextResponse.json({ error: 'LifeFile ID is required' }, { status: 400 });
    }

    if (!photo) {
      return NextResponse.json({ error: 'Photo is required' }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.includes(photo.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload JPEG, PNG, or WebP images.' },
        { status: 400 },
      );
    }

    if (photo.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB.' },
        { status: 400 },
      );
    }

    const trimmedId = lifefileId.trim();

    // --- Match LifeFile ID ---
    const matchedOrder = await prisma.order.findFirst({
      where: { lifefileOrderId: trimmedId },
      select: { id: true, patientId: true, clinicId: true, trackingNumber: true },
    });

    let matchedPatientId = matchedOrder?.patientId ?? null;
    let matchStrategy: string | null = null;

    if (matchedOrder) {
      matchStrategy = 'lifefileOrderId';
    } else {
      const matchedPatient = await prisma.patient.findFirst({
        where: { lifefileId: trimmedId },
        select: { id: true },
      });
      if (matchedPatient) {
        matchedPatientId = matchedPatient.id;
        matchStrategy = 'patientLifefileId';
      }
    }

    // --- Resolve tracking number ---
    let trackingNumber: string | null = null;
    let trackingSource: string | null = null;

    if (manualTracking?.trim()) {
      trackingNumber = manualTracking.trim();
      trackingSource = 'manual';
    } else {
      const resolved = await resolveTracking(
        matchedOrder?.id ?? null,
        trimmedId,
        matchedPatientId,
      );
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
        clinicId: user.clinicId!,
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
  period: z.enum(['today', 'week', 'month', 'all']).optional().default('all'),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  sortBy: z.enum(['createdAt', 'lifefileId']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

async function getHandler(req: NextRequest, user: AuthUser) {
  try {
    const url = new URL(req.url);

    // Stats mode — aggregate counts for the audit dashboard
    if (url.searchParams.get('stats') === 'true') {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());

      const [today, thisWeek, matched, total] = await Promise.all([
        prisma.packagePhoto.count({ where: { createdAt: { gte: todayStart } } }),
        prisma.packagePhoto.count({ where: { createdAt: { gte: weekStart } } }),
        prisma.packagePhoto.count({ where: { matched: true } }),
        prisma.packagePhoto.count(),
      ]);

      return NextResponse.json({
        success: true,
        data: {
          today,
          thisWeek,
          matched,
          total,
          matchRate: total > 0 ? Math.round((matched / total) * 100) : 0,
          unmatched: total - matched,
        },
      });
    }

    const params = searchSchema.parse(Object.fromEntries(url.searchParams));
    const { search, matched, period, page, limit, sortBy, sortOrder } = params;

    const where: Record<string, unknown> = {};

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

    if (period !== 'all') {
      const now = new Date();
      let periodStart: Date;
      if (period === 'today') {
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (period === 'week') {
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        periodStart.setDate(periodStart.getDate() - periodStart.getDay());
      } else {
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      }
      where.createdAt = { gte: periodStart };
    }

    const [photos, total] = await Promise.all([
      prisma.packagePhoto.findMany({
        where,
        include: {
          capturedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          patient: { select: { id: true, firstName: true, lastName: true } },
          order: { select: { id: true, lifefileOrderId: true, status: true, trackingNumber: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.packagePhoto.count({ where }),
    ]);

    const decryptedPhotos = photos.map((photo) => ({
      ...photo,
      patient: photo.patient
        ? {
            ...photo.patient,
            firstName: decryptPHI(photo.patient.firstName) || photo.patient.firstName,
            lastName: decryptPHI(photo.patient.lastName) || photo.patient.lastName,
          }
        : null,
    }));

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
