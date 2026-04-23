/**
 * WellMedR Renewal Invoice Sync (Safety Net Cron)
 * ================================================
 *
 * Catches any WellMedR (Stripe Connect) subscription renewal invoices that
 * `/api/stripe/webhook` dropped — e.g. transient DB failures, Vercel cold-start
 * timeouts, or a webhook endpoint misconfiguration. Runs hourly.
 *
 * Approach (2026-04-22):
 * 1. List paid Stripe invoices on WellMedR's Connect account from the last 48h
 *    with `billing_reason ∈ {subscription_cycle, subscription_update}` and
 *    `status = 'paid'`.
 * 2. For each, check if a local Invoice already exists (by `stripeInvoiceId`).
 *    If it does, skip.
 * 3. Otherwise, replay via `StripeInvoiceService.updateFromWebhook` — the same
 *    code path the webhook uses. Idempotent via the `stripeInvoiceId` unique
 *    index + the `connectInvoiceGuard` predicate.
 *
 * Alerting: if any gaps are reconciled, send a Slack warning so an engineer
 * can investigate why the primary webhook path missed them.
 *
 * Scoped to WellMedR only because other Connect tenants have different flows
 * (Airtable-owned initial + Stripe-owned renewal is WellMedR-specific).
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { verifyCronAuth } from '@/lib/cron/tenant-isolation';
import { prisma, runWithClinicContext } from '@/lib/db';
import { logger } from '@/lib/logger';
import { alertWarning } from '@/lib/observability/slack-alerts';
import { isRenewalBillingReason } from '@/services/stripe/connectInvoiceGuard';
import { StripeInvoiceService } from '@/services/stripe/invoiceService';

import type Stripe from 'stripe';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// How far back to scan. The cron runs hourly; a 48h window gives generous
// retry margin without replaying ancient history. Anything older should be
// reconciled via the one-time backfill script, not this cron.
const SCAN_WINDOW_MS = 48 * 60 * 60 * 1000;
const ALERT_SAMPLE_LIMIT = 10;

interface GapSample {
  stripeInvoiceId: string;
  billingReason: string | null;
  paidAt: string;
  amountPaid: number;
  outcome: 'reconciled' | 'replay_failed' | 'already_exists';
  error?: string;
}

interface RunTotals {
  scanned: number;
  alreadyExists: number;
  reconciled: number;
  replayFailed: number;
  skippedNotRenewal: number;
  samples: GapSample[];
}

/**
 * Replay a single Stripe invoice through the webhook update path and classify
 * the outcome. Extracted to keep the top-level GET body under complexity/depth
 * limits.
 */
async function reconcileInvoice(
  stripeInvoice: Stripe.Invoice,
  clinicId: number,
  stripeAccountId: string,
  totals: RunTotals
): Promise<void> {
  const paidAtSeconds = stripeInvoice.status_transitions?.paid_at ?? stripeInvoice.created;
  const paidAt = new Date(paidAtSeconds * 1000);

  const recordSample = (outcome: GapSample['outcome'], error?: string): void => {
    if (totals.samples.length >= ALERT_SAMPLE_LIMIT) return;
    totals.samples.push({
      stripeInvoiceId: stripeInvoice.id,
      billingReason: stripeInvoice.billing_reason ?? null,
      paidAt: paidAt.toISOString(),
      amountPaid: stripeInvoice.amount_paid,
      outcome,
      error,
    });
  };

  try {
    await runWithClinicContext(clinicId, async () => {
      const existing = await prisma.invoice.findUnique({
        where: { stripeInvoiceId: stripeInvoice.id },
        select: { id: true },
      });

      if (existing) {
        totals.alreadyExists += 1;
        return;
      }

      // Replay the webhook handler. This runs the full auto-create path:
      // patient resolution, Invoice row, SOAP note, portal invite,
      // affiliate commission, admin notification.
      await StripeInvoiceService.updateFromWebhook(stripeInvoice, {
        stripeAccountId,
        clinicId,
      });

      // Verify an Invoice now exists; if not, record as replay failure
      // (patient resolution failed — manual review needed).
      const nowExists = await prisma.invoice.findUnique({
        where: { stripeInvoiceId: stripeInvoice.id },
        select: { id: true },
      });

      if (nowExists) {
        totals.reconciled += 1;
        recordSample('reconciled');
        logger.info('[wellmedr-renewal-invoice-sync] Reconciled missing renewal invoice', {
          stripeInvoiceId: stripeInvoice.id,
          billingReason: stripeInvoice.billing_reason,
          amountPaid: stripeInvoice.amount_paid,
          clinicId,
        });
      } else {
        totals.replayFailed += 1;
        recordSample(
          'replay_failed',
          'Invoice not created after replay (patient resolution likely failed)'
        );
        logger.warn(
          '[wellmedr-renewal-invoice-sync] Replay did not create Invoice — patient unresolved',
          {
            stripeInvoiceId: stripeInvoice.id,
            billingReason: stripeInvoice.billing_reason,
          }
        );
      }
    });
  } catch (err) {
    totals.replayFailed += 1;
    const errorMessage = err instanceof Error ? err.message : 'Unknown';
    recordSample('replay_failed', errorMessage);
    logger.error('[wellmedr-renewal-invoice-sync] Replay threw', {
      stripeInvoiceId: stripeInvoice.id,
      error: errorMessage,
    });
  }
}

