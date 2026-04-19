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
import { logger } from '@/lib/logger';

let cachedStripe: Stripe | null = null;
let connectValidated = false;

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
    apiVersion: '2026-03-25.dahlia',
    typescript: true,
    maxNetworkRetries: 3,
  });

  if (!connectValidated) {
    connectValidated = true;
    validateConnectSetup(cachedStripe).catch((err) => {
      logger.error('[STRIPE CONNECT] Startup validation failed', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
    });
  }

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

  if (!id.startsWith('acct_')) {
    throw new Error(
      `WELLMEDR_STRIPE_ACCOUNT_ID must start with "acct_" (got "${id.slice(0, 8)}..."). ` +
        'This should be the WellMedR connected account ID, not a key or price ID.'
    );
  }

  return id;
}

export function getWellMedrConnectOpts(): { stripeAccount: string } {
  return { stripeAccount: getWellMedrAccountId() };
}

/**
 * Validates that the Connect setup is correct on first use.
 * Detects the most common misconfiguration: using the connected account's
 * own secret key instead of the platform key.
 */
async function validateConnectSetup(stripe: Stripe): Promise<void> {
  const accountId = getWellMedrAccountId();

  const clientAccountId = process.env.NEXT_PUBLIC_WELLMEDR_STRIPE_ACCOUNT_ID;
  if (clientAccountId && clientAccountId !== accountId) {
    logger.error('[STRIPE CONNECT] Account ID mismatch between server and client', {
      serverVar: 'WELLMEDR_STRIPE_ACCOUNT_ID',
      clientVar: 'NEXT_PUBLIC_WELLMEDR_STRIPE_ACCOUNT_ID',
    });
  }

  try {
    // Retrieve the account that owns the secret key (no argument = authenticated account)
    const platformAccount = await stripe.accounts.retrieve(null);
    const platformId = platformAccount.id;

    if (platformId === accountId) {
      logger.error(
        '[STRIPE CONNECT] CRITICAL MISCONFIGURATION: STRIPE_CONNECT_PLATFORM_SECRET_KEY ' +
          'belongs to the WellMedR connected account itself, not the platform. ' +
          'Charges will NOT use the platform negotiated rate. ' +
          'Set STRIPE_CONNECT_PLATFORM_SECRET_KEY to the EONpro platform secret key.',
        { platformId, connectedAccountId: accountId }
      );
      return;
    }

    // Verify the platform can access the connected account
    const connectedAccount = await stripe.accounts.retrieve(accountId);
    if (!connectedAccount.charges_enabled) {
      logger.warn('[STRIPE CONNECT] WellMedR connected account does not have charges enabled', {
        connectedAccountId: accountId,
      });
    }

    logger.info('[STRIPE CONNECT] Validated: platform key is correct for direct charges', {
      platformId,
      connectedAccountId: accountId,
      chargesEnabled: connectedAccount.charges_enabled,
    });

    // Auto-register payment method domains for Apple Pay / Google Pay / Link
    await ensurePaymentMethodDomains(stripe, accountId);
  } catch (err) {
    logger.error('[STRIPE CONNECT] Failed to validate Connect setup — check API keys', {
      error: err instanceof Error ? err.message : 'Unknown',
      connectedAccountId: accountId,
    });
  }
}

const WELLMEDR_DOMAINS = ['wellmedr.eonpro.io', 'intake.wellmedr.com'];

/**
 * Registers payment method domains (Apple Pay, Google Pay, Link) on the
 * WellMedR connected account. Connect platforms using direct charges must
 * register domains via API — the Stripe Dashboard only covers the platform's
 * own account.
 */
async function ensurePaymentMethodDomains(stripe: Stripe, accountId: string): Promise<void> {
  const opts = { stripeAccount: accountId };

  for (const domain of WELLMEDR_DOMAINS) {
    try {
      const existing = await stripe.paymentMethodDomains.list(
        { domain_name: domain, enabled: true },
        opts
      );
      if (existing.data.length > 0) {
        const d = existing.data[0];
        logger.info('[PMD] Domain already registered', {
          domain,
          applePay: d.apple_pay.status,
          googlePay: d.google_pay.status,
          link: d.link.status,
        });
        continue;
      }

      const pmd = await stripe.paymentMethodDomains.create({ domain_name: domain }, opts);
      logger.info('[PMD] Registered domain for connected account', {
        domain,
        applePay: pmd.apple_pay.status,
        googlePay: pmd.google_pay.status,
        link: pmd.link.status,
      });
    } catch (err) {
      logger.warn('[PMD] Failed to register domain — Express Checkout may not load', {
        domain,
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }
  }
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
