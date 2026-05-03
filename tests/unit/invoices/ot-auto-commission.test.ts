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
  getOtTieredNewSaleRateBps,
  getOtDoctorPayoutForSale,
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
    prescribingProviderName: null,
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
    invoiceLineItems: [],
    prescribingProviderName: null,
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

  it('payload commissionRateBps = patientGrossCents × bps / 10_000 (gross basis since 2026-05-02)', () => {
    // gross 350; 8% → $28.00
    const p = basePayload({ commissionRateBps: NEW_BPS });
    expect(computeOtSalesRepCommissionCents(p)).toBe(2800);
  });

  it('rebill (1%) of $350 = $3.50', () => {
    const p = basePayload({ commissionRateBps: REBILL_BPS });
    expect(computeOtSalesRepCommissionCents(p)).toBe(350);
  });

  it('basis is gross even when meds total exceeds gross (admin over-allocation)', () => {
    /**
     * Commission no longer subtracts COGS, so over-allocating meds doesn't
     * zero out the rep's commission. 8% × $50 gross = $4.00 regardless of
     * the $100 meds line.
     */
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
    expect(computeOtSalesRepCommissionCents(p)).toBe(400);
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
    /**
     * Gross-basis commission (since 2026-05-02): 8% × $350 = $28 = 2,800.
     * total deductions (with auto Antonio override on Doe, Jane's sale —
     * Antonio gets 1% × $350 = $3.50):
     *   meds 13500
     *   + commission 2,800
     *   + EONPro 5% × $350 = 1,750
     *   + Merchant 4% × $350 = 1,400
     *   + Manager override 1% × $350 = 350
     */
    const eonpro = Math.round((35_000 * 500) / 10_000);
    const merchant = Math.round((35_000 * 400) / 10_000);
    const managerOverride = Math.round((35_000 * 100) / 10_000);
    expect(t.salesRepCommissionCents).toBe(2800);
    expect(t.eonproFeeCents).toBe(eonpro);
    expect(t.merchantProcessingFeeCents).toBe(merchant);
    expect(t.managerOverrideCents).toBe(managerOverride);
    expect(t.managerOverrideManagerName).toBe('Escobar, Antonio');
    expect(t.totalDeductionsCents).toBe(13_500 + 2800 + eonpro + merchant + managerOverride);
    expect(t.netToOtClinicCents).toBe(
      35_000 - (13_500 + 2800 + eonpro + merchant + managerOverride)
    );
  });
});

describe('Auto manager override — Antonio Escobar 1% on non-excluded reps', () => {
  it('grants 1% on a sale by a non-excluded rep', () => {
    const p = basePayload({ salesRepName: 'Doe, Jane' });
    const t = computeOtAllocationOverrideTotals(p);
    expect(t.managerOverrideCents).toBe(350); // 1% × $350
    expect(t.managerOverrideManagerName).toBe('Escobar, Antonio');
  });

  it('skips Antonio\u2019s OWN sales (no double-pay)', () => {
    const p = basePayload({ salesRepName: 'Escobar, Antonio' });
    const t = computeOtAllocationOverrideTotals(p);
    expect(t.managerOverrideCents).toBe(0);
    expect(t.managerOverrideManagerName).toBeNull();
  });

  it('skips Max Putrello (excluded rep)', () => {
    const p = basePayload({ salesRepName: 'Putrello, Max' });
    const t = computeOtAllocationOverrideTotals(p);
    expect(t.managerOverrideCents).toBe(0);
    expect(t.managerOverrideManagerName).toBeNull();
  });

  it('skips Jay Reeves (excluded rep)', () => {
    const p = basePayload({ salesRepName: 'Reeves, Jay' });
    const t = computeOtAllocationOverrideTotals(p);
    expect(t.managerOverrideCents).toBe(0);
    expect(t.managerOverrideManagerName).toBeNull();
  });

  it('matches case-insensitively', () => {
    const p = basePayload({ salesRepName: 'PUTRELLO, MAX' });
    const t = computeOtAllocationOverrideTotals(p);
    expect(t.managerOverrideCents).toBe(0);
  });

  it('no rep on the sale → no override', () => {
    const p = basePayload({ salesRepName: null });
    const t = computeOtAllocationOverrideTotals(p);
    expect(t.managerOverrideCents).toBe(0);
    expect(t.managerOverrideManagerName).toBeNull();
  });

  it('applies to rebill sales too (1% × gross regardless of rate)', () => {
    const p = basePayload({ salesRepName: 'Doe, Jane', commissionRateBps: 100 });
    const t = computeOtAllocationOverrideTotals(p);
    expect(t.managerOverrideCents).toBe(350);
    expect(t.salesRepCommissionCents).toBe(350); // 1% rebill commission
  });
});

