/**
 * Historical Stripe Payment Sync API
 * ====================================
 *
 * POST /api/finance/sync-payments
 *
 * Phase 1: For each Stripe payment, check if a PAID Invoice exists. If not,
 *          process the payment through the normal pipeline.
 * Phase 2: For payments that DO have Payment records but missing/broken
 *          Invoice records, repair them directly.
 * Phase 3: Sync Stripe invoices (subscription payments).
 * Phase 4: Sync direct charges without payment intents.
 *
 * Body: { sinceDate: "2026-02-01" }
 *
 * maxDuration raised to 300s because this sync can take several minutes
 * when processing large date ranges across multiple Stripe API calls.
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

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

  const results = {
    stripePaymentsFound: 0,
    newlyProcessed: 0,
    repaired: 0,
    alreadyCorrect: 0,
    failed: 0,
    skipped: 0,
    invoiceSyncCount: 0,
    directChargeCount: 0,
    errors: [] as string[],
    dateRange: { from: sinceDate.toISOString(), to: new Date().toISOString() },
    durationMs: 0,
  };

  try {
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { subdomain: true, name: true },
    });

    const stripe = getStripeClientForClinic(clinic?.subdomain || null);

    logger.info('[Payment Sync] Starting historical sync v2', {
      clinicId,
      clinicSubdomain: clinic?.subdomain,
      sinceDate: sinceDate.toISOString(),
      userId: user.id,
    });

    // ========================================================================
    // PHASE 1: Fetch ALL successful payment intents from Stripe
    // ========================================================================
    const sinceTimestamp = Math.floor(sinceDate.getTime() / 1000);
    const allPayments: Stripe.PaymentIntent[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const page = await stripe.paymentIntents.list({
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

    logger.info('[Payment Sync] Found Stripe payments', {
      count: allPayments.length,
      clinicId,
    });

    const {
      processStripePayment,
      extractPaymentDataFromPaymentIntent,
    } = await import('@/services/stripe/paymentMatchingService');

    // ========================================================================
    // PHASE 2: For EACH Stripe payment, ensure a PAID Invoice exists
    // ========================================================================
    const CHUNK_SIZE = 50;

    for (let i = 0; i < allPayments.length; i += CHUNK_SIZE) {
      const chunk = allPayments.slice(i, i + CHUNK_SIZE);
      const piIds = chunk.map((pi) => pi.id);

      // Fetch existing Payment records that are linked to these payment intents
      const existingPayments = await prisma.payment.findMany({
        where: { stripePaymentIntentId: { in: piIds } },
        select: {
          stripePaymentIntentId: true,
          invoiceId: true,
          amount: true,
          invoice: {
            select: {
              id: true,
              status: true,
              amountPaid: true,
              paidAt: true,
              clinicId: true,
            },
          },
        },
      });

      const paymentByPiId = new Map(
        existingPayments
          .filter((p) => p.stripePaymentIntentId)
          .map((p) => [p.stripePaymentIntentId!, p])
      );

      for (const pi of chunk) {
        const piWithInvoice = pi as Stripe.PaymentIntent & { invoice?: string | null };
        if (piWithInvoice.invoice) {
          results.skipped++;
          continue;
        }

        const existingPayment = paymentByPiId.get(pi.id);

        if (existingPayment) {
          // Payment record exists. Check if it has a valid PAID Invoice.
          const inv = existingPayment.invoice;
          if (inv && inv.status === 'PAID' && inv.amountPaid > 0 && inv.paidAt && inv.clinicId === clinicId) {
            results.alreadyCorrect++;
            continue;
          }

          // Repair: Invoice is missing, wrong status, zero amount, or wrong clinic
          try {
            if (inv && inv.id) {
              // Invoice exists but has issues — update it
              await prisma.invoice.update({
                where: { id: inv.id },
                data: {
                  status: 'PAID',
                  amountPaid: pi.amount,
                  amount: pi.amount,
                  amountDue: 0,
                  clinicId,
                  paidAt: new Date(pi.created * 1000),
                },
              });
              results.repaired++;
              logger.info('[Payment Sync] Repaired invoice', {
                invoiceId: inv.id,
                paymentIntentId: pi.id,
                oldStatus: inv.status,
                oldAmount: inv.amountPaid,
                newAmount: pi.amount,
              });
            } else {
              // Payment exists but no invoice linked — create one
              const paidAt = new Date(pi.created * 1000);
              const description = pi.description || 'Payment received via Stripe';

              const newInvoice = await prisma.$transaction(async (tx) => {
                // Find the patient from the Payment record
                const fullPayment = await tx.payment.findFirst({
                  where: { stripePaymentIntentId: pi.id },
                  select: { id: true, patientId: true },
                });

                if (!fullPayment) return null;

                const created = await tx.invoice.create({
                  data: {
                    patientId: fullPayment.patientId,
                    clinicId,
                    description,
                    amount: pi.amount,
                    amountDue: 0,
                    amountPaid: pi.amount,
                    currency: pi.currency || 'usd',
                    status: 'PAID',
                    paidAt,
                    lineItems: [{ description, amount: pi.amount, quantity: 1 }] as any,
                    metadata: {
                      source: 'payment_sync_repair',
                      paymentIntentId: pi.id,
                    } as any,
                  },
                });

                // Link invoice to payment
                await tx.payment.update({
                  where: { id: fullPayment.id },
                  data: { invoiceId: created.id },
                });

                return created;
              });

              if (newInvoice) {
                results.repaired++;
                logger.info('[Payment Sync] Created missing invoice for existing payment', {
                  invoiceId: newInvoice.id,
                  paymentIntentId: pi.id,
                  amount: pi.amount,
                });
              } else {
                results.failed++;
                results.errors.push(`${pi.id}: Payment exists but patient not found`);
              }
            }
          } catch (error) {
            results.failed++;
            const msg = error instanceof Error ? error.message : 'Unknown';
            results.errors.push(`repair ${pi.id}: ${msg}`);
          }
        } else {
          // No Payment record at all — check reconciliation
          const existingRecon = await prisma.paymentReconciliation.findFirst({
            where: { stripePaymentIntentId: pi.id },
            select: { id: true, invoiceId: true, patientId: true, status: true },
          });

          if (existingRecon?.invoiceId) {
            // Has recon with an invoice, check invoice is PAID
            const reconInvoice = await prisma.invoice.findUnique({
              where: { id: existingRecon.invoiceId },
              select: { id: true, status: true, amountPaid: true, clinicId: true },
            });

            if (reconInvoice && reconInvoice.status === 'PAID' && reconInvoice.amountPaid > 0 && reconInvoice.clinicId === clinicId) {
              results.alreadyCorrect++;
              continue;
            }

            if (reconInvoice) {
              // Repair the invoice
              await prisma.invoice.update({
                where: { id: reconInvoice.id },
                data: {
                  status: 'PAID',
                  amountPaid: pi.amount,
                  amount: pi.amount,
                  amountDue: 0,
                  clinicId,
                  paidAt: new Date(pi.created * 1000),
                },
              });
              results.repaired++;
              continue;
            }
          }

          // Fully new — process from scratch
          try {
            const paymentResult = await runWithClinicContext(clinicId, async () => {
              const paymentData = await extractPaymentDataFromPaymentIntent(pi);
              paymentData.metadata = {
                ...paymentData.metadata,
                clinicId: clinicId.toString(),
                sync_source: 'historical_sync_v2',
              };

              return processStripePayment(
                paymentData,
                `sync_${pi.id}_${Date.now()}`,
                'payment_intent.succeeded'
              );
            });

            if (paymentResult.success) {
              results.newlyProcessed++;
              logger.info('[Payment Sync] Processed new payment', {
                paymentIntentId: pi.id,
                patientId: paymentResult.patient?.id,
                invoiceId: paymentResult.invoice?.id,
                amount: pi.amount,
              });
            } else {
              results.failed++;
              results.errors.push(`${pi.id}: ${paymentResult.error || 'Unknown'}`);
            }
          } catch (error) {
            results.failed++;
            const msg = error instanceof Error ? error.message : 'Unknown';
            results.errors.push(`${pi.id}: ${msg}`);
          }
        }
      }
    }

    // ========================================================================
    // PHASE 3: Sync Stripe invoices (subscription payments)
    // ========================================================================
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
          if (existingInvoice.status !== 'PAID' || existingInvoice.amountPaid === 0) {
            await prisma.invoice.update({
              where: { id: existingInvoice.id },
              data: {
                status: 'PAID',
                amountPaid: stripeInvoice.amount_paid,
                amountDue: stripeInvoice.amount_due,
                paidAt: stripeInvoice.status_transitions?.paid_at
                  ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
                  : new Date(),
              },
            });
            results.invoiceSyncCount++;
          }
          continue;
        }

        // Invoice not in DB — process its payment intent
        const paymentIntentId =
          typeof (stripeInvoice as any).payment_intent === 'string'
            ? (stripeInvoice as any).payment_intent
            : ((stripeInvoice as any).payment_intent as Stripe.PaymentIntent | null)?.id;

        if (!paymentIntentId) continue;

        try {
          const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
          if (pi.status !== 'succeeded') continue;

          await runWithClinicContext(clinicId, async () => {
            const paymentData = await extractPaymentDataFromPaymentIntent(pi);
            paymentData.metadata = {
              ...paymentData.metadata,
              clinicId: clinicId.toString(),
              sync_source: 'historical_invoice_sync_v2',
            };
            paymentData.stripeInvoiceId = stripeInvoice.id;

            const result = await processStripePayment(
              paymentData,
              `sync_inv_${stripeInvoice.id}_${Date.now()}`,
              'invoice.payment_succeeded'
            );

            if (result.success) {
              results.invoiceSyncCount++;
              if (result.invoice?.id) {
                await prisma.invoice.update({
                  where: { id: result.invoice.id },
                  data: {
                    stripeInvoiceId: stripeInvoice.id,
                    paidAt: stripeInvoice.status_transitions?.paid_at
                      ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
                      : new Date(),
                  },
                });
              }
            }
          });
        } catch {
          // Non-critical
        }
      }
    } catch (error) {
      logger.warn('[Payment Sync] Invoice phase error', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }

    // ========================================================================
    // PHASE 4: Direct charges without payment intents
    // ========================================================================
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

        const standalone = chargePage.data.filter(
          (c) => c.status === 'succeeded' && !c.payment_intent && !(c as any).invoice
        );
        allCharges.push(...standalone);

        chargeHasMore = chargePage.has_more;
        if (chargePage.data.length > 0) {
          chargeStartingAfter = chargePage.data[chargePage.data.length - 1].id;
        }
      }

      const { extractPaymentDataFromCharge } = await import(
        '@/services/stripe/paymentMatchingService'
      );

      for (const charge of allCharges) {
        const existingByCharge = await prisma.payment.findFirst({
          where: { stripeChargeId: charge.id },
          select: { id: true, invoiceId: true, invoice: { select: { status: true, amountPaid: true } } },
        });

        if (existingByCharge?.invoice?.status === 'PAID' && (existingByCharge.invoice.amountPaid || 0) > 0) {
          continue;
        }

        if (existingByCharge && !existingByCharge.invoice) {
          // Has payment but no invoice — create one
          try {
            const fullPay = await prisma.payment.findUnique({
              where: { id: existingByCharge.id },
              select: { patientId: true, amount: true },
            });
            if (fullPay) {
              const inv = await prisma.invoice.create({
                data: {
                  patientId: fullPay.patientId,
                  clinicId,
                  description: charge.description || 'Charge via Stripe',
                  amount: charge.amount,
                  amountDue: 0,
                  amountPaid: charge.amount,
                  currency: charge.currency || 'usd',
                  status: 'PAID',
                  paidAt: new Date(charge.created * 1000),
                  metadata: { source: 'charge_sync_repair', chargeId: charge.id } as any,
                },
              });
              await prisma.payment.update({
                where: { id: existingByCharge.id },
                data: { invoiceId: inv.id },
              });
              results.directChargeCount++;
            }
          } catch {
            // Non-critical
          }
          continue;
        }

        if (existingByCharge) continue;

        const existingRecon = await prisma.paymentReconciliation.findFirst({
          where: { stripeChargeId: charge.id },
        });
        if (existingRecon) continue;

        try {
          await runWithClinicContext(clinicId, async () => {
            const chargeData = extractPaymentDataFromCharge(charge);
            chargeData.metadata = {
              ...chargeData.metadata,
              clinicId: clinicId.toString(),
              sync_source: 'historical_charge_sync_v2',
            };

            const result = await processStripePayment(
              chargeData,
              `sync_ch_${charge.id}_${Date.now()}`,
              'charge.succeeded'
            );

            if (result.success) results.directChargeCount++;
          });
        } catch {
          // Non-critical
        }
      }
    } catch (error) {
      logger.warn('[Payment Sync] Charge phase error', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }

    // ========================================================================
    // PHASE 5: Final pass — find Payment records with no Invoice at all
    // ========================================================================
    let orphanRepairCount = 0;
    try {
      const orphanPayments = await prisma.payment.findMany({
        where: {
          clinicId,
          invoiceId: null,
          status: 'SUCCEEDED',
          createdAt: { gte: sinceDate },
        },
        select: { id: true, patientId: true, amount: true, stripePaymentIntentId: true, stripeChargeId: true, paidAt: true, description: true, currency: true },
        take: 500,
      });

      for (const orphan of orphanPayments) {
        try {
          const inv = await prisma.invoice.create({
            data: {
              patientId: orphan.patientId,
              clinicId,
              description: orphan.description || 'Payment received via Stripe',
              amount: orphan.amount,
              amountDue: 0,
              amountPaid: orphan.amount,
              currency: orphan.currency || 'usd',
              status: 'PAID',
              paidAt: orphan.paidAt || new Date(),
              metadata: {
                source: 'orphan_payment_repair',
                paymentIntentId: orphan.stripePaymentIntentId,
                chargeId: orphan.stripeChargeId,
              } as any,
            },
          });

          await prisma.payment.update({
            where: { id: orphan.id },
            data: { invoiceId: inv.id },
          });

          orphanRepairCount++;
        } catch {
          // Non-critical
        }
      }
    } catch (error) {
      logger.warn('[Payment Sync] Orphan repair phase error', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }

    results.repaired += orphanRepairCount;
    results.durationMs = Date.now() - startTime;

    const totalFixed = results.newlyProcessed + results.repaired + results.invoiceSyncCount + results.directChargeCount;

    logger.info('[Payment Sync] Completed v2', { clinicId, ...results, orphanRepairCount, totalFixed });

    if (results.errors.length > 10) {
      results.errors = [
        ...results.errors.slice(0, 10),
        `... and ${results.errors.length - 10} more errors`,
      ];
    }

    return NextResponse.json({
      success: true,
      message: `Fixed ${totalFixed} records. New: ${results.newlyProcessed}, Repaired: ${results.repaired}, Invoices: ${results.invoiceSyncCount}, Charges: ${results.directChargeCount}. Already correct: ${results.alreadyCorrect}, Failed: ${results.failed}.`,
      results: {
        ...results,
        orphanRepairCount,
        totalFixed,
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
