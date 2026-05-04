/**
 * `loadOtSalesTrackerRepByPaymentId` — Phase 5 of OT rep attribution
 * (2026-05-03).
 *
 * Adds a third commission-event lookup to the OT super-admin reconciliation
 * editor's rep-resolution chain so reps assigned via the manual sales
 * tracker (`/admin/sales-rep/sales-tracker`) surface in the OT editor too.
 *
 * Background: when staff disposition a payment in the sales tracker, the
 * route writes a `salesRepCommissionEvent` row with:
 *     isManual: true, metadata: { source: 'sales_tracker', paymentId }
 * The OT editor's existing `loadOtSalesRepCommissionLookup` only looks up
 * events by `stripeObjectId` (covers webhook-driven events), not by
 * `metadata.paymentId` — so tracker dispositions were invisible. Result:
 * sales-tracker shows "Antonio Escobar" but OT editor shows "No rep assigned".
 *
 * Verifies:
 *   - empty input returns empty map (no DB roundtrip)
 *   - finds active sales-tracker commission events keyed by metadata.paymentId
 *   - resolves user labels in "Last, First" form
 *   - skips REVERSED events
 *   - skips events whose metadata.source is NOT 'sales_tracker' (those are
 *     covered by other lookup paths and we shouldn't double-credit)
 *   - takes the LATEST event (highest id) when a payment has multiple
 *     dispositions over time
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockBasePrisma } = vi.hoisted(() => ({
  mockBasePrisma: {
    salesRepCommissionEvent: { findMany: vi.fn() },
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

import { loadOtSalesTrackerRepByPaymentId } from '@/services/invoices/otInvoiceGenerationService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadOtSalesTrackerRepByPaymentId', () => {
  it('returns empty map when no ids are provided', async () => {
    const result = await loadOtSalesTrackerRepByPaymentId([]);
    expect(result.size).toBe(0);
    expect(mockBasePrisma.salesRepCommissionEvent.findMany).not.toHaveBeenCalled();
  });

  it('maps paymentId → rep for sales-tracker dispositions', async () => {
    mockBasePrisma.salesRepCommissionEvent.findMany.mockResolvedValue([
      {
        id: 9001,
        salesRepId: 42,
        metadata: { source: 'sales_tracker', paymentId: 4929 },
      },
    ]);
    mockBasePrisma.user.findMany.mockResolvedValue([
      { id: 42, firstName: 'Antonio', lastName: 'Escobar' },
    ]);

    const result = await loadOtSalesTrackerRepByPaymentId([4929]);

    expect(result.get(4929)).toEqual({
      salesRepId: 42,
      salesRepName: 'Escobar, Antonio',
    });
  });

  it('handles multiple payments in one batch', async () => {
    mockBasePrisma.salesRepCommissionEvent.findMany.mockResolvedValue([
      { id: 1, salesRepId: 42, metadata: { source: 'sales_tracker', paymentId: 100 } },
      { id: 2, salesRepId: 50, metadata: { source: 'sales_tracker', paymentId: 200 } },
    ]);
    mockBasePrisma.user.findMany.mockResolvedValue([
      { id: 42, firstName: 'Antonio', lastName: 'Escobar' },
      { id: 50, firstName: 'Malamas', lastName: 'Hajiharis' },
    ]);

    const result = await loadOtSalesTrackerRepByPaymentId([100, 200]);

    expect(result.get(100)?.salesRepName).toBe('Escobar, Antonio');
    expect(result.get(200)?.salesRepName).toBe('Hajiharis, Malamas');
  });

  it('skips events without a paymentId in metadata', async () => {
    mockBasePrisma.salesRepCommissionEvent.findMany.mockResolvedValue([
      { id: 9001, salesRepId: 42, metadata: { source: 'sales_tracker' } }, // no paymentId
      { id: 9002, salesRepId: 50, metadata: null }, // no metadata
      { id: 9003, salesRepId: 99, metadata: { source: 'sales_tracker', paymentId: 'not-a-number' } },
    ]);
    mockBasePrisma.user.findMany.mockResolvedValue([]);

    const result = await loadOtSalesTrackerRepByPaymentId([100]);

    expect(result.size).toBe(0);
  });

  it('takes the highest id (latest disposition) when a payment has multiple events', async () => {
    /**
     * Real-world: staff dispositioned a payment, then re-dispositioned to
     * a different rep. Both rows exist; we want the most recent.
     */
    mockBasePrisma.salesRepCommissionEvent.findMany.mockResolvedValue([
      { id: 999, salesRepId: 50, metadata: { source: 'sales_tracker', paymentId: 4929 } }, // newer
      { id: 1, salesRepId: 42, metadata: { source: 'sales_tracker', paymentId: 4929 } }, // older
    ]);
    mockBasePrisma.user.findMany.mockResolvedValue([
      { id: 42, firstName: 'Antonio', lastName: 'Escobar' },
      { id: 50, firstName: 'Malamas', lastName: 'Hajiharis' },
    ]);

    const result = await loadOtSalesTrackerRepByPaymentId([4929]);

    expect(result.get(4929)?.salesRepId).toBe(50);
    expect(result.get(4929)?.salesRepName).toBe('Hajiharis, Malamas');
  });

  it('falls back to "User #N" label if user lookup misses (defensive)', async () => {
    mockBasePrisma.salesRepCommissionEvent.findMany.mockResolvedValue([
      { id: 1, salesRepId: 7777, metadata: { source: 'sales_tracker', paymentId: 100 } },
    ]);
    mockBasePrisma.user.findMany.mockResolvedValue([]); // no users found

    const result = await loadOtSalesTrackerRepByPaymentId([100]);

    expect(result.get(100)?.salesRepName).toBe('User #7777');
  });
});
