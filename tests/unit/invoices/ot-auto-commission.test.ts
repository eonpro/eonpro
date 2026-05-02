/**
 * OT Manual Reconciliation — auto new/rebill commission rate.
 *
 * Covers:
 *   - Schema accepts the new payload-level `commissionRateBps` field.
 *   - `computeOtSalesRepCommissionCents` precedence:
 *       1. salesRepId == null → 0
 *       2. salesRepCommissionCentsOverride (manual $ override) wins
 *       3. payload.commissionRateBps × max(0, gross − meds total)
 *       4. legacy per-line `meds[].commissionRateBps` sum
 *       5. else 0
 *   - 8% × (gross − meds) for new sales; 1% for rebills.
 *   - `buildDefaultOverridePayload` seeds `commissionRateBps` from
 *     `OtPerSaleReconciliationLine.isRebill`.
 */

import { describe, it, expect } from 'vitest';
import {
  otAllocationOverridePayloadSchema,
  computeOtSalesRepCommissionCents,
  computeOtAllocationOverrideTotals,
  type OtAllocationOverridePayload,
} from '@/services/invoices/otAllocationOverrideTypes';
import {
  buildDefaultOverridePayload,
  type OtPerSaleReconciliationLine,
} from '@/services/invoices/otInvoiceGenerationService';

const REBILL_BPS = 100; // 1%
const NEW_BPS = 800; // 8%

function basePayload(over: Partial<OtAllocationOverridePayload> = {}): OtAllocationOverridePayload {
  return {
    meds: [
      {
        medicationKey: null,
        name: 'Semaglutide',
        strength: '',
        vialSize: '',
        quantity: 1,
        unitPriceCents: 13_500, // $135 COGS
        lineTotalCents: 13_500,
        source: 'custom',
        commissionRateBps: null,
      },
    ],
    shippingCents: 0,
    trtTelehealthCents: 0,
    doctorRxFeeCents: 0,
    fulfillmentFeesCents: 0,
    customLineItems: [],
    notes: null,
    patientGrossCents: 35_000, // $350 gross
    salesRepId: 7,
    salesRepName: 'Doe, Jane',
    salesRepCommissionCentsOverride: null,
    chargeKind: null,
    commissionRateBps: null,
    ...over,
  } as OtAllocationOverridePayload;
}

function makeSale(over: Partial<OtPerSaleReconciliationLine> = {}): OtPerSaleReconciliationLine {
  return {
    orderId: 1,
    invoiceDbId: 100,
    lifefileOrderId: null,
    orderDate: '2026-04-13T10:00:00.000Z',
    paidAt: '2026-04-13T10:00:00.000Z',
    patientName: 'Doe, Jane',
    productDescription: null,
    patientGrossCents: 35_000,
    patientGrossSource: 'stripe_payments',
    stripeBillingNameMatch: 'match',
    invoicePatientMatchesOrder: true,
    medicationsCostCents: 13_500,
    shippingCents: 0,
    trtTelehealthCents: 0,
    pharmacyTotalCents: 13_500,
    doctorApprovalCents: 0,
    doctorRxFeeNominalCents: 3000,
    doctorRxFeeWaivedCents: 0,
    doctorRxFeeDaysSincePrior: null,
    doctorRxFeeNote: null,
    fulfillmentFeesCents: 0,
    merchantProcessingCents: 0,
    platformCompensationCents: 0,
    salesRepCommissionCents: 0,
    salesRepId: 7,
    salesRepName: 'Doe, Jane',
    managerOverrideTotalCents: 0,
    managerOverrideSummary: null,
    totalDeductionsCents: 0,
    clinicNetPayoutCents: 0,
    isRebill: false,
    isBloodworkOnly: false,
    ...over,
  };
}

describe('Schema: payload-level commissionRateBps', () => {
  it('accepts null (back-compat)', () => {
    const r = otAllocationOverridePayloadSchema.safeParse(basePayload({ commissionRateBps: null }));
    expect(r.success).toBe(true);
  });

  it('accepts 800 (8% new sale)', () => {
    const r = otAllocationOverridePayloadSchema.safeParse(basePayload({ commissionRateBps: 800 }));
    expect(r.success).toBe(true);
  });

  it('accepts 100 (1% rebill)', () => {
    const r = otAllocationOverridePayloadSchema.safeParse(basePayload({ commissionRateBps: 100 }));
    expect(r.success).toBe(true);
  });

  it('rejects negative bps', () => {
    const r = otAllocationOverridePayloadSchema.safeParse(basePayload({ commissionRateBps: -1 }));
    expect(r.success).toBe(false);
  });

  it('rejects bps > 5000 (50% sanity cap)', () => {
    const r = otAllocationOverridePayloadSchema.safeParse(basePayload({ commissionRateBps: 5001 }));
    expect(r.success).toBe(false);
  });

  it('omitted commissionRateBps round-trips as null (back-compat with pre-feature drafts)', () => {
    const { commissionRateBps: _drop, ...rest } = basePayload();
    const parsed = otAllocationOverridePayloadSchema.parse(rest);
    expect(parsed.commissionRateBps ?? null).toBeNull();
  });
});

