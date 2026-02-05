/**
 * Patient Portal - Photo Upload API
 *
 * Generates presigned URLs for direct browser-to-S3 uploads.
 * This enables secure, efficient uploads without passing through the server.
 *
 * POST - Generate presigned upload URL
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { generateSignedUrl } from '@/lib/integrations/aws/s3Service';
import { STORAGE_CONFIG, isS3Enabled } from '@/lib/integrations/aws/s3Config';
import { PatientPhotoType } from '@prisma/client';

// =============================================================================
// Constants
// =============================================================================

const MAX_PHOTO_SIZE = 15 * 1024 * 1024; // 15MB for photos
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const PRESIGNED_URL_EXPIRY = 300; // 5 minutes

// =============================================================================
// Request Schema
// =============================================================================

const uploadRequestSchema = z.object({
  type: z.nativeEnum(PatientPhotoType),
  contentType: z.string().refine(
    (type) => ALLOWED_MIME_TYPES.includes(type.toLowerCase()),
    { message: `Invalid file type. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}` }
  ),
  fileSize: z.number().max(MAX_PHOTO_SIZE, {
    message: `File size exceeds maximum of ${MAX_PHOTO_SIZE / 1024 / 1024}MB`,
  }),
  fileName: z.string().optional(),
  category: z.string().optional(),
  // Optional thumbnail request (for client-side thumbnail generation)
  includeThumbnail: z.boolean().optional().default(false),
});

// =============================================================================
// Helpers
// =============================================================================

function generateS3Key(patientId: number, clinicId: number, type: PatientPhotoType, extension: string): string {
  const timestamp = Date.now();
  const uuid = uuidv4();
  return `${STORAGE_CONFIG.PATHS.PATIENT_PHOTOS}/${clinicId}/${patientId}/${type.toLowerCase()}/${timestamp}-${uuid}.${extension}`;
}

function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
  };
  return mimeToExt[mimeType.toLowerCase()] || 'jpg';
}

// =============================================================================
// POST /api/patient-portal/photos/upload
// =============================================================================

async function handlePost(req: NextRequest, user: AuthUser) {
  try {
    // Check if S3 is enabled
    if (!isS3Enabled()) {
      return NextResponse.json(
        { error: 'Photo upload is not available. Storage service not configured.' },
        { status: 503 }
      );
    }

    const body = await req.json();
    const parsed = uploadRequestSchema.safeParse(body);

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
      // Staff can upload for patients - require patientId in body
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

    // Generate S3 keys
    const extension = getExtensionFromMimeType(parsed.data.contentType);
    const s3Key = generateS3Key(patientId, clinicId, parsed.data.type, extension);
    
    // Generate presigned URL for main photo
    const uploadUrl = await generateSignedUrl(s3Key, 'PUT', PRESIGNED_URL_EXPIRY);

    // Optionally generate thumbnail upload URL
    let thumbnailUploadUrl: string | null = null;
    let thumbnailKey: string | null = null;
    
    if (parsed.data.includeThumbnail) {
      thumbnailKey = s3Key.replace(`.${extension}`, `_thumb.${extension}`);
      thumbnailUploadUrl = await generateSignedUrl(thumbnailKey, 'PUT', PRESIGNED_URL_EXPIRY);
    }

    logger.info('[Photos Upload] Presigned URL generated', {
      patientId,
      clinicId,
      type: parsed.data.type,
      requestedBy: user.id,
    });

    return NextResponse.json({
      uploadUrl,
      s3Key,
      thumbnailUploadUrl,
      thumbnailKey,
      expiresIn: PRESIGNED_URL_EXPIRY,
      maxSize: MAX_PHOTO_SIZE,
      // Include metadata to send back when confirming upload
      metadata: {
        patientId,
        clinicId,
        type: parsed.data.type,
        category: parsed.data.category,
        contentType: parsed.data.contentType,
        fileSize: parsed.data.fileSize,
      },
    });
  } catch (error) {
    logger.error('[Photos Upload] Error generating presigned URL', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Failed to generate upload URL' },
      { status: 500 }
    );
  }
}

// =============================================================================
// Export
// =============================================================================

export const POST = withAuth(handlePost);
