import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { standardRateLimit } from '@/lib/rateLimit';
import { notificationService } from '@/services/notification';

/**
 * POST /api/notifications/[id]/read
 * Mark a single notification as read
 */
async function markSingleReadHandler(
  req: NextRequest, 
  user: AuthUser
): Promise<Response> {
  try {
    // Extract ID from URL
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const idIndex = pathParts.indexOf('notifications') + 1;
    const idStr = pathParts[idIndex];
    const notificationId = parseInt(idStr, 10);

    if (isNaN(notificationId)) {
      return NextResponse.json({
        error: 'Invalid notification ID',
      }, { status: 400 });
    }

    const notification = await notificationService.markAsRead(notificationId, user.id);

    if (!notification) {
      return NextResponse.json({
        error: 'Notification not found',
      }, { status: 404 });
    }

    // Get updated unread count
    const unreadCount = await notificationService.getUnreadCount(user.id);

    return NextResponse.json({
      success: true,
      notification,
      unreadCount,
    });
  } catch (error) {
    console.error('Failed to mark notification as read:', error);
    return NextResponse.json({
      error: 'Failed to mark notification as read',
    }, { status: 500 });
  }
}

export const POST = standardRateLimit(withAuth(markSingleReadHandler));
