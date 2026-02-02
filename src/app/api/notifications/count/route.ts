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
    // Check if the error is due to missing Notification table (migration not applied)
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTableMissing = errorMessage.includes('does not exist') || 
                           errorMessage.includes('relation') ||
                           errorMessage.includes('P2021') ||
                           errorMessage.includes('P2025');
    
    if (isTableMissing) {
      console.warn('Notification table not found - returning 0 count. Run migrations to fix.');
      return NextResponse.json({ count: 0 });
    }
    
    console.error('Failed to get notification count:', error);
    return NextResponse.json({
      error: 'Failed to get notification count',
    }, { status: 500 });
  }
}

export const GET = standardRateLimit(withAuth(getUnreadCountHandler));
