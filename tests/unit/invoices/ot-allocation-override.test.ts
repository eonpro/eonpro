/**
 * OT Manual Reconciliation — allocation override tests.
 *
 * Covers:
 *   - Zod schema validation (negatives rejected, oversized notes rejected, etc.)
 *   - computeOtAllocationOverrideTotals math
 *   - reconcileOtAllocationMedLineTotals defense-in-depth recompute
 *   - buildDefaultOverridePayload parity with the underlying per-sale row
 *   - applyOtAllocationOverrides correctly merges overrides + defaults
 *   - generateOtCustomReconciliationPDF emits a non-empty PDF (smoke)
 *   - applyOtAllocationOverrides does not mutate input (data integrity)
 */

import { describe, it, expect } from 'vitest';
import {
  otAllocationOverridePayloadSchema,
  otAllocationOverrideUpsertSchema,
  computeOtAllocationOverrideTotals,
  computeOtSalesRepCommissionCents,
  reconcileOtAllocationMedLineTotals,
  type OtAllocationOverridePayload,
} from '@/services/invoices/otAllocationOverrideTypes';
import {
  buildDefaultOverridePayload,
  applyOtAllocationOverrides,
  generateOtCustomReconciliationPDF,
  type OtAllocationOverrideMeta,
  type OtDailyInvoices,
  type OtPerSaleReconciliationLine,
  type OtPharmacyLineItem,
} from '@/services/invoices/otInvoiceGenerationService';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMed(overrides: Partial<OtPharmacyLineItem> = {}): OtPharmacyLineItem {
  return {
    orderId: 200,
    lifefileOrderId: null,
    orderDate: '2026-04-13T10:00:00.000Z',
    paidAt: '2026-04-13T10:00:00.000Z',
    patientName: 'Doe, Jane',
    patientId: 1,
    providerName: 'Smith, Bob',
    providerId: 1,
    medicationName: 'Semaglutide',
    strength: '2.5/20MG/ML',
    vialSize: '1ML',
    medicationKey: '203448971',
    quantity: 1,
    unitPriceCents: 3500,
    lineTotalCents: 3500,
    pricingStatus: 'priced',
    ...overrides,
  };
}

function makeSale(
  overrides: Partial<OtPerSaleReconciliationLine> = {}
): OtPerSaleReconciliationLine {
  /**
   * Default fixture: $249 gross with a deliberately non-matching description so the
   * tier-aware matcher in `buildDefaultOverridePayload` returns null and the test
   * exercises the pharmacyLines fallback. Tests that want to validate the matcher
   * path explicitly set productDescription to a real package name.
   */
  return {
    orderId: 200,
    invoiceDbId: 500,
    lifefileOrderId: null,
    orderDate: '2026-04-13T10:00:00.000Z',
    paidAt: '2026-04-13T10:00:00.000Z',
    patientName: 'Doe, Jane',
    productDescription: 'NoCatalogMatchProductXyz',
    patientGrossCents: 24900,
    patientGrossSource: 'stripe_payments',
    stripeBillingNameMatch: 'match',
    invoicePatientMatchesOrder: true,
    medicationsCostCents: 3500,
    shippingCents: 2000,
    trtTelehealthCents: 0,
    pharmacyTotalCents: 5500,
    doctorApprovalCents: 3000,
    doctorRxFeeNominalCents: 3000,
    doctorRxFeeWaivedCents: 0,
    doctorRxFeeDaysSincePrior: null,
    doctorRxFeeNote: null,
    fulfillmentFeesCents: 0,
    merchantProcessingCents: 996,
    platformCompensationCents: 2490,
    salesRepCommissionCents: 0,
    salesRepId: null,
    salesRepName: null,
    managerOverrideTotalCents: 0,
    managerOverrideSummary: null,
    totalDeductionsCents: 11986,
    clinicNetPayoutCents: 12914,
    isRebill: false,
    isBloodworkOnly: false,
    invoiceLineItems: [],
    ...overrides,
  };
}

