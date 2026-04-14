/**
 * Daily Payment Reconciliation Cron Job
 * ======================================
 *
 * Catches payments missed by webhooks. Uses runCronPerTenant + runWithClinicContext
 * so each clinic's missing payments are processed in that clinic's context.
 *
 * 1. Per clinic: list succeeded payment intents from that clinic's Stripe (last 48h)
 * 2. Determine which are missing in DB, process in clinic context
 * 3. Alert on failures
 *
 * Vercel Cron: 0 6 * * * (6 AM UTC daily)
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { verifyCronAuth, runCronPerTenant } from '@/lib/cron/tenant-isolation';
import { circuitBreaker, DbTier } from '@/lib/database/circuit-breaker';
import { prisma, runWithClinicContext } from '@/lib/db';
import { logger } from '@/lib/logger';

import type Stripe from 'stripe';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface PerClinicResult {
  newlyProcessed: number;
  failed: number;
  errors: string[];
  /** Succeeded payment intents seen in Stripe for this clinic in the window */
  stripePaymentCount: number;
  /** Platform-account PIs in the window missing clinic metadata (not attributed to this clinic) */
  skippedNoClinic: number;
}

export async function GET(req: NextRequest) {
  return runReconcile(req);
}

export async function POST(req: NextRequest) {
  return runReconcile(req);
}