async function scanAndReconcile(
  stripe: Stripe,
  stripeAccountId: string,
  clinicId: number
): Promise<RunTotals> {
  const totals: RunTotals = {
    scanned: 0,
    alreadyExists: 0,
    reconciled: 0,
    replayFailed: 0,
    skippedNotRenewal: 0,
    samples: [],
  };

  const connectOpts: Stripe.RequestOptions = { stripeAccount: stripeAccountId };
  const since = Math.floor((Date.now() - SCAN_WINDOW_MS) / 1000);

  let startingAfter: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const page = await stripe.invoices.list(
      {
        status: 'paid',
        created: { gte: since },
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      },
      connectOpts
    );

    for (const stripeInvoice of page.data) {
      totals.scanned += 1;

      if (!isRenewalBillingReason(stripeInvoice.billing_reason)) {
        totals.skippedNotRenewal += 1;
        continue;
      }

      await reconcileInvoice(stripeInvoice, clinicId, stripeAccountId, totals);
    }

    hasMore = page.has_more;
    if (page.data.length > 0) {
      startingAfter = page.data[page.data.length - 1].id;
    }
  }

  return totals;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    const clinic = await prisma.clinic.findFirst({
      where: {
        OR: [
          { subdomain: { contains: 'wellmedr', mode: 'insensitive' } },
          { name: { contains: 'Wellmedr', mode: 'insensitive' } },
        ],
      },
      select: { id: true, stripeAccountId: true },
    });

    if (!clinic?.stripeAccountId) {
      return NextResponse.json({
        skipped: true,
        reason: 'No WellMedR clinic or no stripeAccountId',
      });
    }

    const { getStripeForClinic } = await import('@/lib/stripe/connect');
    const stripeContext = await getStripeForClinic(clinic.id);

    if (!stripeContext.stripeAccountId) {
      return NextResponse.json({ skipped: true, reason: 'No Connect account' });
    }

    const totals = await scanAndReconcile(
      stripeContext.stripe,
      stripeContext.stripeAccountId,
      clinic.id
    );

    // Any reconciliation or failure is a signal that the primary webhook path
    // missed events. Alert so engineers can investigate (likely webhook config,
    // cold-start timeout, or a DB incident).
    if (totals.reconciled > 0 || totals.replayFailed > 0) {
      try {
        await alertWarning(
          'WellMedR renewal invoice sync reconciled gaps',
          `Primary Stripe webhook missed ${totals.reconciled + totals.replayFailed} renewal invoice(s) in the last ${SCAN_WINDOW_MS / 3600000}h window. Cron backfilled ${totals.reconciled}; ${totals.replayFailed} needed manual review.`,
          {
            clinicId: clinic.id,
            reconciled: totals.reconciled,
            replayFailed: totals.replayFailed,
            scanned: totals.scanned,
            samples: totals.samples,
          }
        );
      } catch (alertErr) {
        logger.warn('[wellmedr-renewal-invoice-sync] Slack alert failed (non-fatal)', {
          error: alertErr instanceof Error ? alertErr.message : 'Unknown',
        });
      }
    }

    return NextResponse.json({
      success: true,
      clinicId: clinic.id,
      scanned: totals.scanned,
      alreadyExists: totals.alreadyExists,
      reconciled: totals.reconciled,
      replayFailed: totals.replayFailed,
      skippedNotRenewal: totals.skippedNotRenewal,
      samples: totals.samples,
      durationMs: Date.now() - startTime,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error('[wellmedr-renewal-invoice-sync] Fatal error', { error: errorMessage });
    return NextResponse.json(
      { success: false, error: errorMessage, durationMs: Date.now() - startTime },
      { status: 500 }
    );
  }
}