function makeData(
  perSale: OtPerSaleReconciliationLine[],
  pharmacy: OtPharmacyLineItem[]
): OtDailyInvoices {
  return {
    pharmacy: {
      invoiceType: 'pharmacy',
      clinicId: 1,
      clinicName: 'OT',
      invoiceDate: '2026-04-13T12:00:00.000Z',
      periodStart: '2026-04-13T04:00:00.000Z',
      periodEnd: '2026-04-14T03:59:59.999Z',
      lineItems: pharmacy,
      shippingLineItems: [],
      prescriptionFeeLineItems: [],
      trtTelehealthLineItems: [],
      subtotalMedicationsCents: pharmacy.reduce((s, p) => s + p.lineTotalCents, 0),
      subtotalShippingCents: 0,
      subtotalPrescriptionFeesCents: 0,
      subtotalTrtTelehealthCents: 0,
      totalCents: pharmacy.reduce((s, p) => s + p.lineTotalCents, 0),
      orderCount: perSale.length,
      vialCount: pharmacy.reduce((s, p) => s + p.quantity, 0),
      missingPriceCount: 0,
      estimatedPriceCount: 0,
    },
    doctorApprovals: {
      invoiceType: 'doctor_approvals',
      clinicId: 1,
      clinicName: 'OT',
      invoiceDate: '2026-04-13T12:00:00.000Z',
      periodStart: '2026-04-13T04:00:00.000Z',
      periodEnd: '2026-04-14T03:59:59.999Z',
      lineItems: [],
      asyncFeeCents: 3000,
      syncFeeCents: 5000,
      asyncCount: 0,
      syncCount: 0,
      totalCents: 0,
    },
    fulfillment: {
      invoiceType: 'fulfillment',
      clinicId: 1,
      clinicName: 'OT',
      invoiceDate: '2026-04-13T12:00:00.000Z',
      periodStart: '2026-04-13T04:00:00.000Z',
      periodEnd: '2026-04-14T03:59:59.999Z',
      lineItems: [],
      totalCents: 0,
    },
    merchantProcessing: { grossSalesCents: 0, rateBps: 400, feeCents: 0 },
    platformCompensation: { grossSalesCents: 0, rateBps: 1000, feeCents: 0, invoiceCount: 0 },
    grandTotalCents: 0,
    clinicNetPayoutCents: 0,
    salesRepCommissionTotalCents: 0,
    managerOverrideTotalCents: 0,
    perSaleReconciliation: perSale,
    paymentCollections: [],
    paymentsCollectedNetCents: 0,
    paymentsCollectedGrossCents: 0,
    refundsTotalCents: 0,
    refundLineItems: [],
    matchedPrescriptionInvoiceGrossCents: 0,
    feesUseCashCollectedBasis: false,
    paymentsWithoutPharmacyCogs: [],
    nonRxChargeLineItems: [],
    nonRxExplainedPaymentCount: 0,
  };
}

const validPayload = (): OtAllocationOverridePayload => ({
  meds: [
    {
      medicationKey: '203448971',
      name: 'Semaglutide',
      strength: '2.5/20MG/ML',
      vialSize: '1ML',
      quantity: 1,
      unitPriceCents: 3500,
      lineTotalCents: 3500,
      source: 'catalog',
    },
  ],
  shippingCents: 2000,
  trtTelehealthCents: 0,
  doctorRxFeeCents: 3000,
  fulfillmentFeesCents: 0,
  customLineItems: [],
  notes: null,
  patientGrossCents: 24900,
});

// ---------------------------------------------------------------------------
// Zod validation
// ---------------------------------------------------------------------------

