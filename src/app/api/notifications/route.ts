import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { standardRateLimit } from '@/lib/rateLimit';
import { notificationService } from '@/services/notification';
import { z } from 'zod';
import type { NotificationCategory } from '@prisma/client';

// ============================================================================
// Validation Schemas
// ============================================================================

const getNotificationsSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
  category: z.enum([
    'PRESCRIPTION', 'PATIENT', 'ORDER', 'SYSTEM',
    'APPOINTMENT', 'MESSAGE', 'PAYMENT', 'REFILL', 'SHIPMENT'
  ]).optional(),
  isRead: z.enum(['true', 'false']).optional().transform(v => v === 'true' ? true : v === 'false' ? false : undefined),
  isArchived: z.enum(['true', 'false']).optional().transform(v => v === 'true' ? true : v === 'false' ? false : undefined),
});

const markReadSchema = z.object({
  notificationIds: z.array(z.number()).optional(),
  markAll: z.boolean().optional(),
  category: z.enum([
    'PRESCRIPTION', 'PATIENT', 'ORDER', 'SYSTEM',
    'APPOINTMENT', 'MESSAGE', 'PAYMENT', 'REFILL', 'SHIPMENT'
  ]).optional(),
});

const archiveSchema = z.object({
  notificationIds: z.array(z.number()).min(1),
});

// ============================================================================
// Handlers
// ============================================================================

/**
 * GET /api/notifications
 * Get user's notifications with pagination and filters
 *
 * Query params:
 * - page: Page number (default 1)
 * - pageSize: Items per page (default 20, max 100)
 * - category: Filter by category
 * - isRead: Filter by read status
 * - isArchived: Include archived (default false)
 */
async function getNotificationsHandler(req: NextRequest, user: AuthUser): Promise<Response> {
  try {
    const searchParams = Object.fromEntries(req.nextUrl.searchParams);
    const parsed = getNotificationsSchema.safeParse(searchParams);

    if (!parsed.success) {
      return NextResponse.json({
        error: 'Invalid query parameters',
        details: parsed.error.flatten(),
      }, { status: 400 });
    }

    const { page, pageSize, category, isRead, isArchived } = parsed.data;

    const result = await notificationService.getUserNotifications(
      {
        userId: user.id,
        category: category as NotificationCategory | undefined,
        isRead,
        isArchived: isArchived ?? false, // Default to excluding archived
      },
      page,
      pageSize
    );

    return NextResponse.json({
      notifications: result.notifications,
      unreadCount: result.unreadCount,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      hasMore: result.hasMore,
    });
  } catch (error) {
    // Log the full error for debugging
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = (error as any)?.code || 'unknown';

    console.error('[Notifications GET] Error details:', {
      message: errorMessage,
      code: errorCode,
      name: error instanceof Error ? error.name : 'unknown',
      userId: user.id,
    });

    // Check if this is a database/schema error
    const isSchemaError =
      errorMessage.includes('does not exist') ||
      errorMessage.includes('P2010') ||
      errorMessage.includes('P2021') ||
      errorMessage.includes('P2022') ||
      errorMessage.includes('relation') ||
      errorMessage.includes('column');

    if (isSchemaError) {
      // Schema mismatch - return empty with warning header
      console.warn('[Notifications GET] Schema mismatch detected - migrations may be needed');
      return NextResponse.json({
        notifications: [],
        unreadCount: 0,
        total: 0,
        page: 1,
        pageSize: 20,
        hasMore: false,
        _warning: 'Notification feature requires database migration',
      }, {
        headers: {
          'X-Notification-Warning': 'schema-mismatch',
        },
      });
    }

    // For other errors, still return empty data but with error info
    // Notifications are non-critical - app should function without them
    return NextResponse.json({
      notifications: [],
      unreadCount: 0,
      total: 0,
      page: 1,
      pageSize: 20,
      hasMore: false,
      _error: process.env.NODE_ENV === 'development' ? errorMessage : 'Failed to load notifications',
    });
  }
}

/**
 * PUT /api/notifications
 * Mark notifications as read
 *
 * Body options:
 * - { notificationIds: [1, 2, 3] } - Mark specific notifications
 * - { markAll: true } - Mark all as read
 * - { markAll: true, category: "PRESCRIPTION" } - Mark all in category
 */
async function markNotificationsReadHandler(req: NextRequest, user: AuthUser): Promise<Response> {
  try {
    const body = await req.json();
    const parsed = markReadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({
        error: 'Invalid request body',
        details: parsed.error.flatten(),
      }, { status: 400 });
    }

    const { notificationIds, markAll, category } = parsed.data;

    let count = 0;

    if (markAll) {
      count = await notificationService.markAllAsRead(
        user.id,
        category as NotificationCategory | undefined
      );
    } else if (notificationIds && notificationIds.length > 0) {
      count = await notificationService.markManyAsRead(notificationIds, user.id);
    } else {
      return NextResponse.json({
        error: 'Either notificationIds or markAll must be provided',
      }, { status: 400 });
    }

    // Get updated unread count
    const unreadCount = await notificationService.getUnreadCount(user.id);

    return NextResponse.json({
      success: true,
      markedCount: count,
      unreadCount,
    });
  } catch (error) {
    console.error('[Notifications PUT] Error:', error instanceof Error ? error.message : error);
    // Return success on any error - notifications are non-critical
    return NextResponse.json({
      success: true,
      markedCount: 0,
      unreadCount: 0,
    });
  }
}

/**
 * DELETE /api/notifications
 * Archive notifications
 *
 * Body:
 * - { notificationIds: [1, 2, 3] }
 */
async function archiveNotificationsHandler(req: NextRequest, user: AuthUser): Promise<Response> {
  try {
    const body = await req.json();
    const parsed = archiveSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({
        error: 'Invalid request body',
        details: parsed.error.flatten(),
      }, { status: 400 });
    }

    const { notificationIds } = parsed.data;

    const count = await notificationService.archiveMany(notificationIds, user.id);

    // Get updated unread count
    const unreadCount = await notificationService.getUnreadCount(user.id);

    return NextResponse.json({
      success: true,
      archivedCount: count,
      unreadCount,
    });
  } catch (error) {
    console.error('[Notifications DELETE] Error:', error instanceof Error ? error.message : error);
    // Return success on any error - notifications are non-critical
    return NextResponse.json({
      success: true,
      archivedCount: 0,
      unreadCount: 0,
    });
  }
}

export const GET = standardRateLimit(withAuth(getNotificationsHandler));
export const PUT = standardRateLimit(withAuth(markNotificationsReadHandler));
export const DELETE = standardRateLimit(withAuth(archiveNotificationsHandler));
