/**
 * WellMedR Subscription Sync (Safety Net Cron)
 * =============================================
 *
 * Catches WellMedR (Stripe Connect) subscription events that
 * `/api/stripe/webhook` silently dropped. Mirrors
 * `wellmedr-renewal-invoice-sync` route, but for the subscription path.
 *
 * Why this exists:
 *   The webhook calls `syncSubscriptionFromStripe` for every
 *   `customer.subscription.{created,updated,deleted,paused,resumed}` event.
 *   That function returns `{success: true, skipped: true}` whenever patient
 *   resolution fails (Airtable race, transient `stripe.customers.retrieve`
 *   error, customer.email not yet populated, etc.). 2026-05-02 audit found
 *   9,836 of 11,664 active WellMedR subs (~84%) were missing locally because
 *   of this. Sentry tripwire (added in subscriptionSyncService.ts) flags new
 *   silent-skips in real-time; this cron is the recovery path that restores
 *   eventual consistency without engineer intervention.
 *
 * Approach (mirrors wellmedr-renewal-invoice-sync):
 *   1. List Stripe subscriptions on the WellMedR Connect account created in
 *      the last 48h (rolling window).
 *   2. For each, check if a local Subscription exists by stripeSubscriptionId.
 *      If yes → skip.
 *   3. Otherwise call `syncSubscriptionFromStripe` (same idempotent code path
 *      the webhook uses). The fix in subscriptionSyncService now resolves via
 *      customer.email + sub.metadata.email + customer.metadata.email, so most
 *      gaps that webhook missed (race) will succeed here.
 *   4. If reconciled > 0 OR replay-failed > 0 → Slack `alertWarning`.
 *
 * Scoped to WellMedR only because other Connect tenants (OT, etc.) have
 * different signup flows and should be audited/fixed separately.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { verifyCronAuth } from '@/lib/cron/tenant-isolation';
import { prisma, runWithClinicContext } from '@/lib/db';
import { logger } from '@/lib/logger';
import { alertWarning } from '@/lib/observability/slack-alerts';
import { syncSubscriptionFromStripe } from '@/services/stripe/subscriptionSyncService';

import type Stripe from 'stripe';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 48h rolling window. Cron runs hourly; 48h gives generous retry margin
// without replaying ancient history. Older gaps go through the one-time
// scripts/sync-wellmedr-stripe-subscriptions.ts backfill instead.
const SCAN_WINDOW_MS = 48 * 60 * 60 * 1000;
const ALERT_SAMPLE_LIMIT = 10;

interface GapSample {
  stripeSubscriptionId: string;
  status: string | null;
  createdAt: string;
  outcome: 'reconciled' | 'replay_failed' | 'skipped_no_patient';
  reason?: string;
  error?: string;
}

interface RunTotals {
  scanned: number;
  alreadyExists: number;
  reconciled: number;
  replayFailed: number;
  skippedNoPatient: number;
  samples: GapSample[];
}

async function reconcileSubscription(
  stripeSubscription: Stripe.Subscription,
  clinicId: number,
  stripeAccountId: string,
  totals: RunTotals
): Promise<void> {
  const recordSample = (
    outcome: GapSample['outcome'],
    reason?: string,
    error?: string
  ): void => {
    if (totals.samples.length >= ALERT_SAMPLE_LIMIT) return;
    totals.samples.push({
      stripeSubscriptionId: stripeSubscription.id,
      status: stripeSubscription.status,
      createdAt: new Date(stripeSubscription.created * 1000).toISOString(),
      outcome,
      reason,
      error,
    });
  };

  try {
    const result = await runWithClinicContext(clinicId, async () => {
      const existing = await prisma.subscription.findUnique({
        where: { stripeSubscriptionId: stripeSubscription.id },
        select: { id: true },
      });

      if (existing) {
        totals.alreadyExists += 1;
        return { existed: true } as const;
      }

      // Same code path as the webhook. Idempotent (upsert by
      // stripeSubscriptionId). Returns { success, skipped, subscriptionId, ... }.
      const syncResult = await syncSubscriptionFromStripe(
        stripeSubscription,
        `cron-${stripeSubscription.id}`,
        { clinicId, stripeAccountId }
      );
      return { existed: false, syncResult } as const;
    });

    if (result.existed) return;

    if (result.syncResult.skipped) {
      totals.skippedNoPatient += 1;
      recordSample('skipped_no_patient', result.syncResult.reason);
      logger.warn(
        '[wellmedr-subscription-sync] Sync still skipped after metadata fallbacks',
        {
          stripeSubscriptionId: stripeSubscription.id,
          reason: result.syncResult.reason,
        }
      );
      return;
    }

    if (result.syncResult.success && result.syncResult.subscriptionId) {
      totals.reconciled += 1;
      recordSample('reconciled');
      logger.info(
        '[wellmedr-subscription-sync] Reconciled missing subscription',
        {
          stripeSubscriptionId: stripeSubscription.id,
          subscriptionId: result.syncResult.subscriptionId,
          status: stripeSubscription.status,
        }
      );

      // Phase 1.2 (2026-05-03): For every subscription this cron just recovered
      // (the primary Stripe webhook missed or silent-skipped), the patient
      // should also have received a portal invite at original payment time.
      // Fire the trigger here as the recovery surface. Internally idempotent
      // (skips when patient already has a User row OR an unused invite for the
      // same trigger), wrapped to never crash the cron run.
      const recoveredPatientId = result.syncResult.patientId;
      if (recoveredPatientId) {
        try {
          const { triggerPortalInviteOnPayment } = await import(
            '@/lib/portal-invite/service'
          );
          await triggerPortalInviteOnPayment(recoveredPatientId);
        } catch (inviteErr) {
          logger.warn(
            '[wellmedr-subscription-sync] Portal invite trigger failed (non-fatal)',
            {
              stripeSubscriptionId: stripeSubscription.id,
              patientId: recoveredPatientId,
              error: inviteErr instanceof Error ? inviteErr.message : 'Unknown',
            }
          );
        }
      }
      return;
    }

    totals.replayFailed += 1;
    recordSample('replay_failed', undefined, result.syncResult.error);
    logger.error(
      '[wellmedr-subscription-sync] Sync returned non-success',
      {
        stripeSubscriptionId: stripeSubscription.id,
        error: result.syncResult.error,
      }
    );
  } catch (err) {
    totals.replayFailed += 1;
    const errorMessage = err instanceof Error ? err.message : 'Unknown';
    recordSample('replay_failed', undefined, errorMessage);
    logger.error('[wellmedr-subscription-sync] Replay threw', {
      stripeSubscriptionId: stripeSubscription.id,
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
    skippedNoPatient: 0,
    samples: [],
  };

  const connectOpts: Stripe.RequestOptions = { stripeAccount: stripeAccountId };
  const since = Math.floor((Date.now() - SCAN_WINDOW_MS) / 1000);

  let startingAfter: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const page = await stripe.subscriptions.list(
      {
        status: 'all',
        created: { gte: since },
        limit: 100,
        expand: ['data.customer'],
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      },
      connectOpts
    );

    for (const sub of page.data) {
      totals.scanned += 1;
      await reconcileSubscription(sub, clinicId, stripeAccountId, totals);
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

    // Any reconciliation/skip indicates the primary webhook path missed events.
    // Alert so engineers see ongoing leak even with the Sentry tripwire in place.
    if (totals.reconciled > 0 || totals.replayFailed > 0 || totals.skippedNoPatient > 0) {
      try {
        await alertWarning(
          'WellMedR subscription sync reconciled gaps',
          `Primary Stripe webhook missed ${totals.reconciled + totals.replayFailed + totals.skippedNoPatient} subscription event(s) in the last ${SCAN_WINDOW_MS / 3600000}h window. Cron backfilled ${totals.reconciled}; ${totals.replayFailed} replay-failed; ${totals.skippedNoPatient} still unresolved (no patient match).`,
          {
            clinicId: clinic.id,
            reconciled: totals.reconciled,
            replayFailed: totals.replayFailed,
            skippedNoPatient: totals.skippedNoPatient,
            scanned: totals.scanned,
            samples: totals.samples,
          }
        );
      } catch (alertErr) {
        logger.warn('[wellmedr-subscription-sync] Slack alert failed (non-fatal)', {
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
      skippedNoPatient: totals.skippedNoPatient,
      samples: totals.samples,
      durationMs: Date.now() - startTime,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error('[wellmedr-subscription-sync] Fatal error', { error: errorMessage });
    return NextResponse.json(
      { success: false, error: errorMessage, durationMs: Date.now() - startTime },
      { status: 500 }
    );
  }
}
