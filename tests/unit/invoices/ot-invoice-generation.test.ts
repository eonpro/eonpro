/**
 * OT daily invoice generation — deep tests for functionality, reporting math, and flexibility.
 *
 * - Service path: mocked Prisma + timezone + PHI (integration-style).
 * - CSV exports: pure reporting accuracy from typed fixtures.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockBasePrisma, mockMidnightInTz } = vi.hoisted(() => {
  const f = () => vi.fn();
  return {
    mockBasePrisma: {
      clinic: { findFirst: f() },
      invoice: { findMany: f() },
      payment: { findMany: f() },
      patient: { findMany: f() },
      order: { findMany: f() },
      salesRepCommissionEvent: { findMany: f() },
      salesRepOverrideCommissionEvent: { findMany: f() },
      user: { findMany: f() },
      paymentReconciliation: { findMany: f() },
    },
    mockMidnightInTz: vi.fn(),
  };
});

vi.mock('@/lib/db', () => ({ basePrisma: mockBasePrisma }));
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    security: vi.fn(),
  },
}));
vi.mock('@/lib/security/phi-encryption', () => ({
  decryptPHI: (s: string) => s,
}));
vi.mock('@/lib/utils/timezone', () => ({
  midnightInTz: (...args: unknown[]) => (mockMidnightInTz as (...a: unknown[]) => Date)(...args),
}));

import {
  generateOtDailyInvoices,
  OtInvoiceConfigurationError,
  generateOtPharmacyCSV,
  generateOtCombinedCSV,
  generateOtRefundsCSV,
  type OtDailyInvoices,
  type OtPharmacyInvoice,
  type OtRefundLineItem,
} from '@/services/invoices/otInvoiceGenerationService';
import {
  OT_MERCHANT_PROCESSING_BPS,
  OT_PLATFORM_COMPENSATION_BPS,
  OT_TRT_TELEHEALTH_FEE_CENTS,
} from '@/lib/invoices/ot-pricing';

const PAID_AT = new Date(Date.UTC(2026, 2, 20, 16, 0, 0)); // in [periodStart, periodEnd] with mocked TZ

function wireInvoiceSequence(
  mainPaid: unknown[],
  unlinked: unknown[],
  commissionStripe: unknown[],
  rxHistory: unknown[],
  opts?: { paymentBridgeRows: unknown[] },
) {
  const chain = mockBasePrisma.invoice.findMany.mockResolvedValueOnce(mainPaid);
  if (opts) {
    chain.mockResolvedValueOnce(opts.paymentBridgeRows);
  }
  chain
    .mockResolvedValueOnce(unlinked)
    .mockResolvedValueOnce(commissionStripe)
    .mockResolvedValueOnce(rxHistory);
}

function wirePayments(periodRows: unknown[], netByInvoiceRows: unknown[]) {
  mockBasePrisma.payment.findMany.mockResolvedValueOnce(periodRows).mockResolvedValueOnce(netByInvoiceRows);
}

describe('generateOtDailyInvoices (mocked DB)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMidnightInTz.mockImplementation((y: number, m: number, d: number) => new Date(Date.UTC(y, m, d, 5, 0, 0, 0)));
    mockBasePrisma.clinic.findFirst.mockResolvedValue({ id: 42, name: 'OT Clinic' });
    mockBasePrisma.patient.findMany.mockResolvedValue([]);
    mockBasePrisma.paymentReconciliation.findMany.mockResolvedValue([]);
    mockBasePrisma.order.findMany.mockResolvedValue([]);
    mockBasePrisma.salesRepCommissionEvent.findMany.mockResolvedValue([]);
    mockBasePrisma.salesRepOverrideCommissionEvent.findMany.mockResolvedValue([]);
    mockBasePrisma.user.findMany.mockResolvedValue([]);
  });

  it('throws OtInvoiceConfigurationError when OT subdomain clinic is missing', async () => {
    mockBasePrisma.clinic.findFirst.mockResolvedValue(null);
    await expect(generateOtDailyInvoices('2026-03-20')).rejects.toThrow(OtInvoiceConfigurationError);
  });

  it('refunds: full + partial Payment rows produce refundLineItems, gross/net/refundsTotal math', async () => {
    /**
     * Three payments in the period:
     *   - A: $1000 paid, $0 refunded → no refund row
     *   - B: $500 paid, $500 refunded (full)
     *   - C: $400 paid, $100 refunded (partial)
     * Expected:
     *   gross = 1900, refunds = 600, net = 1300
     *   refundLineItems has 2 rows; B isFullyRefunded=true, C isFullyRefunded=false
     */
    wireInvoiceSequence([], [], [], [], { paymentBridgeRows: [] });
    const refundedAtB = new Date(Date.UTC(2026, 2, 20, 18, 0, 0));
    const refundedAtC = new Date(Date.UTC(2026, 2, 20, 19, 0, 0));
    /**
     * payment.findMany call order:
     *   1. Period payments (loadOtSucceededPaymentsForPeriod)
     *   2. Refunded-at lookup (new — only when there are refunded rows)
     *   3. Net cents per invoice (loadOtPaymentNetCentsByInvoiceId)
     */
    mockBasePrisma.payment.findMany
      .mockResolvedValueOnce([
        {
          id: 11,
          amount: 100_000,
          refundedAmount: 0,
          paidAt: PAID_AT,
          createdAt: PAID_AT,
          patientId: 100,
          invoiceId: null,
          description: 'A',
          stripePaymentIntentId: 'pi_a',
          stripeChargeId: 'ch_a',
        },
        {
          id: 12,
          amount: 50_000,
          refundedAmount: 50_000,
          paidAt: PAID_AT,
          createdAt: PAID_AT,
          patientId: 100,
          invoiceId: null,
          description: 'B',
          stripePaymentIntentId: 'pi_b',
          stripeChargeId: 'ch_b',
        },
        {
          id: 13,
          amount: 40_000,
          refundedAmount: 10_000,
          paidAt: PAID_AT,
          createdAt: PAID_AT,
          patientId: 100,
          invoiceId: null,
          description: 'C',
          stripePaymentIntentId: 'pi_c',
          stripeChargeId: 'ch_c',
        },
      ])
      .mockResolvedValueOnce([
        { id: 12, refundedAt: refundedAtB },
        { id: 13, refundedAt: refundedAtC },
      ])
      .mockResolvedValueOnce([]);
    mockBasePrisma.patient.findMany.mockResolvedValue([
      { id: 100, firstName: 'Pat', lastName: 'One' },
    ]);

    const data = await generateOtDailyInvoices('2026-03-20');

    expect(data.paymentsCollectedGrossCents).toBe(190_000);
    expect(data.refundsTotalCents).toBe(60_000);
    expect(data.paymentsCollectedNetCents).toBe(130_000);
    /** Invariant: net === gross − refunds (must always hold). */
    expect(data.paymentsCollectedNetCents).toBe(
      data.paymentsCollectedGrossCents - data.refundsTotalCents,
    );

    expect(data.refundLineItems).toHaveLength(2);
    const fullRefund = data.refundLineItems.find((r) => r.paymentId === 12)!;
    expect(fullRefund.refundedAmountCents).toBe(50_000);
    expect(fullRefund.isFullyRefunded).toBe(true);
    expect(fullRefund.refundedAt).toBe(refundedAtB.toISOString());

    const partial = data.refundLineItems.find((r) => r.paymentId === 13)!;
    expect(partial.refundedAmountCents).toBe(10_000);
    expect(partial.isFullyRefunded).toBe(false);

    /** PaymentCollections rows expose the refund column inline. */
    const aRow = data.paymentCollections.find((r) => r.paymentId === 11)!;
    expect(aRow.refundedAmountCents).toBe(0);
    expect(aRow.isFullyRefunded).toBe(false);
    const bRow = data.paymentCollections.find((r) => r.paymentId === 12)!;
    expect(bRow.refundedAmountCents).toBe(50_000);
    expect(bRow.netCollectedCents).toBe(0);
    expect(bRow.isFullyRefunded).toBe(true);
  });

  it('refunds: skips refundedAt lookup entirely when there are no refunded rows', async () => {
    wireInvoiceSequence([], [], [], [], { paymentBridgeRows: [] });
    mockBasePrisma.payment.findMany
      .mockResolvedValueOnce([
        {
          id: 21,
          amount: 25_000,
          refundedAmount: null,
          paidAt: PAID_AT,
          createdAt: PAID_AT,
          patientId: 100,
          invoiceId: null,
          description: 'no refund',
          stripePaymentIntentId: 'pi_x',
          stripeChargeId: 'ch_x',
        },
      ])
      .mockResolvedValueOnce([]);

    const data = await generateOtDailyInvoices('2026-03-20');
    expect(data.refundLineItems).toEqual([]);
    expect(data.refundsTotalCents).toBe(0);
    expect(data.paymentsCollectedGrossCents).toBe(25_000);
    expect(data.paymentsCollectedNetCents).toBe(25_000);
    /**
     * payment.findMany is called once for the period rows. The refundedAt lookup
     * is skipped (no refunded rows). The net-cents-by-invoice lookup is also
     * skipped because no orders → no invoice ids to net.
     */
    expect(mockBasePrisma.payment.findMany).toHaveBeenCalledTimes(1);
  });

  it('single Semaglutide sale: pharmacy + premium shipping + sync doctor fee; cash basis fees match 4%/10% of net cash', async () => {
    const paidInvoice = {
      id: 500,
      orderId: 200,
      paidAt: PAID_AT,
      patientId: 100,
      prescriptionProcessedAt: PAID_AT,
      amountPaid: 100_000,
      amountDue: null,
      lineItems: [],
    };
    const orderRow = {
      id: 200,
      createdAt: PAID_AT,
      approvedAt: PAID_AT,
      queuedForProviderAt: null,
      lifefileOrderId: 'LF-1',
      shippingMethod: 1,
      patientId: 100,
      providerId: 1,
      patient: { id: 100, firstName: 'Pat', lastName: 'One' },
      provider: { id: 1, firstName: 'Dr', lastName: 'Who' },
      rxs: [
        {
          medicationKey: '203448971',
          medName: 'Semaglutide',
          strength: '2.5/20MG/ML',
          form: '1ML',
          quantity: '1',
        },
      ],
    };
    wireInvoiceSequence(
      [paidInvoice],
      [],
      [{ id: 500, stripeInvoiceId: null }],
      [
        {
          id: 500,
          patientId: 100,
          paidAt: PAID_AT,
          amountPaid: 100_000,
          amountDue: null,
        },
      ],
      { paymentBridgeRows: [] },
    );
    wirePayments(
      [
        {
          id: 1,
          amount: 100_000,
          refundedAmount: null,
          paidAt: PAID_AT,
          createdAt: PAID_AT,
          patientId: 100,
          invoiceId: 500,
          description: 'Stripe',
          stripePaymentIntentId: 'pi_x',
          stripeChargeId: 'ch_x',
        },
      ],
      [{ invoiceId: 500, amount: 100_000 }],
    );
    mockBasePrisma.patient.findMany.mockResolvedValue([{ id: 100, firstName: 'Pat', lastName: 'One' }]);
    mockBasePrisma.order.findMany.mockResolvedValue([orderRow]);

    const data = await generateOtDailyInvoices('2026-03-20');

    expect(data.feesUseCashCollectedBasis).toBe(true);
    expect(data.paymentsCollectedNetCents).toBe(100_000);
    expect(data.paymentCollections).toHaveLength(1);
    expect(data.paymentCollections[0].netCollectedCents).toBe(100_000);
    expect(data.paymentsWithoutPharmacyCogs).toHaveLength(0);

    // Catalog semaglutide 1ML = 3500; premium shipping 3000; sync doctor 3000
    expect(data.pharmacy.subtotalMedicationsCents).toBe(3500);
    expect(data.pharmacy.subtotalShippingCents).toBe(3000);
    expect(data.pharmacy.totalCents).toBe(6500);
    expect(data.doctorApprovals.totalCents).toBe(3000);

    const m = Math.round((100_000 * OT_MERCHANT_PROCESSING_BPS) / 10_000);
    const p = Math.round((100_000 * OT_PLATFORM_COMPENSATION_BPS) / 10_000);
    expect(data.merchantProcessing.feeCents).toBe(m);
    expect(data.platformCompensation.feeCents).toBe(p);
    expect(m).toBe(4000);
    /**
     * EONPro fee changed from 10% (cash-collected basis) to 5% (per-row
     * patient gross) on 2026-05-02. With one $1,000 sale and no refunds,
     * 5% × $1,000 = $50 = 5,000 cents.
     */
    expect(p).toBe(5_000);

    expect(data.grandTotalCents).toBe(6500 + 3000 + m + p);
    expect(data.clinicNetPayoutCents).toBe(100_000 - data.grandTotalCents);

    const sale = data.perSaleReconciliation.find((r) => r.orderId === 200);
    expect(sale).toBeDefined();
    expect(sale!.patientGrossCents).toBe(100_000);
    expect(sale!.patientGrossSource).toBe('stripe_payments');
    expect(sale!.merchantProcessingCents).toBe(m);
    expect(sale!.platformCompensationCents).toBe(p);
    /**
     * productDescription should be derived from the order's Rx list — what the
     * patient actually paid for. The manual reconciliation editor shows this on
     * each row so admins can see the package without expanding.
     */
    expect(sale!.productDescription).toContain('Semaglutide');
  });

  it('payment→invoice bridge: cash in period but Invoice.paidAt outside window still loads Rx COGS / per-sale', async () => {
    const invoicePaidEarly = new Date(Date.UTC(2026, 2, 10, 12, 0, 0));
    const bridgedInvoice = {
      id: 888,
      orderId: 777,
      paidAt: invoicePaidEarly,
      patientId: 100,
      prescriptionProcessedAt: PAID_AT,
      amountPaid: 50_000,
      amountDue: null,
      lineItems: [] as unknown[],
    };
    const orderRow = {
      id: 777,
      createdAt: PAID_AT,
      approvedAt: PAID_AT,
      queuedForProviderAt: null,
      lifefileOrderId: 'LF-BR',
      shippingMethod: 1,
      patientId: 100,
      providerId: 1,
      patient: { id: 100, firstName: 'A', lastName: 'B' },
      provider: { id: 1, firstName: 'D', lastName: 'E' },
      rxs: [
        {
          medicationKey: '203448971',
          medName: 'Semaglutide',
          strength: 'x',
          form: '',
          quantity: '1',
        },
      ],
    };
    wireInvoiceSequence(
      [],
      [],
      [{ id: 888, stripeInvoiceId: null }],
      [
        {
          id: 888,
          patientId: 100,
          paidAt: invoicePaidEarly,
          amountPaid: 50_000,
          amountDue: null,
        },
      ],
      { paymentBridgeRows: [bridgedInvoice] },
    );
    wirePayments(
      [
        {
          id: 1,
          amount: 50_000,
          refundedAmount: null,
          paidAt: PAID_AT,
          createdAt: PAID_AT,
          patientId: 100,
          invoiceId: 888,
          description: 'Stripe',
          stripePaymentIntentId: 'pi_bridge',
          stripeChargeId: 'ch_bridge',
        },
      ],
      [{ invoiceId: 888, amount: 50_000 }],
    );
    mockBasePrisma.patient.findMany.mockResolvedValue([{ id: 100, firstName: 'A', lastName: 'B' }]);
    mockBasePrisma.order.findMany.mockResolvedValue([orderRow]);

    const data = await generateOtDailyInvoices('2026-03-20');
    expect(data.pharmacy.orderCount).toBe(1);
    expect(data.pharmacy.lineItems.length).toBeGreaterThanOrEqual(1);
    expect(data.perSaleReconciliation).toHaveLength(1);
    expect(data.perSaleReconciliation[0].orderId).toBe(777);
  });

  it('Stripe reconciliation resolves invoice when Payment.invoiceId is null', async () => {
    const invoicePaidEarly = new Date(Date.UTC(2026, 2, 10, 12, 0, 0));
    const bridgedInvoice = {
      id: 888,
      orderId: 778,
      paidAt: invoicePaidEarly,
      patientId: 100,
      prescriptionProcessedAt: PAID_AT,
      amountPaid: 55_000,
      amountDue: null,
      lineItems: [] as unknown[],
    };
    const orderRow = {
      id: 778,
      createdAt: PAID_AT,
      approvedAt: PAID_AT,
      queuedForProviderAt: null,
      lifefileOrderId: 'LF-REC',
      shippingMethod: 1,
      patientId: 100,
      providerId: 1,
      patient: { id: 100, firstName: 'A', lastName: 'B' },
      provider: { id: 1, firstName: 'D', lastName: 'E' },
      rxs: [
        {
          medicationKey: '203448971',
          medName: 'Semaglutide',
          strength: 'x',
          form: '',
          quantity: '1',
        },
      ],
    };
    mockBasePrisma.paymentReconciliation.findMany.mockImplementation(
      (args: { where?: { invoiceId?: { in?: number[] }; OR?: unknown[] } }) => {
        if (args.where?.invoiceId?.in) return Promise.resolve([]);
        if (Array.isArray(args.where?.OR)) return Promise.resolve([{ invoiceId: 888 }]);
        return Promise.resolve([]);
      },
    );
    wireInvoiceSequence(
      [],
      [],
      [{ id: 888, stripeInvoiceId: null }],
      [
        {
          id: 888,
          patientId: 100,
          paidAt: invoicePaidEarly,
          amountPaid: 55_000,
          amountDue: null,
        },
      ],
      { paymentBridgeRows: [bridgedInvoice] },
    );
    wirePayments(
      [
        {
          id: 99,
          amount: 55_000,
          refundedAmount: null,
          paidAt: PAID_AT,
          createdAt: PAID_AT,
          patientId: 100,
          invoiceId: null,
          description: 'Stripe',
          stripePaymentIntentId: 'pi_rec',
          stripeChargeId: 'ch_rec',
        },
      ],
      [{ invoiceId: 888, amount: 55_000 }],
    );
    mockBasePrisma.patient.findMany.mockResolvedValue([{ id: 100, firstName: 'A', lastName: 'B' }]);
    mockBasePrisma.order.findMany.mockResolvedValue([orderRow]);

    const data = await generateOtDailyInvoices('2026-03-20');
    expect(data.pharmacy.orderCount).toBe(1);
    expect(data.paymentCollections[0].invoiceId).toBeNull();
    expect(data.perSaleReconciliation).toHaveLength(1);
  });

  it('payment→invoice: cash invoice with orderId null still maps pharmacy via patient Rx order near paidAt', async () => {
    const consultInvoiceNoOrder = {
      id: 8023,
      orderId: null,
      paidAt: PAID_AT,
      patientId: 100,
      prescriptionProcessedAt: null,
      amountPaid: 26_900,
      amountDue: null,
      lineItems: [] as unknown[],
    };
    const rxOrder = {
      id: 101248021,
      createdAt: PAID_AT,
      approvedAt: PAID_AT,
      queuedForProviderAt: null,
      lifefileOrderId: 'LF-GLUT',
      shippingMethod: 1,
      patientId: 100,
      providerId: 1,
      patient: { id: 100, firstName: 'Amanda', lastName: 'Valle' },
      provider: { id: 1, firstName: 'D', lastName: 'E' },
      rxs: [
        {
          medicationKey: '203418766',
          medName: 'GLUTATHIONE 200MG/ML (10ML VIAL) SOLUTION',
          strength: '200MG/ML',
          form: 'Injectable',
          quantity: '1',
        },
      ],
    };
    wireInvoiceSequence(
      [],
      [],
      [{ id: 8023, stripeInvoiceId: null }],
      [],
      { paymentBridgeRows: [consultInvoiceNoOrder] },
    );
    wirePayments(
      [
        {
          id: 2369,
          amount: 26_900,
          refundedAmount: null,
          paidAt: PAID_AT,
          createdAt: PAID_AT,
          patientId: 100,
          invoiceId: 8023,
          description: null,
          stripePaymentIntentId: 'pi_consult',
          stripeChargeId: 'ch_consult',
        },
      ],
      [{ invoiceId: 8023, amount: 26_900 }],
    );
    mockBasePrisma.patient.findMany.mockResolvedValue([{ id: 100, firstName: 'Amanda', lastName: 'Valle' }]);
    mockBasePrisma.order.findMany.mockResolvedValue([rxOrder]);

    const data = await generateOtDailyInvoices('2026-03-20');

    expect(data.pharmacy.orderCount).toBe(1);
    expect(data.pharmacy.lineItems.some((li) => li.medicationKey === '203418766')).toBe(true);
    expect(data.paymentsWithoutPharmacyCogs).toHaveLength(0);
    expect(data.perSaleReconciliation[0].invoiceDbId).toBe(8023);
  });

  it('flexibility: date range uses end-day +1 for periodEnd (midnightInTz called with end calendar day + 1)', async () => {
    wireInvoiceSequence([], [], [], []);
    wirePayments([], []);
    await generateOtDailyInvoices('2026-03-19', '2026-03-20');
    const calls = mockMidnightInTz.mock.calls.map((c) => [c[0], c[1], c[2]]);
    expect(calls).toContainEqual([2026, 2, 19]); // start
    expect(calls).toContainEqual([2026, 2, 21]); // end + 1 day → March 21
  });

  it('legacy fee basis: no period Payment rows → feesUseCashCollectedBasis false; uses per-sale rounded merchant/platform', async () => {
    const paidInvoice = {
      id: 501,
      orderId: 201,
      paidAt: PAID_AT,
      patientId: 101,
      prescriptionProcessedAt: PAID_AT,
      amountPaid: 50_000,
      amountDue: null,
      lineItems: [],
    };
    const orderRow = {
      id: 201,
      createdAt: PAID_AT,
      approvedAt: PAID_AT,
      queuedForProviderAt: null,
      lifefileOrderId: 'LF-2',
      shippingMethod: 1,
      patientId: 101,
      providerId: 1,
      patient: { id: 101, firstName: 'A', lastName: 'B' },
      provider: { id: 1, firstName: 'D', lastName: 'C' },
      rxs: [
        {
          medicationKey: '203448971',
          medName: 'Semaglutide',
          strength: 'x',
          form: '',
          quantity: '1',
        },
      ],
    };
    wireInvoiceSequence(
      [paidInvoice],
      [],
      [{ id: 501, stripeInvoiceId: null }],
      [{ id: 501, patientId: 101, paidAt: PAID_AT, amountPaid: 50_000, amountDue: null }],
    );
    wirePayments([], []); // no rows in Eastern window
    mockBasePrisma.order.findMany.mockResolvedValue([orderRow]);

    const data = await generateOtDailyInvoices('2026-03-20');

    expect(data.feesUseCashCollectedBasis).toBe(false);
    expect(data.paymentsCollectedNetCents).toBe(0);
    expect(data.paymentCollections).toHaveLength(0);
    expect(data.merchantProcessing.grossSalesCents).toBe(data.matchedPrescriptionInvoiceGrossCents);
    expect(data.platformCompensation.grossSalesCents).toBe(data.matchedPrescriptionInvoiceGrossCents);
  });

  it('partial refund: netCollectedCents = amount - refundedAmount; still drives cash fee basis', async () => {
    wireInvoiceSequence([], [], [], []);
    wirePayments(
      [
        {
          id: 9,
          amount: 10_000,
          refundedAmount: 2500,
          paidAt: PAID_AT,
          createdAt: PAID_AT,
          patientId: 100,
          invoiceId: null,
          description: 'Consult',
          stripePaymentIntentId: null,
          stripeChargeId: null,
        },
      ],
      [],
    );
    mockBasePrisma.patient.findMany.mockResolvedValue([{ id: 100, firstName: 'X', lastName: 'Y' }]);

    const data = await generateOtDailyInvoices('2026-03-20');

    expect(data.paymentCollections[0].amountCents).toBe(10_000);
    expect(data.paymentCollections[0].netCollectedCents).toBe(7500);
    expect(data.paymentsCollectedNetCents).toBe(7500);
    expect(data.feesUseCashCollectedBasis).toBe(true);
    expect(data.merchantProcessing.feeCents).toBe(Math.round((7500 * OT_MERCHANT_PROCESSING_BPS) / 10_000));
  });

  it('doctor approval mode: non–testosterone-cypionate orders are async (queue flag does not drive label)', async () => {
    const paidInvoice = {
      id: 700,
      orderId: 400,
      paidAt: PAID_AT,
      patientId: 100,
      prescriptionProcessedAt: PAID_AT,
      amountPaid: 40_000,
      amountDue: null,
      lineItems: [],
    };
    const orderRow = {
      id: 400,
      createdAt: PAID_AT,
      approvedAt: PAID_AT,
      queuedForProviderAt: new Date(PAID_AT.getTime() - 120_000),
      lifefileOrderId: 'LF-4',
      shippingMethod: 1,
      patientId: 100,
      providerId: 1,
      patient: { id: 100, firstName: 'A', lastName: 'B' },
      provider: { id: 1, firstName: 'D', lastName: 'E' },
      rxs: [
        {
          medicationKey: '203448971',
          medName: 'Semaglutide',
          strength: 'x',
          form: '',
          quantity: '1',
        },
      ],
    };
    wireInvoiceSequence(
      [paidInvoice],
      [],
      [{ id: 700, stripeInvoiceId: null }],
      [{ id: 700, patientId: 100, paidAt: PAID_AT, amountPaid: 40_000, amountDue: null }],
      { paymentBridgeRows: [] },
    );
    wirePayments(
      [
        {
          id: 3,
          amount: 40_000,
          refundedAmount: null,
          paidAt: PAID_AT,
          createdAt: PAID_AT,
          patientId: 100,
          invoiceId: 700,
          description: 'Rx',
          stripePaymentIntentId: null,
          stripeChargeId: null,
        },
      ],
      [{ invoiceId: 700, amount: 40_000 }],
    );
    mockBasePrisma.patient.findMany.mockResolvedValue([{ id: 100, firstName: 'A', lastName: 'B' }]);
    mockBasePrisma.order.findMany.mockResolvedValue([orderRow]);

    const data = await generateOtDailyInvoices('2026-03-20');
    const doc = data.doctorApprovals.lineItems.find((l) => l.orderId === 400);
    expect(doc?.approvalMode).toBe('async');
    expect(data.doctorApprovals.asyncCount).toBe(1);
    expect(data.doctorApprovals.syncCount).toBe(0);
  });

  it('doctor approval mode: testosterone cypionate is sync even when order was queued for provider', async () => {
    const paidInvoice = {
      id: 701,
      orderId: 401,
      paidAt: PAID_AT,
      patientId: 100,
      prescriptionProcessedAt: PAID_AT,
      amountPaid: 45_000,
      amountDue: null,
      lineItems: [],
    };
    const orderRow = {
      id: 401,
      createdAt: PAID_AT,
      approvedAt: PAID_AT,
      queuedForProviderAt: new Date(PAID_AT.getTime() - 120_000),
      lifefileOrderId: 'LF-CYP',
      shippingMethod: 1,
      patientId: 100,
      providerId: 1,
      patient: { id: 100, firstName: 'A', lastName: 'B' },
      provider: { id: 1, firstName: 'D', lastName: 'E' },
      rxs: [
        {
          medicationKey: 'x',
          medName: 'Testosterone Cypionate',
          strength: '200mg/ml',
          form: 'injection',
          quantity: '1',
        },
      ],
    };
    wireInvoiceSequence(
      [paidInvoice],
      [],
      [{ id: 701, stripeInvoiceId: null }],
      [{ id: 701, patientId: 100, paidAt: PAID_AT, amountPaid: 45_000, amountDue: null }],
      { paymentBridgeRows: [] },
    );
    wirePayments(
      [
        {
          id: 31,
          amount: 45_000,
          refundedAmount: null,
          paidAt: PAID_AT,
          createdAt: PAID_AT,
          patientId: 100,
          invoiceId: 701,
          description: 'Rx',
          stripePaymentIntentId: null,
          stripeChargeId: null,
        },
      ],
      [{ invoiceId: 701, amount: 45_000 }],
    );
    mockBasePrisma.patient.findMany.mockResolvedValue([{ id: 100, firstName: 'A', lastName: 'B' }]);
    mockBasePrisma.order.findMany.mockResolvedValue([orderRow]);

    const data = await generateOtDailyInvoices('2026-03-20');
    const doc = data.doctorApprovals.lineItems.find((l) => l.orderId === 401);
    expect(doc?.approvalMode).toBe('sync');
    expect(data.doctorApprovals.syncCount).toBe(1);
    expect(data.doctorApprovals.asyncCount).toBe(0);
  });

  it('TRT order adds telehealth fee line and subtotalTrtTelehealthCents', async () => {
    const paidInvoice = {
      id: 800,
      orderId: 500,
      paidAt: PAID_AT,
      patientId: 100,
      prescriptionProcessedAt: PAID_AT,
      amountPaid: 60_000,
      amountDue: null,
      lineItems: [],
    };
    const orderRow = {
      id: 500,
      createdAt: PAID_AT,
      approvedAt: PAID_AT,
      queuedForProviderAt: null,
      lifefileOrderId: 'LF-5',
      shippingMethod: 1,
      patientId: 100,
      providerId: 1,
      patient: { id: 100, firstName: 'T', lastName: 'R' },
      provider: { id: 1, firstName: 'D', lastName: 'X' },
      rxs: [
        {
          medicationKey: 'unknown',
          medName: 'Testosterone Cypionate 200mg/mL',
          strength: '200',
          form: 'injection',
          quantity: '1',
        },
      ],
    };
    wireInvoiceSequence(
      [paidInvoice],
      [],
      [{ id: 800, stripeInvoiceId: null }],
      [{ id: 800, patientId: 100, paidAt: PAID_AT, amountPaid: 60_000, amountDue: null }],
      { paymentBridgeRows: [] },
    );
    wirePayments(
      [
        {
          id: 4,
          amount: 60_000,
          refundedAmount: null,
          paidAt: PAID_AT,
          createdAt: PAID_AT,
          patientId: 100,
          invoiceId: 800,
          description: 'Rx',
          stripePaymentIntentId: null,
          stripeChargeId: null,
        },
      ],
      [{ invoiceId: 800, amount: 60_000 }],
    );
    mockBasePrisma.patient.findMany.mockResolvedValue([{ id: 100, firstName: 'T', lastName: 'R' }]);
    mockBasePrisma.order.findMany.mockResolvedValue([orderRow]);

    const data = await generateOtDailyInvoices('2026-03-20');
    expect(data.pharmacy.subtotalTrtTelehealthCents).toBe(OT_TRT_TELEHEALTH_FEE_CENTS);
    expect(data.pharmacy.trtTelehealthLineItems).toHaveLength(1);
    expect(data.pharmacy.trtTelehealthLineItems[0].feeCents).toBe(OT_TRT_TELEHEALTH_FEE_CENTS);
    // Standard shipping (non-GLP) + TRT injectable fallback COGS
    expect(data.pharmacy.subtotalShippingCents).toBe(2000);
    const doc = data.doctorApprovals.lineItems.find((l) => l.orderId === 500);
    expect(doc?.approvalMode).toBe('sync');
    expect(data.doctorApprovals.syncCount).toBe(1);
    expect(data.doctorApprovals.asyncCount).toBe(0);
  });

  it('sales rep ledger: Stripe invoice id maps commission into per-sale and totals', async () => {
    const paidInvoice = {
      id: 600,
      orderId: 300,
      paidAt: PAID_AT,
      patientId: 100,
      prescriptionProcessedAt: PAID_AT,
      amountPaid: 80_000,
      amountDue: null,
      lineItems: [],
    };
    const orderRow = {
      id: 300,
      createdAt: PAID_AT,
      approvedAt: PAID_AT,
      queuedForProviderAt: new Date(PAID_AT.getTime() - 60_000),
      lifefileOrderId: 'LF-3',
      shippingMethod: 1,
      patientId: 100,
      providerId: 1,
      patient: { id: 100, firstName: 'P', lastName: 'Q' },
      provider: { id: 1, firstName: 'D', lastName: 'R' },
      rxs: [
        {
          medicationKey: '203448971',
          medName: 'Semaglutide',
          strength: 'x',
          form: '',
          quantity: '1',
        },
      ],
    };
    wireInvoiceSequence(
      [paidInvoice],
      [],
      [{ id: 600, stripeInvoiceId: 'in_ledger_1' }],
      [{ id: 600, patientId: 100, paidAt: PAID_AT, amountPaid: 80_000, amountDue: null }],
      { paymentBridgeRows: [] },
    );
    wirePayments(
      [
        {
          id: 2,
          amount: 80_000,
          refundedAmount: null,
          paidAt: PAID_AT,
          createdAt: PAID_AT,
          patientId: 100,
          invoiceId: 600,
          description: 'Rx',
          stripePaymentIntentId: 'pi_y',
          stripeChargeId: 'ch_y',
        },
      ],
      [{ invoiceId: 600, amount: 80_000 }],
    );
    mockBasePrisma.patient.findMany.mockResolvedValue([{ id: 100, firstName: 'P', lastName: 'Q' }]);
    mockBasePrisma.order.findMany.mockResolvedValue([orderRow]);
    mockBasePrisma.salesRepCommissionEvent.findMany.mockResolvedValue([
      {
        id: 9001,
        stripeObjectId: 'in_ledger_1',
        salesRepId: 7,
        commissionAmountCents: 3200,
      },
    ]);
    mockBasePrisma.user.findMany.mockResolvedValue([{ id: 7, firstName: 'Sam', lastName: 'Rep' }]);

    const data = await generateOtDailyInvoices('2026-03-20');

    expect(data.salesRepCommissionTotalCents).toBe(3200);
    const sale = data.perSaleReconciliation.find((r) => r.orderId === 300);
    expect(sale?.salesRepCommissionCents).toBe(3200);
    expect(sale?.salesRepName).toContain('Rep');
    expect(data.grandTotalCents).toBeGreaterThanOrEqual(3200 + data.pharmacy.totalCents + data.doctorApprovals.totalCents);
  });
});

