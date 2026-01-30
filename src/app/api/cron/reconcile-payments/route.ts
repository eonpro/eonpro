/**
 * Daily Payment Reconciliation Cron Job
 * ======================================
 * 
 * CRITICAL: This job catches any payments that were missed by webhooks.
 * Run daily to ensure no patient misses their prescription.
 * 
 * How it works:
 * 1. Fetch all successful payments from Stripe (last 24-48 hours)
 * 2. Check which ones we have records for
 * 3. Process any missing payments
 * 4. Alert on any failures
 * 
 * Vercel Cron: 0 6 * * * (6 AM UTC daily)
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  // Verify cron secret for security
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const results = {
    stripePayments: 0,
    alreadyProcessed: 0,
    newlyProcessed: 0,
    failed: 0,
    errors: [] as string[],
  };

  try {
    const { getStripe } = await import('@/lib/stripe');
    const { prisma } = await import('@/lib/db');
    const {
      processStripePayment,
      extractPaymentDataFromPaymentIntent,
    } = await import('@/services/stripe/paymentMatchingService');

    const stripe = getStripe();

    // Look back 48 hours to catch any stragglers
    const since = Math.floor(Date.now() / 1000) - (48 * 60 * 60);

    logger.info('[Reconciliation Cron] Starting daily payment reconciliation', {
      since: new Date(since * 1000).toISOString(),
    });

    // Fetch all successful payment intents
    let hasMore = true;
    let startingAfter: string | undefined;
    const allPayments: any[] = [];

    while (hasMore) {
      const paymentIntents = await stripe.paymentIntents.list({
        created: { gte: since },
        limit: 100,
        starting_after: startingAfter,
      });

      const succeeded = paymentIntents.data.filter(pi => pi.status === 'succeeded');
      allPayments.push(...succeeded);

      hasMore = paymentIntents.has_more;
      if (paymentIntents.data.length > 0) {
        startingAfter = paymentIntents.data[paymentIntents.data.length - 1].id;
      }
    }

    results.stripePayments = allPayments.length;

    if (allPayments.length === 0) {
      logger.info('[Reconciliation Cron] No payments found in period');
      return NextResponse.json({
        success: true,
        message: 'No payments to reconcile',
        results,
        duration: Date.now() - startTime,
      });
    }

    // Check which ones we already have
    const piIds = allPayments.map(pi => pi.id);
    const existingReconciliations = await prisma.paymentReconciliation.findMany({
      where: { stripePaymentIntentId: { in: piIds } },
      select: { stripePaymentIntentId: true },
    });
    const processedIds = new Set(
      existingReconciliations.map((r: any) => r.stripePaymentIntentId)
    );

    // Also check invoices that might have been created without reconciliation records
    const existingPayments = await prisma.payment.findMany({
      where: { stripePaymentIntentId: { in: piIds } },
      select: { stripePaymentIntentId: true },
    });
    existingPayments.forEach((p: any) => {
      if (p.stripePaymentIntentId) {
        processedIds.add(p.stripePaymentIntentId);
      }
    });

    results.alreadyProcessed = processedIds.size;

    // Process missing payments
    const missingPayments = allPayments.filter(pi => !processedIds.has(pi.id));

    logger.info('[Reconciliation Cron] Found missing payments', {
      total: allPayments.length,
      alreadyProcessed: processedIds.size,
      missing: missingPayments.length,
    });

    for (const pi of missingPayments) {
      try {
        // Skip if it has an invoice (handled by invoice.payment_succeeded)
        if ((pi as any).invoice) {
          continue;
        }

        const paymentData = extractPaymentDataFromPaymentIntent(pi);
        const result = await processStripePayment(
          paymentData,
          `cron_${pi.id}_${Date.now()}`,
          'payment_intent.succeeded'
        );

        if (result.success) {
          results.newlyProcessed++;
          logger.info('[Reconciliation Cron] Processed missing payment', {
            paymentIntentId: pi.id,
            patientId: result.patient?.id,
            invoiceId: result.invoice?.id,
            amount: pi.amount,
          });
        } else {
          results.failed++;
          results.errors.push(`${pi.id}: ${result.error}`);
          logger.error('[Reconciliation Cron] Failed to process payment', {
            paymentIntentId: pi.id,
            error: result.error,
          });
        }
      } catch (error) {
        results.failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.errors.push(`${pi.id}: ${errorMessage}`);
        logger.error('[Reconciliation Cron] Error processing payment', {
          paymentIntentId: pi.id,
          error: errorMessage,
        });
      }
    }

    const duration = Date.now() - startTime;

    // Alert if there were any failures
    if (results.failed > 0) {
      await alertReconciliationFailures(results);
    }

    logger.info('[Reconciliation Cron] Completed', {
      ...results,
      duration,
    });

    return NextResponse.json({
      success: true,
      message: `Reconciled ${results.newlyProcessed} payments, ${results.failed} failures`,
      results,
      duration,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Reconciliation Cron] Fatal error', { error: errorMessage });

    // Try to alert
    try {
      await alertReconciliationFailures({
        ...results,
        errors: [`Fatal error: ${errorMessage}`],
      });
    } catch (error: unknown) {
      // Ignore alert errors
      logger.warn('[Reconciliation Cron] Alert failed', { error: error instanceof Error ? error.message : 'Unknown error' });
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        results,
        duration: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}

// Also support POST for manual triggers
export async function POST(req: NextRequest) {
  return GET(req);
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
    errors: results.errors.slice(0, 10), // First 10 errors
    timestamp: new Date().toISOString(),
    actionRequired: 'Review failed payments in Admin > Payment Reconciliation',
  };

  logger.error('[Reconciliation Alert] Payment reconciliation issues', alertPayload);

  // Optional: Send to external alerting
  try {
    const alertWebhookUrl = process.env.PAYMENT_ALERT_WEBHOOK_URL;
    if (alertWebhookUrl) {
      await fetch(alertWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alertPayload),
      });
    }
  } catch (error: unknown) {
    // Ignore external webhook errors
    logger.warn('[Reconciliation Alert] External webhook failed', { error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