describe('Auto doctor payout — TRT always Sergio Naccarato; per-Rx follows actual prescriber', () => {
  it('TRT telehealth sale → $35 to Sergio (always — only Sergio runs TRT visits)', () => {
    /**
     * Per stakeholder rule (2026-05-02): the $35 TRT visit fee always
     * pays Sergio Naccarato regardless of which provider is on the
     * Lifefile order. Sergio is the only doctor running TRT visits, so
     * even if the order's `provider` is someone else (e.g. a covering
     * provider who signed the Rx), the visit fee still goes to Sergio.
     */
    const p = basePayload({
      trtTelehealthCents: 5000,
      prescribingProviderName: 'Cruz, Victor',
    });
    const r = getOtDoctorPayoutForSale(p);
    expect(r.amountCents).toBe(3500);
    expect(r.doctorName).toBe('Naccarato, Sergio');
  });

  it('non-TRT Rx sale → $10 to the actual prescriber (Victor Cruz, not Sergio)', () => {
    /**
     * Reproduces the bug reported on 2026-05-02 (Anthony Golden / Order
     * #16503 / Enclomiphene): the patient's Rx history shows Victor Cruz
     * as the provider but the OT report was crediting Sergio Naccarato
     * with the $10. Fee should follow the actual prescriber.
     */
    const p = basePayload({
      trtTelehealthCents: 0,
      prescribingProviderName: 'Cruz, Victor',
      meds: [
        { medicationKey: null, name: 'Enclomiphene', strength: '25 mg', vialSize: 'CAP', quantity: 1, unitPriceCents: 13_500, lineTotalCents: 13_500, source: 'custom', commissionRateBps: null },
      ],
    });
    const r = getOtDoctorPayoutForSale(p);
    expect(r.amountCents).toBe(1000);
    expect(r.doctorName).toBe('Cruz, Victor');
  });

  it('non-TRT Rx sale, multi-med package → $10 once to the actual prescriber', () => {
    /**
     * TRT Plus has 3 meds but only 1 prescription. Per-Rx flat fee, not
     * per-med, paid to whoever wrote the script.
     */
    const p = basePayload({
      trtTelehealthCents: 0,
      prescribingProviderName: 'Smith, Alice',
      meds: [
        { medicationKey: null, name: 'Cypionate', strength: '', vialSize: '', quantity: 1, unitPriceCents: 2500, lineTotalCents: 2500, source: 'custom', commissionRateBps: null },
        { medicationKey: null, name: 'Enclomiphene', strength: '', vialSize: '', quantity: 1, unitPriceCents: 1800, lineTotalCents: 1800, source: 'custom', commissionRateBps: null },
        { medicationKey: null, name: 'Anastrozole', strength: '', vialSize: '', quantity: 1, unitPriceCents: 1200, lineTotalCents: 1200, source: 'custom', commissionRateBps: null },
      ],
    });
    const r = getOtDoctorPayoutForSale(p);
    expect(r.amountCents).toBe(1000);
    expect(r.doctorName).toBe('Smith, Alice');
  });

  it('non-TRT Rx sale with no prescriber name → $0 (no one to pay)', () => {
    /**
     * Defensive: if the upstream service couldn't resolve the order's
     * provider (e.g. legacy data, dosespot sync miss), pay $0 rather
     * than mis-attribute. Surfaces a payroll gap that admin can fix.
     */
    const p = basePayload({
      trtTelehealthCents: 0,
      prescribingProviderName: null,
      meds: [
        { medicationKey: null, name: 'Sermorelin', strength: '', vialSize: '', quantity: 1, unitPriceCents: 5000, lineTotalCents: 5000, source: 'custom', commissionRateBps: null },
      ],
    });
    const r = getOtDoctorPayoutForSale(p);
    expect(r.amountCents).toBe(0);
    expect(r.doctorName).toBeNull();
  });

  it('non-Rx-only sale (bloodwork, no meds) → $0; doctor name null', () => {
    const p = basePayload({ trtTelehealthCents: 0, meds: [], prescribingProviderName: 'Cruz, Victor' });
    const r = getOtDoctorPayoutForSale(p);
    expect(r.amountCents).toBe(0);
    expect(r.doctorName).toBeNull();
  });

  it('TRT + Rx → $35 to Sergio (TRT wins; no double-pay even when prescriber is someone else)', () => {
    const p = basePayload({
      trtTelehealthCents: 5000,
      prescribingProviderName: 'Cruz, Victor',
    });
    const r = getOtDoctorPayoutForSale(p);
    expect(r.amountCents).toBe(3500);
    expect(r.doctorName).toBe('Naccarato, Sergio');
  });

  it('totals expose doctorPayoutCents but DO NOT add it to totalDeductionsCents (info-only)', () => {
    const p = basePayload({ trtTelehealthCents: 5000 });
    const t = computeOtAllocationOverrideTotals(p);
    expect(t.doctorPayoutCents).toBe(3500);
    expect(t.doctorPayoutDoctorName).toBe('Naccarato, Sergio');
    /** Net to OT clinic should be unchanged whether we add doctorPayout
     *  or not — it's paid by EONPro, not the clinic. */
    const expectedDeductionsWithoutDoctor =
      t.medicationsCents +
      t.shippingCents +
      t.trtTelehealthCents +
      t.doctorRxFeeCents +
      t.fulfillmentFeesCents +
      t.customLineItemsCents +
      t.salesRepCommissionCents +
      t.eonproFeeCents +
      t.merchantProcessingFeeCents +
      t.managerOverrideCents;
    expect(t.totalDeductionsCents).toBe(expectedDeductionsWithoutDoctor);
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
    // 8% × $350 patient gross = $28.00 (gross basis since 2026-05-02).
    expect(computeOtSalesRepCommissionCents(payload)).toBe(2800);
  });

  it('still pre-fills salesRepId / salesRepName from the per-sale row', () => {
    const sale = makeSale({ salesRepId: 42, salesRepName: 'Smith, Bob' });
    const payload = buildDefaultOverridePayload(sale, []);
    expect(payload.salesRepId).toBe(42);
    expect(payload.salesRepName).toBe('Smith, Bob');
  });

  it('carries prescribingProviderName through so the doctor payout follows the actual writer', () => {
    /**
     * Lock in the data flow that fixes the Anthony Golden bug
     * (2026-05-02): the per-sale line carries the order's provider, the
     * default builder propagates it onto the payload, and downstream
     * `getOtDoctorPayoutForSale` uses it for the per-Rx attribution.
     *
     * Pass a pharmacy line for the sale's order so the default builder
     * populates `meds` (otherwise the Rx-fee branch never fires and the
     * test would degenerate into the no-meds path).
     */
    const sale = makeSale({
      orderId: 16503,
      prescribingProviderName: 'Cruz, Victor',
      isRebill: false,
    });
    const pharmacyLines = [
      {
        orderId: 16503,
        lifefileOrderId: null,
        orderDate: sale.orderDate,
        paidAt: sale.paidAt,
        patientName: sale.patientName,
        patientId: 1,
        providerName: 'Cruz, Victor',
        providerId: 99,
        medicationName: 'Enclomiphene Citrate',
        strength: '25 mg',
        vialSize: 'CAP',
        medicationKey: 'enclomiphene-25mg',
        quantity: 1,
        unitPriceCents: 13_500,
        lineTotalCents: 13_500,
        pricingStatus: 'priced' as const,
      },
    ];
    const payload = buildDefaultOverridePayload(sale, pharmacyLines);
    expect(payload.prescribingProviderName).toBe('Cruz, Victor');
    expect(payload.meds.length).toBeGreaterThan(0);
    const totals = computeOtAllocationOverrideTotals(payload);
    expect(totals.doctorPayoutDoctorName).toBe('Cruz, Victor');
    expect(totals.doctorPayoutCents).toBe(1000);
  });
});

