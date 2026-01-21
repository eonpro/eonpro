/**
 * Google Calendar Integration Service
 * 
 * Handles OAuth2 authentication and two-way sync with Google Calendar
 */

import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';

// OAuth2 configuration
const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXTAUTH_URL}/api/calendar-sync/google/callback`
);

// Scopes required for calendar access
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

export interface CalendarEvent {
  id?: string;
  externalId?: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  attendees?: Array<{ email: string; name?: string }>;
  conferenceLink?: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  reminders?: Array<{ method: 'email' | 'popup'; minutes: number }>;
}

export interface SyncResult {
  created: number;
  updated: number;
  deleted: number;
  errors: string[];
}

/**
 * Generate Google OAuth authorization URL
 */
export function getGoogleAuthUrl(providerId: number, clinicId: number): string {
  const state = Buffer.from(JSON.stringify({ providerId, clinicId })).toString('base64');
  
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    state,
    prompt: 'consent', // Force consent to get refresh token
  });
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  providerId: number,
  clinicId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('Failed to obtain tokens');
    }

    // Store tokens securely
    await prisma.providerCalendarIntegration.upsert({
      where: {
        providerId_provider: {
          providerId,
          provider: 'google',
        },
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        isActive: true,
        lastSyncAt: null,
      },
      create: {
        providerId,
        clinicId,
        provider: 'google',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        isActive: true,
        syncEnabled: true,
        syncDirection: 'both',
      },
    });

    logger.info('Google Calendar connected', { providerId });

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to exchange Google auth code', { error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Get authenticated calendar client for a provider
 */
async function getCalendarClient(providerId: number): Promise<calendar_v3.Calendar | null> {
  const integration = await prisma.providerCalendarIntegration.findFirst({
    where: {
      providerId,
      provider: 'google',
      isActive: true,
    },
  });

  if (!integration) {
    return null;
  }

  oauth2Client.setCredentials({
    access_token: integration.accessToken,
    refresh_token: integration.refreshToken,
    expiry_date: integration.expiresAt?.getTime(),
  });

  // Handle token refresh
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await prisma.providerCalendarIntegration.update({
        where: { id: integration.id },
        data: {
          accessToken: tokens.access_token,
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        },
      });
    }
  });

  // Cast oauth2Client to handle googleapis type version differences
  return google.calendar({ version: 'v3', auth: oauth2Client as unknown as Parameters<typeof google.calendar>[0]['auth'] });
}

/**
 * Create event in Google Calendar
 */
export async function createGoogleEvent(
  providerId: number,
  event: CalendarEvent
): Promise<{ success: boolean; externalId?: string; error?: string }> {
  try {
    const calendar = await getCalendarClient(providerId);
    
    if (!calendar) {
      return { success: false, error: 'Google Calendar not connected' };
    }

    const googleEvent: calendar_v3.Schema$Event = {
      summary: event.title,
      description: event.description,
      start: {
        dateTime: event.startTime.toISOString(),
        timeZone: 'America/New_York', // TODO: Use provider's timezone
      },
      end: {
        dateTime: event.endTime.toISOString(),
        timeZone: 'America/New_York',
      },
      location: event.location,
      attendees: event.attendees?.map(a => ({
        email: a.email,
        displayName: a.name,
      })),
      reminders: {
        useDefault: false,
        overrides: event.reminders?.map(r => ({
          method: r.method,
          minutes: r.minutes,
        })) || [
          { method: 'popup', minutes: 30 },
          { method: 'email', minutes: 60 },
        ],
      },
    };

    // Add conference link if provided
    if (event.conferenceLink) {
      googleEvent.description = `${event.description || ''}\n\nVideo Call: ${event.conferenceLink}`;
    }

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: googleEvent,
      sendUpdates: 'all', // Send email notifications to attendees
    });

    logger.info('Google Calendar event created', {
      providerId,
      eventId: response.data.id,
    });

    return {
      success: true,
      externalId: response.data.id || undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to create Google Calendar event', { error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Update event in Google Calendar
 */
export async function updateGoogleEvent(
  providerId: number,
  externalId: string,
  event: Partial<CalendarEvent>
): Promise<{ success: boolean; error?: string }> {
  try {
    const calendar = await getCalendarClient(providerId);
    
    if (!calendar) {
      return { success: false, error: 'Google Calendar not connected' };
    }

    const updateData: calendar_v3.Schema$Event = {};

    if (event.title) updateData.summary = event.title;
    if (event.description) updateData.description = event.description;
    if (event.location) updateData.location = event.location;
    if (event.startTime) {
      updateData.start = {
        dateTime: event.startTime.toISOString(),
        timeZone: 'America/New_York',
      };
    }
    if (event.endTime) {
      updateData.end = {
        dateTime: event.endTime.toISOString(),
        timeZone: 'America/New_York',
      };
    }
    if (event.status) {
      updateData.status = event.status;
    }

    await calendar.events.patch({
      calendarId: 'primary',
      eventId: externalId,
      requestBody: updateData,
      sendUpdates: 'all',
    });

    logger.info('Google Calendar event updated', { providerId, externalId });

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update Google Calendar event', { error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Delete event from Google Calendar
 */
export async function deleteGoogleEvent(
  providerId: number,
  externalId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const calendar = await getCalendarClient(providerId);
    
    if (!calendar) {
      return { success: false, error: 'Google Calendar not connected' };
    }

    await calendar.events.delete({
      calendarId: 'primary',
      eventId: externalId,
      sendUpdates: 'all',
    });

    logger.info('Google Calendar event deleted', { providerId, externalId });

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to delete Google Calendar event', { error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Fetch events from Google Calendar
 */
export async function fetchGoogleEvents(
  providerId: number,
  startDate: Date,
  endDate: Date
): Promise<CalendarEvent[]> {
  try {
    const calendar = await getCalendarClient(providerId);
    
    if (!calendar) {
      return [];
    }

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
    });

    const events: CalendarEvent[] = (response.data.items || []).map(item => ({
      externalId: item.id || undefined,
      title: item.summary || 'Untitled',
      description: item.description || undefined,
      startTime: new Date(item.start?.dateTime || item.start?.date || ''),
      endTime: new Date(item.end?.dateTime || item.end?.date || ''),
      location: item.location || undefined,
      attendees: item.attendees?.map(a => ({
        email: a.email || '',
        name: a.displayName || undefined,
      })),
      status: item.status as 'confirmed' | 'tentative' | 'cancelled' | undefined,
    }));

    return events;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to fetch Google Calendar events', { error: errorMessage });
    return [];
  }
}

/**
 * Sync appointments to Google Calendar
 */
export async function syncAppointmentsToGoogle(
  providerId: number,
  clinicId: number
): Promise<SyncResult> {
  const result: SyncResult = { created: 0, updated: 0, deleted: 0, errors: [] };

  try {
    const integration = await prisma.providerCalendarIntegration.findFirst({
      where: {
        providerId,
        provider: 'google',
        isActive: true,
        syncEnabled: true,
      },
    });

    if (!integration) {
      result.errors.push('Google Calendar not connected or sync disabled');
      return result;
    }

    // Get appointments that need syncing
    const appointments = await prisma.appointment.findMany({
      where: {
        providerId,
        clinicId,
        status: { in: ['SCHEDULED', 'CONFIRMED', 'RESCHEDULED'] },
        startTime: { gte: new Date() },
      },
      include: {
        patient: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        appointmentType: {
          select: {
            name: true,
            duration: true,
          },
        },
      },
    });

    for (const appt of appointments) {
      try {
        const event: CalendarEvent = {
          title: `${appt.patient.firstName} ${appt.patient.lastName} - ${appt.appointmentType?.name || 'Appointment'}`,
          description: appt.notes || `Patient appointment via EonHealth`,
          startTime: appt.startTime,
          endTime: appt.endTime,
          location: appt.type === 'VIDEO' ? 'Video Call' : appt.location || undefined,
          conferenceLink: appt.zoomJoinUrl || undefined,
          attendees: appt.patient.email ? [{ email: appt.patient.email, name: `${appt.patient.firstName} ${appt.patient.lastName}` }] : undefined,
        };

        if (appt.googleCalendarEventId) {
          // Update existing event
          const updateResult = await updateGoogleEvent(providerId, appt.googleCalendarEventId, event);
          if (updateResult.success) {
            result.updated++;
          } else {
            result.errors.push(`Failed to update appointment ${appt.id}: ${updateResult.error}`);
          }
        } else {
          // Create new event
          const createResult = await createGoogleEvent(providerId, event);
          if (createResult.success && createResult.externalId) {
            await prisma.appointment.update({
              where: { id: appt.id },
              data: { googleCalendarEventId: createResult.externalId },
            });
            result.created++;
          } else {
            result.errors.push(`Failed to create event for appointment ${appt.id}: ${createResult.error}`);
          }
        }
      } catch (error) {
        result.errors.push(`Error processing appointment ${appt.id}`);
      }
    }

    // Handle cancelled appointments
    const cancelledAppointments = await prisma.appointment.findMany({
      where: {
        providerId,
        clinicId,
        status: 'CANCELLED',
        googleCalendarEventId: { not: null },
      },
    });

    for (const appt of cancelledAppointments) {
      if (appt.googleCalendarEventId) {
        const deleteResult = await deleteGoogleEvent(providerId, appt.googleCalendarEventId);
        if (deleteResult.success) {
          await prisma.appointment.update({
            where: { id: appt.id },
            data: { googleCalendarEventId: null },
          });
          result.deleted++;
        }
      }
    }

    // Update last sync time
    await prisma.providerCalendarIntegration.update({
      where: { id: integration.id },
      data: { lastSyncAt: new Date() },
    });

    logger.info('Google Calendar sync completed', {
      providerId,
      ...result,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(`Sync failed: ${errorMessage}`);
    return result;
  }
}

/**
 * Disconnect Google Calendar
 */
export async function disconnectGoogleCalendar(
  providerId: number
): Promise<{ success: boolean }> {
  try {
    await prisma.providerCalendarIntegration.updateMany({
      where: {
        providerId,
        provider: 'google',
      },
      data: {
        isActive: false,
        accessToken: null,
        refreshToken: null,
      },
    });

    logger.info('Google Calendar disconnected', { providerId });

    return { success: true };
  } catch (error) {
    logger.error('Failed to disconnect Google Calendar', { providerId });
    return { success: false };
  }
}

/**
 * Check if Google Calendar is connected
 */
export async function isGoogleCalendarConnected(
  providerId: number
): Promise<boolean> {
  const integration = await prisma.providerCalendarIntegration.findFirst({
    where: {
      providerId,
      provider: 'google',
      isActive: true,
    },
  });

  return !!integration;
}
