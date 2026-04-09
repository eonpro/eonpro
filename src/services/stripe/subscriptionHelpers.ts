/**
 * Shared Stripe Subscription Helpers
 *
 * Extracted from payments/process and payments/confirm routes to eliminate
 * duplication. These helpers are used when creating Stripe Subscriptions
 * after a successful initial PaymentIntent charge.
 */

import type Stripe from 'stripe';

export interface SubscriptionInfo {
  planId: string;
  planName: string;
  interval: string;
  intervalCount: number;
  discountMode?: 'first_only' | 'all_recurring';
  catalogAmountCents?: number;
  /** Pre-existing Stripe Price ID from billing plans config. When set, skips product/price creation. */
  stripePriceId?: string;
}

/**
 * Computes the Unix timestamp (seconds) for the next billing cycle.
 * Used as `trial_end` on Stripe Subscriptions so the initial payment
 * (already collected via PaymentIntent) is not double-charged.
 */
export function computeNextBillingUnix(interval: string, intervalCount: number): number {
  const now = new Date();
  const next = new Date(now);
  const safeCount = Math.max(1, intervalCount || 1);

  switch (interval) {
    case 'year':
      next.setFullYear(next.getFullYear() + safeCount);
      break;
    case 'week':
      next.setDate(next.getDate() + safeCount * 7);
      break;
    case 'day':
      next.setDate(next.getDate() + safeCount);
      break;
    case 'month':
    default:
      next.setMonth(next.getMonth() + safeCount);
      break;
  }

  return Math.floor(next.getTime() / 1000);
}

/**
 * Resolves a Stripe Price for the subscription. Priority:
 *   1. Use `sub.stripePriceId` when the billing plan already has a Stripe Price
 *      configured (avoids creating duplicate products in the Stripe catalog).
 *   2. Search by lookup_key (planId) for previously auto-created prices.
 *   3. Create a new Product + Price pair as a last resort.
 *
 * When `discountMode === 'all_recurring'` and the amount differs from the
 * catalog price, a separate Stripe Price is created with a unique lookup key
 * so it doesn't overwrite the canonical plan price.
 */
export async function getOrCreateStripePrice(
  stripe: Stripe,
  sub: SubscriptionInfo,
  amountCents: number,
  stripeAccountId?: string | null,
): Promise<Stripe.Price> {
  const connectOpts = stripeAccountId ? { stripeAccount: stripeAccountId } : undefined;

  const isCustomPrice =
    sub.discountMode === 'all_recurring' &&
    sub.catalogAmountCents != null &&
    amountCents !== sub.catalogAmountCents;

  // When the billing plan has a pre-configured Stripe Price and we're not
  // applying a custom discount amount, use it directly. This prevents
  // duplicate products from appearing in the Stripe catalog.
  if (sub.stripePriceId && !isCustomPrice) {
    try {
      const price = connectOpts
        ? await stripe.prices.retrieve(sub.stripePriceId, {}, connectOpts)
        : await stripe.prices.retrieve(sub.stripePriceId);
      if (price.active) return price;
    } catch {
      // Price not found or inactive on this account — fall through to creation
    }
  }

  const lookupKey = isCustomPrice
    ? `${sub.planId}_custom_${amountCents}`
    : sub.planId;

  const listParams = { lookup_keys: [lookupKey], limit: 1 };
  const existing = connectOpts
    ? await stripe.prices.list(listParams, connectOpts)
    : await stripe.prices.list(listParams);

  if (existing.data.length > 0) return existing.data[0];

  const productParams = {
    name: isCustomPrice ? `${sub.planName} (Custom)` : sub.planName,
    metadata: { planId: sub.planId, ...(isCustomPrice ? { customAmount: String(amountCents) } : {}) },
  };
  const product = connectOpts
    ? await stripe.products.create(productParams, connectOpts)
    : await stripe.products.create(productParams);

  const intervalMap: Record<string, Stripe.PriceCreateParams.Recurring.Interval> = {
    month: 'month',
    year: 'year',
    week: 'week',
    day: 'day',
  };

  const priceParams: Stripe.PriceCreateParams = {
    product: product.id,
    unit_amount: amountCents,
    currency: 'usd',
    recurring: {
      interval: intervalMap[sub.interval] || 'month',
      interval_count: sub.intervalCount,
    },
    lookup_key: lookupKey,
  };

  return connectOpts
    ? await stripe.prices.create(priceParams, connectOpts)
    : await stripe.prices.create(priceParams);
}
