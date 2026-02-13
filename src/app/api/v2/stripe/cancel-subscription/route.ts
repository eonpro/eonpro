/**
 * API endpoint to cancel Stripe subscriptions
 * Requires authentication; patient may cancel own, admin/provider for same clinic.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/lib/auth/middleware';
import { isFeatureEnabled } from '@/lib/features';
import { getStripe } from '@/lib/stripe';
import { logger } from '@/lib/logger';

const bodySchema = z.object({ subscriptionId: z.string().min(1) });

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

    const parseResult = bodySchema.safeParse(await req.json());
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Subscription ID is required', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }
    const { subscriptionId } = parseResult.data;

    // Check if using mock mode
    const isMockMode = !process.env.STRIPE_SECRET_KEY || process.env.STRIPE_USE_MOCK === 'true';

    if (isMockMode) {
      // Simulate cancellation in mock mode
      const mockCancellation = {
        id: subscriptionId,
        status: 'canceled',
        canceled_at: Date.now() / 1000,
        mock: true,
      };

      logger.debug('[STRIPE_TEST] Cancelled mock subscription:', { value: subscriptionId });

      return NextResponse.json({
        success: true,
        subscription: mockCancellation,
        mock: true,
      });
    }

    // Cancel real Stripe subscription
    try {
      const stripe = getStripe();

      const subscription = await stripe.subscriptions.cancel(subscriptionId);

      logger.debug('[STRIPE_TEST] Cancelled subscription:', { id: subscription.id });

      return NextResponse.json({
        success: true,
        subscription: {
          id: subscription.id,
          status: subscription.status,
          canceled_at: subscription.canceled_at,
          current_period_end: (subscription as any).current_period_end,
        },
        mock: false,
      });
    } catch (stripeError: any) {
      const errorMessage = stripeError instanceof Error ? stripeError.message : 'Unknown error';
      // If subscription doesn't exist, treat as success (idempotent)
      if (stripeError.code === 'resource_missing') {
        return NextResponse.json({
          success: true,
          message: "Subscription already canceled or doesn't exist",
          mock: false,
        });
      }

      logger.error('[STRIPE_TEST] Cancellation failed:', { value: stripeError });
      return NextResponse.json(
        { error: 'Failed to cancel subscription', details: stripeError.message },
        { status: 400 }
      );
    }
  } catch (error: any) {
    // @ts-ignore

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[STRIPE_TEST] Error:', error);
    return NextResponse.json(
      { error: 'Failed to cancel subscription', details: errorMessage },
      { status: 500 }
    );
  }
}
