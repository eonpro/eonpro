/**
 * Patient Chat API
 * Two-way messaging between patients and clinic staff
 * Supports web chat and Twilio SMS delivery
 *
 * ENTERPRISE FEATURES:
 * - Multi-tenant clinic isolation
 * - Audit logging for HIPAA compliance
 * - Rate limiting
 * - Transaction support
 * - Input validation and sanitization
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma, runWithClinicContext } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { standardRateLimit } from '@/lib/rateLimit';
import { sendSMS, formatPhoneNumber } from '@/lib/integrations/twilio/smsService';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { notificationService } from '@/services/notification/notificationService';
import { generateSignedUrl } from '@/lib/integrations/aws/s3Service';
import { isS3Enabled } from '@/lib/integrations/aws/s3Config';
import {
  CHAT_ATTACHMENT_ACCEPTED_MIME_TYPES,
  CHAT_ATTACHMENT_MAX_BYTES,
  CHAT_ATTACHMENT_MAX_PER_MESSAGE,
  CHAT_ATTACHMENT_SIGNED_URL_TTL_SECONDS,
  buildAttachmentOnlyPreview,
  validateChatAttachmentS3Key,
  type ChatAttachmentMime,
  type ChatAttachmentRecord,
  type ChatAttachmentResolved,
} from '@/lib/chat-attachments';
import { z } from 'zod';

function safeDecrypt(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decryptPHI(value) || value;
  } catch {
    return value;
  }
}

// ============================================================================
// SECURITY: Input Sanitization
// ============================================================================

/**
 * Sanitize text to prevent XSS attacks
 * Enterprise-grade: strips HTML, limits length, trims whitespace
 */
function sanitizeText(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .trim()
    .substring(0, 2000);
}

// ============================================================================
// ATTACHMENT RESOLUTION (read path)
// ============================================================================

/**
 * Type-guard for a stored chat attachment record. Used when reading the
 * `attachments` JSON column — the column is `Json?` so anything could be
 * in there if the row was hand-crafted; we silently skip malformed entries
 * rather than crash the whole GET.
 */
function isStoredChatAttachment(value: unknown): value is ChatAttachmentRecord {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.s3Key === 'string' &&
    typeof v.mime === 'string' &&
    typeof v.size === 'number' &&
    typeof v.uploadedAt === 'string'
  );
}

/**
 * Convert the persisted `attachments` JSON into the client-facing shape:
 *   - Strips `s3Key` / `thumbnailKey` (never returned to clients)
 *   - Mints a 1h signed GET URL per attachment (parallelized)
 *   - Skips malformed entries
 *   - Falls back to `url: null` if S3 is disabled so the UI can still
 *     render a placeholder
 */