describe('OT invoice CSV reporting accuracy', () => {
  it('generateOtPharmacyCSV subtotal row matches totalCents', () => {
    const inv: OtPharmacyInvoice = {
      invoiceType: 'pharmacy',
      clinicId: 1,
      clinicName: 'OT Test',
      invoiceDate: '2026-03-20T12:00:00.000Z',
      periodStart: '2026-03-20T05:00:00.000Z',
      periodEnd: '2026-03-21T04:59:59.999Z',
      lineItems: [
        {
          orderId: 1,
          lifefileOrderId: null,
          orderDate: '2026-03-20T10:00:00.000Z',
          paidAt: '2026-03-20T11:00:00.000Z',
          patientName: 'Doe, Jane',
          patientId: 1,
          providerName: 'Who, Dr',
          providerId: 1,
          medicationName: 'Semaglutide',
          strength: 'x',
          vialSize: '1ML',
          medicationKey: '203448971',
          quantity: 2,
          unitPriceCents: 3500,
          lineTotalCents: 7000,
          pricingStatus: 'priced',
        },
      ],
      shippingLineItems: [
        {
          orderId: 1,
          lifefileOrderId: null,
          orderDate: '2026-03-20T10:00:00.000Z',
          paidAt: '2026-03-20T11:00:00.000Z',
          patientName: 'Doe, Jane',
          description: 'Ship',
          feeCents: 3000,
        },
      ],
      prescriptionFeeLineItems: [],
      trtTelehealthLineItems: [],
      subtotalMedicationsCents: 7000,
      subtotalShippingCents: 3000,
      subtotalPrescriptionFeesCents: 0,
      subtotalTrtTelehealthCents: 0,
      totalCents: 10_000,
      orderCount: 1,
      vialCount: 2,
      missingPriceCount: 0,
      estimatedPriceCount: 0,
    };
    const csv = generateOtPharmacyCSV(inv);
    expect(csv).toContain('PHARMACY TOTAL');
    expect(csv).toContain('$100.00');
    expect(csv).toContain('Semaglutide');
  });

  it('generateOtCombinedCSV includes cash label and net payable consistent with inputs', () => {
    const pharmacyTotal = 10_000;
    const doctorTotal = 3000;
    const fulfillmentTotal = 0;
    const merchantFee = 4000;
    const platformFee = 10_000;
    const rep = 500;
    const mo = 100;
    const gross = 100_000;
    const grand = pharmacyTotal + doctorTotal + fulfillmentTotal + merchantFee + platformFee + rep + mo;
    const data = {
      pharmacy: {
        invoiceType: 'pharmacy' as const,
        clinicId: 1,
        clinicName: 'OT',
        invoiceDate: '2026-03-20T12:00:00.000Z',
        periodStart: '2026-03-20T05:00:00.000Z',
        periodEnd: '2026-03-21T04:59:59.999Z',
        lineItems: [],
        shippingLineItems: [],
        prescriptionFeeLineItems: [],
        trtTelehealthLineItems: [],
        subtotalMedicationsCents: 7000,
        subtotalShippingCents: 3000,
        subtotalPrescriptionFeesCents: 0,
        subtotalTrtTelehealthCents: 0,
        totalCents: pharmacyTotal,
        orderCount: 1,
        vialCount: 1,
        missingPriceCount: 0,
        estimatedPriceCount: 0,
      },
      doctorApprovals: {
        invoiceType: 'doctor_approvals' as const,
        clinicId: 1,
        clinicName: 'OT',
        invoiceDate: '2026-03-20T12:00:00.000Z',
        periodStart: '2026-03-20T05:00:00.000Z',
        periodEnd: '2026-03-21T04:59:59.999Z',
        lineItems: [],
        asyncFeeCents: 3000,
        syncFeeCents: 3000,
        asyncCount: 0,
        syncCount: 0,
        totalCents: doctorTotal,
      },
      fulfillment: {
        invoiceType: 'fulfillment' as const,
        clinicId: 1,
        clinicName: 'OT',
        invoiceDate: '2026-03-20T12:00:00.000Z',
        periodStart: '2026-03-20T05:00:00.000Z',
        periodEnd: '2026-03-21T04:59:59.999Z',
        lineItems: [],
        totalCents: fulfillmentTotal,
      },
      merchantProcessing: { grossSalesCents: gross, rateBps: OT_MERCHANT_PROCESSING_BPS, feeCents: merchantFee },
      platformCompensation: {
        grossSalesCents: gross,
        rateBps: OT_PLATFORM_COMPENSATION_BPS,
        feeCents: platformFee,
        invoiceCount: 3,
      },
      grandTotalCents: grand,
      clinicNetPayoutCents: gross - grand,
      salesRepCommissionTotalCents: rep,
      managerOverrideTotalCents: mo,
      perSaleReconciliation: [],
      paymentCollections: [
        {
          paymentId: 1,
          paidAt: '2026-03-20T15:00:00.000Z',
          recordedAt: '2026-03-20T15:00:00.000Z',
          amountCents: 100_000,
          netCollectedCents: 100_000,
          refundedAmountCents: 0,
          isFullyRefunded: false,
          patientId: 1,
          patientName: 'Doe, Jane',
          description: 'pmt',
          invoiceId: 1,
          stripePaymentIntentId: null,
          stripeChargeId: null,
        },
      ],
      paymentsCollectedNetCents: 100_000,
      paymentsCollectedGrossCents: 100_000,
      refundsTotalCents: 0,
      refundLineItems: [],
      matchedPrescriptionInvoiceGrossCents: 95_000,
      feesUseCashCollectedBasis: true,
      paymentsWithoutPharmacyCogs: [],
      nonRxChargeLineItems: [],
      nonRxExplainedPaymentCount: 0,
    } satisfies OtDailyInvoices;

    const csv = generateOtCombinedCSV(data);
    expect(csv).toContain('Cash collected');
    expect(csv).toContain('$1000.00'); // gross top
    expect(csv).toContain(`$${(grand / 100).toFixed(2)}`); // total deductions
    expect(csv).toContain(`$${((gross - grand) / 100).toFixed(2)}`); // net payable
    expect(csv).toContain('ALL PAYMENTS COLLECTED');
    expect(csv).toContain('Gross collected (1 payments)');
    expect(csv).toContain('Less — Refunds (0 refunded payments)');
    expect(csv).toContain('REFUNDS (OT PATIENTS)');
  });

  it('generateOtRefundsCSV emits headers, rows, and total when refunds are present', () => {
    const refundLineItems: OtRefundLineItem[] = [
      {
        paymentId: 1,
        paidAt: '2026-03-20T15:00:00.000Z',
        refundedAt: '2026-03-20T18:00:00.000Z',
        patientId: 1,
        patientName: 'Doe, Jane',
        amountCents: 50_000,
        refundedAmountCents: 50_000,
        isFullyRefunded: true,
        description: 'pmt',
        invoiceId: 1,
        stripePaymentIntentId: 'pi_full',
        stripeChargeId: 'ch_full',
      },
      {
        paymentId: 2,
        paidAt: '2026-03-20T16:00:00.000Z',
        refundedAt: '2026-03-20T19:00:00.000Z',
        patientId: 2,
        patientName: 'Smith, John',
        amountCents: 40_000,
        refundedAmountCents: 10_000,
        isFullyRefunded: false,
        description: 'pmt',
        invoiceId: 2,
        stripePaymentIntentId: 'pi_partial',
        stripeChargeId: 'ch_partial',
      },
    ];
    const data = {
      pharmacy: {
        invoiceType: 'pharmacy' as const,
        clinicId: 1,
        clinicName: 'OT',
        invoiceDate: '2026-03-20T12:00:00.000Z',
        periodStart: '2026-03-20T05:00:00.000Z',
        periodEnd: '2026-03-21T04:59:59.999Z',
        lineItems: [],
        shippingLineItems: [],
        prescriptionFeeLineItems: [],
        trtTelehealthLineItems: [],
        subtotalMedicationsCents: 0,
        subtotalShippingCents: 0,
        subtotalPrescriptionFeesCents: 0,
        subtotalTrtTelehealthCents: 0,
        totalCents: 0,
        orderCount: 0,
        vialCount: 0,
        missingPriceCount: 0,
        estimatedPriceCount: 0,
      },
      paymentCollections: [],
      paymentsCollectedGrossCents: 90_000,
      paymentsCollectedNetCents: 30_000,
      refundsTotalCents: 60_000,
      refundLineItems,
    } as unknown as OtDailyInvoices;

    const csv = generateOtRefundsCSV(data);
    expect(csv).toContain('Refund count,2');
    expect(csv).toContain('Refunds total,$600.00');
    /** Cash math line spells out gross − refunds = net. */
    expect(csv).toContain('Gross collected = $900.00');
    expect(csv).toContain('Cash collected (net) = $300.00');
    /** Both rows present, type column distinguishes them. */
    expect(csv).toContain('pi_full');
    expect(csv).toContain('full');
    expect(csv).toContain('pi_partial');
    expect(csv).toContain('partial');
    expect(csv).toContain('TOTAL,,,,,,$600.00');
  });
});
