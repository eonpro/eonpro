import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { requirePermission, toPermissionContext } from '@/lib/rbac/permissions';
import { auditPhiAccess, buildAuditPhiOptions } from '@/lib/audit/hipaa-audit';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { z } from 'zod';

function safeDecrypt(value: string | null | undefined): string {
  if (!value) return '';
  try {
    return decryptPHI(value) || value;
  } catch {
    return value;
  }
}

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
 * - Search via searchIndex (plaintext index on encrypted PHI)
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

    // Step 1: Find patient IDs with conversations, ordered by latest message,
    // with DB-level filtering for unread / needs_response.
    const messageWhereBase: Record<string, unknown> = { ...clinicFilter };

    if (filter === 'unread') {
      messageWhereBase.direction = 'INBOUND';
      messageWhereBase.readAt = null;
    }

    // Get patientIds ordered by most recent message activity (DB-level sort)
    const recentActivity = await prisma.patientChatMessage.groupBy({
      by: ['patientId'],
      where: messageWhereBase,
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: 'desc' } },
      take: 500,
    });

    let orderedPatientIds = recentActivity.map((r) => r.patientId);

    // For needs_response: further filter to patients whose *latest* message is INBOUND
    if (filter === 'needs_response') {
      const latestMessages = await prisma.patientChatMessage.findMany({
        where: {
          patientId: { in: orderedPatientIds },
          ...clinicFilter,
        },
        distinct: ['patientId'],
        orderBy: { createdAt: 'desc' },
        select: { patientId: true, direction: true },
      });
      const needsReplyIds = new Set(
        latestMessages.filter((m) => m.direction === 'INBOUND').map((m) => m.patientId),
      );
      orderedPatientIds = orderedPatientIds.filter((id) => needsReplyIds.has(id));
    }

    const totalFiltered = orderedPatientIds.length;

    // Paginate the ordered IDs
    const pageIds = orderedPatientIds.slice((page - 1) * limit, page * limit);

    // Step 2: Search filter — if searching, narrow to matching patients
    let finalIds = pageIds;
    if (search && pageIds.length > 0) {
      const matchingPatients = await prisma.patient.findMany({
        where: {
          id: { in: orderedPatientIds },
          searchIndex: { contains: search.toLowerCase(), mode: 'insensitive' },
        },
        select: { id: true },
      });
      const matchSet = new Set(matchingPatients.map((p) => p.id));
      const filteredOrdered = orderedPatientIds.filter((id) => matchSet.has(id));
      finalIds = filteredOrdered.slice((page - 1) * limit, page * limit);
    }

    // Step 3: Fetch patient details + latest message for the page
    const patientsWithMessages = await prisma.patient.findMany({
      where: { id: { in: finalIds } },
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
    });

    // Re-sort to match the ordered IDs (DB findMany doesn't preserve IN order)
    const patientMap = new Map(patientsWithMessages.map((p) => [p.id, p]));
    const sortedPatients = finalIds.map((id) => patientMap.get(id)).filter(Boolean) as typeof patientsWithMessages;

    // Step 4: Unread + total counts for the page
    const unreadCounts = await prisma.patientChatMessage.groupBy({
      by: ['patientId'],
      where: {
        patientId: { in: finalIds },
        direction: 'INBOUND',
        readAt: null,
        ...clinicFilter,
      },
      _count: { id: true },
    });
    const unreadMap = new Map(unreadCounts.map((uc) => [uc.patientId, uc._count.id]));

    const totalCounts = await prisma.patientChatMessage.groupBy({
      by: ['patientId'],
      where: { patientId: { in: finalIds }, ...clinicFilter },
      _count: { id: true },
    });
    const totalMap = new Map(totalCounts.map((tc) => [tc.patientId, tc._count.id]));

    // Build conversation list with decrypted patient names
    const conversations = sortedPatients.map((p) => {
      const last = p.chatMessages[0];
      const unreadCount = unreadMap.get(p.id) || 0;
      const firstName = safeDecrypt(p.firstName);
      const lastName = safeDecrypt(p.lastName);
      return {
        id: last?.id || p.id,
        patientId: p.id,
        patientName: `${firstName} ${lastName}`.trim() || `Patient #${p.id}`,
        lastMessage: last?.message || '',
        lastMessageAt: last?.createdAt?.toISOString() || null,
        timestamp: last?.createdAt ? formatTimestamp(last.createdAt) : '',
        direction: last?.direction || null,
        channel: last?.channel || 'WEB',
        senderType: last?.senderType || null,
        unread: unreadCount > 0,
        unreadCount,
        totalMessages: totalMap.get(p.id) || 0,
        needsResponse: last?.direction === 'INBOUND',
      };
    });

    // Aggregate stats for the entire clinic
    const [totalConversations, totalUnread, activeToday] = await Promise.all([
      prisma.patient.count({ where: { ...clinicFilter, chatMessages: { some: {} } } }),
      prisma.patientChatMessage.count({
        where: { direction: 'INBOUND', readAt: null, ...clinicFilter },
      }),
      prisma.patientChatMessage.groupBy({
        by: ['patientId'],
        where: { createdAt: { gte: (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })() }, ...clinicFilter },
        _count: { id: true },
      }),
    ]);

    const stats = {
      totalConversations,
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
        total: totalFiltered,
        totalPages: Math.ceil(totalFiltered / limit),
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
  roles: ['super_admin', 'admin'],
});
