/**
 * OT bloodwork rebill detection — phantom-Rx guard.
 *
 * Regression coverage for the 2026-05-03 stakeholder bug:
 *
 *   Schultz, Stefan · Inv 19039 · Bloodwork Full Panel
 *
 * The Lifefile order shell carried a phantom Rx ("Rupa Panel") even
 * though the paid invoice line was 100% bloodwork. The rebill signature
 * builder added `'rx'` to the current sale's `chargeKinds`, which
 * intersected with the patient's prior real Rx purchases and flipped
 * the bloodwork sale into "Rebill · 1%". Stakeholder rule (2026-05-03):
 * a bloodwork-only sale must never inherit the `'rx'` chargeKind from a
 * phantom order Rx.
 *
 * Covers:
 *   - `buildOtCurrentSaleSignature` drops phantom rxs when
 *     `isBloodworkOnly === true`.
 *   - `isOtRebillPurchase` no longer flips bloodwork sales as rebill on
 *     the basis of prior Rx history (control: real rebills still detect).
 */

import { describe, it, expect } from 'vitest';
import {
  buildOtCurrentSaleSignature,
  isOtRebillPurchase,
  type OtPatientPurchaseSignature,
} from '@/services/invoices/otInvoiceGenerationService';

function makeHistory(over: Partial<OtPatientPurchaseSignature> = {}): OtPatientPurchaseSignature {
  return {
    invoiceId: 1,
    paidAt: new Date('2026-03-01T00:00:00.000Z'),
    productFamilies: new Set(),
    stripeProductIds: new Set(),
    stripePriceIds: new Set(),
    chargeKinds: new Set(),
    ...over,
  };
}

describe('buildOtCurrentSaleSignature — phantom-Rx guard', () => {
  it('isBloodworkOnly=true: drops phantom rxs from chargeKinds and productFamilies', () => {
    const sig = buildOtCurrentSaleSignature({
      rxs: [{ medName: 'Rupa Panel', medicationKey: 'rupa_panel' }],
      invoiceLines: [{ description: 'Bloodwork Full Panel', amount: 25000 }],
      isBloodworkOnly: true,
    });
    expect(sig.chargeKinds.has('rx')).toBe(false);
    expect(sig.chargeKinds.has('bloodwork')).toBe(true);
  });

  it('isBloodworkOnly=false: keeps the rx signal', () => {
    const sig = buildOtCurrentSaleSignature({
      rxs: [{ medName: 'Sermorelin', medicationKey: 'sermorelin' }],
      invoiceLines: [{ description: 'Sermorelin 1 month', amount: 19900 }],
      isBloodworkOnly: false,
    });
    expect(sig.chargeKinds.has('rx')).toBe(true);
    expect(sig.productFamilies.has('sermorelin')).toBe(true);
  });

  it('isBloodworkOnly=true with empty rxs: no rx in signature', () => {
    const sig = buildOtCurrentSaleSignature({
      rxs: [],
      invoiceLines: [{ description: 'Bloodwork Full Panel', amount: 25000 }],
      isBloodworkOnly: true,
    });
    expect(sig.chargeKinds.has('rx')).toBe(false);
    expect(sig.chargeKinds.has('bloodwork')).toBe(true);
  });
});

