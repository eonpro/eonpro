import { describe, it, expect } from 'vitest';
import {
  OT_PLATFORM_COMPENSATION_BPS,
  OT_MERCHANT_PROCESSING_BPS,
  OT_RX_ASYNC_APPROVAL_FEE_CENTS,
  OT_RX_SYNC_APPROVAL_FEE_CENTS,
  OT_DOCTOR_RX_FEE_REFILL_EXEMPT_DAYS,
  findPriorPaidOtPrescriptionInvoice,
  getOtDoctorRxFeeCentsForSale,
  isOtPremiumShippingMedication,
  getOtPrescriptionShippingCentsForOrder,
  isOtTestosteroneReplacementTherapyOrder,
  inferOtPharmacyUnitPriceFromRx,
  resolveOtProductPriceForPharmacyLine,
  effectiveOtPharmacyBillQuantity,
  getOtDoctorApprovalModeFromRxs,
} from '@/lib/invoices/ot-pricing';

describe('ot-pricing', () => {
  it('getOtDoctorApprovalModeFromRxs: testosterone cypionate → sync; other meds → async', () => {
    expect(
      getOtDoctorApprovalModeFromRxs([
        { medName: 'Semaglutide', medicationKey: '203448971', strength: 'x', form: '' },
      ]),
    ).toBe('async');
    expect(
      getOtDoctorApprovalModeFromRxs([
        { medName: 'Testosterone Cypionate 200mg/mL', medicationKey: 'x', strength: '200', form: 'injection' },
      ]),
    ).toBe('sync');
    expect(
      getOtDoctorApprovalModeFromRxs([
        { medName: 'Semaglutide', medicationKey: '203448971', strength: 'x', form: '' },
        { medName: 'Testosterone Cypionate', medicationKey: 'y', strength: '', form: '' },
      ]),
    ).toBe('sync');
    expect(getOtDoctorApprovalModeFromRxs([])).toBe('async');
  });

  it('computes 10% EONPro fee on gross', () => {
    const gross = 100_000;
    const fee = Math.round((gross * OT_PLATFORM_COMPENSATION_BPS) / 10_000);
    expect(fee).toBe(10_000);
  });

  it('computes 4% merchant processing on gross', () => {
    const gross = 100_000;
    const fee = Math.round((gross * OT_MERCHANT_PROCESSING_BPS) / 10_000);
    expect(fee).toBe(4000);
  });

  it('detects premium shipping medications from names and Lifefile-priced SKUs', () => {
    expect(
      isOtPremiumShippingMedication({
        medName: 'Custom',
        medicationKey: '203448971',
        form: '',
      }),
    ).toBe(true);
    expect(
      isOtPremiumShippingMedication({
        medName: 'NAD+ 1000mg',
        medicationKey: 'x',
      }),
    ).toBe(true);
    expect(
      isOtPremiumShippingMedication({
        medName: 'Sermorelin 10mg',
        medicationKey: 'x',
      }),
    ).toBe(true);
    expect(
      isOtPremiumShippingMedication({
        medName: 'Enclomiphene 25mg',
        medicationKey: 'unknown',
      }),
    ).toBe(false);
  });

  it('uses $30 shipping for whole order if any line is premium', () => {
    const mixed = getOtPrescriptionShippingCentsForOrder([
      { medName: 'Enclomiphene 25mg', medicationKey: 'x' },
      { medName: 'Semaglutide', medicationKey: '203448971' },
    ]);
    expect(mixed.feeCents).toBe(3000);
    expect(mixed.tier).toBe('premium');

    const std = getOtPrescriptionShippingCentsForOrder([
      { medName: 'Testosterone Cypionate', medicationKey: 'x' },
    ]);
    expect(std.feeCents).toBe(2000);
    expect(std.tier).toBe('standard');
  });

  it('uses $30 async and $50 sync doctor/Rx fee', () => {
    expect(OT_RX_ASYNC_APPROVAL_FEE_CENTS).toBe(3000);
    expect(OT_RX_SYNC_APPROVAL_FEE_CENTS).toBe(5000);
  });

  it('findPriorPaidOtPrescriptionInvoice picks latest prior by paidAt, tie-break by id', () => {
    const d0 = new Date('2025-01-01T12:00:00Z');
    const d1 = new Date('2025-02-01T12:00:00Z');
    const d2 = new Date('2025-03-01T12:00:00Z');
    const list = [
      { id: 1, paidAt: d0 },
      { id: 2, paidAt: d1 },
      { id: 3, paidAt: d2 },
    ];
    expect(findPriorPaidOtPrescriptionInvoice(list, 99, new Date('2025-04-01T12:00:00Z'))).toEqual({
      id: 3,
      paidAt: d2,
    });
    expect(findPriorPaidOtPrescriptionInvoice(list, 3, d2)).toEqual({ id: 2, paidAt: d1 });
    const same = new Date('2025-05-01T12:00:00Z');
    const tie = [
      { id: 10, paidAt: same },
      { id: 20, paidAt: same },
    ];
    expect(findPriorPaidOtPrescriptionInvoice(tie, 15, same)).toEqual({ id: 10, paidAt: same });
  });

  it('getOtDoctorRxFeeCentsForSale: new sale, refill <90d waived, ≥90d full fee; missing paidAt charges', () => {
    const prior = new Date('2025-01-01T12:00:00Z');
    expect(
      getOtDoctorRxFeeCentsForSale({
        priorPaidPrescriptionInvoice: null,
        currentPaidAt: new Date('2025-06-01T12:00:00Z'),
        approvalMode: 'async',
      }),
    ).toMatchObject({
      feeCents: 3000,
      waivedReason: null,
      nominalFeeCents: 3000,
      waivedAmountCents: 0,
      daysSincePriorPaidRx: null,
    });

    const day = OT_DOCTOR_RX_FEE_REFILL_EXEMPT_DAYS * 86_400_000;
    const waived = getOtDoctorRxFeeCentsForSale({
      priorPaidPrescriptionInvoice: { paidAt: prior },
      currentPaidAt: new Date(prior.getTime() + day - 1),
      approvalMode: 'sync',
    });
    expect(waived.feeCents).toBe(0);
    expect(waived.waivedAmountCents).toBe(5000);
    expect(waived.daysSincePriorPaidRx).toBe(OT_DOCTOR_RX_FEE_REFILL_EXEMPT_DAYS - 1);

    expect(
      getOtDoctorRxFeeCentsForSale({
        priorPaidPrescriptionInvoice: { paidAt: prior },
        currentPaidAt: new Date(prior.getTime() + day),
        approvalMode: 'sync',
      }),
    ).toMatchObject({
      feeCents: 5000,
      waivedReason: null,
      nominalFeeCents: 5000,
      waivedAmountCents: 0,
      daysSincePriorPaidRx: OT_DOCTOR_RX_FEE_REFILL_EXEMPT_DAYS,
    });

    expect(
      getOtDoctorRxFeeCentsForSale({
        priorPaidPrescriptionInvoice: { paidAt: prior },
        currentPaidAt: null,
        approvalMode: 'async',
      }),
    ).toMatchObject({
      feeCents: 3000,
      waivedReason: null,
      nominalFeeCents: 3000,
      waivedAmountCents: 0,
      daysSincePriorPaidRx: null,
    });
  });

  it('infers pharmacy COGS from med names when Lifefile key is unknown', () => {
    const enclo = inferOtPharmacyUnitPriceFromRx({
      medicationKey: 'unknown-lf-id',
      medName: 'Enclomiphene Citrate 25 mg',
      strength: '25 mg',
      form: 'tabs',
    });
    expect(enclo?.priceCents).toBe(13500);

    const serm = inferOtPharmacyUnitPriceFromRx({
      medicationKey: 'x',
      medName: 'SERMORELIN ACETATE 2MG/ML (5ML) STERILE SOLUTION',
      strength: '2MG/ML',
      form: 'solution',
    });
    expect(serm?.priceCents).toBe(12000);

    expect(
      resolveOtProductPriceForPharmacyLine({
        medicationKey: '203448971',
        medName: 'Semaglutide',
        strength: 'x',
        form: '',
      }),
    ).toMatchObject({ source: 'catalog' });

    expect(
      resolveOtProductPriceForPharmacyLine({
        medicationKey: 'not-in-catalog',
        medName: 'Enclomiphene Citrate 25 mg',
        strength: '25 mg',
        form: '',
      }),
    ).toMatchObject({ source: 'fallback' });

    expect(
      resolveOtProductPriceForPharmacyLine({
        medicationKey: '203418766',
        medName: 'GLUTATHIONE 200MG/ML (10ML VIAL) SOLUTION',
        strength: '200MG/ML',
        form: 'Injectable',
      }),
    ).toMatchObject({ source: 'catalog', row: { priceCents: 4000 } });

    expect(
      inferOtPharmacyUnitPriceFromRx({
        medicationKey: 'x',
        medName: 'Glutathione 200mg/ml',
        strength: '200MG/ML',
        form: 'solution',
      })?.priceCents,
    ).toBe(4000);
  });

  it('effectiveOtPharmacyBillQuantity: oral / enclomiphene uses 1 package, not tab count', () => {
    expect(
      effectiveOtPharmacyBillQuantity({
        medName: 'Enclomiphene Citrate 25 mg',
        form: '',
        consolidatedRawQty: 90,
        pricingSource: 'fallback',
      }),
    ).toBe(1);

    expect(
      effectiveOtPharmacyBillQuantity({
        medName: 'Enclomiphene Citrate 25 mg',
        form: 'CAP',
        consolidatedRawQty: 90,
        pricingSource: 'catalog',
      }),
    ).toBe(1);

    expect(
      effectiveOtPharmacyBillQuantity({
        medName: 'Drug',
        form: 'tablet',
        consolidatedRawQty: 30,
        pricingSource: 'fallback',
      }),
    ).toBe(1);
  });

  it('effectiveOtPharmacyBillQuantity: catalog GLP-1 keeps vial count', () => {
    expect(
      effectiveOtPharmacyBillQuantity({
        medName: 'Semaglutide',
        form: '',
        consolidatedRawQty: 3,
        pricingSource: 'catalog',
      }),
    ).toBe(3);
  });

  it('effectiveOtPharmacyBillQuantity: injectable fallback allows small multipliers only', () => {
    expect(
      effectiveOtPharmacyBillQuantity({
        medName: 'SERMORELIN ACETATE 2MG/ML (5ML) STERILE SOLUTION',
        form: 'solution',
        consolidatedRawQty: 3,
        pricingSource: 'fallback',
      }),
    ).toBe(3);

    expect(
      effectiveOtPharmacyBillQuantity({
        medName: 'Some Injectable',
        form: 'injection',
        consolidatedRawQty: 30,
        pricingSource: 'fallback',
      }),
    ).toBe(1);
  });

  it('detects TRT orders for telehealth fee', () => {
    expect(
      isOtTestosteroneReplacementTherapyOrder([
        { medName: 'Testosterone Cypionate 200mg', medicationKey: 'x' },
      ]),
    ).toBe(true);
    expect(
      isOtTestosteroneReplacementTherapyOrder([{ medName: 'TRT Plus bundle', medicationKey: 'x' }]),
    ).toBe(true);
    expect(
      isOtTestosteroneReplacementTherapyOrder([
        { medName: 'Semaglutide', medicationKey: '203448971' },
      ]),
    ).toBe(false);
  });
});