async function resolveAttachmentsForRead(
  raw: unknown,
  s3Available: boolean,
  ctx: { messageId: number; patientId: number }
): Promise<ChatAttachmentResolved[] | null> {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const valid = raw.filter(isStoredChatAttachment);
  if (valid.length === 0) return null;

  const resolved = await Promise.all(
    valid.map(async (a) => {
      let url: string | undefined;
      let thumbnailUrl: string | undefined;
      if (s3Available) {
        try {
          url = await generateSignedUrl(a.s3Key, 'GET', CHAT_ATTACHMENT_SIGNED_URL_TTL_SECONDS);
          if (a.thumbnailKey) {
            thumbnailUrl = await generateSignedUrl(
              a.thumbnailKey,
              'GET',
              CHAT_ATTACHMENT_SIGNED_URL_TTL_SECONDS
            );
          }
        } catch (err) {
          logger.error('[patient-chat] Failed to sign attachment URL', {
            messageId: ctx.messageId,
            patientId: ctx.patientId,
            attachmentId: a.id,
            error: err instanceof Error ? err.message : 'Unknown',
          });
        }
      }
      const out: ChatAttachmentResolved = {
        id: a.id,
        name: a.name,
        mime: a.mime as ChatAttachmentMime,
        size: a.size,
        uploadedAt: a.uploadedAt,
        ...(url ? { url } : {}),
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
      };
      return out;
    })
  );

  return resolved;
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const attachmentInputSchema = z.object({
  s3Key: z.string().min(1).max(512),
  name: z.string().min(1).max(255).optional(),
  mime: z
    .string()
    .min(1)
    .refine(
      (m) => (CHAT_ATTACHMENT_ACCEPTED_MIME_TYPES as readonly string[]).includes(m.toLowerCase()),
      { message: 'Unsupported attachment MIME type' }
    ),
  size: z
    .number()
    .int()
    .positive()
    .max(CHAT_ATTACHMENT_MAX_BYTES, {
      message: `Attachment exceeds ${CHAT_ATTACHMENT_MAX_BYTES / 1024 / 1024} MB limit`,
    }),
});

const sendMessageSchema = z
  .object({
    patientId: z.union([z.string(), z.number()]).transform((val) => {
      const num = typeof val === 'string' ? parseInt(val, 10) : val;
      if (isNaN(num) || num <= 0) throw new Error('Invalid patientId');
      return num;
    }),
    // NOTE: do not `.transform(sanitizeText)` here — the cross-field
    // refine below needs to inspect the *raw* (pre-sanitize) length so
    // that messages whose only content is HTML stripped by the sanitizer
    // (e.g. an XSS payload) still validate as "had content". The
    // handler applies `sanitizeText` after parse.
    message: z.string().max(2000, 'Message too long').optional().default(''),
    channel: z.enum(['WEB', 'SMS']).default('WEB'),
    threadId: z.string().max(100).optional(),
    replyToId: z.number().positive().optional(),
    attachments: z
      .array(attachmentInputSchema)
      .max(CHAT_ATTACHMENT_MAX_PER_MESSAGE, {
        message: `Up to ${CHAT_ATTACHMENT_MAX_PER_MESSAGE} attachments per message`,
      })
      .optional(),
  })
  .refine(
    (data) =>
      (data.message && data.message.length > 0) ||
      (data.attachments && data.attachments.length > 0),
    { message: 'Message must contain text, attachments, or both', path: ['message'] }
  );

const getMessagesSchema = z.object({
  patientId: z
    .string()
    .nullable()
    .transform((val, ctx) => {
      if (!val) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'patientId is required',
        });
        return z.NEVER;
      }
      const num = parseInt(val, 10);
      if (isNaN(num) || num <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'patientId must be a positive integer',
        });
        return z.NEVER;
      }
      return num;
    }),
  limit: z
    .string()
    .nullable()
    .optional()
    .transform((val) => {
      if (!val) return 50;
      const num = parseInt(val, 10);
      return isNaN(num) || num <= 0 ? 50 : Math.min(num, 100);
    }),
  before: z.string().nullable().optional(), // ISO datetime string for pagination
  threadId: z.string().max(100).nullable().optional(),
});

const markReadSchema = z.object({
  patientId: z.union([z.string(), z.number()]).transform((val) => {
    const num = typeof val === 'string' ? parseInt(val, 10) : val;
    if (isNaN(num) || num <= 0) throw new Error('Invalid patientId');
    return num;
  }),
  messageIds: z.array(z.number().positive()).min(1).max(100),
});

// ============================================================================
// ACCESS CONTROL
// ============================================================================

/**
 * Check if user can access patient's messages
 * Enterprise: Validates both role AND clinic membership
 */
async function canAccessPatientMessages(
  user: AuthUser,
  patientId: number
): Promise<{ allowed: boolean; patient?: any; reason?: string }> {
  // Patients can only see their own messages
  if (user.role === 'patient') {
    if (user.patientId !== patientId) {
      return { allowed: false, reason: 'Patients can only access their own messages' };
    }
    // Fetch patient to get clinic context
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, firstName: true, lastName: true, phone: true, clinicId: true },
    });
    return { allowed: !!patient, patient, reason: patient ? undefined : 'Patient not found' };
  }

  // Staff/providers must be in same clinic as patient
  const allowedRoles = ['provider', 'admin', 'staff', 'super_admin', 'support'];
  if (!allowedRoles.includes(user.role)) {
    return { allowed: false, reason: 'Insufficient permissions' };
  }

  // Super admins can access any clinic
  if (user.role === 'super_admin') {
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, firstName: true, lastName: true, phone: true, clinicId: true },
    });
    return { allowed: !!patient, patient, reason: patient ? undefined : 'Patient not found' };
  }

  // For regular staff, validate clinic membership
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, firstName: true, lastName: true, phone: true, clinicId: true },
  });

  if (!patient) {
    return { allowed: false, reason: 'Patient not found' };
  }

  // Validate user belongs to patient's clinic
  if (user.clinicId && patient.clinicId && user.clinicId !== patient.clinicId) {
    logger.security('Cross-clinic access attempt blocked', {
      userId: user.id,
      userClinicId: user.clinicId,
      patientId,
      patientClinicId: patient.clinicId,
    });
    return { allowed: false, reason: 'Access denied - clinic mismatch' };
  }

  return { allowed: true, patient };
}

