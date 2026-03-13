/**
 * Patient Portal - Direct Photo Upload API
 *
 * Server-side upload that bypasses S3 CORS entirely.
 * Accepts the image file via FormData, uploads to S3 server-side,
 * and creates the DB record in a single request.
 *
 * POST - Upload photo file + create record
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { withRateLimit, RATE_LIMIT_CONFIGS } from '@/lib/security/rate-limiter';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { v4 as uuidv4 } from 'uuid';
import { isS3Enabled, s3Config, STORAGE_CONFIG } from '@/lib/integrations/aws/s3Config';
import { getS3Client } from '@/lib/integrations/aws/s3Service';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { PatientPhotoType } from '@prisma/client';
import { logPHICreate } from '@/lib/audit/hipaa-audit';
import { ACCEPTED_IMAGE_MIME_TYPES } from '@/lib/config/upload-formats';
import crypto from 'crypto';

const MAX_PHOTO_SIZE = 15 * 1024 * 1024; // 15 MB
const ALLOWED_MIME_TYPES: readonly string[] = ACCEPTED_IMAGE_MIME_TYPES;

const VALID_PHOTO_TYPES = new Set<string>([
  'ID_FRONT',
  'ID_BACK',
  'SELFIE',
  'PROGRESS_FRONT',
  'PROGRESS_SIDE',
  'PROGRESS_BACK',
  'MEDICAL_SKIN',
  'MEDICAL_INJURY',
  'MEDICAL_SYMPTOM',
  'MEDICAL_BEFORE',
  'MEDICAL_AFTER',
  'MEDICAL_OTHER',
  'PROFILE_AVATAR',
]);

const ID_PHOTO_TYPES = new Set(['ID_FRONT', 'ID_BACK', 'SELFIE']);

function getExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
  };
  return map[mimeType.toLowerCase()] || 'jpg';
}

function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  return hashIp(forwarded ? forwarded.split(',')[0].trim() : '0.0.0.0');
}

// Next.js route segment config: disable body parser to handle FormData
export const runtime = 'nodejs';

async function handlePost(req: NextRequest, user: AuthUser) {
  try {
    if (!isS3Enabled()) {
      return NextResponse.json(
        { error: 'Photo upload is not available. Storage service not configured.' },
        { status: 503 },
      );
    }

    const formData = await req.formData();
    const file = formData.get('file');
    const type = formData.get('type') as string | null;
    const widthStr = formData.get('width') as string | null;
    const heightStr = formData.get('height') as string | null;
    const uploadedFrom = (formData.get('uploadedFrom') as string) || 'camera';

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }
    if (!type || !VALID_PHOTO_TYPES.has(type)) {
      return NextResponse.json({ error: 'Invalid photo type' }, { status: 400 });
    }

    const mimeType = file.type || 'image/jpeg';
    if (!ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase())) {
      return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
    }
    if (file.size > MAX_PHOTO_SIZE) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_PHOTO_SIZE / 1024 / 1024}MB)` },
        { status: 400 },
      );
    }

    // Resolve patient
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
      const bodyPatientId = formData.get('patientId') as string | null;
      if (!bodyPatientId) {
        return NextResponse.json({ error: 'patientId is required' }, { status: 400 });
      }
      patientId = parseInt(bodyPatientId, 10);
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

    // Build S3 key and upload server-side
    const ext = getExtension(mimeType);
    const s3Key = `${STORAGE_CONFIG.PATHS.PATIENT_PHOTOS}/${clinicId}/${patientId}/${type.toLowerCase()}/${Date.now()}-${uuidv4()}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const client = getS3Client();

    await client.send(
      new PutObjectCommand({
        Bucket: s3Config.bucketName,
        Key: s3Key,
        Body: buffer,
        ContentType: mimeType,
        ServerSideEncryption: 'AES256',
      }),
    );

    // Upload thumbnail server-side
    let thumbnailKey: string | null = null;
    const thumbFile = formData.get('thumbnail');
    if (thumbFile instanceof Blob && thumbFile.size > 0) {
      thumbnailKey = s3Key.replace(`.${ext}`, `_thumb.${ext}`);
      try {
        const thumbBuffer = Buffer.from(await thumbFile.arrayBuffer());
        await client.send(
          new PutObjectCommand({
            Bucket: s3Config.bucketName,
            Key: thumbnailKey,
            Body: thumbBuffer,
            ContentType: mimeType,
            ServerSideEncryption: 'AES256',
          }),
        );
      } catch {
        thumbnailKey = null;
      }
    }

    // Create DB record
    const verificationStatus = ID_PHOTO_TYPES.has(type) ? 'PENDING' : 'NOT_APPLICABLE';

    const photo = await prisma.patientPhoto.create({
      data: {
        patientId,
        clinicId,
        type: type as PatientPhotoType,
        s3Key,
        s3Url: '',
        thumbnailKey,
        thumbnailUrl: thumbnailKey ? '' : null,
        fileSize: file.size,
        mimeType,
        width: widthStr ? parseInt(widthStr, 10) : undefined,
        height: heightStr ? parseInt(heightStr, 10) : undefined,
        takenAt: new Date(),
        verificationStatus,
        isPrivate: true,
        uploadedFrom,
        ipAddress: getClientIp(req),
      },
      select: {
        id: true,
        createdAt: true,
        type: true,
        s3Key: true,
        thumbnailKey: true,
        verificationStatus: true,
      },
    });

    const s3Url = `/api/patient-photos/${photo.id}/image`;

    logger.info('[Photos Direct Upload] Photo created', {
      photoId: photo.id,
      patientId,
      type,
      uploadedBy: user.id,
    });

    await logPHICreate(req, user, 'PatientPhoto', String(photo.id), patientId, {
      photoType: type,
    });

    return NextResponse.json(
      { photo: { ...photo, s3Url } },
      { status: 201 },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Photos Direct Upload] Error', {
      userId: user.id,
      error: msg,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: 'Upload failed. Please try again.' },
      { status: 500 },
    );
  }
}

export const POST = withRateLimit(withAuth(handlePost), RATE_LIMIT_CONFIGS.upload);
