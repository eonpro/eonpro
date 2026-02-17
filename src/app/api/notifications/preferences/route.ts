/**
 * Notification Preferences API
 *
 * Manages user notification preferences that are persisted to the database.
 * Syncs with the frontend NotificationProvider component.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import type { NotificationCategory } from '@prisma/client';

// ============================================================================
// Validation Schemas
// ============================================================================

const notificationPreferencesSchema = z.object({
  // Sound settings
  soundEnabled: z.boolean().optional(),
  soundVolume: z.number().min(0).max(100).optional(),
  soundForPriorities: z.array(z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT'])).optional(),

  // Toast settings
  toastEnabled: z.boolean().optional(),
  toastDuration: z.number().min(1000).max(30000).optional(),
  toastPosition: z.enum(['top-right', 'top-left', 'bottom-right', 'bottom-left']).optional(),

  // Browser notifications
  browserNotificationsEnabled: z.boolean().optional(),

  // Do Not Disturb
  dndEnabled: z.boolean().optional(),
  dndScheduleEnabled: z.boolean().optional(),
  dndStartTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  dndEndTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  dndDays: z.array(z.number().min(0).max(6)).optional(),

  // Category preferences
  mutedCategories: z
    .array(
      z.enum([
        'PRESCRIPTION',
        'PATIENT',
        'ORDER',
        'SYSTEM',
        'APPOINTMENT',
        'MESSAGE',
        'PAYMENT',
        'REFILL',
        'SHIPMENT',
      ])
    )
    .optional(),

  // Display settings
  groupSimilar: z.boolean().optional(),
  showDesktopBadge: z.boolean().optional(),

  // Email preferences (from User model)
  emailNotificationsEnabled: z.boolean().optional(),
  emailDigestEnabled: z.boolean().optional(),
  emailDigestFrequency: z.enum(['daily', 'weekly', 'never']).optional(),
});

// Default preferences
const DEFAULT_PREFERENCES = {
  soundEnabled: true,
  soundVolume: 50,
  soundForPriorities: ['HIGH', 'URGENT'] as const,
  toastEnabled: true,
  toastDuration: 5000,
  toastPosition: 'top-right' as const,
  browserNotificationsEnabled: false,
  dndEnabled: false,
  dndScheduleEnabled: false,
  dndStartTime: '22:00',
  dndEndTime: '08:00',
  dndDays: [0, 1, 2, 3, 4, 5, 6],
  mutedCategories: [] as NotificationCategory[],
  groupSimilar: true,
  showDesktopBadge: true,
  emailNotificationsEnabled: true,
  emailDigestEnabled: false,
  emailDigestFrequency: 'weekly' as const,
};

// ============================================================================
// Handlers
// ============================================================================

/**
 * GET /api/notifications/preferences
 * Get the authenticated user's notification preferences
 */
