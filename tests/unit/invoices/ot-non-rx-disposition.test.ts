/**
 * OT Reconciliation — Non-Rx Disposition tests.
 *
 * Phase 0 (TDD) for the feature plan in `.cursor/scratchpad.md` §"Non-Rx Disposition".
 *
 * Covers:
 *   - `buildOtNonRxReconciliation` pure-builder grouping rules
 *     (group by invoiceId when present, else by paymentId)
 *   - Fully-refunded payments excluded; partially-refunded payments included
 *     with `patientGrossCents` reduced by the refund (per stakeholder Q&A)
 *   - `chargeKind` classification (`bloodwork | consult | other`)
 *   - Combined period totals (Rx + non-Rx) preserve merchant/platform fee math
 *     because those fees are computed on cash-collected basis (no double count)
 *   - `OtAllocationOverridePayload.chargeKind` is optional and defaults to null
 *     so existing Rx callers stay byte-compatible
 *
 * The builder/types under test do not exist yet — these tests intentionally fail
 * until Phase 2 lands. They are the spec.
 */

import { describe, it, expect } from 'vitest';

import {
  otAllocationOverridePayloadSchema,
  type OtAllocationOverridePayload,
} from '@/services/invoices/otAllocationOverrideTypes';

import {
  buildOtNonRxReconciliation,
  type OtNonRxReconciliationLine,
} from '@/services/invoices/otNonRxReconciliationService';

import type {
  OtNonRxChargeLineItem,
  OtPaymentCollectionRow,
} from '@/services/invoices/otInvoiceGenerationService';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePayment(
  overrides: Partial<OtPaymentCollectionRow> = {}
): OtPaymentCollectionRow {
  return {
    paymentId: 9001,
    paidAt: '2026-04-13T14:00:00.000Z',
    recordedAt: '2026-04-13T14:00:00.000Z',
    amountCents: 18000,
    netCollectedCents: 18000,
    refundedAmountCents: 0,
    isFullyRefunded: false,
    patientId: 42,
    patientName: 'Doe, Jane',
    description: 'Bloodwork — baseline lab panel',
    invoiceId: 7001,
    stripePaymentIntentId: 'pi_test_001',
    stripeChargeId: 'ch_test_001',
    ...overrides,
  };
}

