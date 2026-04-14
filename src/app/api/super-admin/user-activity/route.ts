/**
 * User Activity API
 *
 * GET /api/super-admin/user-activity
 *
 * Returns comprehensive user activity data:
 * - All users with last login times
 * - Currently online users (active sessions)
 * - Recent activity logs
 * - Session statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getRecentlyActiveUserIds } from '@/lib/auth/middleware-cache';
import { buildFuzzySearchOr, sortBySearchRelevance } from '@/lib/utils/search';

interface UserActivityStats {
  totalUsers: number;
  activeUsers: number; // Users who logged in within last 30 days
  onlineUsers: number; // Users with active sessions
  newUsersThisMonth: number;
}

export const GET = withAuth(
  async (request: NextRequest) => {
    try {
      const { searchParams } = new URL(request.url);
      const page = parseInt(searchParams.get('page') || '1', 10);
      const limit = parseInt(searchParams.get('limit') || '50', 10);
      const filter = searchParams.get('filter') || 'all'; // all, online, recent, never
      const loginType = (searchParams.get('loginType') || 'all').toLowerCase();
      const search = (searchParams.get('search') || '').trim();
      const sortBy = searchParams.get('sortBy') || 'lastLogin';
      const sortOrder = searchParams.get('sortOrder') || 'desc';

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Build where clause based on filter
      let whereClause: any = {};
      const loginTypeRoleMap: Record<string, string[]> = {
        all: [],
        super_admin: ['SUPER_ADMIN'],
        admin: ['ADMIN'],
        provider: ['PROVIDER'],
        staff: ['STAFF'],
        support: ['SUPPORT'],
        patient: ['PATIENT'],
        affiliate: ['AFFILIATE'],
        sales: ['SALES_REP'],
        sales_rep: ['SALES_REP'],
        pharmacy: ['PHARMACY_REP'],
        pharmacy_staff: ['PHARMACY_REP'],
      };

      if (!(loginType in loginTypeRoleMap)) {
        return NextResponse.json({ error: 'Invalid loginType filter' }, { status: 400 });
      }

      if (loginType !== 'all') {
        whereClause.role = { in: loginTypeRoleMap[loginType] };
      }

      if (search) {
        whereClause.OR = buildFuzzySearchOr(search, ['email'], ['firstName', 'lastName']);
      }

      if (filter === 'recent') {
        whereClause.lastLogin = { gte: thirtyDaysAgo };
      } else if (filter === 'never') {
        whereClause.lastLogin = null;
      }

      // Get active sessions from DB (login/token-refresh based)
      const activeSessions = await prisma.userSession.findMany({
        where: {
          lastActivity: { gte: fifteenMinutesAgo },
          expiresAt: { gt: now },
        },
        select: { userId: true },
        take: 1000,
      });
      const dbOnlineIds = new Set(activeSessions.map((s: { userId: number }) => s.userId));

      // Get recently active users from Redis (request-level activity, updated every minute)
      const redisActivityMap = await getRecentlyActiveUserIds(15);

      // Merge both sources: user is online if detected by EITHER DB sessions or Redis activity
      const onlineUserIds = new Set<number>([
        ...Array.from(dbOnlineIds),
        ...Array.from(redisActivityMap.keys()),
      ]);

      if (filter === 'online') {
        whereClause.id = { in: Array.from(onlineUserIds) };
      }

      // Get total count for pagination
      const totalCount = await prisma.user.count({ where: whereClause });

      // Determine sort field
      const orderBy: any = {};
      if (sortBy === 'lastLogin') {
        orderBy.lastLogin = sortOrder === 'asc' ? 'asc' : 'desc';
      } else if (sortBy === 'createdAt') {
        orderBy.createdAt = sortOrder === 'asc' ? 'asc' : 'desc';
      } else if (sortBy === 'email') {
        orderBy.email = sortOrder === 'asc' ? 'asc' : 'desc';
      } else if (sortBy === 'name') {
        orderBy.firstName = sortOrder === 'asc' ? 'asc' : 'desc';
      }

      // Get users with activity data
      const users = await prisma.user.findMany({
        where: whereClause,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          lastLogin: true,
          createdAt: true,
          clinicId: true,
          providerId: true,
          patientId: true,
          clinic: {
            select: { id: true, name: true, subdomain: true },
          },
          provider: {
            select: { id: true, firstName: true, lastName: true },
          },
          sessions: {
            where: {
              expiresAt: { gt: now },
            },
            orderBy: { lastActivity: 'desc' },
            take: 1,
            select: {
              id: true,
              lastActivity: true,
              ipAddress: true,
              userAgent: true,
              createdAt: true,
            },
          },
          _count: {
            select: {
              auditLogs: true,
              sessions: true,
            },
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      });

      // Enrich users with online status from both DB sessions and Redis activity
      const enrichedUsers = users.map((user: (typeof users)[number]) => {
        const isOnline = onlineUserIds.has(user.id);
        const currentSession = user.sessions[0];
        const redisActivity = redisActivityMap.get(user.id);
        let sessionDuration = null;

        if (currentSession && isOnline) {
          sessionDuration = Math.floor(
            (now.getTime() - new Date(currentSession.createdAt).getTime()) / 1000 / 60
          );
        }

        // Use Redis activity data to supplement DB session info when available
        const lastActivity = redisActivity?.lastActivity
          ? new Date(redisActivity.lastActivity)
          : (currentSession?.lastActivity ?? null);

        const sessionInfo = currentSession
          ? {
              ipAddress: redisActivity?.ipAddress || currentSession.ipAddress,
              userAgent: currentSession.userAgent,
              startedAt: currentSession.createdAt,
              lastActivity: lastActivity,
              durationMinutes: sessionDuration,
            }
          : isOnline && redisActivity
            ? {
                ipAddress: redisActivity.ipAddress,
                userAgent: null,
                startedAt: null,
                lastActivity: new Date(redisActivity.lastActivity),
                durationMinutes: null,
              }
            : null;

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          status: user.status,
          lastLogin: user.lastLogin,
          createdAt: user.createdAt,
          clinicId: user.clinicId,
          clinic: user.clinic,
          providerId: user.providerId,
          provider: user.provider,
          isOnline,
          currentSession: sessionInfo,
          totalSessions: user._count.sessions,
          totalActions: user._count.auditLogs,
        };
      });

      // Calculate stats
      const stats: UserActivityStats = {
        totalUsers: await prisma.user.count(),
        activeUsers: await prisma.user.count({
          where: { lastLogin: { gte: thirtyDaysAgo } },
        }),
        onlineUsers: onlineUserIds.size,
        newUsersThisMonth: await prisma.user.count({
          where: { createdAt: { gte: startOfMonth } },
        }),
      };

      // Get recent activity logs (last 100)
      const recentActivity = await prisma.userAuditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          userId: true,
          action: true,
          details: true,
          ipAddress: true,
          createdAt: true,
          user: {
            select: {
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
      });

      // When searching, sort by relevance so the best match appears first
      const sortedUsers = search
        ? sortBySearchRelevance(enrichedUsers, search, (u) => [
            u.firstName ?? '',
            u.lastName ?? '',
            u.email ?? '',
          ])
        : enrichedUsers;

      return NextResponse.json({
        ok: true,
        users: sortedUsers,
        stats,
        recentActivity,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      });
    } catch (error: unknown) {
      logger.error('[API] Error fetching user activity:', {
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json({ error: 'Failed to fetch user activity' }, { status: 500 });
    }
  },
  { roles: ['super_admin'] }
);

/**
 * POST /api/super-admin/user-activity
 *
 * Force logout a user (invalidate all their sessions)
 */
export const POST = withAuth(
  async (request: NextRequest, user: AuthUser) => {
    try {
      const body = await request.json();
      const { action, userId } = body;

      if (action === 'force_logout' && userId) {
        // Delete all sessions for the user
        const deleted = await prisma.userSession.deleteMany({
          where: { userId: parseInt(userId, 10) },
        });

        // Create audit log
        await prisma.userAuditLog.create({
          data: {
            userId: parseInt(userId, 10),
            action: 'FORCE_LOGOUT',
            details: {
              performedBy: user.email,
              performedByUserId: user.id,
              sessionsDeleted: deleted.count,
            },
            ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
          },
        });

        logger.info('[Admin] User force logged out', {
          targetUserId: userId,
          performedBy: user.email,
          sessionsDeleted: deleted.count,
        });

        return NextResponse.json({
          ok: true,
          message: `User logged out, ${deleted.count} sessions invalidated`,
        });
      }

      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error: unknown) {
      logger.error('[API] Error performing user activity action:', {
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json({ error: 'Failed to perform action' }, { status: 500 });
    }
  },
  { roles: ['super_admin'] }
);
