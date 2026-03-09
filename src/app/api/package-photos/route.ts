import { NextRequest, NextResponse } from 'next/server';
import { withPharmacyAccessAuth, type AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/domains/shared/errors';
import { uploadToS3 } from '@/lib/integrations/aws/s3Service';
import { FileCategory } from '@/lib/integrations/aws/s3Config';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

// ---------------------------------------------------------------------------
// POST — Upload a package photo with LifeFile ID lookup
// ---------------------------------------------------------------------------

async function postHandler(req: NextRequest, user: AuthUser) {
  try {
    const formData = await req.formData();
    const lifefileId = formData.get('lifefileId') as string | null;
    const photo = formData.get('photo') as File | null;
    const notes = formData.get('notes') as string | null;

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

    // Try to match LifeFile ID to an existing order
    const matchedOrder = await prisma.order.findFirst({
      where: { lifefileOrderId: trimmedId },
      select: { id: true, patientId: true, clinicId: true },
    });

    // Also check if the lifefileId matches a patient's lifefileId field directly
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

    // Upload photo to S3
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
        capturedByEmail: user.email,
      },
    });

    // Create database record
    const packagePhoto = await prisma.packagePhoto.create({
      data: {
        clinicId: user.clinicId!,
        lifefileId: trimmedId,
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
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  sortBy: z.enum(['createdAt', 'lifefileId']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

async function getHandler(req: NextRequest, user: AuthUser) {
  try {
    const url = new URL(req.url);
    const params = searchSchema.parse(Object.fromEntries(url.searchParams));
    const { search, matched, page, limit, sortBy, sortOrder } = params;

    const where: Record<string, unknown> = {};

    if (search) {
      where.lifefileId = { contains: search, mode: 'insensitive' };
    }

    if (matched === 'true') {
      where.matched = true;
    } else if (matched === 'false') {
      where.matched = false;
    }

    const [photos, total] = await Promise.all([
      prisma.packagePhoto.findMany({
        where,
        include: {
          capturedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          patient: { select: { id: true, firstName: true, lastName: true } },
          order: { select: { id: true, lifefileOrderId: true, status: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.packagePhoto.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: photos,
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