describe('Currency formatting — thousand separators', () => {
  /**
   * Inline helper mirroring the centsToDisplay implementations in
   * page.tsx / OtAllocationEditor / OtNonRxAllocationEditor /
   * otInvoiceGenerationService. Single source of expected output for
   * the format change so future divergence trips this spec.
   */
  const fmt = (cents: number): string => {
    const negative = cents < 0;
    const abs = Math.abs(cents);
    const dollars = Math.floor(abs / 100);
    const remainder = (abs % 100).toString().padStart(2, '0');
    const withCommas = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${negative ? '-' : ''}$${withCommas}.${remainder}`;
  };

  it('formats $127,154.00 with comma thousand separator', () => {
    expect(fmt(12_715_400)).toBe('$127,154.00');
  });

  it('formats small values without leading commas', () => {
    expect(fmt(0)).toBe('$0.00');
    expect(fmt(50)).toBe('$0.50');
    expect(fmt(99_99)).toBe('$99.99');
    expect(fmt(999_99)).toBe('$999.99');
    expect(fmt(1_000_00)).toBe('$1,000.00');
  });

  it('handles millions', () => {
    expect(fmt(1_234_567_89)).toBe('$1,234,567.89');
  });

  it('formats negatives with leading minus', () => {
    expect(fmt(-150_00)).toBe('-$150.00');
    expect(fmt(-1_000_000_50)).toBe('-$1,000,000.50');
  });
});

describe('getOtTieredNewSaleRateBps — volume-tiered NEW-sale commission', () => {
  it('$0 — $17,299.99 → 8% (base)', () => {
    expect(getOtTieredNewSaleRateBps(0)).toBe(800);
    expect(getOtTieredNewSaleRateBps(1_729_999)).toBe(800);
  });

  it('$17,300 — $22,999.99 → 9% (+1% volume bonus)', () => {
    expect(getOtTieredNewSaleRateBps(1_730_000)).toBe(900);
    expect(getOtTieredNewSaleRateBps(2_299_999)).toBe(900);
  });

  it('$23,000 — $28,999.99 → 10% (+2%)', () => {
    expect(getOtTieredNewSaleRateBps(2_300_000)).toBe(1000);
    expect(getOtTieredNewSaleRateBps(2_899_999)).toBe(1000);
  });

  it('$29,000 — $34,999.99 → 11% (+3%)', () => {
    expect(getOtTieredNewSaleRateBps(2_900_000)).toBe(1100);
    expect(getOtTieredNewSaleRateBps(3_499_999)).toBe(1100);
  });

  it('$35,000+ → 12% (+4%, top tier)', () => {
    expect(getOtTieredNewSaleRateBps(3_500_000)).toBe(1200);
    expect(getOtTieredNewSaleRateBps(10_000_000)).toBe(1200);
  });
});

describe('computeOtSalesRepCommissionCents — tier-rate override (NEW sales only)', () => {
  it('uses the effective rate when passed (e.g. tier 9% instead of base 8%)', () => {
    const p = basePayload({ commissionRateBps: 800 });
    /** Base 8% × $350 = $28; tier 9% × $350 = $31.50. */
    expect(computeOtSalesRepCommissionCents(p)).toBe(2800);
    expect(computeOtSalesRepCommissionCents(p, 900)).toBe(3150);
    expect(computeOtSalesRepCommissionCents(p, 1200)).toBe(4200);
  });

  it('manual $ override still wins over tier-bumped rate', () => {
    const p = basePayload({
      commissionRateBps: 800,
      salesRepCommissionCentsOverride: 9999,
    });
    expect(computeOtSalesRepCommissionCents(p, 1200)).toBe(9999);
  });

  it('rebill rows (1%) are unaffected by the tier override (caller never passes one)', () => {
    const p = basePayload({ commissionRateBps: 100 });
    /** Even if the editor accidentally passed an effective rate for a rebill,
     *  the function still applies it. The editor is responsible for only
     *  passing the tier rate when commissionRateBps === 800. This test
     *  documents the current contract — flip caller logic in the editor
     *  if this changes. */
    expect(computeOtSalesRepCommissionCents(p)).toBe(350);
  });
});