describe('isOtRebillPurchase — bloodwork-only sales (regression)', () => {
  /**
   * The Schultz scenario reproduced end-to-end at the unit level: prior
   * Rx history + current bloodwork-only sale with phantom Rx attached
   * must classify as NEW (not rebill).
   */
  it('first-ever bloodwork sale on a patient with prior Rx history is NEW (not rebill)', () => {
    const history: OtPatientPurchaseSignature[] = [
      makeHistory({
        invoiceId: 100,
        paidAt: new Date('2026-02-01T00:00:00.000Z'),
        chargeKinds: new Set(['rx']),
        productFamilies: new Set(['sermorelin']),
      }),
    ];
    const sig = buildOtCurrentSaleSignature({
      rxs: [{ medName: 'Rupa Panel', medicationKey: 'rupa_panel' }],
      invoiceLines: [{ description: 'Bloodwork Full Panel', amount: 25000 }],
      isBloodworkOnly: true,
    });
    const result = isOtRebillPurchase(history, {
      invoiceId: 19039,
      paidAt: new Date('2026-04-21T16:01:00.000Z'),
      productFamilies: sig.productFamilies,
      stripeProductIds: sig.stripeProductIds,
      stripePriceIds: sig.stripePriceIds,
      chargeKinds: sig.chargeKinds,
    });
    expect(result).toBe(false);
  });

  /**
   * Control case: a patient with prior bloodwork is correctly classified
   * as REBILL on a second bloodwork sale. The phantom-Rx guard must not
   * over-suppress.
   */
  it('second bloodwork sale on a patient with prior bloodwork is REBILL', () => {
    const history: OtPatientPurchaseSignature[] = [
      makeHistory({
        invoiceId: 100,
        paidAt: new Date('2026-02-01T00:00:00.000Z'),
        chargeKinds: new Set(['bloodwork']),
      }),
    ];
    const sig = buildOtCurrentSaleSignature({
      rxs: [],
      invoiceLines: [{ description: 'Bloodwork Full Panel', amount: 25000 }],
      isBloodworkOnly: true,
    });
    const result = isOtRebillPurchase(history, {
      invoiceId: 19040,
      paidAt: new Date('2026-04-21T16:01:00.000Z'),
      productFamilies: sig.productFamilies,
      stripeProductIds: sig.stripeProductIds,
      stripePriceIds: sig.stripePriceIds,
      chargeKinds: sig.chargeKinds,
    });
    expect(result).toBe(true);
  });

  /**
   * Control case: a real Rx sale on a patient with only prior bloodwork
   * still classifies as NEW (chargeKinds don't overlap).
   */
  it('Rx sale on a patient with only prior bloodwork is NEW (chargeKinds disjoint)', () => {
    const history: OtPatientPurchaseSignature[] = [
      makeHistory({
        invoiceId: 100,
        paidAt: new Date('2026-02-01T00:00:00.000Z'),
        chargeKinds: new Set(['bloodwork']),
      }),
    ];
    const sig = buildOtCurrentSaleSignature({
      rxs: [{ medName: 'Sermorelin', medicationKey: 'sermorelin' }],
      invoiceLines: [{ description: 'Sermorelin 1 month', amount: 19900 }],
      isBloodworkOnly: false,
    });
    const result = isOtRebillPurchase(history, {
      invoiceId: 19041,
      paidAt: new Date('2026-04-21T16:01:00.000Z'),
      productFamilies: sig.productFamilies,
      stripeProductIds: sig.stripeProductIds,
      stripePriceIds: sig.stripePriceIds,
      chargeKinds: sig.chargeKinds,
    });
    expect(result).toBe(false);
  });

  /**
   * Control case: an Rx sale on a patient with prior matching Rx is
   * REBILL (the existing detector must remain correct).
   */
  it('second Rx sale on the same drug family is REBILL', () => {
    const history: OtPatientPurchaseSignature[] = [
      makeHistory({
        invoiceId: 100,
        paidAt: new Date('2026-02-01T00:00:00.000Z'),
        chargeKinds: new Set(['rx']),
        productFamilies: new Set(['sermorelin']),
      }),
    ];
    const sig = buildOtCurrentSaleSignature({
      rxs: [{ medName: 'Sermorelin', medicationKey: 'sermorelin' }],
      invoiceLines: [{ description: 'Sermorelin 1 month', amount: 19900 }],
      isBloodworkOnly: false,
    });
    const result = isOtRebillPurchase(history, {
      invoiceId: 19042,
      paidAt: new Date('2026-04-21T16:01:00.000Z'),
      productFamilies: sig.productFamilies,
      stripeProductIds: sig.stripeProductIds,
      stripePriceIds: sig.stripePriceIds,
      chargeKinds: sig.chargeKinds,
    });
    expect(result).toBe(true);
  });
});
