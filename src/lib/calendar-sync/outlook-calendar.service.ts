/**
 * Microsoft Outlook Calendar Integration Service
 * 
 * Handles OAuth2 authentication and two-way sync with Outlook Calendar
 */

import { ConfidentialClientApplication } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import { CalendarEvent, SyncResult } from './google-calendar.service';

// MSAL configuration - lazy initialization to avoid build errors
let msalClient: ConfidentialClientApplication | null = null;

function getMsalClient(): ConfidentialClientApplication {
  if (msalClient) {
    return msalClient;
  }
  
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const tenantId = process.env.MICROSOFT_TENANT_ID || 'common';
  
  if (!clientId || !clientSecret) {
    throw new Error('Microsoft OAuth credentials not configured. Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET.');
  }
  
  const msalConfig = {
    auth: {
      clientId,
      clientSecret,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
  };
  
  msalClient = new ConfidentialClientApplication(msalConfig);
  return msalClient;
}

// Scopes required for calendar access
const SCOPES = [
  'https://graph.microsoft.com/Calendars.ReadWrite',
  'https://graph.microsoft.com/User.Read',
  'offline_access',
];

/**
 * Generate Microsoft OAuth authorization URL
 */
export async function getOutlookAuthUrl(providerId: number, clinicId: number): Promise<string> {
  const state = Buffer.from(JSON.stringify({ providerId, clinicId })).toString('base64');
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI || 
    `${process.env.NEXTAUTH_URL}/api/calendar-sync/outlook/callback`;

  return await getMsalClient().getAuthCodeUrl({
    scopes: SCOPES,
    redirectUri,
    state,
    prompt: 'consent',
  });
}

/**
 * Get authorization URL synchronously for API routes
 */
export async function getOutlookAuthUrlAsync(providerId: number, clinicId: number): Promise<string> {
  const state = Buffer.from(JSON.stringify({ providerId, clinicId })).toString('base64');
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI || 
    `${process.env.NEXTAUTH_URL}/api/calendar-sync/outlook/callback`;

  return await getMsalClient().getAuthCodeUrl({
    scopes: SCOPES,
    redirectUri,
    state,
    prompt: 'consent',
  });
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeOutlookCodeForTokens(
  code: string,
  providerId: number,
  clinicId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const redirectUri = process.env.MICROSOFT_REDIRECT_URI || 
      `${process.env.NEXTAUTH_URL}/api/calendar-sync/outlook/callback`;

    const result = await getMsalClient().acquireTokenByCode({
      code,
      scopes: SCOPES,
      redirectUri,
    });

    if (!result?.accessToken) {
      throw new Error('Failed to obtain access token');
    }

    // Calculate expiry time
    const expiresAt = result.expiresOn ? new Date(result.expiresOn) : null;

    // Store tokens securely
    await prisma.providerCalendarIntegration.upsert({
      where: {
        providerId_provider: {
          providerId,
          provider: 'outlook',
        },
      },
      update: {
        accessToken: result.accessToken,
        refreshToken: result.account?.homeAccountId || null, // MSAL uses account ID for silent token acquisition
        expiresAt,
        isActive: true,
        lastSyncAt: null,
        accountId: result.account?.homeAccountId,
      },
      create: {
        providerId,
        clinicId,
        provider: 'outlook',
        accessToken: result.accessToken,
        refreshToken: result.account?.homeAccountId || null,
        expiresAt,
        isActive: true,
        syncEnabled: true,
        syncDirection: 'both',
        accountId: result.account?.homeAccountId,
      },
    });

    logger.info('Outlook Calendar connected', { providerId });

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to exchange Outlook auth code', { error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Get authenticated Graph client for a provider
 */
async function getGraphClient(providerId: number): Promise<Client | null> {
  const integration = await prisma.providerCalendarIntegration.findFirst({
    where: {
      providerId,
      provider: 'outlook',
      isActive: true,
    },
  });

  if (!integration || !integration.accessToken) {
    return null;
  }

  // Check if token needs refresh
  if (integration.expiresAt && integration.expiresAt < new Date()) {
    // Token expired, try silent acquisition
    if (integration.accountId) {
      try {
        const result = await getMsalClient().acquireTokenSilent({
          scopes: SCOPES,
          account: {
            homeAccountId: integration.accountId,
            environment: 'login.microsoftonline.com',
            tenantId: process.env.MICROSOFT_TENANT_ID || 'common',
            username: '',
            localAccountId: integration.accountId,
          },
        });

        if (result?.accessToken) {
          await prisma.providerCalendarIntegration.update({
            where: { id: integration.id },
            data: {
              accessToken: result.accessToken,
              expiresAt: result.expiresOn ? new Date(result.expiresOn) : null,
            },
          });
          integration.accessToken = result.accessToken;
        }
      } catch (error) {
        logger.error('Failed to refresh Outlook token', { providerId });
        return null;
      }
    }
  }

  return Client.init({
    authProvider: (done) => {
      done(null, integration.accessToken!);
    },
  });
}

/**
 * Create event in Outlook Calendar
 */
export async function createOutlookEvent(
  providerId: number,
  event: CalendarEvent
): Promise<{ success: boolean; externalId?: string; error?: string }> {
  try {
    const client = await getGraphClient(providerId);
    
    if (!client) {
      return { success: false, error: 'Outlook Calendar not connected' };
    }

    const outlookEvent = {
      subject: event.title,
      body: {
        contentType: 'HTML',
        content: event.description || '',
      },
      start: {
        dateTime: event.startTime.toISOString(),
        timeZone: 'Eastern Standard Time',
      },
      end: {
        dateTime: event.endTime.toISOString(),
        timeZone: 'Eastern Standard Time',
      },
      location: event.location ? {
        displayName: event.location,
      } : undefined,
      attendees: event.attendees?.map(a => ({
        emailAddress: {
          address: a.email,
          name: a.name,
        },
        type: 'required',
      })),
      isOnlineMeeting: !!event.conferenceLink,
      onlineMeetingUrl: event.conferenceLink,
      reminderMinutesBeforeStart: 30,
    };

    const response = await client
      .api('/me/events')
      .post(outlookEvent);

    logger.info('Outlook Calendar event created', {
      providerId,
      eventId: response.id,
    });

    return {
      success: true,
      externalId: response.id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to create Outlook Calendar event', { error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Update event in Outlook Calendar
 */
export async function updateOutlookEvent(
  providerId: number,
  externalId: string,
  event: Partial<CalendarEvent>
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = await getGraphClient(providerId);
    
    if (!client) {
      return { success: false, error: 'Outlook Calendar not connected' };
    }

    const updateData: any = {};

    if (event.title) updateData.subject = event.title;
    if (event.description) {
      updateData.body = {
        contentType: 'HTML',
        content: event.description,
      };
    }
    if (event.location) {
      updateData.location = { displayName: event.location };
    }
    if (event.startTime) {
      updateData.start = {
        dateTime: event.startTime.toISOString(),
        timeZone: 'Eastern Standard Time',
      };
    }
    if (event.endTime) {
      updateData.end = {
        dateTime: event.endTime.toISOString(),
        timeZone: 'Eastern Standard Time',
      };
    }
    if (event.status === 'cancelled') {
      updateData.isCancelled = true;
    }

    await client
      .api(`/me/events/${externalId}`)
      .patch(updateData);

    logger.info('Outlook Calendar event updated', { providerId, externalId });

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update Outlook Calendar event', { error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Delete event from Outlook Calendar
 */
export async function deleteOutlookEvent(
  providerId: number,
  externalId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = await getGraphClient(providerId);
    
    if (!client) {
      return { success: false, error: 'Outlook Calendar not connected' };
    }

    await client
      .api(`/me/events/${externalId}`)
      .delete();

    logger.info('Outlook Calendar event deleted', { providerId, externalId });

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to delete Outlook Calendar event', { error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Fetch events from Outlook Calendar
 */
export async function fetchOutlookEvents(
  providerId: number,
  startDate: Date,
  endDate: Date
): Promise<CalendarEvent[]> {
  try {
    const client = await getGraphClient(providerId);
    
    if (!client) {
      return [];
    }

    const response = await client
      .api('/me/calendarview')
      .query({
        startDateTime: startDate.toISOString(),
        endDateTime: endDate.toISOString(),
        $orderby: 'start/dateTime',
        $top: 250,
      })
      .get();

    const events: CalendarEvent[] = (response.value || []).map((item: any) => ({
      externalId: item.id,
      title: item.subject || 'Untitled',
      description: item.body?.content || undefined,
      startTime: new Date(item.start?.dateTime),
      endTime: new Date(item.end?.dateTime),
      location: item.location?.displayName || undefined,
      attendees: item.attendees?.map((a: any) => ({
        email: a.emailAddress?.address || '',
        name: a.emailAddress?.name || undefined,
      })),
      conferenceLink: item.onlineMeetingUrl || undefined,
      status: item.isCancelled ? 'cancelled' : 'confirmed',
    }));

    return events;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to fetch Outlook Calendar events', { error: errorMessage });
    return [];
  }
}

/**
 * Sync appointments to Outlook Calendar
 */
export async function syncAppointmentsToOutlook(
  providerId: number,
  clinicId: number
): Promise<SyncResult> {
  const result: SyncResult = { created: 0, updated: 0, deleted: 0, errors: [] };

  try {
    const integration = await prisma.providerCalendarIntegration.findFirst({
      where: {
        providerId,
        provider: 'outlook',
        isActive: true,
        syncEnabled: true,
      },
    });

    if (!integration) {
      result.errors.push('Outlook Calendar not connected or sync disabled');
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

        if (appt.outlookCalendarEventId) {
          // Update existing event
          const updateResult = await updateOutlookEvent(providerId, appt.outlookCalendarEventId, event);
          if (updateResult.success) {
            result.updated++;
          } else {
            result.errors.push(`Failed to update appointment ${appt.id}: ${updateResult.error}`);
          }
        } else {
          // Create new event
          const createResult = await createOutlookEvent(providerId, event);
          if (createResult.success && createResult.externalId) {
            await prisma.appointment.update({
              where: { id: appt.id },
              data: { outlookCalendarEventId: createResult.externalId },
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
        outlookCalendarEventId: { not: null },
      },
    });

    for (const appt of cancelledAppointments) {
      if (appt.outlookCalendarEventId) {
        const deleteResult = await deleteOutlookEvent(providerId, appt.outlookCalendarEventId);
        if (deleteResult.success) {
          await prisma.appointment.update({
            where: { id: appt.id },
            data: { outlookCalendarEventId: null },
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

    logger.info('Outlook Calendar sync completed', {
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
 * Disconnect Outlook Calendar
 */
export async function disconnectOutlookCalendar(
  providerId: number
): Promise<{ success: boolean }> {
  try {
    await prisma.providerCalendarIntegration.updateMany({
      where: {
        providerId,
        provider: 'outlook',
      },
      data: {
        isActive: false,
        accessToken: null,
        refreshToken: null,
        accountId: null,
      },
    });

    logger.info('Outlook Calendar disconnected', { providerId });

    return { success: true };
  } catch (error) {
    logger.error('Failed to disconnect Outlook Calendar', { providerId });
    return { success: false };
  }
}

/**
 * Check if Outlook Calendar is connected
 */
export async function isOutlookCalendarConnected(
  providerId: number
): Promise<boolean> {
  const integration = await prisma.providerCalendarIntegration.findFirst({
    where: {
      providerId,
      provider: 'outlook',
      isActive: true,
    },
  });

  return !!integration;
}
