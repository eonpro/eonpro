/**
 * WellMedR Stripe Connect — Client-Side Configuration
 *
 * For direct charges via Connect the client MUST use the platform's publishable
 * key together with the connected account ID (`stripeAccount` option on loadStripe).
 *
 * IMPORTANT: No fallback chains to other accounts' keys. If the platform key is
 * missing the integration should fail loudly, not silently use the wrong account.
 */

import { logger } from '@/app/wellmedr-checkout/utils/logger';

/**
 * Returns the platform's publishable key for direct charges via Connect.
 * This MUST be the EONpro platform publishable key, never WellMedR's or EonMeds'.
 */
export function getStripePublishableKey(): string {
  const key = process.env.NEXT_PUBLIC_STRIPE_CONNECT_PUBLISHABLE_KEY;
  if (!key) {
    logger.error(
      '[WellMedR Stripe] NEXT_PUBLIC_STRIPE_CONNECT_PUBLISHABLE_KEY is not configured. ' +
        'Direct charges require the platform publishable key.'
    );
    return '';
  }
  return key;
}

/**
 * Returns the WellMedR connected account ID for use with loadStripe's stripeAccount option.
 */
export function getStripeConnectedAccountId(): string | undefined {
  const id = process.env.NEXT_PUBLIC_WELLMEDR_STRIPE_ACCOUNT_ID;
  if (!id) {
    logger.error(
      '[WellMedR Stripe] NEXT_PUBLIC_WELLMEDR_STRIPE_ACCOUNT_ID is not configured. ' +
        'loadStripe needs the connected account ID to scope operations to WellMedR.'
    );
    return undefined;
  }
  if (!id.startsWith('acct_')) {
    logger.error(
      '[WellMedR Stripe] NEXT_PUBLIC_WELLMEDR_STRIPE_ACCOUNT_ID must start with "acct_".'
    );
  }
  return id;
}

export function getStripePaymentConfigId(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_WELLMEDR_STRIPE_PAYMENT_CONFIG_ID ||
    process.env.NEXT_PUBLIC_STRIPE_PAYMENT_CONFIG_ID ||
    undefined
  );
}
