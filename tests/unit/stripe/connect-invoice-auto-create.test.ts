/**
 * Tests for Connect-invoice auto-create decision logic
 *
 * Context (2026-04-22): WellMedR (Stripe Connect tenant) was silently dropping
 * subscription renewal invoices because `StripeInvoiceService.updateFromWebhook`
 * blanket-skipped auto-create for all Connect events. Renewals (subscription_cycle)
 * must auto-create so they appear in the patient profile and provider Rx queue;
 * only initial-checkout (`subscription_create`/`manual`) remains owned by Airtable.
 *
 * This test pins the predicate so the guard is scoped by `billing_reason`.
 */
import { describe, it, expect } from 'vitest';
import type Stripe from 'stripe';
import { shouldAutoCreateConnectInvoice } from '@/services/stripe/connectInvoiceGuard';

/** Builds a minimal Stripe.Invoice fixture for the predicate. */
function makeInvoice(partial: Partial<Stripe.Invoice>): Stripe.Invoice {
  return {
    id: 'in_test_123',
    object: 'invoice',
    status: 'paid',
    amount_paid: 29900,
    amount_due: 0,
    currency: 'usd',
    billing_reason: 'subscription_cycle',
    ...partial,
  } as Stripe.Invoice;
}

describe('shouldAutoCreateConnectInvoice', () => {
  describe('Connect events', () => {
    it('auto-creates for subscription_cycle (recurring renewal)', () => {
      expect(
        shouldAutoCreateConnectInvoice(
          makeInvoice({ billing_reason: 'subscription_cycle' }),
          { stripeAccountId: 'acct_wellmedr_test' }
        )
      ).toBe(true);
    });

    it('auto-creates for subscription_update (mid-cycle proration)', () => {
      expect(
        shouldAutoCreateConnectInvoice(
          makeInvoice({ billing_reason: 'subscription_update' }),
          { stripeAccountId: 'acct_wellmedr_test' }
        )
      ).toBe(true);
    });

    it('auto-creates for subscription_threshold', () => {
      expect(
        shouldAutoCreateConnectInvoice(
          makeInvoice({ billing_reason: 'subscription_threshold' }),
          { stripeAccountId: 'acct_wellmedr_test' }
        )
      ).toBe(true);
    });

    it('SKIPS subscription_create (initial checkout — owned by Airtable)', () => {
      expect(
        shouldAutoCreateConnectInvoice(
          makeInvoice({ billing_reason: 'subscription_create' }),
          { stripeAccountId: 'acct_wellmedr_test' }
        )
      ).toBe(false);
    });

    it('SKIPS manual (dashboard-created invoices — not subscription renewals)', () => {
      expect(
        shouldAutoCreateConnectInvoice(
          makeInvoice({ billing_reason: 'manual' }),
          { stripeAccountId: 'acct_wellmedr_test' }
        )
      ).toBe(false);
    });

    it('SKIPS when billing_reason is null/undefined (ambiguous — defer to automation)', () => {
      expect(
        shouldAutoCreateConnectInvoice(
          makeInvoice({ billing_reason: null as unknown as Stripe.Invoice['billing_reason'] }),
          { stripeAccountId: 'acct_wellmedr_test' }
        )
      ).toBe(false);
    });

    it('SKIPS when status is not paid (only process successful renewals)', () => {
      expect(
        shouldAutoCreateConnectInvoice(
          makeInvoice({ status: 'open', billing_reason: 'subscription_cycle' }),
          { stripeAccountId: 'acct_wellmedr_test' }
        )
      ).toBe(false);
    });
  });

  describe('Non-Connect (platform) events', () => {
    it('always returns false for non-Connect (handled by existing non-Connect path)', () => {
      // The existing !isConnectInvoice branch already handles platform events.
      // This predicate is only consulted for Connect events.
      expect(
        shouldAutoCreateConnectInvoice(
          makeInvoice({ billing_reason: 'subscription_cycle' }),
          { stripeAccountId: undefined }
        )
      ).toBe(false);
    });

    it('returns false when connectContext is undefined', () => {
      expect(
        shouldAutoCreateConnectInvoice(
          makeInvoice({ billing_reason: 'subscription_cycle' }),
          undefined
        )
      ).toBe(false);
    });
  });
});
