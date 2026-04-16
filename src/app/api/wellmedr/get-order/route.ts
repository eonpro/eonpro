import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import {
  getWellMedrConnectStripe,
  getWellMedrConnectOpts,
} from '@/app/wellmedr-checkout/lib/stripe-connect';
import { rateLimit } from '@/lib/rateLimit';

const getOrderSchema = z.object({
  subscriptionId: z.string().min(1).max(200).startsWith('sub_'),
});

/**
 * GET /api/wellmedr/get-order?subscriptionId=sub_xxx
 *
 * Queries Stripe Connect directly for subscription + customer status.
 * Used by CheckoutFormProvider to detect already-paid subscriptions
 * and recover shipping data from Stripe customer metadata.
 *
 * Authority: Stripe is the source of truth — not Airtable or in-memory store.
 */
async function handler(req: NextRequest) {
  try {
    const parsed = getOrderSchema.safeParse({
      subscriptionId: req.nextUrl.searchParams.get('subscriptionId') ?? '',
    });
    if (!parsed.success) {
      return NextResponse.json({ exists: false });
    }
    const { subscriptionId } = parsed.data;

    const stripe = getWellMedrConnectStripe();
    const connectOpts = getWellMedrConnectOpts();

    const subscription = await stripe.subscriptions.retrieve(
      subscriptionId,
      { expand: ['customer'] },
      connectOpts
    );

    if (!subscription) {
      return NextResponse.json({ exists: false });
    }

    const customer = subscription.customer as any;
    const isActive = subscription.status === 'active' || subscription.status === 'trialing';

    let shippingAddress: Record<string, unknown> | null = null;
    let billingAddress: Record<string, unknown> | null = null;

    // Recover shipping from subscription metadata (stored as JSON by create-subscription)
    if (subscription.metadata?.shippingAddress) {
      try {
        shippingAddress = JSON.parse(subscription.metadata.shippingAddress);
      } catch {
        Sentry.captureMessage('get-order: Failed to parse shippingAddress metadata', 'warning');
      }
    }
    if (subscription.metadata?.billingAddress) {
      try {
        billingAddress = JSON.parse(subscription.metadata.billingAddress);
      } catch {
        Sentry.captureMessage('get-order: Failed to parse billingAddress metadata', 'warning');
      }
    }

    // Fallback: recover shipping from Stripe customer object
    if (
      !shippingAddress &&
      customer &&
      typeof customer !== 'string' &&
      customer.shipping?.address
    ) {
      const addr = customer.shipping.address;
      const nameParts = (customer.shipping.name || '').split(' ');
      shippingAddress = {
        firstName: nameParts[0] || '',
        lastName: nameParts.slice(1).join(' ') || '',
        address: addr.line1 || '',
        apt: addr.line2 || '',
        city: addr.city || '',
        state: addr.state || '',
        zipCode: addr.postal_code || '',
        billingAddressSameAsShipment: true,
      };
    }

    const paymentStatus = isActive ? 'succeeded' : 'pending';

    // Only return addresses for incomplete subscriptions (form recovery).
    // Active/paid subscriptions don't need PII re-exposed.
    const isRecovery = !isActive;

    return NextResponse.json({
      exists: true,
      order: {
        subscriptionId: subscription.id,
        paymentStatus,
        subscriptionStatus: subscription.status,
        orderStatus: isActive ? 'processing' : 'created',
        ...(isRecovery ? { shippingAddress, billingAddress } : {}),
      },
    });
  } catch (error: any) {
    if (error?.type === 'StripeInvalidRequestError' && error?.statusCode === 404) {
      return NextResponse.json({ exists: false });
    }

    Sentry.captureException(error, {
      tags: { module: 'wellmedr-checkout', route: 'get-order' },
    });
    return NextResponse.json({ exists: false }, { status: 500 });
  }
}

export const GET = rateLimit({ max: 30, windowMs: 60_000 })(handler);
