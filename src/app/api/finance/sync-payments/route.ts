/**
 * Historical Stripe Payment Sync API
 * ====================================
 *
 * POST /api/finance/sync-payments
 *
 * Syncs all successful payments from Stripe since a given date.
 * This fills gaps where webhooks were missed and the 48-hour
 * reconciliation cron didn't catch them.
 *
 * Body: { sinceDate: "2026-02-01" }
 *
 * Uses the OT Stripe account when accessed via ot.eonpro.io subdomain,
 * otherwise uses the default (EonMeds) account.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth, type AuthUser } from '@/lib/auth/middleware';
import { prisma, runWithClinicContext } from '@/lib/db';
import { logger } from '@/lib/logger';
import { OT_STRIPE_CONFIG } from '@/lib/stripe/config';
import Stripe from 'stripe';

const MAX_SYNC_DAYS = 90;
const BATCH_SIZE = 100;

function getStripeClientForClinic(clinicSubdomain: string | null): Stripe {
  if (clinicSubdomain === 'ot') {
    const secretKey = OT_STRIPE_CONFIG.secretKey;
    if (!secretKey) throw new Error('OT_STRIPE_SECRET_KEY not configured');
    return new Stripe(secretKey, {
      apiVersion: '2026-01-28.clover',
      typescript: true,
      maxNetworkRetries: 3,
      timeout: 30000,
    });
  }

  const secretKey =
    process.env.EONMEDS_STRIPE_SECRET_KEY ||
    process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error('Stripe secret key not configured');
  return new Stripe(secretKey, {
    apiVersion: '2026-01-28.clover',
    typescript: true,
    maxNetworkRetries: 3,
    timeout: 30000,
  });
}

interface SyncResults {
  stripePaymentsFound: number;
  alreadyInDatabase: number;
  newlyProcessed: number;
  failed: number;
  skipped: number;
  errors: string[];
  dateRange: { from: string; to: string };
  durationMs: number;
}

async function handlePost(request: NextRequest, user: AuthUser) {
  const startTime = Date.now();
  const clinicId = user.clinicId;

  if (!clinicId) {
    return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
  }

  let sinceDate: Date;
  try {
    const body = await request.json();
    if (!body.sinceDate) {
      return NextResponse.json(
        { error: 'sinceDate is required (format: YYYY-MM-DD)' },
        { status: 400 }
      );
    }
    sinceDate = new Date(body.sinceDate + 'T00:00:00Z');
    if (isNaN(sinceDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body. Expected JSON with sinceDate' },
      { status: 400 }
    );
  }

  const daysDiff = Math.ceil((Date.now() - sinceDate.getTime()) / (1000 * 60 * 60 * 24));
  if (daysDiff > MAX_SYNC_DAYS) {
    return NextResponse.json(
      { error: `Cannot sync more than ${MAX_SYNC_DAYS} days at a time. Requested: ${daysDiff} days` },
      { status: 400 }
    );
  }

  if (sinceDate > new Date()) {
    return NextResponse.json(
      { error: 'sinceDate cannot be in the future' },
      { status: 400 }
    );
  }

  const results: SyncResults = {
    stripePaymentsFound: 0,
    alreadyInDatabase: 0,
    newlyProcessed: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    dateRange: { from: sinceDate.toISOString(), to: new Date().toISOString() },
    durationMs: 0,
  };

  try {
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { subdomain: true, name: true },
    });

    const stripe = getStripeClientForClinic(clinic?.subdomain || null);

    logger.info('[Payment Sync] Starting historical sync', {
      clinicId,
      clinicSubdomain: clinic?.subdomain,
      sinceDate: sinceDate.toISOString(),
      userId: user.id,
    });

    const sinceTimestamp = Math.floor(sinceDate.getTime() / 1000);
    const allPayments: Stripe.PaymentIntent[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const page: Stripe.ApiList<Stripe.PaymentIntent> = await stripe.paymentIntents.list({
        created: { gte: sinceTimestamp },
        limit: BATCH_SIZE,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });

      const succeeded = page.data.filter((pi) => pi.status === 'succeeded');
      allPayments.push(...succeeded);

      hasMore = page.has_more;
      if (page.data.length > 0) {
        startingAfter = page.data[page.data.length - 1].id;
      }
    }

    results.stripePaymentsFound = allPayments.length;

    if (allPayments.length === 0) {
      results.durationMs = Date.now() - startTime;
      return NextResponse.json({
        success: true,
        message: 'No successful payments found in Stripe for this period',
        results,
      });
    }

    logger.info('[Payment Sync] Found payments in Stripe', {
      count: allPayments.length,
      clinicId,
    });

    const {
      processStripePayment,
      extractPaymentDataFromPaymentIntent,
    } = await import('@/services/stripe/paymentMatchingService');

    const CHUNK_SIZE = 50;
    for (let i = 0; i < allPayments.length; i += CHUNK_SIZE) {
      const chunk = allPayments.slice(i, i + CHUNK_SIZE);
      const piIds = chunk.map((pi) => pi.id);

      const [existingReconciliations, existingPayments] = await Promise.all([
        prisma.paymentReconciliation.findMany({
          where: { stripePaymentIntentId: { in: piIds } },
          select: { stripePaymentIntentId: true },
        }),
        prisma.payment.findMany({
          where: { stripePaymentIntentId: { in: piIds } },
          select: { stripePaymentIntentId: true },
        }),
      ]);

      const processedIds = new Set([
        ...existingReconciliations.map((r) => r.stripePaymentIntentId).filter(Boolean),
        ...existingPayments.map((p) => p.stripePaymentIntentId).filter(Boolean),
      ]);

      for (const pi of chunk) {
        if (processedIds.has(pi.id)) {
          results.alreadyInDatabase++;
          continue;
        }

        const piWithInvoice = pi as Stripe.PaymentIntent & { invoice?: string | null };
        if (piWithInvoice.invoice) {
          results.skipped++;
          continue;
        }

        try {
          const paymentResult = await runWithClinicContext(clinicId, async () => {
            const paymentData = await extractPaymentDataFromPaymentIntent(pi);
            paymentData.metadata = {
              ...paymentData.metadata,
              clinicId: clinicId.toString(),
              sync_source: 'historical_sync',
              sync_date: new Date().toISOString(),
            };

            return processStripePayment(
              paymentData,
              `sync_${pi.id}_${Date.now()}`,
              'payment_intent.succeeded'
            );
          });

          if (paymentResult.success) {
            results.newlyProcessed++;
            logger.info('[Payment Sync] Processed missing payment', {
              paymentIntentId: pi.id,
              clinicId,
              patientId: paymentResult.patient?.id,
              invoiceId: paymentResult.invoice?.id,
              amount: pi.amount,
            });
          } else {
            results.failed++;
            results.errors.push(`${pi.id}: ${paymentResult.error || 'Unknown error'}`);
          }
        } catch (error) {
          results.failed++;
          const msg = error instanceof Error ? error.message : 'Unknown error';
          results.errors.push(`${pi.id}: ${msg}`);
          logger.error('[Payment Sync] Error processing payment', {
            paymentIntentId: pi.id,
            clinicId,
            error: msg,
          });
        }
      }
    }

    // Also sync Stripe invoices (subscription payments come through as invoices)
    let invoiceSyncCount = 0;
    try {
      const allInvoices: Stripe.Invoice[] = [];
      let invoiceHasMore = true;
      let invoiceStartingAfter: string | undefined;

      while (invoiceHasMore) {
        const invoicePage = await stripe.invoices.list({
          created: { gte: sinceTimestamp },
          status: 'paid',
          limit: BATCH_SIZE,
          ...(invoiceStartingAfter ? { starting_after: invoiceStartingAfter } : {}),
        });
        allInvoices.push(...invoicePage.data);
        invoiceHasMore = invoicePage.has_more;
        if (invoicePage.data.length > 0) {
          invoiceStartingAfter = invoicePage.data[invoicePage.data.length - 1].id;
        }
      }

      for (const stripeInvoice of allInvoices) {
        const existingInvoice = await prisma.invoice.findFirst({
          where: { stripeInvoiceId: stripeInvoice.id },
        });

        if (existingInvoice) {
          if (existingInvoice.status !== 'PAID' && stripeInvoice.status === 'paid') {
            await prisma.invoice.update({
              where: { id: existingInvoice.id },
              data: {
                status: 'PAID',
                amountPaid: stripeInvoice.amount_paid,
                amountDue: stripeInvoice.amount_due,
                paidAt: stripeInvoice.status_transitions?.paid_at
                  ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
                  : new Date(),
                stripeInvoiceUrl: stripeInvoice.hosted_invoice_url || undefined,
                stripePdfUrl: stripeInvoice.invoice_pdf || undefined,
              },
            });
            invoiceSyncCount++;
          }
          continue;
        }

        // Invoice not in DB -- process its payment intent if it has one
        const paymentIntentId =
          typeof stripeInvoice.payment_intent === 'string'
            ? stripeInvoice.payment_intent
            : (stripeInvoice.payment_intent as Stripe.PaymentIntent | null)?.id;

        if (!paymentIntentId) continue;

        const existingPI = await prisma.payment.findFirst({
          where: { stripePaymentIntentId: paymentIntentId },
        });
        if (existingPI) continue;

        try {
          const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
          if (pi.status !== 'succeeded') continue;

          await runWithClinicContext(clinicId, async () => {
            const paymentData = await extractPaymentDataFromPaymentIntent(pi);
            paymentData.metadata = {
              ...paymentData.metadata,
              clinicId: clinicId.toString(),
              sync_source: 'historical_invoice_sync',
            };
            paymentData.stripeInvoiceId = stripeInvoice.id;

            const result = await processStripePayment(
              paymentData,
              `sync_inv_${stripeInvoice.id}_${Date.now()}`,
              'invoice.payment_succeeded'
            );

            if (result.success) {
              invoiceSyncCount++;

              if (result.invoice?.id) {
                await prisma.invoice.update({
                  where: { id: result.invoice.id },
                  data: {
                    stripeInvoiceId: stripeInvoice.id,
                    stripeInvoiceUrl: stripeInvoice.hosted_invoice_url || undefined,
                    stripePdfUrl: stripeInvoice.invoice_pdf || undefined,
                    paidAt: stripeInvoice.status_transitions?.paid_at
                      ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
                      : new Date(),
                  },
                });
              }
            }
          });
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Unknown';
          logger.warn('[Payment Sync] Failed to sync invoice payment', {
            stripeInvoiceId: stripeInvoice.id,
            paymentIntentId,
            error: msg,
          });
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown';
      logger.warn('[Payment Sync] Invoice sync phase had errors', { error: msg });
    }

    results.durationMs = Date.now() - startTime;

    // Also sync charges that aren't tied to payment intents (direct charges)
    let directChargeCount = 0;
    try {
      const allCharges: Stripe.Charge[] = [];
      let chargeHasMore = true;
      let chargeStartingAfter: string | undefined;

      while (chargeHasMore) {
        const chargePage = await stripe.charges.list({
          created: { gte: sinceTimestamp },
          limit: BATCH_SIZE,
          ...(chargeStartingAfter ? { starting_after: chargeStartingAfter } : {}),
        });

        const succeeded = chargePage.data.filter(
          (c) => c.status === 'succeeded' && !c.payment_intent && !c.invoice
        );
        allCharges.push(...succeeded);

        chargeHasMore = chargePage.has_more;
        if (chargePage.data.length > 0) {
          chargeStartingAfter = chargePage.data[chargePage.data.length - 1].id;
        }
      }

      const { extractPaymentDataFromCharge } = await import(
        '@/services/stripe/paymentMatchingService'
      );

      for (const charge of allCharges) {
        const existingByCharge = await prisma.paymentReconciliation.findFirst({
          where: { stripeChargeId: charge.id },
        });
        if (existingByCharge) continue;

        const existingCharge = await prisma.payment.findFirst({
          where: { stripeChargeId: charge.id },
        });
        if (existingCharge) continue;

        try {
          await runWithClinicContext(clinicId, async () => {
            const chargeData = extractPaymentDataFromCharge(charge);
            chargeData.metadata = {
              ...chargeData.metadata,
              clinicId: clinicId.toString(),
              sync_source: 'historical_charge_sync',
            };

            const result = await processStripePayment(
              chargeData,
              `sync_ch_${charge.id}_${Date.now()}`,
              'charge.succeeded'
            );

            if (result.success) directChargeCount++;
          });
        } catch {
          // Non-critical, continue
        }
      }
    } catch (error) {
      logger.warn('[Payment Sync] Direct charge sync had errors', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }

    results.durationMs = Date.now() - startTime;

    const totalSynced = results.newlyProcessed + invoiceSyncCount + directChargeCount;

    logger.info('[Payment Sync] Completed', {
      clinicId,
      ...results,
      invoiceSyncCount,
      directChargeCount,
      totalSynced,
    });

    if (results.errors.length > 10) {
      results.errors = [
        ...results.errors.slice(0, 10),
        `... and ${results.errors.length - 10} more errors`,
      ];
    }

    return NextResponse.json({
      success: true,
      message: `Synced ${totalSynced} payments from Stripe (${results.newlyProcessed} payment intents, ${invoiceSyncCount} invoices, ${directChargeCount} direct charges). ${results.alreadyInDatabase} already in database, ${results.failed} failed.`,
      results: {
        ...results,
        invoiceSyncCount,
        directChargeCount,
        totalSynced,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Payment Sync] Fatal error', { clinicId, error: msg });
    return NextResponse.json(
      { error: `Sync failed: ${msg}`, results: { ...results, durationMs: Date.now() - startTime } },
      { status: 500 }
    );
  }
}

export const POST = withAdminAuth(handlePost);
