/**
 * Patient Portal - Photo API
 *
 * Handles photo listing and creation for patient portal.
 * Supports progress photos, ID verification, medical images, and profile photos.
 *
 * GET - List patient photos with optional filters
 * POST - Create photo record (after S3 upload via presigned URL)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { PatientPhotoType, PatientPhotoVerificationStatus } from '@prisma/client';
import { generateSignedUrl, deleteFromS3 } from '@/lib/integrations/aws/s3Service';
import crypto from 'crypto';

// =============================================================================
// Request Schemas
// =============================================================================

const listPhotosSchema = z.object({
  type: z.nativeEnum(PatientPhotoType).optional(),
  category: z.string().optional(),
  includeDeleted: z.boolean().optional().default(false),
  page: z.number().optional().default(1),
  limit: z.number().optional().default(50),
});

const createPhotoSchema = z.object({
  type: z.nativeEnum(PatientPhotoType),
  category: z.string().optional(),
  s3Key: z.string().min(1, 'S3 key is required'),
  thumbnailKey: z.string().optional(),
  fileSize: z.number().optional(),
  mimeType: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  title: z.string().optional(),
  notes: z.string().optional(),
  weight: z.number().optional(),
  takenAt: z.string().datetime().optional(),
  uploadedFrom: z.enum(['web', 'mobile', 'camera']).optional(),
  deviceInfo: z.string().optional(),
});

// =============================================================================
// Helpers
// =============================================================================

function hashIpAddress(ip: string): string {
  return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : '0.0.0.0';
  return hashIpAddress(ip);
}

async function refreshPhotoUrls(
  photos: Array<{ s3Key: string; thumbnailKey: string | null; [key: string]: any }>
): Promise<Array<any>> {
  return Promise.all(
    photos.map(async (photo) => {
      try {
        const [s3Url, thumbnailUrl] = await Promise.all([
          generateSignedUrl(photo.s3Key, 'GET', 3600),
          photo.thumbnailKey ? generateSignedUrl(photo.thumbnailKey, 'GET', 3600) : null,
        ]);
        return { ...photo, s3Url, thumbnailUrl };
      } catch (error) {
        logger.warn('[Photos API] Failed to generate signed URL', {
          s3Key: photo.s3Key,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        return { ...photo, s3Url: null, thumbnailUrl: null };
      }
    })
  );
}

// =============================================================================
// GET /api/patient-portal/photos
// =============================================================================

async function handleGet(req: NextRequest, user: AuthUser) {
  try {
    const searchParams = req.nextUrl.searchParams;

    // Parse query params
    const params = listPhotosSchema.safeParse({
      type: searchParams.get('type') || undefined,
      category: searchParams.get('category') || undefined,
      includeDeleted: searchParams.get('includeDeleted') === 'true',
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50,
    });

    if (!params.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: params.error.issues },
        { status: 400 }
      );
    }

    // For patient role, only allow access to their own photos
    let patientId: number;
    let clinicId: number;

    if (user.role === 'patient') {
      if (!user.patientId) {
        return NextResponse.json({ error: 'Patient profile not found' }, { status: 404 });
      }
      // Get patient's clinic
      const patient = await prisma.patient.findUnique({
        where: { id: user.patientId },
        select: { id: true, clinicId: true },
      });
      if (!patient) {
        return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
      }
      patientId = patient.id;
      clinicId = patient.clinicId;
    } else {
      // Staff/Provider/Admin - require patientId in query
      const queryPatientId = searchParams.get('patientId');
      if (!queryPatientId) {
        return NextResponse.json({ error: 'patientId is required' }, { status: 400 });
      }
      patientId = parseInt(queryPatientId);

      // Verify patient exists and get clinicId
      const patient = await prisma.patient.findUnique({
        where: { id: patientId },
        select: { id: true, clinicId: true },
      });
      if (!patient) {
        return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
      }

      // Verify clinic access for non-super admins
      if (user.role !== 'super_admin' && user.clinicId !== patient.clinicId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
      clinicId = patient.clinicId;
    }

    // Build query
    const where: any = {
      patientId,
      clinicId,
    };

    // Filter by type if provided
    if (params.data.type) {
      where.type = params.data.type;
    }

    // Filter by category if provided
    if (params.data.category) {
      where.category = params.data.category;
    }

    // Exclude deleted unless requested
    if (!params.data.includeDeleted) {
      where.isDeleted = false;
    }

    // Get total count
    const total = await prisma.patientPhoto.count({ where });

    // Get photos with pagination
    const photos = await prisma.patientPhoto.findMany({
      where,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        type: true,
        category: true,
        s3Key: true,
        thumbnailKey: true,
        fileSize: true,
        mimeType: true,
        width: true,
        height: true,
        title: true,
        notes: true,
        weight: true,
        takenAt: true,
        verificationStatus: true,
        verifiedAt: true,
        isPrivate: true,
        isDeleted: true,
        uploadedFrom: true,
      },
      orderBy: { takenAt: 'desc' },
      skip: (params.data.page - 1) * params.data.limit,
      take: params.data.limit,
    });

    // Generate fresh signed URLs for all photos
    const photosWithUrls = await refreshPhotoUrls(photos);

    return NextResponse.json({
      photos: photosWithUrls,
      pagination: {
        page: params.data.page,
        limit: params.data.limit,
        total,
        totalPages: Math.ceil(total / params.data.limit),
      },
    });
  } catch (error) {
    logger.error('[Photos API] GET error', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to fetch photos' }, { status: 500 });
  }
}

// =============================================================================
// POST /api/patient-portal/photos
// =============================================================================

async function handlePost(req: NextRequest, user: AuthUser) {
  try {
    const body = await req.json();
    const parsed = createPhotoSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.issues },
        { status: 400 }
      );
    }

    // Determine patient ID and clinic ID
    let patientId: number;
    let clinicId: number;

    if (user.role === 'patient') {
      if (!user.patientId) {
        return NextResponse.json({ error: 'Patient profile not found' }, { status: 404 });
      }
      // Get patient's clinic
      const patient = await prisma.patient.findUnique({
        where: { id: user.patientId },
        select: { id: true, clinicId: true },
      });
      if (!patient) {
        return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
      }
      patientId = patient.id;
      clinicId = patient.clinicId;
    } else {
      // Staff can create photos for patients - require patientId in body
      const bodyPatientId = body.patientId;
      if (!bodyPatientId) {
        return NextResponse.json({ error: 'patientId is required' }, { status: 400 });
      }
      patientId = parseInt(bodyPatientId);

      const patient = await prisma.patient.findUnique({
        where: { id: patientId },
        select: { id: true, clinicId: true },
      });
      if (!patient) {
        return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
      }

      // Verify clinic access
      if (user.role !== 'super_admin' && user.clinicId !== patient.clinicId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
      clinicId = patient.clinicId;
    }

    // Determine initial verification status based on photo type
    let verificationStatus: PatientPhotoVerificationStatus = 'NOT_APPLICABLE';
    const idPhotoTypes = [PatientPhotoType.ID_FRONT, PatientPhotoType.ID_BACK, PatientPhotoType.SELFIE];
    if (idPhotoTypes.includes(parsed.data.type)) {
      verificationStatus = 'PENDING';
    }

    // Create photo record
    const photo = await prisma.patientPhoto.create({
      data: {
        patientId,
        clinicId,
        type: parsed.data.type,
        category: parsed.data.category,
        s3Key: parsed.data.s3Key,
        s3Url: '', // Will be generated on access
        thumbnailKey: parsed.data.thumbnailKey,
        thumbnailUrl: parsed.data.thumbnailKey ? '' : null,
        fileSize: parsed.data.fileSize,
        mimeType: parsed.data.mimeType,
        width: parsed.data.width,
        height: parsed.data.height,
        title: parsed.data.title,
        notes: parsed.data.notes,
        weight: parsed.data.weight,
        takenAt: parsed.data.takenAt ? new Date(parsed.data.takenAt) : new Date(),
        verificationStatus,
        isPrivate: true,
        uploadedFrom: parsed.data.uploadedFrom,
        deviceInfo: parsed.data.deviceInfo,
        ipAddress: getClientIp(req),
      },
      select: {
        id: true,
        createdAt: true,
        type: true,
        category: true,
        s3Key: true,
        thumbnailKey: true,
        title: true,
        weight: true,
        takenAt: true,
        verificationStatus: true,
      },
    });

    // Generate signed URL for the response
    const s3Url = await generateSignedUrl(photo.s3Key, 'GET', 3600);
    const thumbnailUrl = photo.thumbnailKey
      ? await generateSignedUrl(photo.thumbnailKey, 'GET', 3600)
      : null;

    logger.info('[Photos API] Photo created', {
      photoId: photo.id,
      patientId,
      type: parsed.data.type,
      uploadedBy: user.id,
    });

    return NextResponse.json(
      {
        photo: {
          ...photo,
          s3Url,
          thumbnailUrl,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error('[Photos API] POST error', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to create photo' }, { status: 500 });
  }
}

// =============================================================================
// Exports
// =============================================================================

export const GET = withAuth(handleGet);
export const POST = withAuth(handlePost);
