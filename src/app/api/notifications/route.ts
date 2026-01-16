import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { standardRateLimit } from '@/lib/rateLimit';

/**
 * GET /api/notifications
 * Get user's notifications
 *
 * NOTE: Notification model not yet implemented in database.
 * Returns empty array for now - will be populated when Notification
 * model is added to Prisma schema.
 */
async function getNotificationsHandler(req: NextRequest, user: AuthUser): Promise<Response> {
  // TODO: Implement when Notification model is added to schema
  // For now, return empty notifications to prevent 404 errors
  return NextResponse.json({
    notifications: [],
    unreadCount: 0,
    total: 0,
  });
}

/**
 * PUT /api/notifications
 * Mark notifications as read
 */
async function markNotificationsReadHandler(req: NextRequest, user: AuthUser): Promise<Response> {
  // TODO: Implement when Notification model is added to schema
  return NextResponse.json({ success: true });
}

export const GET = standardRateLimit(withAuth(getNotificationsHandler));
export const PUT = standardRateLimit(withAuth(markNotificationsReadHandler));