async function getPreferencesHandler(req: NextRequest, user: AuthUser): Promise<Response> {
  try {
    // Try to fetch preferences from database
    // If tables don't exist yet, return defaults (graceful degradation)
    let dbPreferences = null;
    let userEmailPrefs = null;

    try {
      [dbPreferences, userEmailPrefs] = await Promise.all([
        prisma.userNotificationPreference.findUnique({
          where: { userId: user.id },
        }),
        prisma.user.findUnique({
          where: { id: user.id },
          select: {
            emailNotificationsEnabled: true,
            emailDigestEnabled: true,
            emailDigestFrequency: true,
          },
        }),
      ]);
    } catch (dbError) {
      // Database tables might not exist yet - return defaults
      logger.warn('UserNotificationPreference table may not exist, returning defaults', {
        error: dbError instanceof Error ? dbError.message : 'Unknown error',
        userId: user.id,
      });
    }

    // Merge with defaults
    const preferences = {
      // Notification preferences
      soundEnabled: dbPreferences?.soundEnabled ?? DEFAULT_PREFERENCES.soundEnabled,
      soundVolume: dbPreferences?.soundVolume ?? DEFAULT_PREFERENCES.soundVolume,
      soundForPriorities:
        (dbPreferences?.soundForPriorities as string[]) ?? DEFAULT_PREFERENCES.soundForPriorities,
      toastEnabled: dbPreferences?.toastEnabled ?? DEFAULT_PREFERENCES.toastEnabled,
      toastDuration: dbPreferences?.toastDuration ?? DEFAULT_PREFERENCES.toastDuration,
      toastPosition: dbPreferences?.toastPosition ?? DEFAULT_PREFERENCES.toastPosition,
      browserNotificationsEnabled:
        dbPreferences?.browserNotificationsEnabled ??
        DEFAULT_PREFERENCES.browserNotificationsEnabled,
      dndEnabled: dbPreferences?.dndEnabled ?? DEFAULT_PREFERENCES.dndEnabled,
      dndScheduleEnabled:
        dbPreferences?.dndScheduleEnabled ?? DEFAULT_PREFERENCES.dndScheduleEnabled,
      dndStartTime: dbPreferences?.dndStartTime ?? DEFAULT_PREFERENCES.dndStartTime,
      dndEndTime: dbPreferences?.dndEndTime ?? DEFAULT_PREFERENCES.dndEndTime,
      dndDays: (dbPreferences?.dndDays as number[]) ?? DEFAULT_PREFERENCES.dndDays,
      mutedCategories:
        (dbPreferences?.mutedCategories as string[]) ?? DEFAULT_PREFERENCES.mutedCategories,
      groupSimilar: dbPreferences?.groupSimilar ?? DEFAULT_PREFERENCES.groupSimilar,
      showDesktopBadge: dbPreferences?.showDesktopBadge ?? DEFAULT_PREFERENCES.showDesktopBadge,

      // Email preferences from User model
      emailNotificationsEnabled:
        userEmailPrefs?.emailNotificationsEnabled ?? DEFAULT_PREFERENCES.emailNotificationsEnabled,
      emailDigestEnabled:
        userEmailPrefs?.emailDigestEnabled ?? DEFAULT_PREFERENCES.emailDigestEnabled,
      emailDigestFrequency:
        userEmailPrefs?.emailDigestFrequency ?? DEFAULT_PREFERENCES.emailDigestFrequency,
    };

    return NextResponse.json({
      success: true,
      preferences,
    });
  } catch (error) {
    logger.error('Failed to get notification preferences', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: user.id,
    });

    // Return defaults even on error - don't break the UI
    return NextResponse.json({
      success: true,
      preferences: DEFAULT_PREFERENCES,
      _fallback: true,
    });
  }
}

/**
 * PUT /api/notifications/preferences
 * Update the authenticated user's notification preferences
 */
async function updatePreferencesHandler(req: NextRequest, user: AuthUser): Promise<Response> {
  try {
    const body = await req.json();
    const parsed = notificationPreferencesSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid preferences',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const updates = parsed.data;

    // Separate email preferences (go to User model) from notification preferences
    const emailUpdates: {
      emailNotificationsEnabled?: boolean;
      emailDigestEnabled?: boolean;
      emailDigestFrequency?: string;
    } = {};
    const notificationUpdates: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) continue;

      if (key === 'emailNotificationsEnabled') {
        emailUpdates.emailNotificationsEnabled = value as boolean;
      } else if (key === 'emailDigestEnabled') {
        emailUpdates.emailDigestEnabled = value as boolean;
      } else if (key === 'emailDigestFrequency') {
        emailUpdates.emailDigestFrequency = value as string;
      } else {
        notificationUpdates[key] = value;
      }
    }

    // Try to update in database - if tables don't exist, silently succeed
    // (preferences are also stored in localStorage as backup)
    try {
      await prisma.$transaction(async (tx) => {
        // Update User email preferences
        if (Object.keys(emailUpdates).length > 0) {
          await tx.user.update({
            where: { id: user.id },
            data: emailUpdates,
          });
        }

        // Upsert notification preferences
        if (Object.keys(notificationUpdates).length > 0) {
          await tx.userNotificationPreference.upsert({
            where: { userId: user.id },
            create: {
              userId: user.id,
              ...notificationUpdates,
            },
            update: notificationUpdates,
          });
        }
      }, { timeout: 15000 });

      logger.info('Notification preferences updated', {
        userId: user.id,
        updatedFields: Object.keys(updates),
      });
    } catch (dbError) {
      // Database tables might not exist yet - that's okay
      // Preferences are stored in localStorage on the client as well
      logger.warn('Could not persist notification preferences to database', {
        error: dbError instanceof Error ? dbError.message : 'Unknown error',
        userId: user.id,
      });
    }

    // Return success with the updates (client will use localStorage as backup)
    return NextResponse.json({
      success: true,
      preferences: { ...DEFAULT_PREFERENCES, ...updates },
      _persisted: false, // Indicates DB write may have failed
    });
  } catch (error) {
    logger.error('Failed to update notification preferences', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: user.id,
    });

    // Still return success - client will use localStorage
    return NextResponse.json({
      success: true,
      preferences: DEFAULT_PREFERENCES,
      _fallback: true,
    });
  }
}

// ============================================================================
// Exports
// ============================================================================

export const GET = withAuth(getPreferencesHandler);
export const PUT = withAuth(updatePreferencesHandler);
