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
    console.error('Failed to get notification count:', error);
    return NextResponse.json({
      error: 'Failed to get notification count',
    }, { status: 500 });
  }
}

export const GET = standardRateLimit(withAuth(getUnreadCountHandler));