function makeNonRxLine(
  overrides: Partial<OtNonRxChargeLineItem> = {}
): OtNonRxChargeLineItem {
  return {
    invoiceDbId: 7001,
    patientId: 42,
    patientName: 'Doe, Jane',
    paidAt: '2026-04-13T14:00:00.000Z',
    description: 'Quest CMP baseline lab panel',
    lineAmountCents: 18000,
    chargeKind: 'bloodwork',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildOtNonRxReconciliation — grouping
// ---------------------------------------------------------------------------

describe('buildOtNonRxReconciliation — grouping', () => {
  it('groups multiple Payments that share an invoiceId into a single row', () => {
    const p1 = makePayment({ paymentId: 1, invoiceId: 7001, amountCents: 10000, netCollectedCents: 10000 });
    const p2 = makePayment({ paymentId: 2, invoiceId: 7001, amountCents: 8000, netCollectedCents: 8000 });
    const rows = buildOtNonRxReconciliation({
      paymentCollections: [p1, p2],
      nonRxChargeLineItems: [makeNonRxLine({ invoiceDbId: 7001, lineAmountCents: 18000 })],
      invoiceDbIdsUsedForCogs: new Set(),
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].dispositionKey).toBe('inv:7001');
    expect(rows[0].dispositionType).toBe('invoice');
    expect(rows[0].patientGrossCents).toBe(18000);
    expect(rows[0].invoiceDbId).toBe(7001);
    expect(rows[0].paymentId).toBeNull();
  });

  it('keys by paymentId when invoiceId is null', () => {
    const standalone = makePayment({
      paymentId: 9999,
      invoiceId: null,
      amountCents: 5000,
      netCollectedCents: 5000,
      description: 'Membership fee',
    });
    const rows = buildOtNonRxReconciliation({
      paymentCollections: [standalone],
      nonRxChargeLineItems: [],
      invoiceDbIdsUsedForCogs: new Set(),
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].dispositionKey).toBe('pay:9999');
    expect(rows[0].dispositionType).toBe('payment');
    expect(rows[0].invoiceDbId).toBeNull();
    expect(rows[0].paymentId).toBe(9999);
    expect(rows[0].patientGrossCents).toBe(5000);
  });

  it('excludes payments tied to invoices that are used for pharmacy COGS', () => {
    const rxPayment = makePayment({ paymentId: 1, invoiceId: 5001 });
    const nonRxPayment = makePayment({ paymentId: 2, invoiceId: 7001 });
    const rows = buildOtNonRxReconciliation({
      paymentCollections: [rxPayment, nonRxPayment],
      nonRxChargeLineItems: [makeNonRxLine({ invoiceDbId: 7001 })],
      invoiceDbIdsUsedForCogs: new Set([5001]),
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].dispositionKey).toBe('inv:7001');
  });
});

// ---------------------------------------------------------------------------
// Refund semantics — fully-refunded excluded, partial included w/ adjusted gross
// ---------------------------------------------------------------------------

describe('buildOtNonRxReconciliation — refund semantics', () => {
  it('excludes fully-refunded payments entirely', () => {
    const refunded = makePayment({
      paymentId: 1,
      invoiceId: 7001,
      amountCents: 18000,
      refundedAmountCents: 18000,
      netCollectedCents: 0,
      isFullyRefunded: true,
    });
    const rows = buildOtNonRxReconciliation({
      paymentCollections: [refunded],
      nonRxChargeLineItems: [makeNonRxLine({ invoiceDbId: 7001 })],
      invoiceDbIdsUsedForCogs: new Set(),
    });
    expect(rows).toHaveLength(0);
  });

  it('includes partially-refunded payments with patientGross = sum(netCollectedCents)', () => {
    /** $180 charge with a $30 partial refund → row should reflect $150 net. */
    const partial = makePayment({
      paymentId: 1,
      invoiceId: 7001,
      amountCents: 18000,
      refundedAmountCents: 3000,
      netCollectedCents: 15000,
      isFullyRefunded: false,
    });
    const rows = buildOtNonRxReconciliation({
      paymentCollections: [partial],
      nonRxChargeLineItems: [makeNonRxLine({ invoiceDbId: 7001, lineAmountCents: 18000 })],
      invoiceDbIdsUsedForCogs: new Set(),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].patientGrossCents).toBe(15000);
  });

  it('keeps an invoice row when one of its two payments is fully refunded', () => {
    const good = makePayment({ paymentId: 1, invoiceId: 7001, amountCents: 10000, netCollectedCents: 10000 });
    const refunded = makePayment({
      paymentId: 2,
      invoiceId: 7001,
      amountCents: 8000,
      refundedAmountCents: 8000,
      netCollectedCents: 0,
      isFullyRefunded: true,
    });
    const rows = buildOtNonRxReconciliation({
      paymentCollections: [good, refunded],
      nonRxChargeLineItems: [makeNonRxLine({ invoiceDbId: 7001 })],
      invoiceDbIdsUsedForCogs: new Set(),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].patientGrossCents).toBe(10000);
  });
});

// ---------------------------------------------------------------------------
// Charge-kind classification
// ---------------------------------------------------------------------------

describe('buildOtNonRxReconciliation — chargeKind classification', () => {
  it('uses the invoice line classification when an invoice is present', () => {
    const rows = buildOtNonRxReconciliation({
      paymentCollections: [makePayment({ paymentId: 1, invoiceId: 7001 })],
      nonRxChargeLineItems: [makeNonRxLine({ invoiceDbId: 7001, chargeKind: 'consult' })],
      invoiceDbIdsUsedForCogs: new Set(),
    });
    expect(rows[0].chargeKind).toBe('consult');
  });

  it('classifies invoice-less payments by description ($180 → bloodwork)', () => {
    const standalone = makePayment({
      paymentId: 1,
      invoiceId: null,
      amountCents: 18000,
      netCollectedCents: 18000,
      description: 'CMP panel',
    });
    const rows = buildOtNonRxReconciliation({
      paymentCollections: [standalone],
      nonRxChargeLineItems: [],
      invoiceDbIdsUsedForCogs: new Set(),
    });
    expect(rows[0].chargeKind).toBe('bloodwork');
  });

  it('falls back to "other" when description does not match any keyword', () => {
    const standalone = makePayment({
      paymentId: 1,
      invoiceId: null,
      amountCents: 9999,
      netCollectedCents: 9999,
      description: 'Custom bundle',
    });
    const rows = buildOtNonRxReconciliation({
      paymentCollections: [standalone],
      nonRxChargeLineItems: [],
      invoiceDbIdsUsedForCogs: new Set(),
    });
    expect(rows[0].chargeKind).toBe('other');
  });
});

// ---------------------------------------------------------------------------
// Per-row defaults: 4% merchant + 10% platform on gross, no rep commission yet
// ---------------------------------------------------------------------------

describe('buildOtNonRxReconciliation — per-row defaults', () => {
  it('computes 4% merchant + 5% EONPro fee on gross, rounded (rate change 2026-05-02)', () => {
    const p = makePayment({ paymentId: 1, invoiceId: 7001, amountCents: 18000, netCollectedCents: 18000 });
    const rows = buildOtNonRxReconciliation({
      paymentCollections: [p],
      nonRxChargeLineItems: [makeNonRxLine({ invoiceDbId: 7001 })],
      invoiceDbIdsUsedForCogs: new Set(),
    });
    expect(rows[0].merchantProcessingCents).toBe(720); // 18000 * 0.04
    expect(rows[0].platformCompensationCents).toBe(900); // 18000 * 0.05 (was 10%)
  });

  it('seeds zero medication/shipping/etc. by default; bloodwork rows get $0 doctor fee (2026-05-03)', () => {
    const rows = buildOtNonRxReconciliation({
      paymentCollections: [makePayment({ paymentId: 1, invoiceId: 7001 })],
      nonRxChargeLineItems: [makeNonRxLine({ invoiceDbId: 7001 })],
      invoiceDbIdsUsedForCogs: new Set(),
    });
    const r: OtNonRxReconciliationLine = rows[0];
    expect(r.medicationsCostCents).toBe(0);
    expect(r.shippingCents).toBe(0);
    expect(r.trtTelehealthCents).toBe(0);
    /**
     * Bloodwork chargeKind → $0 doctor fee per stakeholder rule (2026-05-03).
     * Was $10 from 2026-05-02 to 2026-05-03; explicit zero now: bloodwork
     * sales no longer carry a doctor-review fee on the OT side.
     */
    expect(r.chargeKind).toBe('bloodwork');
    expect(r.doctorApprovalCents).toBe(0);
    expect(r.fulfillmentFeesCents).toBe(0);
    expect(r.salesRepCommissionCents).toBe(0);
    expect(r.salesRepId).toBeNull();
  });

  it('"other" chargeKind seeds $5 doctor fee (2026-05-03 stakeholder rule for non-Rx products)', () => {
    const rows = buildOtNonRxReconciliation({
      paymentCollections: [makePayment({ paymentId: 1, invoiceId: 7001 })],
      nonRxChargeLineItems: [
        makeNonRxLine({
          invoiceDbId: 7001,
          chargeKind: 'other',
          description: 'Recovery bundle',
        }),
      ],
      invoiceDbIdsUsedForCogs: new Set(),
    });
    const r = rows[0];
    expect(r.chargeKind).toBe('other');
    /** $5 = 500 cents — the non-Rx default doctor fee. */
    expect(r.doctorApprovalCents).toBe(500);
    /** Existing rule preserved: 'other' kind also defaults to $20 shipping. */
    expect(r.shippingCents).toBe(2000);
  });

  it('consult chargeKind keeps $0 doctor fee (telehealth visits are billed via TRT line)', () => {
    const rows = buildOtNonRxReconciliation({
      paymentCollections: [makePayment({ paymentId: 1, invoiceId: 7001 })],
      nonRxChargeLineItems: [
        makeNonRxLine({
          invoiceDbId: 7001,
          chargeKind: 'consult',
          description: 'Telehealth visit',
        }),
      ],
      invoiceDbIdsUsedForCogs: new Set(),
    });
    expect(rows[0].chargeKind).toBe('consult');
    expect(rows[0].doctorApprovalCents).toBe(0);
  });

  it('sums totalDeductionsCents = merchant + platform + doctor (bloodwork)', () => {
    const rows = buildOtNonRxReconciliation({
      paymentCollections: [makePayment({ paymentId: 1, invoiceId: 7001, amountCents: 18000, netCollectedCents: 18000 })],
      nonRxChargeLineItems: [makeNonRxLine({ invoiceDbId: 7001 })],
      invoiceDbIdsUsedForCogs: new Set(),
    });
    const r = rows[0];
    expect(r.totalDeductionsCents).toBe(
      r.merchantProcessingCents + r.platformCompensationCents + r.doctorApprovalCents
    );
    expect(r.clinicNetPayoutCents).toBe(r.patientGrossCents - r.totalDeductionsCents);
  });

  it('orders rows by paidAt ascending', () => {
    const a = makePayment({ paymentId: 1, invoiceId: 7001, paidAt: '2026-04-13T18:00:00.000Z' });
    const b = makePayment({ paymentId: 2, invoiceId: 7002, paidAt: '2026-04-13T10:00:00.000Z' });
    const rows = buildOtNonRxReconciliation({
      paymentCollections: [a, b],
      nonRxChargeLineItems: [
        makeNonRxLine({ invoiceDbId: 7001 }),
        makeNonRxLine({ invoiceDbId: 7002, chargeKind: 'consult', description: 'Telehealth visit' }),
      ],
      invoiceDbIdsUsedForCogs: new Set(),
    });
    expect(rows[0].dispositionKey).toBe('inv:7002');
    expect(rows[1].dispositionKey).toBe('inv:7001');
  });
});

// ---------------------------------------------------------------------------
// Schema: chargeKind is optional and back-compat with Rx callers
// ---------------------------------------------------------------------------

describe('OtAllocationOverridePayload schema with chargeKind extension', () => {
  const base = (): OtAllocationOverridePayload => ({
    meds: [],
    shippingCents: 0,
    trtTelehealthCents: 0,
    doctorRxFeeCents: 0,
    fulfillmentFeesCents: 0,
    customLineItems: [],
    notes: null,
    patientGrossCents: 0,
    salesRepId: null,
    salesRepName: null,
    salesRepCommissionCentsOverride: null,
    /**
     * Phase 2a adds this optional field. When omitted (Rx callers), parsing
     * normalizes it to null. Spec test forces explicit shape so old payloads
     * round-trip identically.
     */
    chargeKind: null,
  });

  it('accepts a payload with chargeKind = null (Rx default)', () => {
    expect(otAllocationOverridePayloadSchema.safeParse(base()).success).toBe(true);
  });

  it('accepts chargeKind = bloodwork | consult | other', () => {
    for (const k of ['bloodwork', 'consult', 'other'] as const) {
      const r = otAllocationOverridePayloadSchema.safeParse({ ...base(), chargeKind: k });
      expect(r.success, `${k} should parse`).toBe(true);
    }
  });

  it('rejects an unknown chargeKind value', () => {
    const r = otAllocationOverridePayloadSchema.safeParse({ ...base(), chargeKind: 'pharmacy' });
    expect(r.success).toBe(false);
  });

  it('back-compat: payload without chargeKind defaults to null after parse', () => {
    /** Strip the field to mimic an existing Rx payload from disk. */
    const legacy = base();
    delete (legacy as Partial<OtAllocationOverridePayload>).chargeKind;
    const r = otAllocationOverridePayloadSchema.safeParse(legacy);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.chargeKind).toBeNull();
  });
});
