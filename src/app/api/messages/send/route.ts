/**
 * Send Patient Message API
 * POST /api/messages/send - Send a message to a patient
 *
 * This endpoint provides a convenient wrapper for the main patient-chat API,
 * matching the frontend's expected interface.
 *
 * ENTERPRISE FEATURES:
 * - Multi-tenant clinic isolation
 * - HIPAA audit logging
 * - SMS delivery via Twilio (optional)
 * - Input sanitization
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { requirePermission, toPermissionContext } from '@/lib/rbac/permissions';
import { auditPhiAccess, buildAuditPhiOptions } from '@/lib/audit/hipaa-audit';
import { standardRateLimit } from '@/lib/rateLimit';
import { sendSMS, formatPhoneNumber } from '@/lib/integrations/twilio/smsService';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { z } from 'zod';

function safeDecrypt(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decryptPHI(value) || value;
  } catch {
    return value;
  }
}

// Input sanitization
function sanitizeText(text: string): string {
  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim()
    .substring(0, 2000);
}

// Validation schema
const sendMessageSchema = z.object({
  patientId: z.union([z.string(), z.number()]).transform((val) => {
    const num = typeof val === 'string' ? parseInt(val, 10) : val;
    if (isNaN(num) || num <= 0) throw new Error('Invalid patientId');
    return num;
  }),
  content: z.string().min(1, 'Message cannot be empty').max(2000, 'Message too long'),
  channel: z.enum(['WEB', 'SMS']).default('WEB'),
});

/**
 * Check if user can send messages to this patient
 */
async function canAccessPatient(
  user: AuthUser,
  patientId: number
): Promise<{ allowed: boolean; patient?: any; reason?: string }> {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      clinicId: true,
    },
  });

  if (!patient) {
    return { allowed: false, reason: 'Patient not found' };
  }

  // Super admins can access any patient
  if (user.role === 'super_admin') {
    return { allowed: true, patient };
  }

  // Patients can send to themselves (for patient portal)
  if (user.role === 'patient') {
    if (user.patientId !== patientId) {
      return { allowed: false, reason: 'Access denied' };
    }
    return { allowed: true, patient };
  }

  // Staff must be in same clinic as patient
  if (user.clinicId && patient.clinicId && user.clinicId !== patient.clinicId) {
    const userClinic = await prisma.userClinic.findFirst({
      where: {
        userId: user.id,
        clinicId: patient.clinicId,
        isActive: true,
      },
    });

    if (!userClinic) {
      logger.security('Cross-clinic send blocked', {
        userId: user.id,
        patientId,
      });
      return { allowed: false, reason: 'Access denied' };
    }
  }

  return { allowed: true, patient };
}

/**
 * POST - Send a message to a patient
 */
async function postHandler(request: NextRequest, user: AuthUser) {
  const startTime = Date.now();

  try {
    requirePermission(toPermissionContext(user), 'message:send');
    const body = await request.json();
    const parseResult = sendMessageSchema.safeParse(body);

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

    const { patientId, content, channel } = parseResult.data;
    const message = sanitizeText(content);

    // Check access
    const accessCheck = await canAccessPatient(user, patientId);
    if (!accessCheck.allowed) {
      return NextResponse.json({ error: accessCheck.reason || 'Access denied' }, { status: 403 });
    }

    const rawPatient = accessCheck.patient!;
    const clinicId = rawPatient.clinicId || user.clinicId;

    const patient = {
      ...rawPatient,
      phone: safeDecrypt(rawPatient.phone),
      firstName: safeDecrypt(rawPatient.firstName) || rawPatient.firstName,
      lastName: safeDecrypt(rawPatient.lastName) || rawPatient.lastName,
    };

    // SMS requires phone number
    if (channel === 'SMS' && !patient.phone) {
      return NextResponse.json(
        { error: 'Cannot send SMS - patient has no phone number' },
        { status: 400 }
      );
    }

    // Determine direction and sender info
    const isPatient = user.role === 'patient';
    const direction = isPatient ? 'INBOUND' : 'OUTBOUND';
    const senderType = isPatient ? 'PATIENT' : user.role === 'provider' ? 'PROVIDER' : 'STAFF';

    // Create the message
    const chatMessage = await prisma.patientChatMessage.create({
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
        threadId: `thread_${patientId}_${Date.now()}`,
        metadata: {
          createdBy: user.id,
          userAgent: request.headers.get('user-agent'),
        },
      },
    });

    await auditPhiAccess(request, buildAuditPhiOptions(request, user, 'message:send', {
      patientId,
      route: 'POST /api/messages/send',
    }));

    // Send SMS if requested (outside DB transaction)
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
            where: { id: chatMessage.id },
            data: {
              status: 'DELIVERED',
              externalId: smsResult.messageId,
              deliveredAt: new Date(),
            },
          });
          smsStatus = 'delivered';
        } else {
          await prisma.patientChatMessage.update({
            where: { id: chatMessage.id },
            data: {
              status: 'FAILED',
              failureReason: smsResult.error || 'SMS delivery failed',
            },
          });
          smsStatus = 'failed';
        }
      } catch (smsError) {
        const errMsg = smsError instanceof Error ? smsError.message : 'SMS error';
        await prisma.patientChatMessage.update({
          where: { id: chatMessage.id },
          data: {
            status: 'FAILED',
            failureReason: errMsg,
          },
        });
        smsStatus = 'failed';
        logger.error('SMS delivery failed', { error: errMsg, patientId });
      }
    }

    // Audit log
    try {
      await prisma.auditLog.create({
        data: {
          action: 'CHAT_SEND',
          resource: 'PatientChatMessage',
          resourceId: patientId,
          userId: user.id,
          clinicId: user.clinicId || null,
          details: {
            messageId: chatMessage.id,
            channel,
            smsStatus,
          },
        },
      });
    } catch (auditError) {
      logger.error('Failed to create audit log', { error: auditError });
    }

    logger.info('Message sent', {
      messageId: chatMessage.id,
      patientId,
      channel,
      direction,
      smsStatus,
      durationMs: Date.now() - startTime,
    });

    // Return in frontend-expected format
    return NextResponse.json(
      {
        success: true,
        message: {
          id: chatMessage.id,
          sender: direction === 'INBOUND' ? 'patient' : 'provider',
          content: chatMessage.message,
          timestamp: formatTimestamp(chatMessage.createdAt),
          channel: chatMessage.channel,
          status: chatMessage.status,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error('Failed to send message', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: user.id,
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Export with auth and rate limiting
export const POST = standardRateLimit(
  withAuth(postHandler, {
    roles: ['super_admin', 'admin', 'provider', 'staff', 'support', 'patient'],
  })
);
