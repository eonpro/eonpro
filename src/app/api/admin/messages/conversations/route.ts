import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { requirePermission, toPermissionContext } from '@/lib/rbac/permissions';
import { auditPhiAccess, buildAuditPhiOptions } from '@/lib/audit/hipaa-audit';
import { z } from 'zod';

const querySchema = z.object({
  search: z.string().max(100).optional(),
  filter: z.enum(['all', 'unread', 'needs_response']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/**
 * GET /api/admin/messages/conversations
 * Centralized admin view of all patient chat conversations for the clinic.
 *
 * - Multi-tenant clinic isolation
 * - Search by patient name
 * - Filter: all / unread / needs_response
 * - Paginated with aggregate stats
 * - HIPAA audit logged
 */
async function getHandler(request: NextRequest, user: AuthUser) {
  const startTime = Date.now();

  try {
    requirePermission(toPermissionContext(user), 'message:view');

    const params = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = querySchema.safeParse(params);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { search, filter, page, limit } = parsed.data;

    logger.api('GET', '/api/admin/messages/conversations', {
      userId: user.id,
      userRole: user.role,
      clinicId: user.clinicId,
      search: search || null,
      filter,
      page,
    });

    const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;
    const clinicFilter = clinicId ? { clinicId } : {};

    // Build patient where clause with optional name search
    const patientWhere: Record<string, unknown> = {
      ...clinicFilter,
      chatMessages: { some: {} },
    };

    if (search) {
      patientWhere.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Total count for pagination (before applying filter-specific constraints)
    const totalPatients = await prisma.patient.count({ where: patientWhere });

    // Fetch patients with their latest message
    const patientsWithMessages = await prisma.patient.findMany({
      where: patientWhere,
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
            channel: true,
            readAt: true,
            senderType: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const patientIds = patientsWithMessages.map((p) => p.id);

    // Unread counts (inbound messages not yet read)
    const unreadCounts = await prisma.patientChatMessage.groupBy({
      by: ['patientId'],
      where: {
        patientId: { in: patientIds },
        direction: 'INBOUND',
        readAt: null,
        ...clinicFilter,
      },
      _count: { id: true },
    });
    const unreadMap = new Map(unreadCounts.map((uc) => [uc.patientId, uc._count.id]));

    // Total message counts per patient
    const totalCounts = await prisma.patientChatMessage.groupBy({
      by: ['patientId'],
      where: { patientId: { in: patientIds }, ...clinicFilter },
      _count: { id: true },
    });
    const totalMap = new Map(totalCounts.map((tc) => [tc.patientId, tc._count.id]));

    // For "needs_response" filter: find patients whose last message is INBOUND
    const needsResponseIds = new Set(
      patientsWithMessages
        .filter((p) => p.chatMessages[0]?.direction === 'INBOUND')
        .map((p) => p.id),
    );

    // Build conversation list
    let conversations = patientsWithMessages.map((p) => {
      const last = p.chatMessages[0];
      const unreadCount = unreadMap.get(p.id) || 0;
      return {
        id: last?.id || p.id,
        patientId: p.id,
        patientName: `${p.firstName} ${p.lastName}`.trim(),
        lastMessage: last?.message || '',
        lastMessageAt: last?.createdAt?.toISOString() || null,
        timestamp: last?.createdAt ? formatTimestamp(last.createdAt) : '',
        direction: last?.direction || null,
        channel: last?.channel || 'WEB',
        senderType: last?.senderType || null,
        unread: unreadCount > 0,
        unreadCount,
        totalMessages: totalMap.get(p.id) || 0,
        needsResponse: needsResponseIds.has(p.id),
      };
    });

    // Apply client-side filter
    if (filter === 'unread') {
      conversations = conversations.filter((c) => c.unread);
    } else if (filter === 'needs_response') {
      conversations = conversations.filter((c) => c.needsResponse);
    }

    // Sort: unread first, then by most recent activity
    conversations.sort((a, b) => {
      if (a.unread !== b.unread) return a.unread ? -1 : 1;
      if (a.lastMessageAt && b.lastMessageAt) {
        return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
      }
      return 0;
    });

    // Aggregate stats for the entire clinic
    const totalUnread = await prisma.patientChatMessage.count({
      where: { direction: 'INBOUND', readAt: null, ...clinicFilter },
    });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const activeToday = await prisma.patientChatMessage.groupBy({
      by: ['patientId'],
      where: { createdAt: { gte: todayStart }, ...clinicFilter },
      _count: { id: true },
    });

    const stats = {
      totalConversations: totalPatients,
      totalUnread,
      activeToday: activeToday.length,
    };

    logger.debug('Admin conversations fetched', {
      count: conversations.length,
      totalUnread: stats.totalUnread,
      durationMs: Date.now() - startTime,
    });

    await auditPhiAccess(
      request,
      buildAuditPhiOptions(request, user, 'message:view', {
        route: 'GET /api/admin/messages/conversations',
      }),
    );

    return NextResponse.json({
      ok: true,
      conversations,
      stats,
      pagination: {
        page,
        limit,
        total: totalPatients,
        totalPages: Math.ceil(totalPatients / limit),
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error fetching admin conversations', {
      error: errorMessage,
      userId: user.id,
      clinicId: user.clinicId,
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json(
      { error: 'Failed to fetch conversations', conversations: [], stats: null },
      { status: 500 },
    );
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
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const GET = withAuth(getHandler, {
  roles: ['super_admin', 'admin'],
});
