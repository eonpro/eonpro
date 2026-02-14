/**
 * Daily Payment Reconciliation Cron Job
 * ======================================
 *
 * Catches payments missed by webhooks. Uses runCronPerTenant + runWithClinicContext
 * so each clinic's missing payments are processed in that clinic's context.
 *
 * 1. Fetch successful payment intents from Stripe (last 48h)
 * 2. Per clinic: determine which are missing, process in clinic context
 * 3. Alert on failures
 *
 * Vercel Cron: 0 6 * * * (6 AM UTC daily)
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { prisma, runWithClinicContext } from '@/lib/db';
import { verifyCronAuth, runCronPerTenant } from '@/lib/cron/tenant-isolation';

type PerClinicResult = {
  newlyProcessed: number;
  failed: number;
  errors: string[];
};

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

  const results = {
    stripePayments: 0,
    alreadyProcessed: 0,
    newlyProcessed: 0,
    failed: 0,
    skippedNoClinic: 0,
    errors: [] as string[],
  };

  try {
    const { getStripe } = await import('@/lib/stripe');
    const { processStripePayment, extractPaymentDataFromPaymentIntent } = await import(
      '@/services/stripe/paymentMatchingService'
    );

    const stripe = getStripe();
    const since = Math.floor(Date.now() / 1000) - 48 * 60 * 60;

    logger.info('[Reconciliation Cron] Starting daily payment reconciliation (per-tenant)', {
      since: new Date(since * 1000).toISOString(),
    });

    let hasMore = true;
    let startingAfter: string | undefined;
    const allPayments: any[] = [];

    while (hasMore) {
      const paymentIntents = await stripe.paymentIntents.list({
        created: { gte: since },
        limit: 100,
        starting_after: startingAfter,
      });
      const succeeded = paymentIntents.data.filter((pi) => pi.status === 'succeeded');
      allPayments.push(...succeeded);
      hasMore = paymentIntents.has_more;
      if (paymentIntents.data.length > 0) {
        startingAfter = paymentIntents.data[paymentIntents.data.length - 1].id;
      }
    }

    results.stripePayments = allPayments.length;

    if (allPayments.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No payments to reconcile',
        results,
        duration: Date.now() - startTime,
      });
    }

    const piIds = allPayments.map((pi) => pi.id);

    const { results: perClinicResults, totalDurationMs } = await runCronPerTenant<PerClinicResult>({
      jobName: 'reconcile-payments',
      perClinic: async (clinicId) => {
        return runWithClinicContext(clinicId, async () => {
          const out: PerClinicResult = { newlyProcessed: 0, failed: 0, errors: [] };

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
            const meta = (pi.metadata || {}) as Record<string, unknown>;
            const metaClinicId = meta?.clinic_id ?? meta?.clinicId;
            return Number(metaClinicId) === clinicId;
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

    const skippedNoClinic = allPayments.filter((pi) => {
      if ((pi as any).invoice) return false;
      const meta = (pi.metadata || {}) as Record<string, unknown>;
      const metaClinicId = meta?.clinic_id ?? meta?.clinicId;
      return metaClinicId == null || metaClinicId === '';
    }).length;

    results.skippedNoClinic = skippedNoClinic;
    results.newlyProcessed = perClinicResults.reduce((s, r) => s + (r.data?.newlyProcessed ?? 0), 0);
    results.failed = perClinicResults.reduce((s, r) => s + (r.data?.failed ?? 0), 0);
    results.errors = perClinicResults.flatMap((r) => r.data?.errors ?? (r.error ? [r.error] : []));
    results.alreadyProcessed = results.stripePayments - results.newlyProcessed - results.failed - skippedNoClinic;

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
    successfullyProcessed: results.newlyProcessed || 0,
    failed: results.failed,
    errors: (results.errors || []).slice(0, 10),
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
