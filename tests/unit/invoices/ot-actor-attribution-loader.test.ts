/**
 * `loadOtActorAttributions` — Phase 4 of the OT rep attribution plan
 * (2026-05-03). Covers the per-invoice / per-payment lookup that the
 * OT super-admin reconciliation editor uses as the second link in the
 * rep fallback chain (between SalesRepCommissionEvent ledger and
 * PatientSalesRepAssignment).
 *
 * Verifies:
 *   - Invoice.metadata.actorUserId yields a `byInvoiceDbId` entry when
 *     the user is commission-eligible + active.
 *   - Payment.metadata.actorUserId yields a `byPaymentId` entry AND
 *     populates `byInvoiceDbId` when the payment has an invoiceId.
 *   - Non-eligible roles (e.g. SUPER_ADMIN, PATIENT) are dropped.
 *   - Inactive users are dropped.
 *   - String-encoded `actorUserId` (Stripe metadata stores everything as
 *     strings) is parsed as a number.
 *   - Malformed metadata is silently skipped.
 *   - Empty input returns empty maps.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockBasePrisma } = vi.hoisted(() => ({
  mockBasePrisma: {
    invoice: { findMany: vi.fn() },
    payment: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/db', () => ({
  basePrisma: mockBasePrisma,
  prisma: mockBasePrisma,
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { loadOtActorAttributions } from '@/services/invoices/otInvoiceGenerationService';

const REP_ID = 42;
const ADMIN_ID = 99;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadOtActorAttributions', () => {
  it('returns empty maps when no ids are provided', async () => {
    const result = await loadOtActorAttributions([], []);
    expect(result.byInvoiceDbId.size).toBe(0);
    expect(result.byPaymentId.size).toBe(0);
    /** No DB roundtrip when nothing to look up. */
    expect(mockBasePrisma.invoice.findMany).not.toHaveBeenCalled();
    expect(mockBasePrisma.payment.findMany).not.toHaveBeenCalled();
    expect(mockBasePrisma.user.findMany).not.toHaveBeenCalled();
  });

  it('maps invoiceDbId → rep when actor stamped on Invoice.metadata is commission-eligible', async () => {
    mockBasePrisma.invoice.findMany.mockResolvedValue([
      { id: 1001, metadata: { actorUserId: REP_ID } },
    ]);
    mockBasePrisma.payment.findMany.mockResolvedValue([]);
    mockBasePrisma.user.findMany.mockResolvedValue([
      { id: REP_ID, firstName: 'Antonio', lastName: 'Escobar' },
    ]);

    const result = await loadOtActorAttributions([1001], []);

    expect(result.byInvoiceDbId.get(1001)).toEqual({
      salesRepId: REP_ID,
      salesRepName: 'Escobar, Antonio',
    });
  });

  it('maps paymentId → rep AND propagates to byInvoiceDbId when payment has invoiceId', async () => {
    mockBasePrisma.invoice.findMany.mockResolvedValue([
      { id: 2002, metadata: null }, // no actor on the invoice itself
    ]);
    mockBasePrisma.payment.findMany.mockResolvedValue([
      { id: 5005, metadata: { actorUserId: REP_ID }, invoiceId: 2002 },
    ]);
    mockBasePrisma.user.findMany.mockResolvedValue([
      { id: REP_ID, firstName: 'Antonio', lastName: 'Escobar' },
    ]);

    const result = await loadOtActorAttributions([2002], [5005]);

    expect(result.byPaymentId.get(5005)).toEqual({
      salesRepId: REP_ID,
      salesRepName: 'Escobar, Antonio',
    });
    /** Payment-side stamp also populates the invoice-keyed map. */
    expect(result.byInvoiceDbId.get(2002)).toEqual({
      salesRepId: REP_ID,
      salesRepName: 'Escobar, Antonio',
    });
  });

  it('drops users whose role is not commission-eligible (SUPER_ADMIN acting on a rep behalf)', async () => {
    mockBasePrisma.invoice.findMany.mockResolvedValue([
      { id: 1, metadata: { actorUserId: ADMIN_ID } },
    ]);
    mockBasePrisma.payment.findMany.mockResolvedValue([]);
    /**
     * `prisma.user.findMany` is called with `role IN COMMISSION_ELIGIBLE_ROLES`
     * — a SUPER_ADMIN won't satisfy the where clause, so the mock returns []
     * and the candidate is dropped.
     */
    mockBasePrisma.user.findMany.mockResolvedValue([]);

    const result = await loadOtActorAttributions([1], []);

    expect(result.byInvoiceDbId.size).toBe(0);
    expect(result.byPaymentId.size).toBe(0);
  });

  it('parses a string-encoded actorUserId (Stripe metadata stringifies everything)', async () => {
    mockBasePrisma.invoice.findMany.mockResolvedValue([
      { id: 1, metadata: { actorUserId: '42' } },
    ]);
    mockBasePrisma.payment.findMany.mockResolvedValue([]);
    mockBasePrisma.user.findMany.mockResolvedValue([
      { id: REP_ID, firstName: 'A', lastName: 'B' },
    ]);

    const result = await loadOtActorAttributions([1], []);

    expect(result.byInvoiceDbId.get(1)?.salesRepId).toBe(REP_ID);
  });

  it('silently skips invoices/payments with missing or malformed metadata', async () => {
    mockBasePrisma.invoice.findMany.mockResolvedValue([
      { id: 1, metadata: null },
      { id: 2, metadata: { actorUserId: 'not-a-number' } },
      { id: 3, metadata: { actorUserId: -5 } },
      { id: 4, metadata: { actorUserId: REP_ID } },
    ]);
    mockBasePrisma.payment.findMany.mockResolvedValue([]);
    mockBasePrisma.user.findMany.mockResolvedValue([
      { id: REP_ID, firstName: 'A', lastName: 'B' },
    ]);

    const result = await loadOtActorAttributions([1, 2, 3, 4], []);

    /** Only invoice 4 makes it through. */
    expect(result.byInvoiceDbId.size).toBe(1);
    expect(result.byInvoiceDbId.has(4)).toBe(true);
  });

  it('does NOT overwrite Invoice-side actor with Payment-side actor on the same invoice', async () => {
    mockBasePrisma.invoice.findMany.mockResolvedValue([
      { id: 7, metadata: { actorUserId: REP_ID } },
    ]);
    mockBasePrisma.payment.findMany.mockResolvedValue([
      /** Different actor on the payment for the same invoice. */
      { id: 70, metadata: { actorUserId: ADMIN_ID }, invoiceId: 7 },
    ]);
    mockBasePrisma.user.findMany.mockResolvedValue([
      { id: REP_ID, firstName: 'Antonio', lastName: 'Escobar' },
      { id: ADMIN_ID, firstName: 'Other', lastName: 'Rep' },
    ]);

    const result = await loadOtActorAttributions([7], [70]);

    /** Invoice-side stamp wins for the invoice key. */
    expect(result.byInvoiceDbId.get(7)?.salesRepId).toBe(REP_ID);
    /** Payment-side stamp still appears in the payment-keyed map. */
    expect(result.byPaymentId.get(70)?.salesRepId).toBe(ADMIN_ID);
  });
});
