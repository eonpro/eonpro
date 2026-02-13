/**
 * API endpoint to validate Stripe configuration
 * Requires authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth/middleware';
import { isFeatureEnabled } from '@/lib/features';
import { getStripe } from '@/lib/stripe';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const authResult = await verifyAuth(req);
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (!isFeatureEnabled('STRIPE_SUBSCRIPTIONS')) {
      return NextResponse.json(
        { error: 'Stripe Subscriptions feature is not enabled' },
        { status: 403 }
      );
    }

    // Check environment variables
    const config = {
      hasPublicKey: !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      hasSecretKey: !!process.env.STRIPE_SECRET_KEY,
      hasWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
      isTestMode: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.includes('_test_'),
    };

    // If no keys configured, return mock mode status
    if (!config.hasSecretKey) {
      return NextResponse.json({
        valid: false,
        mode: 'mock',
        message: 'Running in mock mode - no Stripe keys configured',
        config,
      });
    }

    // Try to connect to Stripe
    try {
      const stripe = getStripe();

      // Test the connection by retrieving account info
      const account = await stripe.accounts.retrieve();

      return NextResponse.json({
        valid: true,
        mode: config.isTestMode ? 'test' : 'live',
        accountId: account.id,
        accountName: account.business_profile?.name || account.email,
        config,
      });
    } catch (stripeError: any) {
      const errorMessage = stripeError instanceof Error ? stripeError.message : String(stripeError);
      // If it's a permissions error, the keys are valid but limited
      if (stripeError.type === 'StripePermissionError') {
        return NextResponse.json({
          valid: true,
          mode: config.isTestMode ? 'test' : 'live',
          message: 'Keys are valid but have limited permissions',
          config,
        });
      }

      return NextResponse.json({
        valid: false,
        error: 'Invalid Stripe keys',
        details: errorMessage,
        config,
      });
    }
  } catch (error: any) {
    // @ts-ignore

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[STRIPE_VALIDATE] Error:', error);
    return NextResponse.json(
      { error: 'Failed to validate configuration', details: errorMessage },
      { status: 500 }
    );
  }
}
