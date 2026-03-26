/**
 * WellMedR Stripe Connect — Direct Charges via Platform
 *
 * All WellMedR Stripe API calls MUST go through the platform's secret key
 * with the connected account ID in the `stripeAccount` header.
 * This ensures WellMedR receives the negotiated processing rate and
 * the platform can collect application fees.
 *
 * See: https://docs.stripe.com/connect/direct-charges
 */

import Stripe from 'stripe';

let cachedStripe: Stripe | null = null;

export function getWellMedrConnectStripe(): Stripe {
  if (cachedStripe) return cachedStripe;

  const key = process.env.STRIPE_CONNECT_PLATFORM_SECRET_KEY;
  if (!key) {
    throw new Error(
      'STRIPE_CONNECT_PLATFORM_SECRET_KEY is not configured. ' +
      'Direct charges require the platform secret key, not the connected account key.'
    );
  }

  cachedStripe = new Stripe(key, {
    apiVersion: '2025-02-24.acacia' as Stripe.LatestApiVersion,
    typescript: true,
    maxNetworkRetries: 3,
  });

  return cachedStripe;
}

export function getWellMedrAccountId(): string {
  const id = process.env.WELLMEDR_STRIPE_ACCOUNT_ID;
  if (!id) {
    throw new Error(
      'WELLMEDR_STRIPE_ACCOUNT_ID is not configured. ' +
      'Set this to the WellMedR connected account ID (acct_xxx).'
    );
  }
  return id;
}

export function getWellMedrConnectOpts(): { stripeAccount: string } {
  return { stripeAccount: getWellMedrAccountId() };
}

/**
 * Returns the application fee in cents for a given charge amount,
 * or undefined if no fee is configured.
 */
export function getWellMedrApplicationFee(_amountCents: number): number | undefined {
  const feeCents = process.env.WELLMEDR_APPLICATION_FEE_CENTS;
  if (!feeCents) return undefined;
  const parsed = parseInt(feeCents, 10);
  if (isNaN(parsed) || parsed <= 0) return undefined;
  return parsed;
}

export function getWellMedrConnectWebhookSecret(): string {
  const secret = process.env.STRIPE_CONNECT_PLATFORM_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('STRIPE_CONNECT_PLATFORM_WEBHOOK_SECRET is not configured.');
  }
  return secret;
}