/**
 * Generate a unique thread ID with clinic prefix for isolation
 */
function generateThreadId(clinicId?: number | null): string {
  const prefix = clinicId ? `c${clinicId}` : 'sys';
  return `${prefix}_thread_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Audit log for HIPAA compliance
 */
async function auditChatAccess(
  action: 'VIEW' | 'SEND' | 'READ_MARK',
  user: AuthUser,
  patientId: number,
  details?: Record<string, any>
) {
  try {
    await prisma.auditLog.create({
      data: {
        action: `CHAT_${action}`,
        resource: 'PatientChatMessage',
        resourceId: patientId,
        userId: user.id,
        clinicId: user.clinicId || null,
        ipAddress: details?.ipAddress || null,
        userAgent: details?.userAgent || null,
        details: {
          patientId,
          channel: details?.channel,
          messageCount: details?.messageCount,
          ...details,
        },
      },
    });
  } catch (error) {
    // Don't fail the request if audit logging fails
    logger.error('Failed to create audit log', { error, action, patientId });
  }
}

// ============================================================================
// POST - Send a new message
// ============================================================================

const postHandler = withAuth(async (request: NextRequest, user) => {
  const startTime = Date.now();

  try {
    const rawData = await request.json();
    const parseResult = sendMessageSchema.safeParse(rawData);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid input',
          details: parseResult.error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        },
        { status: 400 }
      );
    }

    const {
      patientId,
      message: rawMessage,
      channel,
      threadId,
      replyToId,
      attachments,
    } = parseResult.data;
    // Sanitize after the cross-field refine so that XSS-only payloads
    // (whose raw input is non-empty but sanitizes to "") still parse —
    // and we persist the safe-stripped result.
    const message = sanitizeText(rawMessage);

    // Validate access with clinic check
    const accessCheck = await canAccessPatientMessages(user, patientId);
    if (!accessCheck.allowed) {
      return NextResponse.json({ error: accessCheck.reason || 'Access denied' }, { status: 403 });
    }

    const rawPatient = accessCheck.patient!;
    const clinicId = rawPatient.clinicId || user.clinicId;

    // ---------------------------------------------------------------
    // Cross-tenant TOCTOU defense for attachments. Each attachment's
    // s3Key MUST be `chat-attachments/{clinicId}/{patientId}/...` so
    // the upload route's clinic+patient ownership check is enforced
    // again at message-send time. Reject the entire payload if any
    // attachment fails — partial persistence is worse than rejection.
    // ---------------------------------------------------------------
    let persistedAttachments: ChatAttachmentRecord[] | null = null;
    if (attachments && attachments.length > 0) {
      if (!clinicId) {
        return NextResponse.json(
          { error: 'Cannot attach files without a clinic context' },
          { status: 400 }
        );
      }
      for (const att of attachments) {
        if (!validateChatAttachmentS3Key(att.s3Key, { clinicId, patientId })) {
          logger.security('Cross-clinic chat attachment s3Key rejected', {
            userId: user.id,
            userClinicId: user.clinicId,
            targetClinicId: clinicId,
            targetPatientId: patientId,
            keyPrefix: att.s3Key.substring(0, 60),
          });
          return NextResponse.json({ error: 'Invalid attachment reference' }, { status: 400 });
        }
      }

      const nowIso = new Date().toISOString();
      persistedAttachments = attachments.map((att) => ({
        id: randomUUID(),
        s3Key: att.s3Key,
        name: (att.name ?? 'attachment').slice(0, 255),
        mime: att.mime.toLowerCase() as ChatAttachmentMime,
        size: att.size,
        uploadedAt: nowIso,
      }));
    }

    const patient = {
      ...rawPatient,
      phone: safeDecrypt(rawPatient.phone),
      firstName: safeDecrypt(rawPatient.firstName) || rawPatient.firstName,
      lastName: safeDecrypt(rawPatient.lastName) || rawPatient.lastName,
    };

    // Validate SMS channel requirements
    if (channel === 'SMS' && !patient.phone) {
      return NextResponse.json(
        { error: 'Cannot send SMS - patient has no phone number on file' },
        { status: 400 }
      );
    }

    // Validate replyToId if provided
    if (replyToId) {
      const replyMessage = await prisma.patientChatMessage.findUnique({
        where: { id: replyToId },
        select: { id: true, patientId: true },
      });
      if (!replyMessage || replyMessage.patientId !== patientId) {
        return NextResponse.json({ error: 'Invalid reply reference' }, { status: 400 });
      }
    }

    // Determine message direction and sender info
    const isPatient = user.role === 'patient';
    const direction = isPatient ? 'INBOUND' : 'OUTBOUND';
    const senderType = isPatient ? 'PATIENT' : user.role === 'provider' ? 'PROVIDER' : 'STAFF';

    // Create or use thread ID
    const finalThreadId = threadId || generateThreadId(clinicId);

    // Use transaction for atomic message creation + SMS delivery status
    const result = await prisma.$transaction(
      async (tx) => {
        // Create the message
        const chatMessage = await tx.patientChatMessage.create({
          data: {
            patientId,
            clinicId: clinicId || null,
            message,
            direction,
            channel,
            senderType,
            senderId: isPatient ? null : user.id,
            senderName: isPatient ? `${patient.firstName} ${patient.lastName}` : user.email,
            status: 'SENT',
            threadId: finalThreadId,
            replyToId: replyToId || null,
            // Persisted as JSON; cast through `unknown` because Prisma's
            // generated `InputJsonValue` does not narrow to our typed shape.
            attachments:
              persistedAttachments && persistedAttachments.length > 0
                ? (persistedAttachments as unknown as Prisma.InputJsonValue)
                : undefined,
            metadata: {
              userAgent: request.headers.get('user-agent'),
              createdBy: user.id,
            },
          },
        });

        return chatMessage;
      },
      { timeout: 15000 }
    );

    // Send SMS if requested (outside transaction - external service)
    let smsStatus = null;
    if (channel === 'SMS' && direction === 'OUTBOUND' && patient.phone) {
      try {
        const formattedPhone = formatPhoneNumber(patient.phone);
        const smsResult = await sendSMS({
          to: formattedPhone,
          body: message,
        });

        if (smsResult.success) {
          await prisma.patientChatMessage.update({
            where: { id: result.id },
            data: {
              status: 'DELIVERED',
              externalId: smsResult.messageId,
              deliveredAt: new Date(),
            },
          });
          smsStatus = 'delivered';
        } else {
          await prisma.patientChatMessage.update({
            where: { id: result.id },
            data: {
              status: 'FAILED',
              failureReason: smsResult.error || 'SMS delivery failed',
            },
          });
          smsStatus = 'failed';

          logger.error('SMS delivery failed', {
            chatMessageId: result.id,
            error: smsResult.error,
            patientId,
          });
        }
      } catch (smsError) {
        const errMsg = smsError instanceof Error ? smsError.message : 'Unknown SMS error';
        logger.error('SMS delivery exception', { error: errMsg, patientId });

        await prisma.patientChatMessage.update({
          where: { id: result.id },
          data: {
            status: 'FAILED',
            failureReason: errMsg,
          },
        });
        smsStatus = 'failed';
      }
    }

    // Fetch the created message with relations
    const fullMessage = await prisma.patientChatMessage.findUnique({
      where: { id: result.id },
      include: {
        replyTo: {
          select: { id: true, message: true, senderName: true },
        },
      },
    });

    // Audit log
    await auditChatAccess('SEND', user, patientId, {
      channel,
      messageId: result.id,
      smsStatus,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
      userAgent: request.headers.get('user-agent'),
    });

    // Notify clinic admins of new inbound patient message (non-blocking)
    if (direction === 'INBOUND' && clinicId) {
      const patientDisplayName = `${patient.firstName} ${patient.lastName}`.trim();
      const textPreview = message.length > 80 ? `${message.slice(0, 80)}…` : message;
      const attachmentPreview =
        persistedAttachments && persistedAttachments.length > 0
          ? buildAttachmentOnlyPreview(persistedAttachments)
          : '';
      const preview = textPreview
        ? attachmentPreview
          ? `${textPreview} ${attachmentPreview}`
          : textPreview
        : attachmentPreview || '(empty message)';
      notificationService
        .notifyAdmins({
          clinicId,
          category: 'MESSAGE',
          priority: 'NORMAL',
          title: `New message from ${patientDisplayName}`,
          message: preview,
          actionUrl: '/admin/messages',
          sourceType: 'patient_chat',
          sourceId: `chat_${result.id}`,
          metadata: {
            patientId,
            messageId: result.id,
            channel,
            attachmentCount: persistedAttachments?.length ?? 0,
          },
        })
        .catch((err) => {
          logger.error('Failed to notify admins of new message', {
            error: err instanceof Error ? err.message : 'Unknown error',
            patientId,
            messageId: result.id,
          });
        });
    }

    const duration = Date.now() - startTime;
    logger.info('Chat message sent', {
      messageId: result.id,
      patientId,
      channel,
      direction,
      smsStatus,
      durationMs: duration,
    });

    return NextResponse.json(fullMessage, { status: 201 });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    logger.error('Failed to send chat message', {
      error: errorMsg,
      ...(process.env.NODE_ENV === 'development' && { stack: errorStack }),
      userId: user.id,
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json(
      { error: 'Failed to send message', requestId: `req_${Date.now()}` },
      { status: 500 }
    );
  }
});

export const POST = standardRateLimit(postHandler);

// ============================================================================
// GET - Fetch messages for a patient
// ============================================================================

const getHandler = withAuth(async (request: NextRequest, user) => {
  const startTime = Date.now();

  try {
    const urlParams = new URL(request.url).searchParams;
    const nextParams = request.nextUrl.searchParams;
    const getParam = (key: string) => nextParams.get(key) ?? urlParams.get(key);
    let patientIdParam = getParam('patientId');
    if (patientIdParam == null && user.role === 'patient' && user.patientId != null)
      patientIdParam = String(user.patientId);
    const parseResult = getMessagesSchema.safeParse({
      patientId: patientIdParam,
      limit: getParam('limit'),
      before: getParam('before'),
      threadId: getParam('threadId'),
    });

    if (!parseResult.success) {
      logger.warn('Patient chat GET validation failed', {
        issues: parseResult.error.issues,
        rawParams: {
          patientId: getParam('patientId'),
          limit: getParam('limit'),
        },
      });
      return NextResponse.json(
        {
          error: 'Invalid parameters',
          details: parseResult.error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        },
        { status: 400 }
      );
    }

    const { patientId, limit, before, threadId } = parseResult.data;

    // Validate access with clinic check
    const accessCheck = await canAccessPatientMessages(user, patientId);
    if (!accessCheck.allowed) {
      return NextResponse.json({ error: accessCheck.reason || 'Access denied' }, { status: 403 });
    }

    const patient = accessCheck.patient!;

    // Build query filters with clinic isolation
    const whereClause: any = {
      patientId,
      // Add clinic filter for non-super-admin users
      ...(user.role !== 'super_admin' && patient.clinicId && { clinicId: patient.clinicId }),
    };

    if (threadId) {
      whereClause.threadId = threadId;
    }

    if (before) {
      whereClause.createdAt = { lt: new Date(before) };
    }

    // Fetch messages
    const messages = await prisma.patientChatMessage.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        replyTo: {
          select: { id: true, message: true, senderName: true },
        },
      },
    });

    // Get unread count for staff viewing patient messages
    let unreadCount = 0;
    if (user.role !== 'patient') {
      unreadCount = await prisma.patientChatMessage.count({
        where: {
          patientId,
          direction: 'INBOUND',
          readAt: null,
          ...(patient.clinicId && { clinicId: patient.clinicId }),
        },
      });
    }

    // Mark inbound messages as read when staff views them
    if (user.role !== 'patient' && messages.length > 0) {
      const unreadMessageIds = messages
        .filter((m) => m.direction === 'INBOUND' && !m.readAt)
        .map((m) => m.id);

      if (unreadMessageIds.length > 0) {
        await prisma.patientChatMessage.updateMany({
          where: {
            id: { in: unreadMessageIds },
            patientId,
            direction: 'INBOUND',
            readAt: null,
          },
          data: {
            readAt: new Date(),
          },
        });
      }
    }

    // Audit log for viewing messages
    await auditChatAccess('VIEW', user, patientId, {
      messageCount: messages.length,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
      userAgent: request.headers.get('user-agent'),
    });

    // -----------------------------------------------------------------
    // Resolve attachment s3Keys → 1h signed URLs. Done in parallel per
    // message; never returns the raw `s3Key` to the client. If S3 is
    // disabled (e.g. test env / dev without creds), strip the keys but
    // keep the metadata so the client can still render fallback UI.
    // -----------------------------------------------------------------
    const s3Available = isS3Enabled();
    const resolvedMessages = await Promise.all(
      messages.map(async (m) => {
        const raw = (m as { attachments?: unknown }).attachments;
        const resolved = await resolveAttachmentsForRead(raw, s3Available, {
          messageId: m.id,
          patientId,
        });
        return { ...m, attachments: resolved };
      })
    );

    const totalAttachments = resolvedMessages.reduce(
      (acc, m) => acc + (m.attachments?.length ?? 0),
      0
    );

    const duration = Date.now() - startTime;
    logger.debug('Chat messages fetched', {
      patientId,
      count: messages.length,
      unreadCount,
      attachmentCount: totalAttachments,
      durationMs: duration,
    });

    return NextResponse.json({
      data: resolvedMessages.reverse(), // Return in chronological order
      meta: {
        count: messages.length,
        unreadCount,
        patientId,
        hasMore: messages.length === limit,
        oldestTimestamp: messages.length > 0 ? messages[messages.length - 1].createdAt : null,
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to fetch chat messages', {
      error: errorMsg,
      userId: user.id,
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json(
      { error: 'Failed to fetch messages', requestId: `req_${Date.now()}` },
      { status: 500 }
    );
  }
});

export const GET = standardRateLimit(getHandler);

// ============================================================================
// PATCH - Mark messages as read
// ============================================================================

const patchHandler = withAuth(async (request: NextRequest, user) => {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const parseResult = markReadSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid parameters',
          details: parseResult.error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        },
        { status: 400 }
      );
    }

    const { patientId, messageIds } = parseResult.data;

    // Validate access with clinic check
    const accessCheck = await canAccessPatientMessages(user, patientId);
    if (!accessCheck.allowed) {
      return NextResponse.json({ error: accessCheck.reason || 'Access denied' }, { status: 403 });
    }

    const patient = accessCheck.patient!;

    // Mark messages as read with clinic isolation
    const result = await prisma.patientChatMessage.updateMany({
      where: {
        id: { in: messageIds },
        patientId,
        readAt: null,
        ...(patient.clinicId && { clinicId: patient.clinicId }),
      },
      data: {
        readAt: new Date(),
      },
    });

    // Audit log
    await auditChatAccess('READ_MARK', user, patientId, {
      messageIds,
      updatedCount: result.count,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
    });

    const duration = Date.now() - startTime;
    logger.debug('Messages marked as read', {
      patientId,
      messageIds,
      updatedCount: result.count,
      durationMs: duration,
    });

    return NextResponse.json({
      success: true,
      updated: result.count,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to mark messages as read', {
      error: errorMsg,
      userId: user.id,
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json(
      { error: 'Failed to update messages', requestId: `req_${Date.now()}` },
      { status: 500 }
    );
  }
});

export const PATCH = standardRateLimit(patchHandler);
