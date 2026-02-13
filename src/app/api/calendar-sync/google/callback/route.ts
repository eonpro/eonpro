/**
 * Google Calendar OAuth Callback
 *
 * Handles the OAuth2 callback from Google after user authorization.
 * Redirects to /provider/calendar (where Connect Google Calendar lives).
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { exchangeCodeForTokens } from '@/lib/calendar-sync/google-calendar.service';

const REDIRECT_BASE = '/provider/calendar';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Handle errors from Google
    if (error) {
      logger.error('Google OAuth error', { error });
      return NextResponse.redirect(
        new URL(`${REDIRECT_BASE}?error=${encodeURIComponent(error)}`, req.url)
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(new URL(`${REDIRECT_BASE}?error=missing_params`, req.url));
    }

    // Decode state to get provider and clinic IDs
    let stateData: { providerId: number; clinicId: number };
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch {
      return NextResponse.redirect(new URL(`${REDIRECT_BASE}?error=invalid_state`, req.url));
    }

    // Exchange code for tokens
    const result = await exchangeCodeForTokens(code, stateData.providerId, stateData.clinicId);

    if (!result.success) {
      logger.error('Failed to exchange Google code', { error: result.error });
      return NextResponse.redirect(
        new URL(
          `${REDIRECT_BASE}?error=${encodeURIComponent(result.error || 'exchange_failed')}`,
          req.url
        )
      );
    }

    logger.info('Google Calendar connected successfully', {
      providerId: stateData.providerId,
    });

    return NextResponse.redirect(new URL(`${REDIRECT_BASE}?success=google_connected`, req.url));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Google OAuth callback error', { error: errorMessage });
    return NextResponse.redirect(
      new URL(`${REDIRECT_BASE}?error=${encodeURIComponent(errorMessage)}`, req.url)
    );
  }
}
