/**
 * Apple Calendar Service
 * 
 * Apple Calendar primarily uses iCal subscriptions for external calendar integration.
 * Unlike Google and Outlook, Apple doesn't provide a REST API for iCloud Calendar.
 * 
 * This service provides:
 * 1. iCal subscription URL generation for Apple Calendar
 * 2. Tracking of Apple Calendar connections
 * 3. Instructions for users on how to subscribe
 * 
 * Note: For true two-way sync with Apple Calendar, users would need to:
 * - Use our iCal subscription (one-way: our appointments → their calendar)
 * - Or use Google/Outlook calendar sync with their Apple account
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { 
  createCalendarSubscription, 
  generateSubscriptionToken 
} from './ical.service';

// ============================================================================
// Types
// ============================================================================

export interface AppleCalendarSetup {
  feedUrl: string;
  webcalUrl: string;
  instructions: string[];
  qrCodeUrl?: string;
}

// ============================================================================
// Connection Status
// ============================================================================

/**
 * Check if provider has Apple Calendar connected (via iCal subscription)
 */
export async function isAppleCalendarConnected(providerId: number): Promise<boolean> {
  const integration = await prisma.providerCalendarIntegration.findFirst({
    where: {
      providerId,
      provider: 'apple',
      isActive: true,
    }
  });

  return !!integration;
}

/**
 * Get Apple Calendar integration status
 */
export async function getAppleCalendarStatus(providerId: number) {
  const integration = await prisma.providerCalendarIntegration.findFirst({
    where: {
      providerId,
      provider: 'apple',
    }
  });

  // Also check for iCal subscriptions
  const subscriptions = await prisma.calendarSubscription.findMany({
    where: {
      providerId,
      isActive: true,
    },
    select: {
      id: true,
      token: true,
      name: true,
      lastAccessedAt: true,
      accessCount: true,
    }
  });

  return {
    isConnected: !!integration?.isActive || subscriptions.length > 0,
    integration,
    subscriptions,
    syncType: 'subscription', // Apple uses subscription-based sync
  };
}

// ============================================================================
// Setup Functions
// ============================================================================

/**
 * Setup Apple Calendar integration for a provider
 * Creates an iCal subscription that can be added to Apple Calendar
 */
export async function setupAppleCalendar(
  providerId: number,
  clinicId?: number,
  options?: {
    includePatientNames?: boolean;
    includeMeetingLinks?: boolean;
  }
): Promise<AppleCalendarSetup> {
  // Create iCal subscription
  const subscription = await createCalendarSubscription(
    providerId,
    clinicId,
    {
      name: 'Appointments (Apple Calendar)',
      includePatientNames: options?.includePatientNames ?? false,
      includeMeetingLinks: options?.includeMeetingLinks ?? true,
      syncRangeDays: 90,
    }
  );

  // Create or update provider calendar integration record
  await prisma.providerCalendarIntegration.upsert({
    where: {
      providerId_provider: {
        providerId,
        provider: 'apple',
      }
    },
    update: {
      isActive: true,
      syncEnabled: true,
      lastSyncAt: new Date(),
      metadata: {
        subscriptionId: subscription.id,
        setupAt: new Date().toISOString(),
      }
    },
    create: {
      providerId,
      provider: 'apple',
      isActive: true,
      syncEnabled: true,
      syncDirection: 'to_external', // iCal is one-way (our data → their calendar)
      metadata: {
        subscriptionId: subscription.id,
        setupAt: new Date().toISOString(),
      }
    }
  });

  // Generate URLs
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.eonpro.io';
  const feedUrl = `${baseUrl}/api/calendar/ical/${subscription.token}`;
  const webcalUrl = `webcal://${new URL(baseUrl).host}/api/calendar/ical/${subscription.token}`;

  logger.info('Apple Calendar setup completed', {
    providerId,
    subscriptionId: subscription.id,
  });

  return {
    feedUrl,
    webcalUrl,
    instructions: [
      '1. On your Mac, open Calendar app',
      '2. Go to File → New Calendar Subscription',
      '3. Paste this URL and click Subscribe:',
      `   ${webcalUrl}`,
      '',
      'On iPhone/iPad:',
      '1. Go to Settings → Calendar → Accounts',
      '2. Add Account → Other → Add Subscribed Calendar',
      `3. Paste this URL: ${feedUrl}`,
      '',
      'The calendar will automatically refresh every 30 minutes.',
    ],
    // Optional: Generate QR code URL (would need a QR service)
    qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(webcalUrl)}`,
  };
}

/**
 * Disconnect Apple Calendar integration
 */
export async function disconnectAppleCalendar(
  providerId: number
): Promise<{ success: boolean }> {
  try {
    // Get the integration to find subscription ID
    const integration = await prisma.providerCalendarIntegration.findFirst({
      where: {
        providerId,
        provider: 'apple',
      }
    });

    // Deactivate related subscriptions
    if (integration?.metadata && typeof integration.metadata === 'object') {
      const metadata = integration.metadata as { subscriptionId?: number };
      if (metadata.subscriptionId) {
        await prisma.calendarSubscription.update({
          where: { id: metadata.subscriptionId },
          data: { isActive: false }
        });
      }
    }

    // Update integration status
    await prisma.providerCalendarIntegration.updateMany({
      where: {
        providerId,
        provider: 'apple',
      },
      data: {
        isActive: false,
        accessToken: null,
        refreshToken: null,
      }
    });

    logger.info('Apple Calendar disconnected', { providerId });

    return { success: true };
  } catch (error) {
    logger.error('Failed to disconnect Apple Calendar', {
      providerId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return { success: false };
  }
}

// ============================================================================
// Note on Full CalDAV Integration
// ============================================================================

/**
 * Full CalDAV Integration Notes:
 * 
 * Apple Calendar uses CalDAV (RFC 4791) for full calendar sync.
 * Implementing a CalDAV server would require:
 * 
 * 1. CalDAV Server Implementation:
 *    - WebDAV base layer (RFC 4918)
 *    - CalDAV extension (RFC 4791)
 *    - CardDAV for contacts (RFC 6352) - optional
 * 
 * 2. Authentication:
 *    - Apple-specific authentication (app-specific passwords)
 *    - Or OAuth with Sign in with Apple (limited calendar access)
 * 
 * 3. Sync Protocol:
 *    - PROPFIND for listing calendars
 *    - REPORT for fetching events
 *    - PUT for creating/updating events
 *    - DELETE for removing events
 *    - MKCALENDAR for creating calendars
 * 
 * 4. Libraries:
 *    - sabre/dav (PHP) - most complete
 *    - radicale (Python) - simpler
 *    - No mature Node.js CalDAV server library
 * 
 * For our use case, iCal subscriptions provide the best balance of:
 * - Easy setup for users
 * - Low maintenance
 * - Good enough sync for appointments
 * 
 * The main limitation is one-way sync (our data → user's calendar).
 * If the user creates events in Apple Calendar, they won't sync back.
 * 
 * For bi-directional sync with Apple devices, we recommend:
 * - Use Google Calendar integration (syncs with Apple via Google account)
 * - Or use Outlook integration (syncs via Exchange ActiveSync)
 */
