#!/usr/bin/env npx tsx
/**
 * One-time script to retroactively sync Ingrid Aguirre's payment from Stripe
 * into the platform database.
 *
 * Payment: pi_3TME7IGzKhM7cZeG0YKq6sEv ($229.00, Semaglutide - Monthly Recurring)
 * Customer: cus_SRyPQjUOW44pmZ
 * Patient: Ingrid Aguirre (EON-13403)
 *
 * Usage: npx tsx scripts/sync-ingrid-payment.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { prisma, runWithClinicContext } from '@/lib/db';
import {
  processStripePayment,
  extractPaymentDataFromPaymentIntent,
} from '@/services/stripe/paymentMatchingService';

const PAYMENT_INTENT_ID = 'pi_3TME7IGzKhM7cZeG0YKq6sEv';
const EONMEDS_CLINIC_ID = parseInt(process.env.DEFAULT_CLINIC_ID || '3', 10);

async function main() {
  console.log('=== Syncing Ingrid Aguirre Payment ===');
  console.log(`PaymentIntent: ${PAYMENT_INTENT_ID}`);
  console.log(`Clinic ID: ${EONMEDS_CLINIC_ID}`);

  // Check if already reconciled
  const existing = await prisma.paymentReconciliation.findFirst({
    where: { stripePaymentIntentId: PAYMENT_INTENT_ID },
  });
  if (existing) {
    console.log(`\nAlready reconciled (status: ${existing.status}, patientId: ${existing.patientId})`);
    console.log('No action needed.');
    process.exit(0);
  }

  // Retrieve from Stripe
  const { getStripeForClinic, stripeRequestOptions } = await import('@/lib/stripe/connect');
  const stripeContext = await getStripeForClinic(EONMEDS_CLINIC_ID);
  const reqOpts = stripeRequestOptions(stripeContext);

  console.log('\nFetching PaymentIntent from Stripe...');
  const paymentIntent = await stripeContext.stripe.paymentIntents.retrieve(
    PAYMENT_INTENT_ID,
    {},
    reqOpts
  );

  if (paymentIntent.status !== 'succeeded') {
    console.error(`PaymentIntent status is "${paymentIntent.status}", expected "succeeded".`);
    process.exit(1);
  }

  console.log(`Amount: $${(paymentIntent.amount / 100).toFixed(2)} ${paymentIntent.currency}`);
  console.log(`Customer: ${typeof paymentIntent.customer === 'string' ? paymentIntent.customer : paymentIntent.customer?.id}`);
  console.log(`Description: ${paymentIntent.description}`);

  // Process
  console.log('\nProcessing payment...');
  const result = await runWithClinicContext(EONMEDS_CLINIC_ID, async () => {
    const paymentData = await extractPaymentDataFromPaymentIntent(paymentIntent);
    if (!paymentData.metadata?.clinicId) {
      paymentData.metadata = { ...paymentData.metadata, clinicId: String(EONMEDS_CLINIC_ID) };
    }
    return processStripePayment(
      paymentData,
      `manual_sync_${PAYMENT_INTENT_ID}_${Date.now()}`,
      'payment_intent.succeeded'
    );
  });

  if (result.success) {
    console.log('\n=== SUCCESS ===');
    console.log(`Patient ID: ${result.patient?.id}`);
    console.log(`Invoice ID: ${result.invoice?.id}`);
    console.log(`Patient Created: ${result.patientCreated}`);
    console.log(`Matched By: ${result.matchResult?.matchedBy}`);
    console.log(`Confidence: ${result.matchResult?.confidence}`);
  } else {
    console.error('\n=== FAILED ===');
    console.error(`Error: ${result.error}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
