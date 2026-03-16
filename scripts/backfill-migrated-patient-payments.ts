/**
 * Backfill Migrated Patient Payment Markers
 *
 * For patients migrated from another EMR who already had active subscriptions,
 * creates a synthetic Payment record so checkIfFirstPaymentForSalesRep returns
 * false, ensuring they get the recurring commission rate instead of the new-sale rate.
 *
 * Usage:
 *   npx tsx scripts/backfill-migrated-patient-payments.ts --clinic-id 8 --cutoff-date 2026-03-15
 *   npx tsx scripts/backfill-migrated-patient-payments.ts --clinic-id 8 --cutoff-date 2026-03-15 --dry-run
 *
 * Arguments:
 *   --clinic-id      Required. The clinic ID to backfill (e.g. 8 for OT, 3 for EONMEDS)
 *   --cutoff-date    Required. Patients created before this date are treated as migrated (ISO format)
 *   --dry-run        Optional. Preview changes without writing to the database
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function parseArgs(): { clinicId: number; cutoffDate: Date; dryRun: boolean } {
  const args = process.argv.slice(2);
  let clinicId = 0;
  let cutoffDate: Date | null = null;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--clinic-id' && args[i + 1]) {
      clinicId = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--cutoff-date' && args[i + 1]) {
      cutoffDate = new Date(args[i + 1]);
      i++;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }

  if (!clinicId || clinicId <= 0) {
    console.error('Error: --clinic-id is required and must be a positive integer');
    process.exit(1);
  }
  if (!cutoffDate || isNaN(cutoffDate.getTime())) {
    console.error('Error: --cutoff-date is required and must be a valid ISO date (e.g. 2026-03-15)');
    process.exit(1);
  }

  return { clinicId, cutoffDate, dryRun };
}

async function main() {
  const { clinicId, cutoffDate, dryRun } = parseArgs();

  console.log('=== Migrated Patient Payment Backfill ===\n');
  console.log(`Clinic ID:    ${clinicId}`);
  console.log(`Cutoff Date:  ${cutoffDate.toISOString().slice(0, 10)}`);
  console.log(`Mode:         ${dryRun ? 'DRY RUN (no changes)' : 'LIVE'}\n`);

  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { id: true, name: true },
  });

  if (!clinic) {
    console.error(`Error: Clinic ${clinicId} not found`);
    process.exit(1);
  }

  console.log(`Clinic:       ${clinic.name} (ID: ${clinic.id})\n`);

  // Find patients in this clinic created before the cutoff date
  const migratedPatients = await prisma.patient.findMany({
    where: {
      clinicId,
      createdAt: { lt: cutoffDate },
    },
    select: {
      id: true,
      createdAt: true,
    },
  });

  console.log(`Found ${migratedPatients.length} patients created before ${cutoffDate.toISOString().slice(0, 10)}\n`);

  if (migratedPatients.length === 0) {
    console.log('No patients to process. Done.');
    await prisma.$disconnect();
    return;
  }

  // Check which patients already have a SUCCEEDED payment
  const patientIds = migratedPatients.map((p) => p.id);
  const existingPayments = await prisma.payment.findMany({
    where: {
      patientId: { in: patientIds },
      status: 'SUCCEEDED',
    },
    select: { patientId: true },
    distinct: ['patientId'],
  });

  const patientsWithPayments = new Set(existingPayments.map((p) => p.patientId));
  const patientsNeedingBackfill = migratedPatients.filter(
    (p) => !patientsWithPayments.has(p.id)
  );

  console.log(`  Already have payments:  ${patientsWithPayments.size}`);
  console.log(`  Need backfill marker:   ${patientsNeedingBackfill.length}\n`);

  if (patientsNeedingBackfill.length === 0) {
    console.log('All migrated patients already have payment records. Done.');
    await prisma.$disconnect();
    return;
  }

  if (dryRun) {
    console.log('DRY RUN — Would create synthetic Payment records for these patients:\n');
    for (const p of patientsNeedingBackfill.slice(0, 20)) {
      console.log(`  Patient ID: ${p.id}  (created: ${p.createdAt.toISOString().slice(0, 10)})`);
    }
    if (patientsNeedingBackfill.length > 20) {
      console.log(`  ... and ${patientsNeedingBackfill.length - 20} more`);
    }
    console.log(`\nRun without --dry-run to apply.`);
    await prisma.$disconnect();
    return;
  }

  let created = 0;
  let errors = 0;

  for (const patient of patientsNeedingBackfill) {
    try {
      await prisma.payment.create({
        data: {
          clinicId,
          patientId: patient.id,
          amount: 0,
          currency: 'usd',
          status: 'SUCCEEDED',
          description: 'Migration marker - pre-existing patient from prior EMR',
          notes: `Backfilled ${new Date().toISOString()} for commission recurring-rate eligibility`,
          metadata: {
            source: 'migration_backfill',
            migratedAt: new Date().toISOString(),
            originalCreatedAt: patient.createdAt.toISOString(),
            cutoffDate: cutoffDate.toISOString(),
          },
        },
      });
      created++;
    } catch (err) {
      errors++;
      console.error(`  Error for patient ${patient.id}: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }

  console.log(`\n=== Results ===`);
  console.log(`  Created:  ${created}`);
  console.log(`  Errors:   ${errors}`);
  console.log(`  Total:    ${patientsNeedingBackfill.length}\n`);

  if (created > 0) {
    console.log('Migrated patients will now get the recurring commission rate on their next payment.');
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  prisma.$disconnect();
  process.exit(1);
});
