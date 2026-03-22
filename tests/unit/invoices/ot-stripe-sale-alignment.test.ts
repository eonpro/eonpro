import { describe, it, expect } from 'vitest';
import {
  compareStripeBillingNameToPatient,
  normalizeComparablePersonName,
  resolveOtPatientGrossCents,
} from '@/lib/invoices/ot-stripe-sale-alignment';

describe('ot-stripe-sale-alignment', () => {
  it('normalizes names for comparison', () => {
    expect(normalizeComparablePersonName("  D'Aleo ")).toBe('daleo');
    expect(normalizeComparablePersonName('José García')).toBe('jose garcia');
    expect(normalizeComparablePersonName(undefined)).toBe('');
    expect(normalizeComparablePersonName(null)).toBe('');
  });

  it('compareStripeBillingNameToPatient: unknown when profile name parts missing (no throw)', () => {
    expect(
      compareStripeBillingNameToPatient({
        stripeBillingName: 'John Smith',
        patientFirstName: undefined as unknown as string,
        patientLastName: 'Smith',
      }),
    ).toBe('unknown');
  });

  it('compareStripeBillingNameToPatient: match common orderings', () => {
    expect(
      compareStripeBillingNameToPatient({
        stripeBillingName: 'Justin Daleo',
        patientFirstName: 'Justin',
        patientLastName: "D'aleo",
      }),
    ).toBe('match');

    expect(
      compareStripeBillingNameToPatient({
        stripeBillingName: 'Smith, John',
        patientFirstName: 'John',
        patientLastName: 'Smith',
      }),
    ).toBe('match');
  });

  it('compareStripeBillingNameToPatient: unknown when Stripe name missing', () => {
    expect(
      compareStripeBillingNameToPatient({
        stripeBillingName: null,
        patientFirstName: 'A',
        patientLastName: 'B',
      }),
    ).toBe('unknown');
  });

  it('compareStripeBillingNameToPatient: mismatch when tokens missing', () => {
    expect(
      compareStripeBillingNameToPatient({
        stripeBillingName: 'Totally Different Person',
        patientFirstName: 'John',
        patientLastName: 'Smith',
      }),
    ).toBe('mismatch');
  });

  it('resolveOtPatientGrossCents prefers payment net map', () => {
    const map = new Map<number, number>([[42, 12_345]]);
    expect(
      resolveOtPatientGrossCents({
        invoiceDbId: 42,
        invoiceAmountPaid: 99,
        invoiceAmountDue: null,
        paymentNetCentsByInvoiceId: map,
        invoiceGrossFallback: () => 99,
      }),
    ).toEqual({ cents: 12_345, source: 'stripe_payments' });
  });

  it('resolveOtPatientGrossCents falls back to invoice when no payments', () => {
    const map = new Map<number, number>();
    expect(
      resolveOtPatientGrossCents({
        invoiceDbId: 7,
        invoiceAmountPaid: 5000,
        invoiceAmountDue: null,
        paymentNetCentsByInvoiceId: map,
        invoiceGrossFallback: (i) => i.amountPaid,
      }),
    ).toEqual({ cents: 5000, source: 'invoice_sync' });
  });
});
