#!/usr/bin/env tsx
/**
 * Remediate OT Pending Payment — Sermorelin 6-Month (Connor Mccoy)
 *
 * Fixes the following data issues caused by the OT webhook not calling
 * updatePaymentFromIntent for Process Payment form payments:
 *
 *   1. Payment stuck at PENDING → update to SUCCEEDED
 *   2. Invoice subtotal/amountDue wrong → fix to match amountPaid
 *   3. No local Subscription record → create one
 *   4. No Stripe Subscription → create one with trial_end so initial charge isn't repeated
 *
 * Known Stripe IDs:
 *   PaymentIntent:  pi_3TKj2ADQIH4O9Fhr0uc5owBz
 *   Customer:       cus_UJKnc7pVNSHAXN
 *   PaymentMethod:  pm_1TKi87DQIH4O9FhroucTZM3g
 *   Price (SERMO6): price_1TExOFDQIH4O9FhrCbcFanE6
 *
 * Usage:
 *   # Dry run (preview)
 *   npx tsx scripts/remediate-ot-pending-payment.ts
 *
 *   # Execute
 *   npx tsx scripts/remediate-ot-pending-payment.ts --execute
 */

import * as dotenv from 'dotenv';
import { prisma, withoutClinicFilter } from '../src/lib/db';
import { OT_STRIPE_CONFIG } from '../src/lib/stripe/config';
import Stripe from 'stripe';

