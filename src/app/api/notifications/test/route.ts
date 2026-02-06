/**
 * Test Notification API
 * 
 * Creates a test notification for the authenticated user.
 * This is for development/debugging purposes only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { notificationService } from '@/services/notification';

async function testNotificationHandler(req: NextRequest, user: AuthUser): Promise<Response> {
  try {
    // Create a test notification
    const notification = await notificationService.createNotification({
      userId: user.id,
      clinicId: user.clinicId || undefined,
      category: 'SYSTEM',
      priority: 'HIGH',
      title: '🔔 Notification Test',
      message: `Test notification created at ${new Date().toLocaleString()}. If you see this, your notification system is working!`,
      actionUrl: '/admin/intakes',
      metadata: {
        testId: Date.now(),
        environment: process.env.NODE_ENV,
      },
      sourceType: 'test',
      sourceId: `test-${Date.now()}`,
    });

    console.log('[Test Notification] Created:', {
      id: notification.id,
      userId: user.id,
      title: notification.title,
    });

    return NextResponse.json({
      success: true,
      message: 'Test notification created successfully',
      notification: {
        id: notification.id,
        title: notification.title,
        message: notification.message,
        createdAt: notification.createdAt,
      },
    });
  } catch (error) {
    console.error('[Test Notification] Error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create test notification',
      details: process.env.NODE_ENV === 'development' ? String(error) : undefined,
    }, { status: 500 });
  }
}

export const POST = withAuth(testNotificationHandler);
