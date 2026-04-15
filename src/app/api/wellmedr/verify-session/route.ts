import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import {
  getWellMedrConnectStripe,
  getWellMedrConnectOpts,
} from '@/app/wellmedr-checkout/lib/stripe-connect';
import { generateUpsellToken } from '@/lib/wellmedr/upsell-auth';
import { rateLimit } from '@/lib/rateLimit';

const querySchema = z.object({
  subscription_id: z.string().min(1).max(200).optional(),
  payment_intent: z.string().min(1).max(200).optional(),
});

async function handler(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const parsed = querySchema.safeParse({
      subscription_id: searchParams.get('subscription_id') || undefined,
      payment_intent: searchParams.get('payment_intent') || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid parameters' },
        { status: 400 }
      );
    }

    const { subscription_id: subscriptionId, payment_intent: paymentIntentId } = parsed.data;

    if (!subscriptionId && !paymentIntentId) {
      return NextResponse.json(
        { error: 'Subscription ID or Payment Intent ID required' },
        { status: 400 }
      );
    }

    const stripe = getWellMedrConnectStripe();
    const connectOpts = getWellMedrConnectOpts();

    let result: {
      success: boolean;
      status?: string;
      customerId?: string;
      email?: string;
      amount?: number;
      currency?: string;
      transactionId?: string;
      paymentMethod?: { brand: string; last4: string };
      metadata?: Record<string, string>;
    };

    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(
        subscriptionId,
        { expand: ['customer', 'latest_invoice', 'default_payment_method'] },
        connectOpts
      );
      const customer = subscription.customer as any;
      const success = subscription.status === 'active' || subscription.status === 'trialing';

      let paymentMethod: { brand: string; last4: string } | undefined;
      const pm = subscription.default_payment_method as any;
      if (pm?.card) {
        paymentMethod = { brand: pm.card.brand, last4: pm.card.last4 };
      }

      result = {
        success,
        status: success ? 'succeeded' : subscription.status,
        customerId: typeof customer === 'string' ? customer : customer?.id,
        email: typeof customer === 'string' ? undefined : customer?.email,
        metadata: (subscription.metadata || {}) as Record<string, string>,
        paymentMethod,
        transactionId: subscriptionId,
      };
    } else if (paymentIntentId) {
      const paymentIntent = await stripe.paymentIntents.retrieve(
        paymentIntentId,
        { expand: ['customer'] },
        connectOpts
      );
      const customer = paymentIntent.customer as any;
      const success = paymentIntent.status === 'succeeded';

      result = {
        success,
        status: paymentIntent.status,
        customerId: typeof customer === 'string' ? customer : customer?.id,
        email: paymentIntent.receipt_email || (customer && typeof customer !== 'string' ? customer.email : undefined),
        amount: paymentIntent.amount ? paymentIntent.amount / 100 : undefined,
        currency: paymentIntent.currency?.toUpperCase(),
        transactionId: paymentIntentId,
        metadata: (paymentIntent.metadata || {}) as Record<string, string>,
      };
    } else {
      return NextResponse.json({ error: 'Missing identifier' }, { status: 400 });
    }

    const response = NextResponse.json(result);

    if (result.success && result.customerId) {
      const token = generateUpsellToken(result.customerId);
      response.cookies.set('wellmedr_upsell_auth', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 3600,
      });
    }

    return response;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { module: 'wellmedr-checkout', route: 'verify-session' },
    });
    return NextResponse.json(
      { error: 'Failed to verify session' },
      { status: 500 }
    );
  }
}

export const GET = rateLimit({ max: 30, windowMs: 60_000 })(handler);