dotenv.config({ path: '.env.production.local' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const STRIPE_PAYMENT_INTENT_ID = 'pi_3TKj2ADQIH4O9Fhr0uc5owBz';
const STRIPE_CUSTOMER_ID = 'cus_UJKnc7pVNSHAXN';
const STRIPE_PAYMENT_METHOD_ID = 'pm_1TKi87DQIH4O9FhroucTZM3g';
const STRIPE_PRICE_ID = 'price_1TExOFDQIH4O9FhrCbcFanE6';
const PLAN_ID = 'ot_sermorelin_6mo';
const PLAN_NAME = 'Sermorelin – 6 Month';
const INTERVAL = 'month';
const INTERVAL_COUNT = 6;

const execute = process.argv.includes('--execute');

function getOTStripe(): Stripe {
  const secretKey = OT_STRIPE_CONFIG.secretKey;
  if (!secretKey) throw new Error('OT_STRIPE_SECRET_KEY not configured');
  return new Stripe(secretKey, {
    apiVersion: '2026-03-25.dahlia' as Stripe.LatestApiVersion,
    typescript: true,
    maxNetworkRetries: 3,
  });
}

async function main() {
  console.log('');
  console.log('=== Remediate OT Pending Payment ===');
  console.log(`Mode: ${execute ? 'EXECUTE' : 'DRY RUN'}`);
  console.log(`PaymentIntent: ${STRIPE_PAYMENT_INTENT_ID}`);
  console.log('');

  await withoutClinicFilter(async () => {
    // Step 1: Find the PENDING payment
    const payment = await prisma.payment.findFirst({
      where: {
        OR: [
          { stripePaymentIntentId: STRIPE_PAYMENT_INTENT_ID },
          { stripePaymentIntentId: null, status: 'PENDING' },
        ],
      },
      include: {
        patient: { select: { id: true, clinicId: true, stripeCustomerId: true } },
        invoice: { select: { id: true, status: true, amount: true, amountDue: true, amountPaid: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!payment) {
      // Try finding by PI ID directly
      const byPI = await prisma.payment.findUnique({
        where: { stripePaymentIntentId: STRIPE_PAYMENT_INTENT_ID },
        include: {
          patient: { select: { id: true, clinicId: true, stripeCustomerId: true } },
          invoice: { select: { id: true, status: true, amount: true, amountDue: true, amountPaid: true } },
        },
      });
      if (!byPI) {
        console.error('Payment not found for PI:', STRIPE_PAYMENT_INTENT_ID);
        return;
      }
      return processPayment(byPI);
    }

    return processPayment(payment);
  });
}

async function processPayment(payment: any) {
  console.log('--- Payment Found ---');
  console.log(`  ID:          ${payment.id}`);
  console.log(`  Status:      ${payment.status}`);
  console.log(`  Amount:      $${(payment.amount / 100).toFixed(2)}`);
  console.log(`  Stripe PI:   ${payment.stripePaymentIntentId || '(none)'}`);
  console.log(`  Patient ID:  ${payment.patientId}`);
  console.log(`  Invoice ID:  ${payment.invoiceId || '(none)'}`);
  console.log(`  Sub ID:      ${payment.subscriptionId || '(none)'}`);
  console.log('');

  if (payment.invoice) {
    console.log('--- Invoice ---');
    console.log(`  ID:          ${payment.invoice.id}`);
    console.log(`  Status:      ${payment.invoice.status}`);
    console.log(`  Amount:      $${(payment.invoice.amount / 100).toFixed(2)}`);
    console.log(`  Amount Due:  $${(payment.invoice.amountDue / 100).toFixed(2)}`);
    console.log(`  Amount Paid: $${(payment.invoice.amountPaid / 100).toFixed(2)}`);
    console.log('');
  }

  // Verify on Stripe
  const stripe = getOTStripe();
  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.retrieve(STRIPE_PAYMENT_INTENT_ID);
    console.log(`--- Stripe PaymentIntent ---`);
    console.log(`  Status:      ${intent.status}`);
    console.log(`  Amount:      $${(intent.amount / 100).toFixed(2)}`);
    console.log(`  Customer:    ${intent.customer}`);
    console.log(`  PM:          ${intent.payment_method}`);
    console.log('');
  } catch (err) {
    console.error('Failed to retrieve PI from Stripe:', err instanceof Error ? err.message : err);
    return;
  }

  if (intent.status !== 'succeeded') {
    console.error(`Stripe PI status is "${intent.status}", not "succeeded". Aborting.`);
    return;
  }

  // Step 1: Update Payment to SUCCEEDED
  if (payment.status === 'PENDING' || payment.status === 'PROCESSING') {
    console.log(`[STEP 1] Update Payment #${payment.id} from ${payment.status} → SUCCEEDED`);
    if (execute) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'SUCCEEDED',
          stripePaymentIntentId: STRIPE_PAYMENT_INTENT_ID,
          stripeChargeId: intent.latest_charge?.toString(),
          paidAt: new Date(),
        },
      });
      console.log('  ✓ Payment updated');
    } else {
      console.log('  (dry run — would update)');
    }
  } else {
    console.log(`[STEP 1] Payment already ${payment.status}, skipping status update.`);
  }

  // Step 2: Fix Invoice subtotal/amountDue and add discount line items
  const CATALOG_PRICE_CENTS = 125900; // Sermorelin 6-month Stripe price
  const discountCents = CATALOG_PRICE_CENTS - payment.amount;
  const hasDiscount = discountCents > 0;

  if (payment.invoiceId) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: payment.invoiceId },
      include: { items: true },
    });
    if (invoice) {
      const needsFix = invoice.amount === 0 || invoice.amountDue < 0;
      if (needsFix || hasDiscount) {
        console.log(`[STEP 2] Fix Invoice #${invoice.id}:`);
        console.log(`  amount: ${invoice.amount} → ${payment.amount}`);
        console.log(`  amountDue: ${invoice.amountDue} → 0`);
        if (hasDiscount) {
          console.log(`  Adding discount: -$${(discountCents / 100).toFixed(2)} (catalog $${(CATALOG_PRICE_CENTS / 100).toFixed(2)} → charged $${(payment.amount / 100).toFixed(2)})`);
        }
        if (execute) {
          const lineItems = hasDiscount
            ? [
                { description: PLAN_NAME, amount: CATALOG_PRICE_CENTS, quantity: 1 },
                { description: `Discount – ${PLAN_NAME}`, amount: -discountCents, quantity: 1 },
              ]
            : [{ description: PLAN_NAME, amount: payment.amount, quantity: 1 }];

          const metadataUpdate: Record<string, unknown> = {
            ...(typeof invoice.metadata === 'object' && invoice.metadata !== null ? invoice.metadata : {}),
            source: 'process_payment',
            planId: PLAN_ID,
            planName: PLAN_NAME,
            remediated: true,
            ...(hasDiscount ? {
              summary: {
                subtotal: CATALOG_PRICE_CENTS,
                discountAmount: discountCents,
                taxAmount: 0,
                total: payment.amount,
                amountPaid: payment.amount,
                amountDue: 0,
              },
            } : {}),
          };

          await prisma.invoice.update({
            where: { id: invoice.id },
            data: {
              amount: payment.amount,
              amountDue: 0,
              status: 'PAID',
              paidAt: invoice.paidAt || new Date(),
              lineItems: lineItems as any,
              metadata: metadataUpdate as any,
            },
          });

          // Replace InvoiceItem rows
          await prisma.invoiceItem.deleteMany({ where: { invoiceId: invoice.id } });
          for (const li of lineItems) {
            await prisma.invoiceItem.create({
              data: {
                invoiceId: invoice.id,
                description: li.description,
                quantity: 1,
                unitPrice: li.amount,
                amount: li.amount,
              },
            });
          }

          console.log('  ✓ Invoice fixed with discount line items');
        } else {
          console.log('  (dry run — would fix)');
        }
      } else {
        console.log(`[STEP 2] Invoice #${invoice.id} looks correct, skipping.`);
      }
    }
  } else {
    console.log(`[STEP 2] No invoice linked to payment. May need manual review.`);
  }

  // Step 3: Create local Subscription if missing
  const existingSub = payment.subscriptionId
    ? await prisma.subscription.findUnique({ where: { id: payment.subscriptionId } })
    : null;

  if (existingSub) {
    console.log(`[STEP 3] Local subscription already exists: #${existingSub.id} (${existingSub.status}), skipping.`);
  } else {
    console.log(`[STEP 3] Create local Subscription for ${PLAN_NAME}`);
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + INTERVAL_COUNT);

    if (execute) {
      const sub = await prisma.subscription.create({
        data: {
          patientId: payment.patientId,
          clinicId: payment.patient.clinicId,
          planId: PLAN_ID,
          planName: PLAN_NAME,
          planDescription: PLAN_NAME,
          amount: payment.amount,
          interval: INTERVAL,
          intervalCount: INTERVAL_COUNT,
          startDate: now,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          nextBillingDate: periodEnd,
          status: 'ACTIVE',
        },
      });

      await prisma.payment.update({
        where: { id: payment.id },
        data: { subscriptionId: sub.id },
      });

      console.log(`  ✓ Subscription #${sub.id} created, linked to payment`);

      // Step 4: Create Stripe Subscription
      console.log(`[STEP 4] Create Stripe Subscription for ${STRIPE_CUSTOMER_ID}`);
      try {
        const trialEnd = Math.floor(periodEnd.getTime() / 1000);
        const stripeSub = await stripe.subscriptions.create({
          customer: STRIPE_CUSTOMER_ID,
          items: [{ price: STRIPE_PRICE_ID }],
          default_payment_method: STRIPE_PAYMENT_METHOD_ID,
          trial_end: trialEnd,
          metadata: {
            patientId: payment.patientId.toString(),
            planId: PLAN_ID,
            localSubscriptionId: sub.id.toString(),
            remediationScript: 'remediate-ot-pending-payment',
          },
        });

        await prisma.subscription.update({
          where: { id: sub.id },
          data: { stripeSubscriptionId: stripeSub.id },
        });

        console.log(`  ✓ Stripe Subscription ${stripeSub.id} created`);
        console.log(`    Trial ends: ${periodEnd.toISOString()}`);
        console.log(`    Next charge: $${((stripeSub.items.data[0]?.price?.unit_amount || 0) / 100).toFixed(2)} on ${periodEnd.toLocaleDateString()}`);
      } catch (stripeErr) {
        console.error(`  ✗ Failed to create Stripe Subscription:`, stripeErr instanceof Error ? stripeErr.message : stripeErr);
        console.log('  → Manual action: create Stripe Subscription in the dashboard.');
      }
    } else {
      console.log('  (dry run — would create local sub + Stripe sub)');
      console.log(`  Plan: ${PLAN_NAME}, interval: every ${INTERVAL_COUNT} months`);
      console.log(`  Stripe Price: ${STRIPE_PRICE_ID}`);
      console.log(`  Customer: ${STRIPE_CUSTOMER_ID}, PM: ${STRIPE_PAYMENT_METHOD_ID}`);
      console.log(`  Trial would end: ${periodEnd.toISOString()}`);
    }
  }

  console.log('');
  console.log('=== Remediation Complete ===');
  if (!execute) {
    console.log('Run with --execute to apply changes.');
  }
}

main()
  .catch((err) => {
    console.error('Fatal error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
