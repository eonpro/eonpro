/**
 * Unified Calendar Sync Service
 *
 * Handles two-way synchronization between platform appointments and external calendars
 */

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import {
  CalendarEvent,
  SyncResult,
  getGoogleAuthUrl,
  syncAppointmentsToGoogle,
  fetchGoogleEvents,
  isGoogleCalendarConnected,
  disconnectGoogleCalendar,
} from './google-calendar.service';
import {
  getOutlookAuthUrlAsync,
  syncAppointmentsToOutlook,
  fetchOutlookEvents,
  isOutlookCalendarConnected,
  disconnectOutlookCalendar,
} from './outlook-calendar.service';
import {
  isAppleCalendarConnected,
  setupAppleCalendar,
  disconnectAppleCalendar,
  getAppleCalendarStatus,
} from './apple-calendar.service';

export type CalendarProvider = 'google' | 'outlook' | 'apple';
export type SyncDirection = 'to_external' | 'from_external' | 'both';

export interface CalendarIntegrationStatus {
  provider: CalendarProvider;
  isConnected: boolean;
  syncEnabled: boolean;
  lastSyncAt: Date | null;
  syncDirection: SyncDirection;
}

export interface UnifiedSyncResult {
  google?: SyncResult;
  outlook?: SyncResult;
  totalCreated: number;
  totalUpdated: number;
  totalDeleted: number;
  allErrors: string[];
}

/**
 * Get OAuth URL for a calendar provider
 * For Apple, returns setup instructions instead of OAuth URL
 */
export async function getCalendarAuthUrl(
  provider: CalendarProvider,
  providerId: number,
  clinicId: number
): Promise<string | { type: 'setup'; setup: Awaited<ReturnType<typeof setupAppleCalendar>> }> {
  switch (provider) {
    case 'google':
      return getGoogleAuthUrl(providerId, clinicId);
    case 'outlook':
      return await getOutlookAuthUrlAsync(providerId, clinicId);
    case 'apple':
      // Apple uses iCal subscription, not OAuth
      const setup = await setupAppleCalendar(providerId, clinicId);
      return { type: 'setup', setup };
    default:
      throw new Error(`Unknown calendar provider: ${provider}`);
  }
}

/**
 * Get connection status for all calendar integrations
 */
export async function getCalendarIntegrationStatus(
  providerId: number
): Promise<CalendarIntegrationStatus[]> {
  const integrations = await prisma.providerCalendarIntegration.findMany({
    where: { providerId },
    select: {
      provider: true,
      isActive: true,
      syncEnabled: true,
      lastSyncAt: true,
      syncDirection: true,
    },
  });

  const googleConnected = await isGoogleCalendarConnected(providerId);
  const outlookConnected = await isOutlookCalendarConnected(providerId);
  const appleConnected = await isAppleCalendarConnected(providerId);

  const result: CalendarIntegrationStatus[] = [];

  // Google status
  const googleIntegration = integrations.find((i: { provider: string }) => i.provider === 'google');
  result.push({
    provider: 'google',
    isConnected: googleConnected,
    syncEnabled: googleIntegration?.syncEnabled || false,
    lastSyncAt: googleIntegration?.lastSyncAt || null,
    syncDirection: (googleIntegration?.syncDirection as SyncDirection) || 'both',
  });

  // Outlook status
  const outlookIntegration = integrations.find(
    (i: { provider: string }) => i.provider === 'outlook'
  );
  result.push({
    provider: 'outlook',
    isConnected: outlookConnected,
    syncEnabled: outlookIntegration?.syncEnabled || false,
    lastSyncAt: outlookIntegration?.lastSyncAt || null,
    syncDirection: (outlookIntegration?.syncDirection as SyncDirection) || 'both',
  });

  // Apple status
  const appleIntegration = integrations.find((i: { provider: string }) => i.provider === 'apple');
  result.push({
    provider: 'apple',
    isConnected: appleConnected,
    syncEnabled: appleIntegration?.syncEnabled || false,
    lastSyncAt: appleIntegration?.lastSyncAt || null,
    syncDirection: (appleIntegration?.syncDirection as SyncDirection) || 'to_external', // Apple is subscription-based
  });

  return result;
}

