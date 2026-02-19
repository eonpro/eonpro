#!/usr/bin/env npx tsx
/**
 * Audit & Fix Mismatched Tracking Records
 * ========================================
 *
 * The old findPatientForShipping() had two dangerous fallback strategies
 * (fuzzy_single_untracked, fuzzy_most_recent, broad_fallback) that could
 * assign tracking numbers to the wrong patient. This script:
 *
 * 1. Finds all shipping updates and orders where the tracking may have
 *    been assigned via those strategies (no lifefileOrderId link)
 * 2. Reports suspected mismatches for manual review
 * 3. Optionally cleans up a specific patient's record (--fix mode)
 *
 * Usage:
 *   npx tsx scripts/audit-mismatched-tracking.ts                    # Audit only
 *   npx tsx scripts/audit-mismatched-tracking.ts --fix --patient-id 25726  # Fix specific patient
 *   npx tsx scripts/audit-mismatched-tracking.ts --fix --tracking 398854940852  # Fix by tracking number
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const fixMode = args.includes('--fix');
const patientIdArg = args.find((_, i) => args[i - 1] === '--patient-id');
const trackingArg = args.find((_, i) => args[i - 1] === '--tracking');

async function main() {
  console.log('\n🔍 Audit: Potentially Mismatched Tracking Records');
  console.log('='.repeat(60));

  // Find shipping updates where the order has no lifefileOrderId — a strong
  // signal that the match was done via fuzzy/broad fallback rather than
  // an exact Lifefile reference.
  const suspectUpdates = await prisma.patientShippingUpdate.findMany({
    where: {
      patientId: { not: null },
      matchedAt: { not: null },
      order: {
        OR: [
          { lifefileOrderId: null },
          { lifefileOrderId: '' },
        ],
      },
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, patientId: true, email: true } },
      order: { select: { id: true, lifefileOrderId: true, trackingNumber: true, status: true, createdAt: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Also find orders that have a tracking number but no lifefileOrderId
  const suspectOrders = await prisma.order.findMany({
    where: {
      trackingNumber: { not: null },
      OR: [
        { lifefileOrderId: null },
        { lifefileOrderId: '' },
      ],
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, patientId: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`\n⚠️  Suspect PatientShippingUpdate records: ${suspectUpdates.length}`);
  console.log(`⚠️  Orders with tracking but no lifefileOrderId: ${suspectOrders.length}`);

  if (suspectUpdates.length > 0) {
    console.log('\n📋 Shipping Updates (possibly mismatched):');
    console.log('-'.repeat(60));
    for (const u of suspectUpdates) {
      console.log(`  ID: ${u.id}`);
      console.log(`    Patient: ${u.patient?.firstName} ${u.patient?.lastName} (ID: ${u.patientId}, extId: ${u.patient?.patientId})`);
      console.log(`    Tracking: ${u.trackingNumber} (${u.carrier})`);
      console.log(`    Lifefile Order: ${u.lifefileOrderId || 'NONE'}`);
      console.log(`    Order: ${u.orderId ? `#${u.orderId} (lifefileOrderId: ${u.order?.lifefileOrderId || 'NONE'})` : 'No order linked'}`);
      console.log(`    Matched At: ${u.matchedAt?.toISOString()}`);
      console.log('');
    }
  }

  if (suspectOrders.length > 0) {
    console.log('\n📋 Orders with tracking but no Lifefile reference:');
    console.log('-'.repeat(60));
    for (const o of suspectOrders) {
      console.log(`  Order #${o.id} — ${o.patient?.firstName} ${o.patient?.lastName} (patient ${o.patient?.patientId})`);
      console.log(`    Tracking: ${o.trackingNumber}`);
      console.log(`    LifeFile ID: ${o.lifefileOrderId || 'NONE'}`);
      console.log(`    Status: ${o.status}`);
      console.log(`    Created: ${o.createdAt.toISOString()}`);
      console.log('');
    }
  }

  // ── Fix mode ──────────────────────────────────────────────────────────────
  if (fixMode) {
    if (!patientIdArg && !trackingArg) {
      console.log('\n❌ --fix requires --patient-id <id> or --tracking <number>');
      await prisma.$disconnect();
      process.exit(1);
    }

    console.log('\n🔧 FIX MODE');
    console.log('-'.repeat(60));

    const whereClause: any = {};
    if (trackingArg) {
      whereClause.trackingNumber = trackingArg;
      console.log(`  Fixing records with tracking number: ${trackingArg}`);
    }
    if (patientIdArg) {
      whereClause.patientId = parseInt(patientIdArg, 10);
      console.log(`  Fixing records for patient ID: ${patientIdArg}`);
    }

    // Find matching shipping updates
    const toFix = await prisma.patientShippingUpdate.findMany({
      where: whereClause,
      include: {
        order: { select: { id: true, trackingNumber: true, lifefileOrderId: true } },
      },
    });

    if (toFix.length === 0) {
      console.log('  No matching records found.');
    } else {
      console.log(`  Found ${toFix.length} record(s) to clean up:\n`);

      for (const record of toFix) {
        console.log(`  📦 ShippingUpdate #${record.id}`);
        console.log(`     Tracking: ${record.trackingNumber}`);
        console.log(`     Patient: ${record.patientId}`);
        console.log(`     Order: ${record.orderId}`);

        // Unlink the shipping update from the patient/order (set to unmatched)
        await prisma.patientShippingUpdate.update({
          where: { id: record.id },
          data: {
            patientId: null,
            orderId: null,
            matchedAt: null,
          },
        });
        console.log(`     ✅ Unlinked shipping update (now unmatched for admin review)`);

        // Clear tracking from the order if it was set
        if (record.orderId && record.order?.trackingNumber === record.trackingNumber) {
          await prisma.order.update({
            where: { id: record.orderId },
            data: {
              trackingNumber: null,
              trackingUrl: null,
              shippingStatus: null,
              lastWebhookAt: null,
              lastWebhookPayload: null,
            },
          });
          console.log(`     ✅ Cleared tracking from order #${record.orderId}`);
        }

        console.log('');
      }

      console.log('  ✅ Cleanup complete. Records are now unmatched for manual review.');
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Done.');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  prisma.$disconnect();
  process.exit(1);
});
