/**
 * OT Invoice Reconciliation Cron — Smoke Tests
 * =============================================
 *
 * The cron is the safety-net for the 2026-05-02 OT invoice double-decrement
 * incident (RCA at `~/.cursor/plans/ot-invoice-3213-rca.md`). It runs hourly,
 * scoped to OT invoices touched in the last 24h, and:
 *   - backfills any missing `Payment.refundedAmount` columns from metadata
 *   - re-runs `recomputeInvoiceAmountPaid` for each invoice in the window
 *   - Slack-alerts via `alertWarning` if EITHER bucket > 0
 *
 * The PR #11 fixes make the live pipeline idempotent, so a healthy
 * production should see this cron alert with `0 corrected, 0 backfilled`
 * every hour. Any non-zero count means a code path bypassed
 * `recomputeInvoiceAmountPaid` and we need to investigate.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  verifyCronAuth: vi.fn(),
  alertWarning: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  clinicFindFirst: vi.fn(),
  invoiceFindMany: vi.fn(),
  invoiceFindUnique: vi.fn(),
  invoiceUpdate: vi.fn(),
  paymentFindMany: vi.fn(),
  paymentUpdate: vi.fn(),
  $transaction: vi.fn(async (fn: (client: unknown) => unknown) => fn(mocks.txClient)),
  txClient: {} as unknown,
}));

mocks.txClient = {
  invoice: { findUnique: mocks.invoiceFindUnique, update: mocks.invoiceUpdate },
  payment: { findMany: mocks.paymentFindMany, update: mocks.paymentUpdate },
};

vi.mock('@/lib/cron/tenant-isolation', () => ({
  verifyCronAuth: mocks.verifyCronAuth,
}));

vi.mock('@/lib/observability/slack-alerts', () => ({
  alertWarning: mocks.alertWarning,
}));

vi.mock('@/lib/observability/sentry-alerts', () => ({
  emitWarningAlert: vi.fn(),
  emitCriticalAlert: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    debug: vi.fn(),
    security: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({
  prisma: {},
  basePrisma: {
    clinic: { findFirst: mocks.clinicFindFirst },
    invoice: { findMany: mocks.invoiceFindMany },
    payment: { findMany: mocks.paymentFindMany, update: mocks.paymentUpdate },
    $transaction: mocks.$transaction,
  },
  getClinicContext: vi.fn(() => null),
}));

import { GET } from '@/app/api/cron/ot-invoice-reconciliation/route';

function makeReq(): NextRequest {
  return {} as NextRequest;
}

describe('GET /api/cron/ot-invoice-reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyCronAuth.mockReturnValue(true);
    mocks.clinicFindFirst.mockResolvedValue({ id: 8, subdomain: 'ot' });
    mocks.invoiceFindMany.mockResolvedValue([]);
    mocks.paymentFindMany.mockResolvedValue([]);
    mocks.invoiceFindUnique.mockResolvedValue({ amountPaid: 0 });
  });

  it('rejects requests without valid cron auth', async () => {
    mocks.verifyCronAuth.mockReturnValue(false);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it('returns success with 0 counts when no OT invoices in window (clean state)', async () => {
    const res = await GET(makeReq());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.scanned).toBe(0);
    expect(body.amountPaidCorrected).toBe(0);
    expect(body.refundColumnBackfilled).toBe(0);
    expect(mocks.alertWarning).not.toHaveBeenCalled();
  });

  it('does NOT alert when invoices in window are all already correct', async () => {
    // 2 invoices, each with a SUCCEEDED Payment of $100, amountPaid already $100.
    mocks.invoiceFindMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    mocks.invoiceFindUnique.mockResolvedValue({ amountPaid: 10000 });
    // Inside the recompute helper, payment.findMany is called via tx.
    mocks.paymentFindMany.mockImplementation(async (args: { where?: { invoiceId?: number; status?: { in?: string[] } } }) => {
      if (args.where?.status?.in) {
        // recompute helper query
        return [{ amount: 10000, refundedAmount: 0 }];
      }
      // refund-column-backfill query
      return [];
    });

    const res = await GET(makeReq());
    const body = await res.json();

    expect(body.scanned).toBe(2);
    expect(body.amountPaidCorrected).toBe(0);
    expect(mocks.alertWarning).not.toHaveBeenCalled();
  });

  it('ALERTS via Slack when amountPaid drift is corrected', async () => {
    // 1 invoice with corrupt amountPaid=$249, real Payment net=$449.
    mocks.invoiceFindMany.mockResolvedValue([{ id: 19036 }]);
    mocks.invoiceFindUnique.mockResolvedValue({ amountPaid: 24900 });
    mocks.paymentFindMany.mockImplementation(async (args: { where?: { invoiceId?: number; status?: { in?: string[] } } }) => {
      if (args.where?.status?.in) {
        return [{ amount: 64900, refundedAmount: 20000 }];
      }
      return [];
    });

    const res = await GET(makeReq());
    const body = await res.json();

    expect(body.amountPaidCorrected).toBe(1);
    expect(body.amountPaidCorrectedTotal_cents).toBe(20000);
    expect(mocks.alertWarning).toHaveBeenCalledTimes(1);

    const [title, message, details] = mocks.alertWarning.mock.calls[0];
    expect(title).toContain('OT invoice reconciliation cron found drift');
    expect(message).toContain('1 Invoice.amountPaid drift');
    expect(details).toMatchObject({
      clinicId: 8,
      amountPaidCorrected: 1,
      amountPaidCorrectedTotal_cents: 20000,
    });
    expect(details.samples[0]).toMatchObject({
      invoiceId: 19036,
      previousAmountPaid_cents: 24900,
      newAmountPaid_cents: 44900,
      delta_cents: 20000,
    });
  });

  it('ALERTS when missing Payment.refundedAmount columns are backfilled', async () => {
    // No invoices to recompute, but 1 Payment row needing column backfill.
    mocks.invoiceFindMany.mockResolvedValue([]);
    mocks.paymentFindMany.mockImplementation(async (args: { where?: { invoiceId?: number; status?: { in?: string[] }; refundedAmount?: null } }) => {
      // The refund-column-backfill query is the one with `refundedAmount: null`
      if (args.where?.refundedAmount === null) {
        return [
          {
            id: 4929,
            amount: 64900,
            status: 'PARTIALLY_REFUNDED',
            metadata: { refund: { amount: 20000 } },
          },
        ];
      }
      return [];
    });

    const res = await GET(makeReq());
    const body = await res.json();

    expect(body.refundColumnBackfilled).toBe(1);
    expect(mocks.paymentUpdate).toHaveBeenCalledWith({
      where: { id: 4929 },
      data: { refundedAmount: 20000 },
    });
    expect(mocks.alertWarning).toHaveBeenCalledTimes(1);
    expect(mocks.alertWarning.mock.calls[0][2]).toMatchObject({
      refundColumnBackfilled: 1,
    });
  });

  it('caps refundedAmount at Payment.amount (defensive against bad metadata)', async () => {
    mocks.invoiceFindMany.mockResolvedValue([]);
    mocks.paymentFindMany.mockImplementation(async (args: { where?: { refundedAmount?: null } }) => {
      if (args.where?.refundedAmount === null) {
        return [
          {
            id: 999,
            amount: 5000, // payment is $50
            status: 'REFUNDED',
            metadata: { refund: { amount: 99999 } }, // metadata claims $999.99 refund — impossible
          },
        ];
      }
      return [];
    });

    await GET(makeReq());

    expect(mocks.paymentUpdate).toHaveBeenCalledWith({
      where: { id: 999 },
      data: { refundedAmount: 5000 }, // capped, not the bogus 99999
    });
  });

  it('skips Payment rows where metadata.refund.amount is missing or invalid', async () => {
    mocks.invoiceFindMany.mockResolvedValue([]);
    mocks.paymentFindMany.mockImplementation(async (args: { where?: { refundedAmount?: null } }) => {
      if (args.where?.refundedAmount === null) {
        return [
          { id: 1, amount: 5000, status: 'REFUNDED', metadata: null },
          { id: 2, amount: 5000, status: 'REFUNDED', metadata: { refund: { amount: 'not-a-number' } } },
          { id: 3, amount: 5000, status: 'REFUNDED', metadata: { refund: { amount: 0 } } },
        ];
      }
      return [];
    });

    const res = await GET(makeReq());
    const body = await res.json();

    expect(mocks.paymentUpdate).not.toHaveBeenCalled();
    expect(body.refundColumnBackfilled).toBe(0);
  });

  it('does NOT alert on sub-$1 drift (noise floor)', async () => {
    // 50¢ drift — below DRIFT_ALERT_THRESHOLD_CENTS.
    mocks.invoiceFindMany.mockResolvedValue([{ id: 1 }]);
    mocks.invoiceFindUnique.mockResolvedValue({ amountPaid: 9999 });
    mocks.paymentFindMany.mockImplementation(async (args: { where?: { invoiceId?: number; status?: { in?: string[] } } }) => {
      if (args.where?.status?.in) return [{ amount: 10049, refundedAmount: 0 }];
      return [];
    });

    const res = await GET(makeReq());
    const body = await res.json();

    expect(body.amountPaidCorrected).toBe(0);
    expect(mocks.alertWarning).not.toHaveBeenCalled();
  });

  it('returns 200 even if Slack alert call throws (alerting must be non-fatal)', async () => {
    mocks.invoiceFindMany.mockResolvedValue([{ id: 19036 }]);
    mocks.invoiceFindUnique.mockResolvedValue({ amountPaid: 24900 });
    mocks.paymentFindMany.mockImplementation(async (args: { where?: { invoiceId?: number; status?: { in?: string[] } } }) => {
      if (args.where?.status?.in) return [{ amount: 64900, refundedAmount: 20000 }];
      return [];
    });
    mocks.alertWarning.mockRejectedValue(new Error('Slack boom'));

    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.amountPaidCorrected).toBe(1); // recompute still happened
  });

  it('returns 200 with skipped:true when OT clinic does not exist', async () => {
    mocks.clinicFindFirst.mockResolvedValue(null);
    const res = await GET(makeReq());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.skipped).toBe(true);
  });
});
