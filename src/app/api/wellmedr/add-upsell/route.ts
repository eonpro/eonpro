import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import { validateUpsellToken } from '@/lib/wellmedr/upsell-auth';
import {
  getWellMedrConnectStripe,
  getWellMedrConnectOpts,
} from '@/app/wellmedr-checkout/lib/stripe-connect';
import { rateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

function getAllowedProductIds(): Set<string> {
  const raw = process.env.WELLMEDR_UPSELL_ALLOWED_PRODUCT_IDS || '';
  const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return new Set(ids);
}

const addUpsellSchema = z.object({
  customerId: z.string().min(1).max(200),
  upsellProductIds: z.array(z.string().min(1).max(200)).min(1).max(5),
  discountAmountOff: z.number().min(0).max(100_00).optional(),
});

async function handler(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const parsed = addUpsellSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { customerId, upsellProductIds, discountAmountOff } = parsed.data;

    const authToken = req.cookies.get('wellmedr_upsell_auth')?.value;
    if (!authToken || !validateUpsellToken(authToken, customerId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const allowedIds = getAllowedProductIds();
    if (allowedIds.size > 0) {
      const disallowed = upsellProductIds.filter((id) => !allowedIds.has(id));
      if (disallowed.length > 0) {
        logger.warn('[add-upsell] Rejected disallowed product IDs', {
          customerId,
          disallowed,
        });
        return NextResponse.json(
          { error: 'One or more products are not available for upsell.' },
          { status: 400 }
        );
      }
    }

    const stripe = getWellMedrConnectStripe();
    const connectOpts = getWellMedrConnectOpts();

    const customer = await stripe.customers.retrieve(customerId, {}, connectOpts as any);
    if ((customer as Stripe.DeletedCustomer).deleted) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    let paymentMethodId: string | null = null;
    const cust = customer as Stripe.Customer;
    const invoicePm = cust.invoice_settings?.default_payment_method;
    if (invoicePm) {
      paymentMethodId = typeof invoicePm === 'string' ? invoicePm : invoicePm.id;
    }

    if (!paymentMethodId) {
      const paymentMethods = await stripe.paymentMethods.list(
        { customer: customerId, type: 'card', limit: 1 },
        connectOpts
      );
      if (paymentMethods.data.length > 0) {
        paymentMethodId = paymentMethods.data[0].id;
      }
    }

    if (!paymentMethodId) {
      return NextResponse.json(
        { error: 'No payment method on file. Please contact support.' },
        { status: 400 }
      );
    }

    const upsellPriceLookups = upsellProductIds.map(async (productId: string) => {
      const prices = await stripe.prices.list(
        { product: productId, active: true, limit: 10 },
        connectOpts
      );
      const monthlyPrice = prices.data.find(
        (p) => p.recurring?.interval === 'month' && p.recurring?.interval_count === 1
      );
      if (monthlyPrice) return { priceId: monthlyPrice.id, isRecurring: true };

      const anyPrice = prices.data[0];
      if (anyPrice) return { priceId: anyPrice.id, isRecurring: !!anyPrice.recurring };

      return null;
    });

    const resolved = (await Promise.all(upsellPriceLookups)).filter(Boolean) as {
      priceId: string;
      isRecurring: boolean;
    }[];

    if (resolved.length === 0) {
      return NextResponse.json(
        { error: 'Could not resolve upsell products. Please contact support.' },
        { status: 400 }
      );
    }

    const recurringItems = resolved.filter((r) => r.isRecurring);
    const oneTimeItems = resolved.filter((r) => !r.isRecurring);

    if (recurringItems.length > 0) {
      let couponId: string | undefined;
      if (discountAmountOff && discountAmountOff > 0) {
        const coupon = await stripe.coupons.create(
          {
            amount_off: discountAmountOff,
            currency: 'usd',
            duration: 'forever',
            name: 'Post-purchase upsell discount',
          },
          connectOpts
        );
        couponId = coupon.id;
      }

      await stripe.subscriptions.create(
        {
          customer: customerId,
          items: recurringItems.map((r) => ({ price: r.priceId })),
          default_payment_method: paymentMethodId,
          payment_behavior: 'error_if_incomplete',
          off_session: true,
          ...(couponId ? { coupon: couponId } : {}),
          metadata: {
            source: 'wellmedr-post-purchase-upsell',
            ...(couponId ? { discountApplied: `${discountAmountOff}` } : {}),
          },
        },
        connectOpts
      );
    }

    for (const item of oneTimeItems) {
      const invoiceItem = await stripe.invoiceItems.create(
        { customer: customerId, price: item.priceId } as any,
        connectOpts
      );
      try {
        const invoice = await stripe.invoices.create(
          {
            customer: customerId,
            default_payment_method: paymentMethodId,
            auto_advance: false,
            metadata: { source: 'wellmedr-post-purchase-upsell' },
          },
          connectOpts
        );
        await stripe.invoices.pay(invoice.id, {}, connectOpts as any);
      } catch (invoiceError) {
        try {
          await stripe.invoiceItems.del(invoiceItem.id, connectOpts as any);
        } catch {
          /* best effort cleanup */
        }
        throw invoiceError;
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      Sentry.captureException(error, {
        tags: { module: 'wellmedr-checkout', route: 'add-upsell' },
        extra: { type: error.type, code: error.code },
      });
      logger.error('[add-upsell] Stripe error', { type: error.type, code: error.code });
      return NextResponse.json(
        { error: 'Payment failed. Please contact support.' },
        { status: 400 }
      );
    }

    Sentry.captureException(error, {
      tags: { module: 'wellmedr-checkout', route: 'add-upsell' },
    });
    return NextResponse.json(
      { error: 'Failed to add supplement. Please try again.' },
      { status: 500 }
    );
  }
}

export const POST = rateLimit({ max: 10, windowMs: 60_000 })(handler);
