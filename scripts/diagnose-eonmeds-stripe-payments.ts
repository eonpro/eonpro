#!/usr/bin/env npx tsx
/**
 * EonMeds Stripe Payment Diagnostic
 *
 * Run: npx tsx scripts/diagnose-eonmeds-stripe-payments.ts
 *
 * Checks:
 * 1. WebhookLog for failed stripe events (CLINIC_UNRESOLVED)
 * 2. PaymentReconciliation for recent EonMeds (clinic 3) activity
 * 3. Patient creation count for clinic 3 in last 7 days
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('\n=== EonMeds Stripe Payment Diagnostic ===\n');

  // 1. Failed events due to clinic_unresolved
  const failedUnresolved = await prisma.webhookLog.findMany({
    where: {
      source: 'stripe',
      errorMessage: { contains: 'CLINIC_UNRESOLVED', mode: 'insensitive' },
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    select: {
      id: true,
      eventId: true,
      eventType: true,
      errorMessage: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  console.log('1. Failed Stripe events (CLINIC_UNRESOLVED) - last 7 days');
  console.log(`   Count: ${failedUnresolved.length}`);
  if (failedUnresolved.length > 0) {
    const byType = failedUnresolved.reduce<Record<string, number>>((acc, e) => {
      acc[e.eventType || 'unknown'] = (acc[e.eventType || 'unknown'] || 0) + 1;
      return acc;
    }, {});
    console.log('   By event type:', byType);
    console.log('   Sample (most recent):');
    const sample = failedUnresolved[0];
    console.log(`     - ${sample.eventType} | ${sample.eventId} | ${sample.createdAt.toISOString()}`);
  }
  console.log('');

  // 2. All failed stripe events (status != SUCCESS)
  const allFailed = await prisma.webhookLog.count({
    where: {
      source: 'stripe',
      status: { not: 'SUCCESS' },
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
  });

  console.log('2. All failed Stripe webhooks (any reason) - last 7 days');
  console.log(`   Count: ${allFailed}`);
  console.log('');

  // 3. Successful stripe webhooks
  const successCount = await prisma.webhookLog.count({
    where: {
      source: 'stripe',
      status: 'SUCCESS',
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
  });

  console.log('3. Successful Stripe webhooks - last 7 days');
  console.log(`   Count: ${successCount}`);
  console.log('');

  // 4. PaymentReconciliation for clinic 3 (EonMeds)
  const reconCount = await prisma.paymentReconciliation.count({
    where: {
      clinicId: 3,
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
  });

  const reconCreated = await prisma.paymentReconciliation.count({
    where: {
      clinicId: 3,
      patientCreated: true,
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
  });

  console.log('4. PaymentReconciliation for EonMeds (clinic 3) - last 7 days');
  console.log(`   Total reconciled: ${reconCount}`);
  console.log(`   New patients created: ${reconCreated}`);
  console.log('');

  // 5. New patients for clinic 3
  const newPatients = await prisma.patient.count({
    where: {
      clinicId: 3,
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
  });

  console.log('5. New EonMeds patients created - last 7 days');
  console.log(`   Count: ${newPatients}`);
  console.log('');

  // Summary
  console.log('=== Summary ===');
  if (failedUnresolved.length > 0 && newPatients < failedUnresolved.length) {
    console.log('⚠️  Likely cause: Payments were DROPPED due to missing metadata.clinicId');
    console.log('   → Fix: Set DEFAULT_CLINIC_ID=3 and deploy (see docs/EONMEDS_STRIPE_PAYMENT_DEEP_DIVE.md)');
  } else if (successCount === 0 && allFailed > 0) {
    console.log('⚠️  No successful webhooks. Check:');
    console.log('   - Is EONMEDS_STRIPE_WEBHOOK_SECRET correct in Stripe Dashboard?');
    console.log('   - Is webhook URL pointing to correct deployment?');
  } else {
    console.log('✓  Some webhooks succeeding. Review counts above for anomalies.');
  }
  console.log('');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
