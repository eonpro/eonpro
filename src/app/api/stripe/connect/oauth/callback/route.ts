/**
 * STRIPE CONNECT OAUTH CALLBACK
 *
 * Handles the redirect from Stripe after user authorizes the connection.
 * Exchanges the authorization code and redirects to the settings page.
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2026-01-28.clover',
});

/**
 * GET /api/stripe/connect/oauth/callback
 * Handle OAuth callback from Stripe
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  const settingsUrl = `${baseUrl}/admin/settings/stripe`;

  // Handle errors from Stripe
  if (error) {
    logger.warn('[STRIPE OAUTH CALLBACK] Error from Stripe', { error, errorDescription });

    const errorMessage = errorDescription || error;
    return NextResponse.redirect(
      `${settingsUrl}?stripe=error&message=${encodeURIComponent(errorMessage)}`
    );
  }

  if (!code || !state) {
    logger.warn('[STRIPE OAUTH CALLBACK] Missing code or state');
    return NextResponse.redirect(`${settingsUrl}?stripe=error&message=Missing+authorization+code`);
  }

  try {
    // Decode state
    let stateData: { clinicId: number; userId: number; timestamp: number };
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch {
      return NextResponse.redirect(`${settingsUrl}?stripe=error&message=Invalid+state+parameter`);
    }

    // Verify state is not too old (15 minutes max)
    if (Date.now() - stateData.timestamp > 15 * 60 * 1000) {
      return NextResponse.redirect(`${settingsUrl}?stripe=error&message=Authorization+expired`);
    }

    // Exchange code for access token and account ID
    const response = await stripe.oauth.token({
      grant_type: 'authorization_code',
      code: code,
    });

    if (!response.stripe_user_id) {
      throw new Error('No Stripe account ID returned');
    }

    // Get account details
    const account = await stripe.accounts.retrieve(response.stripe_user_id);

    // Update clinic with connected account
    await prisma.clinic.update({
      where: { id: stateData.clinicId },
      data: {
        stripeAccountId: response.stripe_user_id,
        stripeAccountStatus: account.charges_enabled ? 'active' : 'pending',
        stripeChargesEnabled: account.charges_enabled,
        stripePayoutsEnabled: account.payouts_enabled,
        stripeDetailsSubmitted: account.details_submitted,
        stripeOnboardingComplete: account.charges_enabled && account.details_submitted,
        stripeConnectedAt: new Date(),
      },
    });

    logger.info('[STRIPE OAUTH CALLBACK] Connected account', {
      clinicId: stateData.clinicId,
      accountId: response.stripe_user_id,
      chargesEnabled: account.charges_enabled,
    });

    // Redirect to settings with success
    return NextResponse.redirect(`${settingsUrl}?stripe=connected`);
  } catch (error: any) {
    logger.error('[STRIPE OAUTH CALLBACK] Error:', error);

    const message = error.message || 'Failed to connect account';
    return NextResponse.redirect(
      `${settingsUrl}?stripe=error&message=${encodeURIComponent(message)}`
    );
  }
}
