import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { verifyAuth } from '@/lib/auth/middleware';
import { getStripeForClinic, getStripeForPlatform } from '@/lib/stripe/connect';
import { logger } from '@/lib/logger';

/**
 * GET /api/stripe/subscriptions - List subscriptions
 *
 * MULTI-TENANT: Returns subscriptions for the user's clinic only.
 * - Super admins see platform-level data
 * - Other admins see only their clinic's data
 * - Clinics without Stripe connected see empty data
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const authResult = await verifyAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = authResult.user!;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as Stripe.Subscription.Status | null;
    const limit = parseInt(searchParams.get('limit') || '100');
    const customerId = searchParams.get('customerId');

    // Check if Stripe is configured
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({
        subscriptions: [],
        message: 'Stripe not configured',
      });
    }

    // MULTI-TENANT: Get clinic-specific Stripe context
    let stripeContext;

    if (user.role === 'super_admin') {
      // Super admin sees platform-level data
      stripeContext = getStripeForPlatform();
      logger.info('[STRIPE SUBSCRIPTIONS] Super admin accessing platform data', {
        user: user.email,
      });
    } else if (user.clinicId) {
      // Get clinic-specific Stripe context
      stripeContext = await getStripeForClinic(user.clinicId);

      // If clinic has no Stripe account (not platform and no connected account),
      // return empty data - they shouldn't see platform data
      if (!stripeContext.isPlatformAccount && !stripeContext.stripeAccountId) {
        logger.info('[STRIPE SUBSCRIPTIONS] Clinic has no Stripe account configured', {
          user: user.email,
          clinicId: user.clinicId,
        });
        return NextResponse.json({
          subscriptions: [],
          hasMore: false,
          message: 'No Stripe account connected to this clinic',
        });
      }

      logger.info('[STRIPE SUBSCRIPTIONS] Fetching clinic-specific data', {
        user: user.email,
        clinicId: user.clinicId,
        isPlatformAccount: stripeContext.isPlatformAccount,
        hasConnectedAccount: !!stripeContext.stripeAccountId,
      });
    } else {
      // User has no clinic - shouldn't see any Stripe data
      logger.warn('[STRIPE SUBSCRIPTIONS] User has no clinic context', {
        user: user.email,
      });
      return NextResponse.json({
        subscriptions: [],
        hasMore: false,
        error: 'No clinic context',
      });
    }

    const stripe = stripeContext.stripe;
    const stripeAccountId = stripeContext.stripeAccountId;

    const params: Stripe.SubscriptionListParams = {
      limit,
    };

    if (status) {
      params.status = status;
    }

    if (customerId) {
      params.customer = customerId;
    }

    // MULTI-TENANT: Pass connected account as request options if applicable
    const subscriptions = stripeAccountId
      ? await stripe.subscriptions.list(params, { stripeAccount: stripeAccountId })
      : await stripe.subscriptions.list(params);

    return NextResponse.json({
      subscriptions: subscriptions.data,
      hasMore: subscriptions.has_more,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[STRIPE SUBSCRIPTIONS] Error:', { error: errorMessage });

    // Return empty array instead of error for dashboard compatibility
    return NextResponse.json({
      subscriptions: [],
      error: errorMessage,
    });
  }
}