describe('computeOtSalesRepCommissionCents precedence', () => {
  it('returns 0 when no rep is assigned, even with payload rate set', () => {
    const p = basePayload({ salesRepId: null, commissionRateBps: NEW_BPS });
    expect(computeOtSalesRepCommissionCents(p)).toBe(0);
  });

  it('manual $ override wins over payload rate', () => {
    const p = basePayload({
      commissionRateBps: NEW_BPS,
      salesRepCommissionCentsOverride: 9999,
    });
    expect(computeOtSalesRepCommissionCents(p)).toBe(9999);
  });

  it('payload commissionRateBps = (gross − meds) × bps / 10_000', () => {
    // gross 350, meds 135 → basis 215; 8% → $17.20
    const p = basePayload({ commissionRateBps: NEW_BPS });
    expect(computeOtSalesRepCommissionCents(p)).toBe(1720);
  });

  it('rebill (1%) of $350 − $135 = $2.15', () => {
    const p = basePayload({ commissionRateBps: REBILL_BPS });
    expect(computeOtSalesRepCommissionCents(p)).toBe(215);
  });

  it('floors basis at 0 when meds total exceeds gross (admin over-allocation)', () => {
    const p = basePayload({
      patientGrossCents: 5000, // $50 gross
      meds: [
        {
          medicationKey: null,
          name: 'Big bundle',
          strength: '',
          vialSize: '',
          quantity: 1,
          unitPriceCents: 10_000, // $100 COGS — exceeds gross
          lineTotalCents: 10_000,
          source: 'custom',
          commissionRateBps: null,
        },
      ],
      commissionRateBps: NEW_BPS,
    });
    expect(computeOtSalesRepCommissionCents(p)).toBe(0);
  });

  it('falls back to legacy per-line bps when payload rate is null', () => {
    const p = basePayload({
      commissionRateBps: null,
      meds: [
        {
          medicationKey: null,
          name: 'Med A',
          strength: '',
          vialSize: '',
          quantity: 1,
          unitPriceCents: 10_000,
          lineTotalCents: 10_000,
          source: 'custom',
          commissionRateBps: 800, // 8% per line legacy
        },
      ],
    });
    // 10_000 × 800 / 10_000 = 800
    expect(computeOtSalesRepCommissionCents(p)).toBe(800);
  });

  it('totals reflect commission via computeOtAllocationOverrideTotals', () => {
    const p = basePayload({ commissionRateBps: NEW_BPS });
    const t = computeOtAllocationOverrideTotals(p);
    expect(t.salesRepCommissionCents).toBe(1720);
    /**
     * total deductions = meds 13500 + commission 1720 + EONPro 5% × $350 = 1750
     * (rate change 2026-05-02: every row carries the 5% EONPro fee)
     */
    const eonpro = Math.round((35_000 * 500) / 10_000);
    expect(t.eonproFeeCents).toBe(eonpro);
    expect(t.totalDeductionsCents).toBe(13_500 + 1720 + eonpro);
    expect(t.netToOtClinicCents).toBe(35_000 - (13_500 + 1720 + eonpro));
  });
});

describe('buildDefaultOverridePayload — auto rate by isRebill', () => {
  it('sets commissionRateBps = 800 for new sales (isRebill=false)', () => {
    const sale = makeSale({ isRebill: false });
    const payload = buildDefaultOverridePayload(sale, []);
    expect(payload.commissionRateBps).toBe(NEW_BPS);
  });

  it('sets commissionRateBps = 100 for rebills (isRebill=true)', () => {
    const sale = makeSale({
      isRebill: true,
      doctorRxFeeDaysSincePrior: 14,
    });
    const payload = buildDefaultOverridePayload(sale, []);
    expect(payload.commissionRateBps).toBe(REBILL_BPS);
  });

  it('does NOT pre-fill salesRepCommissionCentsOverride from ledger anymore (auto rate is default)', () => {
    const sale = makeSale({
      isRebill: false,
      salesRepCommissionCents: 4242, // some prior ledger amount
    });
    const payload = buildDefaultOverridePayload(sale, []);
    expect(payload.salesRepCommissionCentsOverride).toBeNull();
    // Effective commission comes from payload rate, not from ledger.
    // Patient gross 35000, meds 0 (no pharmacy line for orderId=1) → basis 35000
    // 35000 × 8% = 2800
    expect(computeOtSalesRepCommissionCents(payload)).toBe(2800);
  });

  it('still pre-fills salesRepId / salesRepName from the per-sale row', () => {
    const sale = makeSale({ salesRepId: 42, salesRepName: 'Smith, Bob' });
    const payload = buildDefaultOverridePayload(sale, []);
    expect(payload.salesRepId).toBe(42);
    expect(payload.salesRepName).toBe('Smith, Bob');
  });
});
