/**
 * Outlook Calendar OAuth Callback
 *
 * Handles the OAuth2 callback from Microsoft after user authorization
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { exchangeOutlookCodeForTokens } from '@/lib/calendar-sync/outlook-calendar.service';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Handle errors from Microsoft
    if (error) {
      logger.error('Microsoft OAuth error', { error, errorDescription });
      return NextResponse.redirect(
        new URL(
          `/dashboard/settings/integrations?error=${encodeURIComponent(errorDescription || error)}`,
          req.url
        )
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL('/dashboard/settings/integrations?error=missing_params', req.url)
      );
    }

    // Decode state to get provider and clinic IDs
    let stateData: { providerId: number; clinicId: number };
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch {
      return NextResponse.redirect(
        new URL('/dashboard/settings/integrations?error=invalid_state', req.url)
      );
    }

    // Exchange code for tokens
    const result = await exchangeOutlookCodeForTokens(
      code,
      stateData.providerId,
      stateData.clinicId
    );

    if (!result.success) {
      logger.error('Failed to exchange Outlook code', { error: result.error });
      return NextResponse.redirect(
        new URL(
          `/dashboard/settings/integrations?error=${encodeURIComponent(result.error || 'exchange_failed')}`,
          req.url
        )
      );
    }

    logger.info('Outlook Calendar connected successfully', {
      providerId: stateData.providerId,
    });

    return NextResponse.redirect(
      new URL('/dashboard/settings/integrations?success=outlook_connected', req.url)
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Outlook OAuth callback error', { error: errorMessage });
    return NextResponse.redirect(
      new URL(`/dashboard/settings/integrations?error=${encodeURIComponent(errorMessage)}`, req.url)
    );
  }
}
