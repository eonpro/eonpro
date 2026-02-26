import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { requirePermission, toPermissionContext } from '@/lib/rbac/permissions';
import { auditPhiAccess, buildAuditPhiOptions } from '@/lib/audit/hipaa-audit';
import { decryptPHI } from '@/lib/security/phi-encryption';

function safeDecrypt(value: string | null | undefined): string {
  if (!value) return '';
  try {
    return decryptPHI(value) || value;
  } catch {
    return value;
  }
}

/**
 * GET /api/messages/conversations - Get patient message conversations for provider
 * Returns a list of patients with their latest message and unread counts
 *
 * ENTERPRISE FEATURES:
 * - Multi-tenant clinic isolation
 * - Efficient single-query with aggregation
 * - HIPAA-compliant logging (no PHI)
 */
async function getHandler(request: NextRequest, user: AuthUser) {
  const startTime = Date.now();

  try {
    requirePermission(toPermissionContext(user), 'message:view');
    logger.api('GET', '/api/messages/conversations', {
      userId: user.id,
      userRole: user.role,
      clinicId: user.clinicId,
    });

    const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

    // Build clinic filter
    const clinicFilter = clinicId ? { clinicId } : {};

    // Step 1: Get patients who have chat messages
    // Using basePrisma to avoid clinic filter interference with complex queries
    const patientsWithMessages = await prisma.patient.findMany({
      where: {
        ...clinicFilter,
        chatMessages: {
          some: {}, // Has at least one message
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        chatMessages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            message: true,
            createdAt: true,
            direction: true,
            readAt: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 100,
    });

    // Step 2: Get unread counts for these patients in a separate efficient query
    const patientIds = patientsWithMessages.map((p) => p.id);

    // Get unread message counts grouped by patient
    const unreadCounts = await prisma.patientChatMessage.groupBy({
      by: ['patientId'],
      where: {
        patientId: { in: patientIds },
        direction: 'INBOUND', // Patient -> Staff messages
        readAt: null, // Not read yet
        ...clinicFilter,
      },
      _count: {
        id: true,
      },
    });

    // Create a map for quick lookup
    const unreadCountMap = new Map(unreadCounts.map((uc) => [uc.patientId, uc._count.id]));

    // Transform to frontend format (decrypt PHI names)
    const conversations = patientsWithMessages.map((p) => ({
      id: p.chatMessages[0]?.id || p.id,
      patientId: p.id,
      patientName: `${safeDecrypt(p.firstName)} ${safeDecrypt(p.lastName)}`.trim() || `Patient #${p.id}`,
      lastMessage: p.chatMessages[0]?.message || '',
      timestamp: p.chatMessages[0]?.createdAt ? formatTimestamp(p.chatMessages[0].createdAt) : '',
      unread: (unreadCountMap.get(p.id) || 0) > 0,
      unreadCount: unreadCountMap.get(p.id) || 0,
      priority: 'normal' as const,
    }));

    // Sort by unread first, then by timestamp
    conversations.sort((a, b) => {
      if (a.unread !== b.unread) return a.unread ? -1 : 1;
      return 0; // Keep original order (by updatedAt) for same unread status
    });

    logger.debug('Conversations fetched', {
      count: conversations.length,
      unreadTotal: conversations.filter((c) => c.unread).length,
      durationMs: Date.now() - startTime,
    });

    await auditPhiAccess(request, buildAuditPhiOptions(request, user, 'message:view', { route: 'GET /api/messages/conversations' }));

    return NextResponse.json({
      ok: true,
      conversations,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    logger.error('Error fetching conversations:', {
      error: errorMessage,
      ...(process.env.NODE_ENV === 'development' && { stack: errorStack }),
      userId: user.id,
      clinicId: user.clinicId,
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json(
      { error: 'Failed to fetch conversations', conversations: [] },
      { status: 500 }
    );
  }
}

const TZ = 'America/New_York';

function formatTimestamp(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  } else if (days === 1) {
    return 'Yesterday';
  } else if (days < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'short', timeZone: TZ });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ });
}

export const GET = withAuth(getHandler, {
  roles: ['super_admin', 'admin', 'provider'],
});
