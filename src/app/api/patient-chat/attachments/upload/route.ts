/**
 * Patient ↔ Clinic Chat Attachments — Presigned Upload API
 *
 * `POST /api/patient-chat/attachments/upload`
 *
 * Mints a 5-minute presigned PUT URL so the client can upload an attachment
 * directly to S3 (no proxy through Next.js — see scratchpad rationale). The
 * client then references the returned `s3Key` from a subsequent `POST
 * /api/patient-chat` call so the file appears inline in the conversation.
 *
 * Security model:
 *   - `withAuth` enforces a logged-in session; any role allowed by the chat
 *     thread (patient/staff/provider/admin/super_admin/support) may upload.
 *   - For `patient` role: target patientId is forced to `user.patientId`.
 *     Any `patientId` in the request body is ignored.
 *   - For staff roles: `patientId` is required in the body and the patient's
 *     `clinicId` must match `user.clinicId` (super_admin bypasses).
 *   - The minted s3Key is structurally locked to
 *     `chat-attachments/{clinicId}/{patientId}/{timestamp}-{uuid}.{ext}` so
 *     `validateChatAttachmentS3Key` will accept it during the chat-send
 *     transaction. There is no path for a client to forge an s3Key for a
 *     patient that isn't theirs.
 *   - MIME / size are validated against the locked allowlists in
 *     `src/lib/chat-attachments`.
 *   - Every successful mint writes a HIPAA `PHI_CREATE` audit row.
 *   - Rate limited via `RATE_LIMIT_CONFIGS.upload`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { withRateLimit, RATE_LIMIT_CONFIGS } from '@/lib/security/rate-limiter';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { generateSignedUrl } from '@/lib/integrations/aws/s3Service';
import { isS3Configured, isS3Enabled, s3Config } from '@/lib/integrations/aws/s3Config';
import { isFeatureEnabled } from '@/lib/features';
import { logPHICreate } from '@/lib/audit/hipaa-audit';
import {
  CHAT_ATTACHMENT_ACCEPTED_MIME_TYPES,
  CHAT_ATTACHMENT_MAX_BYTES,
  CHAT_ATTACHMENT_UPLOAD_URL_TTL_SECONDS,
  buildChatAttachmentS3Key,
  isAcceptedChatAttachmentMime,
} from '@/lib/chat-attachments';

// ---------------------------------------------------------------------------
// Request schema
// ---------------------------------------------------------------------------

const uploadRequestSchema = z.object({
  contentType: z
    .string()
    .min(1)
    .refine((mime) => isAcceptedChatAttachmentMime(mime), {
      message: `Unsupported file type. Allowed: ${CHAT_ATTACHMENT_ACCEPTED_MIME_TYPES.join(', ')}`,
    }),
  fileSize: z
    .number()
    .int()
    .positive('fileSize must be > 0')
    .max(CHAT_ATTACHMENT_MAX_BYTES, {
      message: `File exceeds maximum size of ${CHAT_ATTACHMENT_MAX_BYTES / 1024 / 1024} MB`,
    }),
  // Sanitized filename hint — we strip path components defensively.
  fileName: z.string().max(255).optional(),
  // Optional for patients (forced to user.patientId). Required for staff roles.
  patientId: z.union([z.string(), z.number()]).optional(),
});

function sanitizeFileName(input: string | undefined): string | undefined {
  if (!input) return undefined;
  // Drop directory traversal + control chars; keep up to 200 chars.
  const base = input.split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(/[\u0000-\u001f<>:"|?*]/g, '').trim();
  return cleaned.length > 0 ? cleaned.slice(0, 200) : undefined;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async function handlePost(req: NextRequest, user: AuthUser): Promise<Response> {
  if (!isS3Enabled()) {
    logger.error('[ChatAttachmentUpload] S3 not enabled', {
      featureFlag: isFeatureEnabled('AWS_S3_STORAGE'),
      configured: isS3Configured(),
      hasBucket: !!s3Config.bucketName,
      hasAccessKey: !!s3Config.accessKeyId,
      hasSecretKey: !!s3Config.secretAccessKey,
    });
    return NextResponse.json(
      {
        error: 'Chat attachments are unavailable. Storage service not configured.',
        code: 'S3_DISABLED',
      },
      { status: 503 }
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = uploadRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Invalid request',
        details: parsed.error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      },
      { status: 400 }
    );
  }

  // ---------------------------------------------------------------------
  // Resolve the (clinicId, patientId) tuple the upload will be scoped to.
  // ---------------------------------------------------------------------

  let clinicId: number;
  let patientId: number;

  if (user.role === 'patient') {
    if (!user.patientId) {
      return NextResponse.json({ error: 'Patient profile not found' }, { status: 404 });
    }
    const patient = await prisma.patient.findUnique({
      where: { id: user.patientId },
      select: { id: true, clinicId: true },
    });
    if (!patient || !patient.clinicId) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }
    patientId = patient.id;
    clinicId = patient.clinicId;
  } else {
    const bodyPatientId = parsed.data.patientId;
    const numeric = typeof bodyPatientId === 'string' ? parseInt(bodyPatientId, 10) : bodyPatientId;
    if (!numeric || !Number.isFinite(numeric) || numeric <= 0) {
      return NextResponse.json(
        { error: 'patientId is required for non-patient roles' },
        { status: 400 }
      );
    }

    const patient = await prisma.patient.findUnique({
      where: { id: numeric },
      select: { id: true, clinicId: true },
    });
    if (!patient || !patient.clinicId) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.clinicId !== patient.clinicId) {
      logger.security('Cross-clinic chat attachment upload blocked', {
        userId: user.id,
        userClinicId: user.clinicId,
        targetPatientId: patient.id,
        targetClinicId: patient.clinicId,
      });
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    patientId = patient.id;
    clinicId = patient.clinicId;
  }

  // ---------------------------------------------------------------------
  // Build the canonical s3Key + mint the presigned PUT URL.
  // ---------------------------------------------------------------------

  let s3Key: string;
  try {
    s3Key = buildChatAttachmentS3Key({
      clinicId,
      patientId,
      mime: parsed.data.contentType,
    });
  } catch (err) {
    // Should never happen given the schema validation above, but keep a
    // structured error to make any future regression obvious.
    logger.error('[ChatAttachmentUpload] Failed to build s3Key', {
      patientId,
      clinicId,
      error: err instanceof Error ? err.message : 'Unknown',
    });
    return NextResponse.json({ error: 'Failed to derive storage path' }, { status: 500 });
  }

  let uploadUrl: string;
  try {
    uploadUrl = await generateSignedUrl(s3Key, 'PUT', CHAT_ATTACHMENT_UPLOAD_URL_TTL_SECONDS);
  } catch (signError) {
    logger.error('[ChatAttachmentUpload] Presigned URL generation failed', {
      userId: user.id,
      patientId,
      clinicId,
      bucket: s3Config.bucketName,
      region: s3Config.region,
      error: signError instanceof Error ? signError.message : 'Unknown',
    });
    return NextResponse.json(
      { error: 'Failed to generate upload URL.', code: 'S3_SIGN_FAILED' },
      { status: 500 }
    );
  }

  const sanitizedName = sanitizeFileName(parsed.data.fileName);

  // HIPAA audit: the s3Key is the resourceId so support can later trace a
  // specific file from incident response.
  await logPHICreate(req, user, 'PatientChatAttachmentUpload', s3Key, patientId, {
    clinicId,
    contentType: parsed.data.contentType,
    fileSize: parsed.data.fileSize,
    fileNameProvided: !!parsed.data.fileName,
  });

  logger.info('[ChatAttachmentUpload] Presigned PUT minted', {
    userId: user.id,
    role: user.role,
    patientId,
    clinicId,
    contentType: parsed.data.contentType,
    fileSize: parsed.data.fileSize,
  });

  return NextResponse.json({
    uploadUrl,
    s3Key,
    expiresIn: CHAT_ATTACHMENT_UPLOAD_URL_TTL_SECONDS,
    maxSize: CHAT_ATTACHMENT_MAX_BYTES,
    metadata: {
      patientId,
      clinicId,
      contentType: parsed.data.contentType,
      fileSize: parsed.data.fileSize,
      fileName: sanitizedName,
    },
  });
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const POST = withRateLimit(withAuth(handlePost), RATE_LIMIT_CONFIGS.upload);