/**
 * Update sync settings for a calendar integration
 */
export async function updateCalendarSyncSettings(
  providerId: number,
  provider: CalendarProvider,
  settings: {
    syncEnabled?: boolean;
    syncDirection?: SyncDirection;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.providerCalendarIntegration.updateMany({
      where: {
        providerId,
        provider,
      },
      data: settings,
    });

    logger.info('Calendar sync settings updated', { providerId, provider, settings });

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update calendar sync settings', { error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Disconnect a calendar integration
 */
export async function disconnectCalendar(
  providerId: number,
  provider: CalendarProvider
): Promise<{ success: boolean }> {
  switch (provider) {
    case 'google':
      return disconnectGoogleCalendar(providerId);
    case 'outlook':
      return disconnectOutlookCalendar(providerId);
    case 'apple':
      return disconnectAppleCalendar(providerId);
    default:
      return { success: false };
  }
}

/**
 * Sync appointments to all connected calendars
 */
export async function syncAllCalendars(
  providerId: number,
  clinicId: number
): Promise<UnifiedSyncResult> {
  const result: UnifiedSyncResult = {
    totalCreated: 0,
    totalUpdated: 0,
    totalDeleted: 0,
    allErrors: [],
  };

  // Check which calendars are connected and enabled
  const integrations = await prisma.providerCalendarIntegration.findMany({
    where: {
      providerId,
      isActive: true,
      syncEnabled: true,
    },
  });

  // Sync to Google
  const googleIntegration = integrations.find((i: { provider: string }) => i.provider === 'google');
  if (googleIntegration && ['to_external', 'both'].includes(googleIntegration.syncDirection)) {
    const googleResult = await syncAppointmentsToGoogle(providerId, clinicId);
    result.google = googleResult;
    result.totalCreated += googleResult.created;
    result.totalUpdated += googleResult.updated;
    result.totalDeleted += googleResult.deleted;
    result.allErrors.push(...googleResult.errors.map((e) => `[Google] ${e}`));
  }

  // Sync to Outlook
  const outlookIntegration = integrations.find(
    (i: { provider: string }) => i.provider === 'outlook'
  );
  if (outlookIntegration && ['to_external', 'both'].includes(outlookIntegration.syncDirection)) {
    const outlookResult = await syncAppointmentsToOutlook(providerId, clinicId);
    result.outlook = outlookResult;
    result.totalCreated += outlookResult.created;
    result.totalUpdated += outlookResult.updated;
    result.totalDeleted += outlookResult.deleted;
    result.allErrors.push(...outlookResult.errors.map((e) => `[Outlook] ${e}`));
  }

  logger.info('All calendars synced', {
    providerId,
    totalCreated: result.totalCreated,
    totalUpdated: result.totalUpdated,
    totalDeleted: result.totalDeleted,
    errorCount: result.allErrors.length,
  });

  return result;
}

/**
 * Fetch events from all connected calendars
 */
export async function fetchAllCalendarEvents(
  providerId: number,
  startDate: Date,
  endDate: Date
): Promise<{
  google: CalendarEvent[];
  outlook: CalendarEvent[];
  combined: CalendarEvent[];
}> {
  const [googleEvents, outlookEvents] = await Promise.all([
    fetchGoogleEvents(providerId, startDate, endDate),
    fetchOutlookEvents(providerId, startDate, endDate),
  ]);

  // Combine and sort by start time
  const combined = [...googleEvents, ...outlookEvents].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime()
  );

  return {
    google: googleEvents,
    outlook: outlookEvents,
    combined,
  };
}

/**
 * Import external calendar events as blocked time
 * This prevents double-booking when provider has events in external calendar
 */
export async function importExternalEventsAsBlockedTime(
  providerId: number,
  clinicId: number,
  startDate: Date,
  endDate: Date
): Promise<{ imported: number; errors: string[] }> {
  const result = { imported: 0, errors: [] as string[] };

  try {
    const integrations = await prisma.providerCalendarIntegration.findMany({
      where: {
        providerId,
        isActive: true,
        syncEnabled: true,
        syncDirection: { in: ['from_external', 'both'] },
      },
    });

    if (integrations.length === 0) {
      return result;
    }

    // Fetch events from connected calendars
    const { combined: externalEvents } = await fetchAllCalendarEvents(
      providerId,
      startDate,
      endDate
    );

    // Get existing appointments to avoid duplicates
    const existingAppointments = await prisma.appointment.findMany({
      where: {
        providerId,
        startTime: { gte: startDate, lte: endDate },
      },
      select: {
        startTime: true,
        endTime: true,
        googleCalendarEventId: true,
        outlookCalendarEventId: true,
      },
    });

    // Filter out events that are already in our system
    const newEvents = externalEvents.filter((event) => {
      // Check if this event already exists
      const exists = existingAppointments.some((appt: (typeof existingAppointments)[0]) => {
        if (event.externalId) {
          return (
            appt.googleCalendarEventId === event.externalId ||
            appt.outlookCalendarEventId === event.externalId
          );
        }
        // Check for time overlap
        return (
          appt.startTime.getTime() === event.startTime.getTime() &&
          appt.endTime.getTime() === event.endTime.getTime()
        );
      });
      return !exists;
    });

    // Create blocked time entries for external events
    for (const event of newEvents) {
      try {
        // Check if this looks like a patient appointment from our system
        if (event.title.includes('EonHealth') || event.title.includes('Patient appointment')) {
          continue; // Skip - this is one of our appointments
        }

        await prisma.providerTimeOff.create({
          data: {
            providerId,
            clinicId,
            startTime: event.startTime,
            endTime: event.endTime,
            reason: `External: ${event.title}`,
            isAllDay: false,
            isRecurring: false,
            source: 'calendar_sync',
          } as any,
        });

        result.imported++;
      } catch (error) {
        result.errors.push(`Failed to import event: ${event.title}`);
      }
    }

    logger.info('External events imported as blocked time', {
      providerId,
      imported: result.imported,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(errorMessage);
    return result;
  }
}

/**
 * Get calendar sync statistics for a provider
 */
export async function getCalendarSyncStats(providerId: number): Promise<{
  totalSyncs: number;
  lastSyncAt: Date | null;
  eventsCreated: number;
  eventsUpdated: number;
  eventsDeleted: number;
  errorRate: number;
}> {
  // Get integrations
  const integrations = await prisma.providerCalendarIntegration.findMany({
    where: { providerId },
  });

  // Get appointments with calendar sync
  const syncedAppointments = await prisma.appointment.count({
    where: {
      providerId,
      OR: [{ googleCalendarEventId: { not: null } }, { outlookCalendarEventId: { not: null } }],
    },
  });

  const lastSyncDates = integrations
    .filter((i: { lastSyncAt: Date | null }) => i.lastSyncAt)
    .map((i: { lastSyncAt: Date | null }) => i.lastSyncAt!);

  return {
    totalSyncs: integrations.filter((i: { lastSyncAt: Date | null }) => i.lastSyncAt).length,
    lastSyncAt:
      lastSyncDates.length > 0
        ? new Date(Math.max(...lastSyncDates.map((d: Date) => d.getTime())))
        : null,
    eventsCreated: syncedAppointments,
    eventsUpdated: 0, // Would need to track this separately
    eventsDeleted: 0, // Would need to track this separately
    errorRate: 0,
  };
}

/**
 * Trigger sync when an appointment is created/updated/deleted
 * This is called from the appointment API
 */
export async function onAppointmentChange(
  providerId: number,
  clinicId: number,
  appointmentId: number,
  action: 'created' | 'updated' | 'cancelled'
): Promise<void> {
  // Check if provider has any calendar integrations enabled
  const integrations = await prisma.providerCalendarIntegration.findMany({
    where: {
      providerId,
      isActive: true,
      syncEnabled: true,
      syncDirection: { in: ['to_external', 'both'] },
    },
  });

  if (integrations.length === 0) {
    return; // No sync needed
  }

  // Queue sync (in production, use a job queue like BullMQ)
  // For now, sync immediately
  try {
    await syncAllCalendars(providerId, clinicId);
  } catch (error) {
    logger.error('Failed to sync after appointment change', {
      providerId,
      appointmentId,
      action,
    });
  }
}
