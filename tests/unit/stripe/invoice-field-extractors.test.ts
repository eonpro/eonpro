/**
 * Tests for dahlia-aware invoice field extractors.
 *
 * Pins the contract: every high-traffic invoice field resolves correctly
 * from BOTH the dahlia (`2026-03-25`) and legacy shapes. Prevents silent
 * regressions like the 2026-04-03 → 2026-04-22 refill-trigger outage
 * where `invoice.subscription` returned undefined on dahlia invoices.
 */
import { describe, it, expect } from 'vitest';
import type Stripe from 'stripe';
import {
  getInvoiceChargeId,
  getInvoicePaymentIntentId,
  getInvoicePaymentMethodIdFromExpanded,
  getInvoiceSubscriptionId,
} from '@/services/stripe/invoiceFieldExtractors';

/** Build a minimal invoice fixture from a partial payload. */
function invoice(partial: Record<string, unknown>): Stripe.Invoice {
  return { id: 'in_test', object: 'invoice', ...partial } as unknown as Stripe.Invoice;
}

describe('getInvoiceSubscriptionId', () => {
  it('resolves dahlia path: parent.subscription_details.subscription (string)', () => {
    const inv = invoice({
      parent: {
        type: 'subscription_details',
        subscription_details: { subscription: 'sub_dahlia_123' },
      },
    });
    expect(getInvoiceSubscriptionId(inv)).toBe('sub_dahlia_123');
  });

  it('resolves dahlia path when subscription is an expanded object', () => {
    const inv = invoice({
      parent: {
        subscription_details: { subscription: { id: 'sub_dahlia_456' } },
      },
    });
    expect(getInvoiceSubscriptionId(inv)).toBe('sub_dahlia_456');
  });

  it('falls back to legacy top-level invoice.subscription (string)', () => {
    const inv = invoice({ subscription: 'sub_legacy_789' });
    expect(getInvoiceSubscriptionId(inv)).toBe('sub_legacy_789');
  });

  it('falls back to legacy top-level invoice.subscription (object)', () => {
    const inv = invoice({ subscription: { id: 'sub_legacy_999' } });
    expect(getInvoiceSubscriptionId(inv)).toBe('sub_legacy_999');
  });

  it('prefers dahlia path over legacy when both present', () => {
    const inv = invoice({
      subscription: 'sub_legacy',
      parent: { subscription_details: { subscription: 'sub_dahlia' } },
    });
    expect(getInvoiceSubscriptionId(inv)).toBe('sub_dahlia');
  });

  it('returns null when neither path has a subscription', () => {
    expect(getInvoiceSubscriptionId(invoice({}))).toBeNull();
    expect(getInvoiceSubscriptionId(invoice({ subscription: null }))).toBeNull();
    expect(
      getInvoiceSubscriptionId(
        invoice({ parent: { subscription_details: { subscription: null } } })
      )
    ).toBeNull();
  });
});

describe('getInvoicePaymentIntentId', () => {
  it('resolves dahlia payments.data[].payment.payment_intent', () => {
    const inv = invoice({
      payments: {
        object: 'list',
        data: [
          {
            id: 'inpay_1',
            payment: { type: 'payment_intent', payment_intent: 'pi_dahlia_111' },
          },
        ],
      },
    });
    expect(getInvoicePaymentIntentId(inv)).toBe('pi_dahlia_111');
  });

  it('falls back to legacy invoice.payment_intent', () => {
    const inv = invoice({ payment_intent: 'pi_legacy_222' });
    expect(getInvoicePaymentIntentId(inv)).toBe('pi_legacy_222');
  });

  it('returns first PI when multiple payment entries exist', () => {
    const inv = invoice({
      payments: {
        data: [
          { payment: { type: 'payment_intent', payment_intent: 'pi_first' } },
          { payment: { type: 'payment_intent', payment_intent: 'pi_second' } },
        ],
      },
    });
    expect(getInvoicePaymentIntentId(inv)).toBe('pi_first');
  });

  it('returns null when no payment intent found', () => {
    expect(getInvoicePaymentIntentId(invoice({}))).toBeNull();
    expect(getInvoicePaymentIntentId(invoice({ payments: { data: [] } }))).toBeNull();
  });
});

describe('getInvoiceChargeId', () => {
  it('resolves dahlia payments.data[].payment.charge', () => {
    const inv = invoice({
      payments: {
        data: [{ payment: { type: 'charge', charge: 'ch_dahlia_333' } }],
      },
    });
    expect(getInvoiceChargeId(inv)).toBe('ch_dahlia_333');
  });

  it('falls back to legacy invoice.charge string', () => {
    const inv = invoice({ charge: 'ch_legacy_444' });
    expect(getInvoiceChargeId(inv)).toBe('ch_legacy_444');
  });

  it('falls back to legacy invoice.charge expanded object', () => {
    const inv = invoice({ charge: { id: 'ch_legacy_555' } });
    expect(getInvoiceChargeId(inv)).toBe('ch_legacy_555');
  });
});

describe('getInvoicePaymentMethodIdFromExpanded', () => {
  it('extracts from legacy expanded charge.payment_method (string)', () => {
    const inv = invoice({
      charge: { id: 'ch_1', payment_method: 'pm_111', object: 'charge' },
    });
    expect(getInvoicePaymentMethodIdFromExpanded(inv)).toBe('pm_111');
  });

  it('extracts from legacy expanded payment_intent.payment_method (string)', () => {
    const inv = invoice({
      payment_intent: { id: 'pi_1', payment_method: 'pm_222', object: 'payment_intent' },
    });
    expect(getInvoicePaymentMethodIdFromExpanded(inv)).toBe('pm_222');
  });

  it('extracts from legacy expanded payment_intent.payment_method (object)', () => {
    const inv = invoice({
      payment_intent: {
        id: 'pi_1',
        payment_method: { id: 'pm_333' },
        object: 'payment_intent',
      },
    });
    expect(getInvoicePaymentMethodIdFromExpanded(inv)).toBe('pm_333');
  });

  it('returns null when nothing is expanded (caller must call resolveInvoicePaymentMethodId)', () => {
    const dahliaMinimal = invoice({
      payments: {
        data: [{ payment: { type: 'payment_intent', payment_intent: 'pi_dahlia' } }],
      },
    });
    expect(getInvoicePaymentMethodIdFromExpanded(dahliaMinimal)).toBeNull();
  });
});
