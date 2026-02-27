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
import { withRateLimit, RATE_LIMIT_CONFIGS } from '@/lib/security/rate-limiter';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { generateSignedUrl } from '@/lib/integrations/aws/s3Service';
import { STORAGE_CONFIG, isS3Enabled, isS3Configured, s3Config } from '@/lib/integrations/aws/s3Config';
import { isFeatureEnabled } from '@/lib/features';
import { PatientPhotoType } from '@prisma/client';
import { logPHICreate } from '@/lib/audit/hipaa-audit';

// =============================================================================
// Constants
// =============================================================================

const MAX_PHOTO_SIZE = 15 * 1024 * 1024; // 15MB for photos
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];
const PRESIGNED_URL_EXPIRY = 300; // 5 minutes

// =============================================================================
// Request Schema
// =============================================================================

const uploadRequestSchema = z.object({
  type: z.nativeEnum(PatientPhotoType),
  contentType: z.string().refine((type) => ALLOWED_MIME_TYPES.includes(type.toLowerCase()), {
    message: `Invalid file type. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
  }),
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

function generateS3Key(
  patientId: number,
  clinicId: number,
  type: PatientPhotoType,
  extension: string
): string {
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
    // Detailed S3 diagnostics for 503
    if (!isS3Enabled()) {
      const featureFlag = isFeatureEnabled('AWS_S3_STORAGE');
      const configured = isS3Configured();
      logger.error('[Photos Upload] S3 not enabled', {
        featureFlag,
        configured,
        hasBucket: !!s3Config.bucketName,
        hasAccessKey: !!s3Config.accessKeyId,
        hasSecretKey: !!s3Config.secretAccessKey,
        hasRegion: !!s3Config.region,
        bucket: s3Config.bucketName,
        region: s3Config.region,
      });
      return NextResponse.json(
        {
          error: 'Photo upload is not available. Storage service not configured.',
          diagnostics: {
            featureEnabled: featureFlag,
            configured,
            hasBucket: !!s3Config.bucketName,
            hasCredentials: !!s3Config.accessKeyId && !!s3Config.secretAccessKey,
            hasRegion: !!s3Config.region,
          },
        },
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

      if (user.role !== 'super_admin' && user.clinicId !== patient.clinicId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
      clinicId = patient.clinicId;
    }

    // Generate S3 keys
    const extension = getExtensionFromMimeType(parsed.data.contentType);
    const s3Key = generateS3Key(patientId, clinicId, parsed.data.type, extension);

    // Generate presigned URL with detailed error capture
    let uploadUrl: string;
    try {
      uploadUrl = await generateSignedUrl(s3Key, 'PUT', PRESIGNED_URL_EXPIRY);
    } catch (signError) {
      logger.error('[Photos Upload] Presigned URL generation failed', {
        userId: user.id,
        patientId,
        clinicId,
        s3Key,
        bucket: s3Config.bucketName,
        region: s3Config.region,
        hasAccessKey: !!s3Config.accessKeyId,
        hasSecretKey: !!s3Config.secretAccessKey,
        error: signError instanceof Error ? signError.message : 'Unknown',
        stack: signError instanceof Error ? signError.stack : undefined,
      });
      return NextResponse.json(
        {
          error: 'Failed to generate upload URL. S3 signing failed.',
          code: 'S3_SIGN_FAILED',
        },
        { status: 500 }
      );
    }

    // Optionally generate thumbnail upload URL
    let thumbnailUploadUrl: string | null = null;
    let thumbnailKey: string | null = null;

    if (parsed.data.includeThumbnail) {
      thumbnailKey = s3Key.replace(`.${extension}`, `_thumb.${extension}`);
      try {
        thumbnailUploadUrl = await generateSignedUrl(thumbnailKey, 'PUT', PRESIGNED_URL_EXPIRY);
      } catch {
        logger.warn('[Photos Upload] Thumbnail presigned URL failed, continuing without', {
          thumbnailKey,
        });
      }
    }

    logger.info('[Photos Upload] Presigned URL generated', {
      patientId,
      clinicId,
      type: parsed.data.type,
      requestedBy: user.id,
    });

    await logPHICreate(req, user, 'PatientPhotoUpload', s3Key, patientId, {
      photoType: parsed.data.type,
      contentType: parsed.data.contentType,
      fileSize: parsed.data.fileSize,
    });

    return NextResponse.json({
      uploadUrl,
      s3Key,
      thumbnailUploadUrl,
      thumbnailKey,
      expiresIn: PRESIGNED_URL_EXPIRY,
      maxSize: MAX_PHOTO_SIZE,
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
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    const errStack = error instanceof Error ? error.stack : undefined;
    logger.error('[Photos Upload] Unhandled error', {
      userId: user.id,
      role: user.role,
      patientId: user.patientId,
      error: errMsg,
      stack: errStack,
      s3Enabled: isS3Enabled(),
      featureFlag: isFeatureEnabled('AWS_S3_STORAGE'),
      s3Configured: isS3Configured(),
    });
    return NextResponse.json(
      { error: `Failed to generate upload URL: ${errMsg}`, code: 'UPLOAD_URL_ERROR' },
      { status: 500 }
    );
  }
}

// =============================================================================
// Export
// =============================================================================

export const POST = withRateLimit(withAuth(handlePost), RATE_LIMIT_CONFIGS.upload);
