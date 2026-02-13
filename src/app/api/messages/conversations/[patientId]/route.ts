/**
 * Patient Conversation Thread API
 * GET /api/messages/conversations/[patientId] - Fetch chat thread for a specific patient
 *
 * ENTERPRISE FEATURES:
 * - Multi-tenant clinic isolation
 * - HIPAA audit logging
 * - Access control (staff can only view patients in their clinic)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { requirePermission, toPermissionContext } from '@/lib/rbac/permissions';
import { auditPhiAccess, buildAuditPhiOptions } from '@/lib/audit/hipaa-audit';
import { z } from 'zod';

// Validation schema for query params
const querySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return 50;
      const num = parseInt(val, 10);
      return isNaN(num) || num <= 0 ? 50 : Math.min(num, 100);
    }),
  before: z.string().optional(), // ISO datetime for pagination
});

/**
 * Check if user can access patient's messages
 */
async function canAccessPatient(
  user: AuthUser,
  patientId: number
): Promise<{ allowed: boolean; patient?: any; reason?: string }> {
  // Fetch patient with clinic info
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
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

  // Patients can only see their own messages
  if (user.role === 'patient') {
    if (user.patientId !== patientId) {
      return { allowed: false, reason: 'Access denied' };
    }
    return { allowed: true, patient };
  }

  // Staff must be in same clinic as patient
  if (user.clinicId && patient.clinicId && user.clinicId !== patient.clinicId) {
    // Check if user has access via UserClinic
    const userClinic = await prisma.userClinic.findFirst({
      where: {
        userId: user.id,
        clinicId: patient.clinicId,
        isActive: true,
      },
    });

    if (!userClinic) {
      logger.security('Cross-clinic access blocked', {
        userId: user.id,
        userClinicId: user.clinicId,
        patientId,
        patientClinicId: patient.clinicId,
      });
      return { allowed: false, reason: 'Access denied - clinic mismatch' };
    }
  }

  return { allowed: true, patient };
}

/**
 * GET - Fetch chat thread for a specific patient
 */
async function getHandler(
  request: NextRequest,
  user: AuthUser,
  { params }: { params: { patientId: string } }
) {
  const startTime = Date.now();

  try {
    requirePermission(toPermissionContext(user), 'message:view');
    // Parse patient ID from URL
    const patientId = parseInt(params.patientId, 10);
    if (isNaN(patientId) || patientId <= 0) {
      return NextResponse.json({ error: 'Invalid patient ID' }, { status: 400 });
    }

    // Parse query params
    const searchParams = request.nextUrl.searchParams;
    const parseResult = querySchema.safeParse({
      limit: searchParams.get('limit'),
      before: searchParams.get('before'),
    });

    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const { limit, before } = parseResult.data;

    // Check access
    const accessCheck = await canAccessPatient(user, patientId);
    if (!accessCheck.allowed) {
      return NextResponse.json({ error: accessCheck.reason || 'Access denied' }, { status: 403 });
    }

    const patient = accessCheck.patient!;

    // Build query
    const whereClause: Record<string, unknown> = {
      patientId,
    };

    // Add clinic filter for extra security
    if (patient.clinicId && user.role !== 'super_admin') {
      whereClause.clinicId = patient.clinicId;
    }

    if (before) {
      whereClause.createdAt = { lt: new Date(before) };
    }

    // Fetch messages
    const messages = await prisma.patientChatMessage.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        createdAt: true,
        message: true,
        direction: true,
        channel: true,
        senderType: true,
        senderName: true,
        status: true,
        readAt: true,
        replyToId: true,
        replyTo: {
          select: {
            id: true,
            message: true,
            senderName: true,
          },
        },
      },
    });

    // Transform to frontend-expected format
    const transformedMessages = messages.reverse().map((m: (typeof messages)[number]) => ({
      id: m.id,
      sender: m.direction === 'INBOUND' ? 'patient' : 'provider',
      content: m.message,
      timestamp: formatTimestamp(m.createdAt),
      channel: m.channel,
      status: m.status,
      readAt: m.readAt,
      senderName: m.senderName,
      replyTo: m.replyTo,
    }));

    // Get unread count for staff
    let unreadCount = 0;
    if (user.role !== 'patient') {
      unreadCount = await prisma.patientChatMessage.count({
        where: {
          patientId,
          direction: 'INBOUND',
          readAt: null,
          ...(patient.clinicId ? { clinicId: patient.clinicId } : {}),
        },
      });

      // Auto-mark inbound messages as read when staff views
      if (messages.length > 0) {
        const unreadIds = messages
          .filter((m: (typeof messages)[number]) => m.direction === 'INBOUND' && !m.readAt)
          .map((m: (typeof messages)[number]) => m.id);

        if (unreadIds.length > 0) {
          await prisma.patientChatMessage.updateMany({
            where: {
              id: { in: unreadIds },
              patientId,
              direction: 'INBOUND',
              readAt: null,
            },
            data: { readAt: new Date() },
          });
        }
      }
    }

    // Audit log
    try {
      await prisma.auditLog.create({
        data: {
          action: 'CHAT_VIEW',
          resource: 'PatientChatMessage',
          resourceId: patientId,
          userId: user.id,
          clinicId: user.clinicId || null,
          details: {
            patientId,
            messageCount: messages.length,
          },
        },
      });
    } catch (auditError) {
      logger.error('Failed to create audit log', { error: auditError });
    }

    await auditPhiAccess(request, buildAuditPhiOptions(request, user, 'message:view', {
      patientId,
      route: 'GET /api/messages/conversations/[patientId]',
    }));

    logger.debug('Chat thread fetched', {
      patientId,
      count: messages.length,
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json({
      messages: transformedMessages,
      patient: {
        id: patient.id,
        name: `${patient.firstName} ${patient.lastName}`.trim(),
      },
      meta: {
        count: messages.length,
        unreadCount,
        hasMore: messages.length === limit,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch chat thread', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: user.id,
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}

function formatTimestamp(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } else if (days === 1) {
    return 'Yesterday';
  } else if (days < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

// Create wrapper that passes params
const wrappedGetHandler = async (
  request: NextRequest,
  context: { params: Promise<{ patientId: string }> }
) => {
  const params = await context.params;
  return withAuth((req, user) => getHandler(req, user, { params }), {
    roles: ['super_admin', 'admin', 'provider', 'staff', 'support', 'patient'],
  })(request);
};

export const GET = wrappedGetHandler;
