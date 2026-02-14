/**
 * Payment Reconciliation Admin API
 * =================================
 *
 * CRITICAL: This API is for monitoring and managing payment-to-invoice matching.
 * Missed payments = missed prescriptions.
 *
 * GET  - List failed/pending reconciliation records
 * POST - Retry failed payment processing
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { AGGREGATION_TAKE } from '@/lib/pagination';
import { decryptPatientPHI } from '@/lib/security/phi-encryption';

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.success || !auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!['admin', 'super_admin'].includes(auth.user.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status'); // PENDING, FAILED, MATCHED, CREATED
    const days = parseInt(searchParams.get('days') || '7', 10);

    const since = new Date();
    since.setDate(since.getDate() - days);

    // Get reconciliation records
    const where: any = {
      createdAt: { gte: since },
    };
    if (status) {
      where.status = status;
    }

    const [reconciliations, stats, failedWebhooks] = await Promise.all([
      prisma.paymentReconciliation.findMany({
        where,
        include: {
          patient: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          invoice: {
            select: { id: true, amount: true, status: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      // Get summary stats
      prisma.paymentReconciliation.groupBy({
        by: ['status'],
        where: { createdAt: { gte: since } },
        _count: true,
        _sum: { amount: true },
      }),
      // Get failed webhook logs (ERROR, INVALID_AUTH, INVALID_PAYLOAD, PROCESSING_ERROR)
      prisma.webhookLog.findMany({
        where: {
          source: 'stripe',
          status: { in: ['ERROR', 'INVALID_AUTH', 'INVALID_PAYLOAD', 'PROCESSING_ERROR'] },
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    // Calculate totals
    const summary = {
      total: reconciliations.length,
      byStatus: Object.fromEntries(
        stats.map((s: any) => [s.status, { count: s._count, amount: s._sum.amount }])
      ),
      failedWebhooks: failedWebhooks.length,
      period: `Last ${days} days`,
    };

    const formatReconciliation = (r: (typeof reconciliations)[number]) => {
      let patient = r.patient;
      if (patient) {
        try {
          patient = decryptPatientPHI(patient as Record<string, unknown>, [
            'firstName',
            'lastName',
            'email',
          ]) as typeof patient;
        } catch (decryptErr) {
          logger.warn('[Payment Reconciliation] Failed to decrypt patient PHI', {
            patientId: patient.id,
            error: decryptErr instanceof Error ? decryptErr.message : String(decryptErr),
          });
        }
      }
      return {
        id: r.id,
        createdAt: r.createdAt,
        status: r.status,
        stripeEventId: r.stripeEventId,
        stripeEventType: r.stripeEventType,
        stripePaymentIntentId: r.stripePaymentIntentId,
        stripeChargeId: r.stripeChargeId,
        stripeCustomerId: r.stripeCustomerId,
        amount: r.amount,
        currency: r.currency,
        customerEmail: r.customerEmail,
        customerName: r.customerName,
        matchedBy: r.matchedBy,
        matchConfidence: r.matchConfidence,
        patientCreated: r.patientCreated,
        patient,
        invoice: r.invoice,
        errorMessage: r.errorMessage,
        processedAt: r.processedAt,
      };
    };

    return NextResponse.json({
      success: true,
      summary,
      reconciliations: reconciliations.map(formatReconciliation),
      failedWebhooks: failedWebhooks.map((w: any) => ({
        id: w.id,
        eventId: w.eventId,
        eventType: w.eventType,
        errorMessage: w.errorMessage,
        retryCount: w.retryCount,
        createdAt: w.createdAt,
      })),
    });
  } catch (error) {
    logger.error('[Payment Reconciliation] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch reconciliation data' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.success || !auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!['admin', 'super_admin'].includes(auth.user.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { action, webhookLogId, reconciliationId } = body;

    if (action === 'retry_webhook') {
      // Retry a failed webhook
      if (!webhookLogId) {
        return NextResponse.json({ error: 'webhookLogId required' }, { status: 400 });
      }

      const webhookLog = await prisma.webhookLog.findUnique({
        where: { id: webhookLogId },
      });

      if (!webhookLog) {
        return NextResponse.json({ error: 'Webhook log not found' }, { status: 404 });
      }

      if (!webhookLog.payload) {
        return NextResponse.json({ error: 'No payload to retry' }, { status: 400 });
      }

      // Re-process the payment
      const {
        processStripePayment,
        extractPaymentDataFromCharge,
        extractPaymentDataFromPaymentIntent,
        extractPaymentDataFromCheckoutSession,
      } = await import('@/services/stripe/paymentMatchingService');

      const payload = webhookLog.payload as any;
      const eventType = webhookLog.eventType || '';
      const eventData = payload.data?.object || payload;

      let paymentData;
      if (eventType.includes('payment_intent')) {
        paymentData = await extractPaymentDataFromPaymentIntent(eventData);
      } else if (eventType.includes('charge')) {
        paymentData = extractPaymentDataFromCharge(eventData);
      } else if (eventType.includes('checkout')) {
        paymentData = extractPaymentDataFromCheckoutSession(eventData);
      } else {
        return NextResponse.json({ error: 'Unknown event type for retry' }, { status: 400 });
      }

      const result = await processStripePayment(
        paymentData,
        `retry_${webhookLog.eventId}_${Date.now()}`,
        eventType
      );

      // Update webhook log
      await prisma.webhookLog.update({
        where: { id: webhookLogId },
        data: {
          retryCount: { increment: 1 },
          lastRetryAt: new Date(),
          status: result.success ? 'SUCCESS' : 'ERROR',
          processedAt: result.success ? new Date() : null,
          errorMessage: result.error || null,
        },
      });

      logger.info('[Payment Reconciliation] Retried webhook', {
        webhookLogId,
        success: result.success,
        user: auth.user.email,
      });

      return NextResponse.json({
        success: result.success,
        result: {
          patientId: result.patient?.id,
          invoiceId: result.invoice?.id,
          patientCreated: result.patientCreated,
          matchedBy: result.matchResult.matchedBy,
          error: result.error,
        },
      });
    }

    if (action === 'mark_resolved') {
      // Mark a failed reconciliation as manually resolved
      if (!reconciliationId) {
        return NextResponse.json({ error: 'reconciliationId required' }, { status: 400 });
      }

      await prisma.paymentReconciliation.update({
        where: { id: reconciliationId },
        data: {
          status: 'SKIPPED',
          errorMessage: `Manually marked as resolved by ${auth.user.email} at ${new Date().toISOString()}`,
          processedAt: new Date(),
        },
      });

      logger.info('[Payment Reconciliation] Marked as resolved', {
        reconciliationId,
        user: auth.user.email,
      });

      return NextResponse.json({ success: true });
    }

    if (action === 'fetch_stripe_payments') {
      // Fetch recent payments directly from Stripe for manual reconciliation
      const { getStripe } = await import('@/lib/stripe');
      const stripe = getStripe();

      const days = body.days ?? 7;
      const limit = Math.min(body.limit ?? 100, 500);
      const since = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;

      const paymentIntents = await stripe.paymentIntents.list({
        created: { gte: since },
        limit,
      });

      const successfulPayments = paymentIntents.data.filter((pi) => pi.status === 'succeeded');

      // Check which ones we have records for
      const piIds = successfulPayments.map((pi) => pi.id);
      const existingRecords = await prisma.paymentReconciliation.findMany({
        where: { stripePaymentIntentId: { in: piIds } },
        select: { stripePaymentIntentId: true },
        take: AGGREGATION_TAKE,
      });
      const processedIds = new Set(existingRecords.map((r: any) => r.stripePaymentIntentId));

      const missingPayments = successfulPayments.filter((pi) => !processedIds.has(pi.id));

      return NextResponse.json({
        success: true,
        total: successfulPayments.length,
        processed: existingRecords.length,
        missing: missingPayments.length,
        hasMore: !!paymentIntents.has_more,
        missingPayments: missingPayments.map((pi) => ({
          id: pi.id,
          amount: pi.amount,
          currency: pi.currency,
          created: new Date(pi.created * 1000).toISOString(),
          customerEmail: (pi as any).receipt_email,
          customerId: typeof pi.customer === 'string' ? pi.customer : pi.customer?.id,
          description: pi.description,
        })),
      });
    }

    if (action === 'sync_from_stripe') {
      // Bulk sync missing Stripe payments into the platform (for EonMeds 10k+ backlog)
      const { getStripe } = await import('@/lib/stripe');
      const stripe = getStripe();
      const {
        processStripePayment,
        extractPaymentDataFromPaymentIntent,
      } = await import('@/services/stripe/paymentMatchingService');

      const days = body.days ?? 30;
      const batchSize = Math.min(body.batchSize ?? 50, 100);
      const clinicId =
        body.clinicId ?? parseInt(process.env.DEFAULT_CLINIC_ID || '0', 10);
      const endingBefore = body.endingBefore as string | undefined;
      if (!clinicId) {
        return NextResponse.json(
          { error: 'clinicId or DEFAULT_CLINIC_ID required for sync' },
          { status: 400 }
        );
      }

      const since = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
      const listParams: Record<string, unknown> = {
        created: { gte: since },
        limit: Math.min(batchSize * 4, 500),
      };
      if (endingBefore) listParams.ending_before = endingBefore;

      const paymentIntents = await stripe.paymentIntents.list(listParams as any);
      const successful = paymentIntents.data.filter((pi) => pi.status === 'succeeded');
      const piIds = successful.map((pi) => pi.id);
      const existing = await prisma.paymentReconciliation.findMany({
        where: { stripePaymentIntentId: { in: piIds } },
        select: { stripePaymentIntentId: true },
      });
      const processedIds = new Set(existing.map((r: any) => r.stripePaymentIntentId));
      const toProcess = successful.filter((pi) => !processedIds.has(pi.id)).slice(0, batchSize);

      const results: { id: string; success: boolean; error?: string }[] = [];
      for (const pi of toProcess) {
        try {
          const paymentData = await extractPaymentDataFromPaymentIntent(pi);
          if (!paymentData.metadata?.clinicId) {
            paymentData.metadata = { ...paymentData.metadata, clinicId: String(clinicId) };
          }
          const result = await processStripePayment(
            paymentData,
            `sync_${pi.id}_${Date.now()}`,
            'payment_intent.succeeded'
          );
          results.push({ id: pi.id, success: result.success, error: result.error ?? undefined });
        } catch (err) {
          results.push({
            id: pi.id,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const processed = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success);

      logger.info('[Payment Reconciliation] Stripe sync completed', {
        days,
        batchSize,
        clinicId,
        processed,
        failed: failed.length,
        user: auth.user.email,
      });

      const oldestInBatch =
        paymentIntents.data.length > 0
          ? paymentIntents.data[paymentIntents.data.length - 1].id
          : null;

      return NextResponse.json({
        success: true,
        syncSummary: {
          processed,
          failed: failed.length,
          total: toProcess.length,
          hasMore: paymentIntents.has_more,
          missingInBatch: successful.filter((pi) => !processedIds.has(pi.id)).length,
          endingBefore: oldestInBatch,
        },
        results: failed.length > 0 ? failed : undefined,
      });
    }

    if (action === 'process_missing_payment') {
      // Manually process a payment that was missed
      const { paymentIntentId, clinicId: overrideClinicId } = body;
      if (!paymentIntentId) {
        return NextResponse.json({ error: 'paymentIntentId required' }, { status: 400 });
      }

      const { getStripe } = await import('@/lib/stripe');
      const stripe = getStripe();

      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      if (paymentIntent.status !== 'succeeded') {
        return NextResponse.json({ error: 'Payment not succeeded' }, { status: 400 });
      }

      const { processStripePayment, extractPaymentDataFromPaymentIntent } =
        await import('@/services/stripe/paymentMatchingService');

      const paymentData = await extractPaymentDataFromPaymentIntent(paymentIntent);
      // Inject clinicId when missing (EonMeds/IntakeQ payments from Payment Links lack metadata)
      const fallbackClinicId =
        overrideClinicId ??
        parseInt(process.env.DEFAULT_CLINIC_ID || '0', 10);
      if (fallbackClinicId > 0 && !paymentData.metadata?.clinicId) {
        paymentData.metadata = { ...paymentData.metadata, clinicId: String(fallbackClinicId) };
      }
      const result = await processStripePayment(
        paymentData,
        `manual_${paymentIntentId}_${Date.now()}`,
        'payment_intent.succeeded'
      );

      logger.info('[Payment Reconciliation] Manually processed payment', {
        paymentIntentId,
        success: result.success,
        user: auth.user.email,
      });

      return NextResponse.json({
        success: result.success,
        result: {
          patientId: result.patient?.id,
          invoiceId: result.invoice?.id,
          patientCreated: result.patientCreated,
          matchedBy: result.matchResult.matchedBy,
          error: result.error,
        },
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    logger.error('[Payment Reconciliation] POST error:', error);
    return NextResponse.json(
      { error: 'Operation failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
