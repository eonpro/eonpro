/**
 * API endpoint to process test Stripe payments
 * Requires authentication (admin/provider for testing).
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth/middleware';
import { isFeatureEnabled } from '@/lib/features';
import { getStripe } from '@/lib/stripe';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
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

    const { amount, customerId, description, testCard } = await req.json();

    // Check if using mock mode
    const isMockMode = !process.env.STRIPE_SECRET_KEY || process.env.STRIPE_USE_MOCK === 'true';

    if (isMockMode) {
      // Simulate payment in mock mode
      const mockPayment = {
        id: `pi_mock_${Date.now()}`,
        amount,
        currency: 'usd',
        status: testCard === 'declined' ? 'failed' : 'succeeded',
        customer: customerId,
        description,
        created: Date.now() / 1000,
        mock: true,
      };

      logger.debug('[STRIPE_TEST] Processed mock payment:', { value: mockPayment.id });

      if (testCard === 'declined') {
        return NextResponse.json(
          { error: 'Payment declined', payment: mockPayment },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        paymentId: mockPayment.id,
        amount,
        status: mockPayment.status,
        mock: true,
      });
    }

    // Process real Stripe payment
    try {
      const stripe = getStripe();

      // For testing, we'll create a payment intent but not confirm it
      // This avoids actual charges in test mode
      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: 'usd',
        customer: customerId || undefined,
        description: description || 'Test payment from test suite',
        metadata: {
          test: 'true',
          createdBy: 'test-suite',
        } as any,
        // Don't auto-confirm for test purposes
        automatic_payment_methods: {
          enabled: true,
        },
      });

      // Simulate different outcomes based on testCard parameter
      if (testCard === 'declined') {
        // Cancel the payment intent to simulate decline
        await stripe.paymentIntents.cancel(paymentIntent.id);

        return NextResponse.json(
          {
            error: 'Payment declined',
            paymentId: paymentIntent.id,
            status: 'canceled',
          },
          { status: 400 }
        );
      }

      logger.debug('[STRIPE_TEST] Created payment intent:', { value: paymentIntent.id });

      return NextResponse.json({
        success: true,
        paymentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        amount: paymentIntent.amount,
        status: paymentIntent.status,
        mock: false,
      });
    } catch (stripeError: any) {
      const errorMessage = stripeError instanceof Error ? stripeError.message : String(stripeError);
      logger.error('[STRIPE_TEST] Payment failed:', { value: stripeError });
      return NextResponse.json({ error: 'Payment failed', details: errorMessage }, { status: 400 });
    }
  } catch (error: any) {
    // @ts-ignore

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[STRIPE_TEST] Error:', error);
    return NextResponse.json(
      { error: 'Failed to process test payment', details: errorMessage },
      { status: 500 }
    );
  }
}