async function runReconcile(req: NextRequest) {
  const startTime = Date.now();

  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Tier 3 BACKGROUND: hard-blocked when circuit breaker is open
  const guard = await circuitBreaker.guard(DbTier.BACKGROUND);
  if (!guard.allowed) {
    logger.warn('[Reconciliation Cron] Blocked by circuit breaker', {
      reason: guard.reason,
      state: guard.state,
    });
    return NextResponse.json(
      { error: 'Database circuit breaker is open — cron job deferred', reason: guard.reason },
      { status: 503, headers: { 'Retry-After': '30' } }
    );
  }

  const results = {
    stripePayments: 0,
    alreadyProcessed: 0,
    newlyProcessed: 0,
    failed: 0,
    skippedNoClinic: 0,
    errors: [] as string[],
  };

  try {
    const { getStripeForClinic, stripeRequestOptions } = await import('@/lib/stripe/connect');
    const { processStripePayment, extractPaymentDataFromPaymentIntent } =
      await import('@/services/stripe/paymentMatchingService');

    const since = Math.floor(Date.now() / 1000) - 48 * 60 * 60;

    logger.info('[Reconciliation Cron] Starting daily payment reconciliation (per-tenant)', {
      since: new Date(since * 1000).toISOString(),
    });

    const { results: perClinicResults } = await runCronPerTenant<PerClinicResult>({
      jobName: 'reconcile-payments',
      perClinic: async (clinicId) => {
        return runWithClinicContext(clinicId, async () => {
          const out: PerClinicResult = {
            newlyProcessed: 0,
            failed: 0,
            errors: [],
            stripePaymentCount: 0,
            skippedNoClinic: 0,
          };

          const stripeContext = await getStripeForClinic(clinicId);
          if (
            !stripeContext.isPlatformAccount &&
            !stripeContext.stripeAccountId &&
            !stripeContext.isDedicatedAccount
          ) {
            logger.info('[Reconciliation Cron] Skipping clinic — no Stripe account configured', {
              clinicId,
            });
            return out;
          }

          const reqOpts = stripeRequestOptions(stripeContext);
          const allPayments: Stripe.PaymentIntent[] = [];
          let hasMore = true;
          let startingAfter: string | undefined;

          while (hasMore) {
            const paymentIntents = await stripeContext.stripe.paymentIntents.list(
              {
                created: { gte: since },
                limit: 100,
                starting_after: startingAfter,
              },
              reqOpts
            );
            const succeeded = paymentIntents.data.filter((pi) => pi.status === 'succeeded');
            allPayments.push(...succeeded);
            hasMore = paymentIntents.has_more;
            if (paymentIntents.data.length > 0) {
              startingAfter = paymentIntents.data[paymentIntents.data.length - 1].id;
            }
          }

          out.stripePaymentCount = allPayments.length;
          if (stripeContext.isPlatformAccount && !stripeContext.isDedicatedAccount) {
            out.skippedNoClinic = allPayments.filter((pi) => {
              if ((pi as any).invoice) return false;
              const meta = pi.metadata as Record<string, string | undefined>;
              const metaClinicId = meta.clinic_id ?? meta.clinicId;
              return metaClinicId === null || metaClinicId === undefined || metaClinicId === '';
            }).length;
          }

          if (allPayments.length === 0) {
            return out;
          }

          const piIds = allPayments.map((pi) => pi.id);

          const existingRec = await prisma.paymentReconciliation.findMany({
            where: { stripePaymentIntentId: { in: piIds } },
            select: { stripePaymentIntentId: true },
          });
          const existingPay = await prisma.payment.findMany({
            where: { stripePaymentIntentId: { in: piIds } },
            select: { stripePaymentIntentId: true },
          });
          const processedIds = new Set([
            ...existingRec.map((r) => r.stripePaymentIntentId).filter(Boolean),
            ...existingPay.map((p) => p.stripePaymentIntentId).filter(Boolean),
          ]);

          const missingForClinic = allPayments.filter((pi) => {
            if (processedIds.has(pi.id)) return false;
            if ((pi as any).invoice) return false;
            // Connect / dedicated accounts: listing is already scoped to this clinic.
            // Platform Stripe (single clinic on Connect platform): require metadata match.
            if (stripeContext.isPlatformAccount && !stripeContext.isDedicatedAccount) {
              const meta = pi.metadata as Record<string, string | undefined>;
              const metaClinicId = meta.clinic_id ?? meta.clinicId;
              return Number(metaClinicId) === clinicId;
            }
            return true;
          });

          for (const pi of missingForClinic) {
            try {
              const paymentData = await extractPaymentDataFromPaymentIntent(pi);
              const result = await processStripePayment(
                paymentData,
                `cron_${pi.id}_${Date.now()}`,
                'payment_intent.succeeded'
              );
              if (result.success) {
                out.newlyProcessed++;
                logger.info('[Reconciliation Cron] Processed missing payment', {
                  paymentIntentId: pi.id,
                  clinicId,
                  patientId: result.patient?.id,
                  invoiceId: result.invoice?.id,
                });
              } else {
                out.failed++;
                out.errors.push(`${pi.id}: ${result.error}`);
              }
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              out.failed++;
              out.errors.push(`${pi.id}: ${errorMessage}`);
              logger.error('[Reconciliation Cron] Error processing payment', {
                paymentIntentId: pi.id,
                clinicId,
                error: errorMessage,
              });
            }
          }

          return out;
        });
      },
    });

    results.stripePayments = perClinicResults.reduce(
      (s, r) => s + (r.data?.stripePaymentCount ?? 0),
      0
    );

    if (results.stripePayments === 0) {
      return NextResponse.json({
        success: true,
        message: 'No payments to reconcile',
        results,
        duration: Date.now() - startTime,
      });
    }

    const skippedNoClinic = perClinicResults.reduce(
      (s, r) => s + (r.data?.skippedNoClinic ?? 0),
      0
    );

    results.skippedNoClinic = skippedNoClinic;
    results.newlyProcessed = perClinicResults.reduce(
      (s, r) => s + (r.data?.newlyProcessed ?? 0),
      0
    );
    results.failed = perClinicResults.reduce((s, r) => s + (r.data?.failed ?? 0), 0);
    results.errors = perClinicResults.flatMap((r) => r.data?.errors ?? (r.error ? [r.error] : []));
    results.alreadyProcessed =
      results.stripePayments - results.newlyProcessed - results.failed - skippedNoClinic;

    if (results.failed > 0) {
      await alertReconciliationFailures(results);
    }

    logger.info('[Reconciliation Cron] Completed', { ...results });

    return NextResponse.json({
      success: true,
      message: `Reconciled ${results.newlyProcessed} payments, ${results.failed} failures`,
      results,
      duration: Date.now() - startTime,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Reconciliation Cron] Fatal error', { error: errorMessage });
    try {
      await alertReconciliationFailures({ ...results, errors: [`Fatal error: ${errorMessage}`] });
    } catch {
      // ignore
    }
    return NextResponse.json(
      { success: false, error: errorMessage, results, duration: Date.now() - startTime },
      { status: 500 }
    );
  }
}

async function alertReconciliationFailures(results: {
  failed: number;
  errors: string[];
  newlyProcessed?: number;
}): Promise<void> {
  const alertPayload = {
    severity: 'WARNING',
    title: 'Payment Reconciliation Issues',
    message: `Daily reconciliation completed with ${results.failed} failures`,
    successfullyProcessed: results.newlyProcessed ?? 0,
    failed: results.failed,
    errors: results.errors.slice(0, 10),
    timestamp: new Date().toISOString(),
    actionRequired: 'Review failed payments in Admin > Payment Reconciliation',
  };
  logger.error('[Reconciliation Alert] Payment reconciliation issues', alertPayload);
  const alertWebhookUrl = process.env.PAYMENT_ALERT_WEBHOOK_URL;
  if (alertWebhookUrl) {
    try {
      await fetch(alertWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alertPayload),
      });
    } catch {
      // ignore
    }
  }
}