describe('otAllocationOverridePayloadSchema', () => {
  it('accepts a well-formed payload', () => {
    const r = otAllocationOverridePayloadSchema.safeParse(validPayload());
    expect(r.success).toBe(true);
  });

  it('rejects negative cents anywhere', () => {
    const p = validPayload();
    p.shippingCents = -1;
    expect(otAllocationOverridePayloadSchema.safeParse(p).success).toBe(false);
  });

  it('rejects empty medication name', () => {
    const p = validPayload();
    p.meds[0].name = '';
    expect(otAllocationOverridePayloadSchema.safeParse(p).success).toBe(false);
  });

  it('rejects quantity below 1', () => {
    const p = validPayload();
    p.meds[0].quantity = 0;
    expect(otAllocationOverridePayloadSchema.safeParse(p).success).toBe(false);
  });

  it('rejects oversized notes (>1000 chars)', () => {
    const p = validPayload();
    p.notes = 'x'.repeat(1001);
    expect(otAllocationOverridePayloadSchema.safeParse(p).success).toBe(false);
  });

  it('rejects more than 20 meds', () => {
    const p = validPayload();
    p.meds = Array.from({ length: 21 }, () => ({
      medicationKey: 'x',
      name: 'Y',
      strength: '',
      vialSize: '',
      quantity: 1,
      unitPriceCents: 1,
      lineTotalCents: 1,
      source: 'custom' as const,
    }));
    expect(otAllocationOverridePayloadSchema.safeParse(p).success).toBe(false);
  });

  it('upsert schema rejects FINALIZED with bad orderId', () => {
    const r = otAllocationOverrideUpsertSchema.safeParse({
      orderId: -1,
      payload: validPayload(),
      status: 'FINALIZED',
    });
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('computeOtAllocationOverrideTotals', () => {
  it('adds all the line buckets and computes net = gross - deductions', () => {
    const p = validPayload();
    p.customLineItems = [{ description: 'Comp shipping', amountCents: 100 }];
    p.fulfillmentFeesCents = 250;
    const t = computeOtAllocationOverrideTotals(p);
    expect(t.medicationsCents).toBe(3500);
    expect(t.shippingCents).toBe(2000);
    expect(t.doctorRxFeeCents).toBe(3000);
    expect(t.fulfillmentFeesCents).toBe(250);
    expect(t.customLineItemsCents).toBe(100);
    /**
     * Per-row platform deductions on patient gross:
     *   EONPro fee 5%  → 1,245 cents
     *   Merchant 4%    → 996 cents
     */
    expect(t.eonproFeeCents).toBe(1245);
    expect(t.merchantProcessingFeeCents).toBe(996);
    expect(t.totalDeductionsCents).toBe(3500 + 2000 + 0 + 3000 + 250 + 100 + 1245 + 996);
    expect(t.netToOtClinicCents).toBe(24900 - t.totalDeductionsCents);
  });

  it('allows net to go negative when admin over-allocates', () => {
    const p = validPayload();
    p.shippingCents = 100_000;
    const t = computeOtAllocationOverrideTotals(p);
    expect(t.netToOtClinicCents).toBeLessThan(0);
  });
});

describe('reconcileOtAllocationMedLineTotals', () => {
  it('snaps lineTotalCents to unitPriceCents * quantity even if drift was sent', () => {
    const out = reconcileOtAllocationMedLineTotals([
      {
        medicationKey: 'k',
        name: 'M',
        strength: '',
        vialSize: '',
        quantity: 3,
        unitPriceCents: 5000,
        lineTotalCents: 9999,
        source: 'catalog',
      },
    ]);
    expect(out[0].lineTotalCents).toBe(15000);
  });

  it('does not mutate input', () => {
    const input = [
      {
        medicationKey: 'k',
        name: 'M',
        strength: '',
        vialSize: '',
        quantity: 2,
        unitPriceCents: 100,
        lineTotalCents: 999,
        source: 'catalog' as const,
      },
    ];
    const before = JSON.stringify(input);
    reconcileOtAllocationMedLineTotals(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// buildDefaultOverridePayload — parity with computed sale row
// ---------------------------------------------------------------------------

describe('buildDefaultOverridePayload', () => {
  it('produces a payload whose totals match the underlying per-sale numbers', () => {
    const sale = makeSale();
    const meds = [makeMed()];
    const payload = buildDefaultOverridePayload(sale, meds);
    const totals = computeOtAllocationOverrideTotals(payload);
    expect(totals.medicationsCents).toBe(sale.medicationsCostCents);
    expect(totals.shippingCents).toBe(sale.shippingCents);
    expect(totals.doctorRxFeeCents).toBe(sale.doctorApprovalCents);
    expect(totals.fulfillmentFeesCents).toBe(sale.fulfillmentFeesCents);
    /**
     * patientGrossCents - (meds + shipping + trt + doctor + fulfillment +
     * EONPro 5% + Merchant 4%) — both platform fees are now per-row in the
     * editor's totals.
     */
    const eonproFee = Math.round((sale.patientGrossCents * 500) / 10_000);
    const merchantFee = Math.round((sale.patientGrossCents * 400) / 10_000);
    const expectedNet =
      sale.patientGrossCents -
      (sale.medicationsCostCents +
        sale.shippingCents +
        sale.trtTelehealthCents +
        sale.doctorApprovalCents +
        sale.fulfillmentFeesCents +
        eonproFee +
        merchantFee);
    expect(totals.netToOtClinicCents).toBe(expectedNet);
  });

  it('only includes pharmacy lines for the same orderId', () => {
    const sale = makeSale({ orderId: 200 });
    const myMed = makeMed({ orderId: 200 });
    const otherMed = makeMed({ orderId: 999, medicationName: 'OTHER', lineTotalCents: 99999 });
    const payload = buildDefaultOverridePayload(sale, [myMed, otherMed]);
    expect(payload.meds).toHaveLength(1);
    expect(payload.meds[0].name).toBe('Semaglutide');
  });

  it('uses tier-matched package COST when patient gross matches a catalog tier (the primary user fix)', () => {
    /**
     * Reproduces the exact production bug: patient paid $249 (1mo Enclomiphene retail).
     * The `pharmacyByOrderId` map had stale per-SKU pricing showing $135 (which is
     * actually the 3-month cost for the same SKU). With tier matching the editor
     * pre-fills $45 — the correct 1-month cost.
     */
    const sale = makeSale({
      productDescription: 'Enclomiphene Citrate 25 mg',
      patientGrossCents: 24900,
    });
    /** Stale pharmacy line — what the bug looks like in the underlying data. */
    const stalePharmacyLine = makeMed({
      medicationName: 'ENCLOMIPHENE CITRATE',
      strength: '25 mg',
      vialSize: 'CAP',
      unitPriceCents: 13500,
      lineTotalCents: 13500,
      pricingStatus: 'priced',
    });
    const payload = buildDefaultOverridePayload(sale, [stalePharmacyLine]);
    expect(payload.meds).toHaveLength(1);
    expect(payload.meds[0].name.toLowerCase()).toContain('enclomiphene');
    /** Cost defaults to the 1-month tier ($45), not the stale $135. */
    expect(payload.meds[0].unitPriceCents).toBe(4500);
    expect(payload.meds[0].lineTotalCents).toBe(4500);
    /** Vial slot is repurposed to label the matched tier so the PDF reads "1 month" not a vial size. */
    expect(payload.meds[0].vialSize).toBe('1 month');
    /** Shipping + consult also pulled from the catalog defaults for that package. */
    expect(payload.shippingCents).toBe(2000);
    expect(payload.doctorRxFeeCents).toBe(3000);
  });

  it('falls back to pharmacyLines when patient gross does not match any catalog tier', () => {
    const sale = makeSale({
      productDescription: 'Enclomiphene Citrate 25 mg',
      /** $250 is not a catalog tier — closest is $249 1mo. With tolerance=0 → no match. */
      patientGrossCents: 25000,
    });
    const stalePharmacyLine = makeMed({
      medicationName: 'ENCLOMIPHENE CITRATE',
      strength: '25 mg',
      unitPriceCents: 13500,
      lineTotalCents: 13500,
    });
    const payload = buildDefaultOverridePayload(sale, [stalePharmacyLine]);
    /** Falls back to the (stale) pharmacy line because no catalog tier matched. */
    expect(payload.meds[0].unitPriceCents).toBe(13500);
  });

  it('bloodwork-only sale uses fixed defaults regardless of phantom Rxs on the order', () => {
    /**
     * Reproduces the exact production scenario: patient paid $120 for
     * "Bloodwork (Full Panel)" but the Lifefile order has phantom Sermorelin
     * Rx data attached. With `isBloodworkOnly = true` set by the per-sale
     * loop (when invoice line items all classify as bloodwork), the editor
     * seeds bloodwork defaults instead of pulling Sermorelin into meds.
     */
    const sale = makeSale({
      productDescription: 'Bloodwork (Full Panel)',
      patientGrossCents: 12_000,
      isBloodworkOnly: true,
    });
    const phantomSermorelin = makeMed({
      medicationName: 'SERMORELIN ACETATE',
      strength: '2MG/ML',
      unitPriceCents: 7500,
      lineTotalCents: 7500,
    });
    const payload = buildDefaultOverridePayload(sale, [phantomSermorelin]);
    /** No meds — bloodwork has no pharmacy COGS. */
    expect(payload.meds).toEqual([]);
    /** No shipping, no TRT, no fulfillment. */
    expect(payload.shippingCents).toBe(0);
    expect(payload.trtTelehealthCents).toBe(0);
    expect(payload.fulfillmentFeesCents).toBe(0);
    /** $10 doctor / Rx review fee per stakeholder rule. */
    expect(payload.doctorRxFeeCents).toBe(1000);
    /** Patient gross + sales rep settings unchanged. */
    expect(payload.patientGrossCents).toBe(12_000);
  });
});

// ---------------------------------------------------------------------------
// applyOtAllocationOverrides — merger + grand totals
// ---------------------------------------------------------------------------

describe('applyOtAllocationOverrides', () => {
  it('uses computed defaults when no override is present and override values when present', () => {
    const sale1 = makeSale({ orderId: 200, patientGrossCents: 24900 });
    const sale2 = makeSale({
      orderId: 201,
      patientGrossCents: 50000,
      shippingCents: 3000,
      doctorApprovalCents: 5000,
      medicationsCostCents: 6200,
    });
    const data = makeData(
      [sale1, sale2],
      [
        makeMed({ orderId: 200 }),
        makeMed({ orderId: 201, lineTotalCents: 6200, unitPriceCents: 6200 }),
      ]
    );

    const overrides = new Map<number, OtAllocationOverrideMeta>();
    /** sale 200 gets a finalized override that comps shipping + doctor. */
    overrides.set(200, {
      status: 'FINALIZED',
      updatedAt: '2026-04-13T13:00:00.000Z',
      finalizedAt: '2026-04-13T13:00:00.000Z',
      lastEditedByUserId: 7,
      payload: {
        ...validPayload(),
        shippingCents: 0,
        doctorRxFeeCents: 0,
      },
    });

    const result = applyOtAllocationOverrides(data, overrides);
    expect(result.lines).toHaveLength(2);

    const overridden = result.lines.find((l) => l.orderId === 200)!;
    expect(overridden.overrideStatus).toBe('FINALIZED');
    expect(overridden.totals.shippingCents).toBe(0);
    expect(overridden.totals.doctorRxFeeCents).toBe(0);

    const computed = result.lines.find((l) => l.orderId === 201)!;
    expect(computed.overrideStatus).toBeNull();
    /** Computed defaults from sale row. */
    expect(computed.totals.shippingCents).toBe(3000);
    expect(computed.totals.doctorRxFeeCents).toBe(5000);

    /** Grand totals: 1 finalized + 1 computed-only. */
    expect(result.totals.saleCount).toBe(2);
    expect(result.totals.finalizedCount).toBe(1);
    expect(result.totals.draftCount).toBe(0);
    expect(result.totals.computedCount).toBe(1);
    expect(result.totals.patientGrossCents).toBe(24900 + 50000);
  });

  it('does not mutate the underlying OtDailyInvoices', () => {
    const sale = makeSale();
    const data = makeData([sale], [makeMed()]);
    const before = JSON.stringify(data);
    applyOtAllocationOverrides(data, new Map());
    expect(JSON.stringify(data)).toBe(before);
  });

  it('reflects custom line items in deductions and net', () => {
    const sale = makeSale({ patientGrossCents: 30000 });
    const data = makeData([sale], [makeMed()]);
    const overrides = new Map<number, OtAllocationOverrideMeta>();
    overrides.set(200, {
      status: 'DRAFT',
      updatedAt: '2026-04-13T13:00:00.000Z',
      finalizedAt: null,
      lastEditedByUserId: 7,
      payload: {
        ...validPayload(),
        patientGrossCents: 30000,
        customLineItems: [
          { description: 'Comp shipping', amountCents: 500 },
          { description: 'Special handling', amountCents: 250 },
        ],
      },
    });
    const r = applyOtAllocationOverrides(data, overrides);
    const line = r.lines[0];
    expect(line.totals.customLineItemsCents).toBe(750);
    /** EONPro 5% + Merchant 4% on $300 patient gross. */
    const eonpro = Math.round((30000 * 500) / 10_000);
    const merchant = Math.round((30000 * 400) / 10_000);
    expect(line.totals.eonproFeeCents).toBe(eonpro);
    expect(line.totals.merchantProcessingFeeCents).toBe(merchant);
    expect(line.totals.totalDeductionsCents).toBe(
      3500 + 2000 + 0 + 3000 + 0 + 750 + eonpro + merchant
    );
    expect(line.totals.netToOtClinicCents).toBe(30000 - line.totals.totalDeductionsCents);
    expect(r.totals.draftCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// PDF smoke test — proves the multi-page generator produces a non-empty PDF
// without throwing on realistic fixtures.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Sales rep + per-line commission
// ---------------------------------------------------------------------------

describe('computeOtSalesRepCommissionCents', () => {
  it('returns 0 when no rep is assigned, regardless of rates', () => {
    const p: OtAllocationOverridePayload = {
      ...validPayload(),
      salesRepId: null,
      meds: [
        {
          ...validPayload().meds[0],
          commissionRateBps: 800,
        },
      ],
    };
    expect(computeOtSalesRepCommissionCents(p)).toBe(0);
  });

  it('sums per-line cents at each lines rate when rep is assigned and no override', () => {
    /**
     * 2 meds @ 8% on $100 each + 1 med @ 1% on $200.
     * = 800 + 800 + 200 = 1800 cents (rounded per line).
     */
    const p: OtAllocationOverridePayload = {
      ...validPayload(),
      salesRepId: 7,
      salesRepName: 'Rep A',
      salesRepCommissionCentsOverride: null,
      meds: [
        {
          medicationKey: 'a',
          name: 'A',
          strength: '',
          vialSize: '',
          quantity: 1,
          unitPriceCents: 10000,
          lineTotalCents: 10000,
          source: 'catalog',
          commissionRateBps: 800,
        },
        {
          medicationKey: 'b',
          name: 'B',
          strength: '',
          vialSize: '',
          quantity: 1,
          unitPriceCents: 10000,
          lineTotalCents: 10000,
          source: 'catalog',
          commissionRateBps: 800,
        },
        {
          medicationKey: 'c',
          name: 'C',
          strength: '',
          vialSize: '',
          quantity: 1,
          unitPriceCents: 20000,
          lineTotalCents: 20000,
          source: 'catalog',
          commissionRateBps: 100,
        },
      ],
    };
    expect(computeOtSalesRepCommissionCents(p)).toBe(800 + 800 + 200);
  });

  it('uses the manual override when present, ignoring per-line rates', () => {
    const p: OtAllocationOverridePayload = {
      ...validPayload(),
      salesRepId: 7,
      salesRepCommissionCentsOverride: 5000,
      meds: [
        {
          ...validPayload().meds[0],
          commissionRateBps: 800,
        },
      ],
    };
    expect(computeOtSalesRepCommissionCents(p)).toBe(5000);
  });

  it('flows commission into total deductions and net', () => {
    const p: OtAllocationOverridePayload = {
      ...validPayload(),
      salesRepId: 7,
      salesRepCommissionCentsOverride: 1000,
    };
    const t = computeOtAllocationOverrideTotals(p);
    expect(t.salesRepCommissionCents).toBe(1000);
    /**
     * total = meds(3500) + ship(2000) + trt(0) + dr(3000) + fulf(0) + custom(0)
     *       + commission(1000) + EONPro 5% × 24,900 = 1,245
     *       + Merchant 4% × 24,900 = 996
     */
    const eonpro = Math.round((24900 * 500) / 10_000);
    const merchant = Math.round((24900 * 400) / 10_000);
    expect(t.eonproFeeCents).toBe(eonpro);
    expect(t.merchantProcessingFeeCents).toBe(merchant);
    expect(t.totalDeductionsCents).toBe(9500 + eonpro + merchant);
    expect(t.netToOtClinicCents).toBe(24900 - (9500 + eonpro + merchant));
  });
});

describe('Zod schema — rep + commission fields', () => {
  it('defaults rep fields to null when omitted', () => {
    const p = otAllocationOverridePayloadSchema.parse({
      meds: [],
      shippingCents: 0,
      trtTelehealthCents: 0,
      doctorRxFeeCents: 0,
      fulfillmentFeesCents: 0,
      customLineItems: [],
      notes: null,
      patientGrossCents: 10000,
    });
    expect(p.salesRepId).toBeNull();
    expect(p.salesRepName).toBeNull();
    expect(p.salesRepCommissionCentsOverride).toBeNull();
  });

  it('rejects commissionRateBps > 5000 (50% sanity cap)', () => {
    const r = otAllocationOverridePayloadSchema.safeParse({
      ...validPayload(),
      meds: [
        {
          medicationKey: 'a',
          name: 'A',
          strength: '',
          vialSize: '',
          quantity: 1,
          unitPriceCents: 10000,
          lineTotalCents: 10000,
          source: 'catalog',
          commissionRateBps: 9999,
        },
      ],
    });
    expect(r.success).toBe(false);
  });
});

describe('generateOtCustomReconciliationPDF', () => {
  it('returns non-empty PDF bytes for a small period', async () => {
    const sale = makeSale();
    const data = makeData([sale], [makeMed()]);
    const reconciliation = applyOtAllocationOverrides(data, new Map());
    const bytes = await generateOtCustomReconciliationPDF(data, reconciliation);
    expect(bytes.byteLength).toBeGreaterThan(500); // non-empty PDF
    /** PDF magic header. */
    const head = String.fromCharCode(...Array.from(bytes.slice(0, 4)));
    expect(head).toBe('%PDF');
  });

  it('handles many sales (paginates without throwing)', async () => {
    const sales = Array.from({ length: 25 }, (_, i) =>
      makeSale({ orderId: 1000 + i, patientGrossCents: 24900 + i * 100 })
    );
    const meds = sales.map((s) => makeMed({ orderId: s.orderId }));
    const data = makeData(sales, meds);
    const reconciliation = applyOtAllocationOverrides(data, new Map());
    const bytes = await generateOtCustomReconciliationPDF(data, reconciliation);
    expect(bytes.byteLength).toBeGreaterThan(2000);
  });
});
