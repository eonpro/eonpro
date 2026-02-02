import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { standardRateLimit } from '@/lib/rateLimit';
import { notificationService } from '@/services/notification';

/**
 * GET /api/notifications/count
 * Get unread notification count for badge display
 */
async function getUnreadCountHandler(req: NextRequest, user: AuthUser): Promise<Response> {
  try {
    const count = await notificationService.getUnreadCount(user.id);

    return NextResponse.json({
      count,
    });
  } catch (error) {
    console.error('[Notifications Count] Error:', error instanceof Error ? error.message : error);
    // Return 0 on any error - notifications are non-critical
    return NextResponse.json({ count: 0 });
  }
}

export const GET = standardRateLimit(withAuth(getUnreadCountHandler));
