/**
 * Calendar Sync API
 * 
 * Manage calendar integrations and sync operations
 */

import { NextRequest, NextResponse } from 'next/server';
import { withProviderAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import {
  getCalendarAuthUrl,
  getCalendarIntegrationStatus,
  updateCalendarSyncSettings,
  disconnectCalendar,
  syncAllCalendars,
  fetchAllCalendarEvents,
  importExternalEventsAsBlockedTime,
  getCalendarSyncStats,
  getGoogleOAuthConfig,
  CalendarProvider,
  SyncDirection,
} from '@/lib/calendar-sync';
import { getProviderForUser } from '@/lib/auth/get-provider-for-user';

const connectSchema = z.object({
  provider: z.enum(['google', 'outlook']),
});

const settingsSchema = z.object({
  provider: z.enum(['google', 'outlook']),
  syncEnabled: z.boolean().optional(),
  syncDirection: z.enum(['to_external', 'from_external', 'both']).optional(),
});

const syncSchema = z.object({
  provider: z.enum(['google', 'outlook']).optional(),
  importExternal: z.boolean().optional(),
});

/**
 * GET /api/calendar-sync
 * Get calendar integration status and stats
 */
export const GET = withProviderAuth(
  async (req: NextRequest, user) => {
    try {
      const searchParams = req.nextUrl.searchParams;
      const action = searchParams.get('action');

      // Get provider ID from user (correct lookup via providerId or email)
      const provider = await getProviderForUser(user);

      if (!provider) {
        return NextResponse.json(
          { error: 'Provider not found' },
          { status: 404 }
        );
      }

      switch (action) {
        case 'status':
          // Get connection status for all integrations
          const status = await getCalendarIntegrationStatus(provider.id);
          return NextResponse.json({ success: true, integrations: status });

        case 'stats':
          // Get sync statistics
          const stats = await getCalendarSyncStats(provider.id);
          return NextResponse.json({ success: true, stats });

        case 'events':
          // Fetch external calendar events
          const startDateParam = searchParams.get('startDate');
          const endDateParam = searchParams.get('endDate');
          
          const startDate = startDateParam 
            ? new Date(startDateParam) 
            : new Date();
          const endDate = endDateParam 
            ? new Date(endDateParam) 
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

          const events = await fetchAllCalendarEvents(
            provider.id,
            startDate,
            endDate
          );

          return NextResponse.json({ success: true, events });

        default:
          // Default: return status
          const defaultStatus = await getCalendarIntegrationStatus(provider.id);
          return NextResponse.json({ success: true, integrations: defaultStatus });
      }
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Unknown error';
      const errStack = error instanceof Error ? error.stack : undefined;
      logger.error('Calendar sync GET error', { error: errMessage });
      return NextResponse.json(
        {
          error: 'Failed to get calendar info',
          detail: errMessage,
          ...(process.env.NODE_ENV === 'development' && { stack: errStack }),
        },
        { status: 500 }
      );
    }
  }
);

/**
 * POST /api/calendar-sync
 * Connect calendar, sync, or import events
 */
export const POST = withProviderAuth(
  async (req: NextRequest, user) => {
    try {
      const body = await req.json();
      const action = body.action;

      // Get provider ID from user (correct lookup via providerId or email)
      const provider = await getProviderForUser(user);

      if (!provider) {
        return NextResponse.json(
          { error: 'Provider not found' },
          { status: 404 }
        );
      }

      switch (action) {
        case 'connect':
          // Generate OAuth URL for calendar connection
          const connectParsed = connectSchema.safeParse(body);
          if (!connectParsed.success) {
            return NextResponse.json(
              { error: 'Invalid provider' },
              { status: 400 }
            );
          }

          let authUrl: Awaited<ReturnType<typeof getCalendarAuthUrl>>;
          try {
            authUrl = await getCalendarAuthUrl(
              connectParsed.data.provider as CalendarProvider,
              provider.id,
              provider.clinicId || 0
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : '';
            if (msg.includes('GOOGLE_CLIENT_ID') || msg.includes('Google Calendar OAuth is not configured')) {
              return NextResponse.json(
                {
                  error: 'Google Calendar is not configured for this environment. Contact your administrator to set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
                  code: 'GOOGLE_OAUTH_NOT_CONFIGURED',
                },
                { status: 503 }
              );
            }
            throw err;
          }

          // For Google, include config so you can verify against Google Console (401 invalid_client)
          if (connectParsed.data.provider === 'google') {
            const config = getGoogleOAuthConfig();
            return NextResponse.json({
              success: true,
              authUrl,
              _debug: {
                redirectUri: config.redirectUri,
                clientId: config.clientId,
                hint: 'If you get 401 invalid_client, ensure this redirectUri is in Google Console → Authorized redirect URIs and this clientId matches your OAuth client.',
              },
            });
          }
          return NextResponse.json({ success: true, authUrl });

        case 'sync':
          // Trigger calendar sync
          const syncParsed = syncSchema.safeParse(body);
          
          const syncResult = await syncAllCalendars(
            provider.id,
            provider.clinicId || 0
          );

          // Optionally import external events
          let importResult: { imported: number; errors: string[] } | null = null;
          if (syncParsed.success && syncParsed.data.importExternal) {
            const startDate = new Date();
            const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            
            importResult = await importExternalEventsAsBlockedTime(
              provider.id,
              provider.clinicId || 0,
              startDate,
              endDate
            );
          }

          return NextResponse.json({
            success: true,
            syncResult,
            importResult,
          });

        case 'import':
          // Import external events as blocked time
          const importStartDate = new Date();
          const importEndDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

          const importEventsResult = await importExternalEventsAsBlockedTime(
            provider.id,
            provider.clinicId || 0,
            importStartDate,
            importEndDate
          );

          return NextResponse.json({
            success: true,
            imported: importEventsResult.imported,
            errors: importEventsResult.errors,
          });

        default:
          return NextResponse.json(
            { error: 'Invalid action' },
            { status: 400 }
          );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Calendar sync POST error', { error: errorMessage });
      return NextResponse.json(
        { error: 'Calendar operation failed' },
        { status: 500 }
      );
    }
  }
);

/**
 * PATCH /api/calendar-sync
 * Update calendar sync settings
 */
export const PATCH = withProviderAuth(
  async (req: NextRequest, user) => {
    try {
      const body = await req.json();
      const parsed = settingsSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid settings', details: parsed.error.issues },
          { status: 400 }
        );
      }

      // Get provider ID from user (correct lookup via providerId or email)
      const provider = await getProviderForUser(user);

      if (!provider) {
        return NextResponse.json(
          { error: 'Provider not found' },
          { status: 404 }
        );
      }

      const result = await updateCalendarSyncSettings(
        provider.id,
        parsed.data.provider as CalendarProvider,
        {
          syncEnabled: parsed.data.syncEnabled,
          syncDirection: parsed.data.syncDirection as SyncDirection | undefined,
        }
      );

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Calendar sync PATCH error', { error: errorMessage });
      return NextResponse.json(
        { error: 'Failed to update settings' },
        { status: 500 }
      );
    }
  }
);

/**
 * DELETE /api/calendar-sync
 * Disconnect a calendar integration
 */
export const DELETE = withProviderAuth(
  async (req: NextRequest, user) => {
    try {
      const searchParams = req.nextUrl.searchParams;
      const providerParam = searchParams.get('provider');

      if (!providerParam || !['google', 'outlook'].includes(providerParam)) {
        return NextResponse.json(
          { error: 'Invalid provider' },
          { status: 400 }
        );
      }

      // Get provider ID from user (correct lookup via providerId or email)
      const provider = await getProviderForUser(user);

      if (!provider) {
        return NextResponse.json(
          { error: 'Provider not found' },
          { status: 404 }
        );
      }

      const result = await disconnectCalendar(
        provider.id,
        providerParam as CalendarProvider
      );

      if (!result.success) {
        return NextResponse.json(
          { error: 'Failed to disconnect' },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Calendar sync DELETE error', { error: errorMessage });
      return NextResponse.json(
        { error: 'Failed to disconnect calendar' },
        { status: 500 }
      );
    }
  }
);
