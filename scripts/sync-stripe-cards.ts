#!/usr/bin/env tsx
/**
 * Stripe Saved Cards Sync (Match by Email / stripeCustomerId)
 * ============================================================
 *
 * Pulls saved payment methods (cards) from a clinic's Stripe account,
 * matches each customer to a patient profile by stripeCustomerId or email,
 * and upserts local PaymentMethod records. Also sets patient.stripeCustomerId
 * when a match is found but the link is missing.
 *
 * Works with dedicated Stripe accounts (EonMeds, OT) and Connect accounts (WellMedR).
 *
 * Usage:
 *   # Dry run for a specific clinic (by subdomain or ID):
 *   npx tsx scripts/sync-stripe-cards.ts --clinic eonmeds
 *   npx tsx scripts/sync-stripe-cards.ts --clinic wellmedr
 *   npx tsx scripts/sync-stripe-cards.ts --clinic ot
 *   npx tsx scripts/sync-stripe-cards.ts --clinic 3
 *
 *   # Execute (write to DB):
 *   npx tsx scripts/sync-stripe-cards.ts --clinic eonmeds --execute
 *
 *   # Include expired cards:
 *   npx tsx scripts/sync-stripe-cards.ts --clinic ot --execute --include-expired
 *
 *   # Limit to first N Stripe customers (for testing):
 *   npx tsx scripts/sync-stripe-cards.ts --clinic eonmeds --limit 50
 *
 * For production (load env first):
 *   env $(grep -v '^#' .env.production.local | grep -v '^\s*$' | tr -d '\r' | xargs) \
 *     npx tsx scripts/sync-stripe-cards.ts --clinic eonmeds --execute
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.production.local' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { prisma, runWithClinicContext } from '../src/lib/db';
import { syncCardsForClinic, type CardSyncResult } from '../src/services/stripe/cardSyncService';

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  let clinic: string | undefined;
  let execute = false;
  let includeExpired = false;
  let limit = 0;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--clinic':
        clinic = args[++i];
        break;
      case '--execute':
        execute = true;
        break;
      case '--include-expired':
        includeExpired = true;
        break;
      case '--limit':
        limit = parseInt(args[++i], 10) || 0;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  if (!clinic) {
    console.error('Error: --clinic <subdomain|id> is required.\n');
    printHelp();
    process.exit(1);
  }

  return { clinic, execute, includeExpired, limit };
}

function printHelp() {
  console.log(`
Usage: npx tsx scripts/sync-stripe-cards.ts --clinic <subdomain|id> [options]

Options:
  --clinic <val>      Clinic subdomain (eonmeds, wellmedr, ot) or numeric ID (required)
  --execute           Write changes to the database (default: dry run)
  --include-expired   Include expired cards in sync
  --limit <n>         Process at most N Stripe customers (0 = unlimited)
  --help, -h          Show this help
`);
}

// ---------------------------------------------------------------------------
// Resolve clinic
// ---------------------------------------------------------------------------

async function resolveClinicId(clinicArg: string): Promise<number> {
  const numericId = parseInt(clinicArg, 10);

  if (!Number.isNaN(numericId) && numericId > 0) {
    const clinic = await prisma.clinic.findUnique({
      where: { id: numericId },
      select: { id: true, name: true, subdomain: true },
    });
    if (!clinic) throw new Error(`Clinic with ID ${numericId} not found`);
    console.log(`Clinic: ${clinic.name} (id=${clinic.id}, subdomain=${clinic.subdomain})`);
    return clinic.id;
  }

  const clinic = await prisma.clinic.findFirst({
    where: {
      OR: [
        { subdomain: { equals: clinicArg, mode: 'insensitive' } },
        { name: { contains: clinicArg, mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, subdomain: true },
  });
  if (!clinic) throw new Error(`Clinic "${clinicArg}" not found by subdomain or name`);
  console.log(`Clinic: ${clinic.name} (id=${clinic.id}, subdomain=${clinic.subdomain})`);
  return clinic.id;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function printReport(result: CardSyncResult) {
  const { stats, dryRun } = result;

  console.log('\n╔══════════════════════════════════════════╗');
  console.log(`║  Stripe Card Sync ${dryRun ? '(DRY RUN)' : '(EXECUTED)'}`.padEnd(44) + '║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Stripe customers scanned: ${String(stats.stripeCustomersTotal).padStart(8)}    ║`);
  console.log(`║  Customers with cards:     ${String(stats.stripeCustomersWithCards).padStart(8)}    ║`);
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Patients matched:         ${String(stats.patientsMatched).padStart(8)}    ║`);
  console.log(`║  Skipped (no email):       ${String(stats.customersSkippedNoEmail).padStart(8)}    ║`);
  console.log(`║  Skipped (no patient):     ${String(stats.customersSkippedNoPatient).padStart(8)}    ║`);
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Cards created:            ${String(stats.cardsCreated).padStart(8)}    ║`);
  console.log(`║  Cards updated:            ${String(stats.cardsUpdated).padStart(8)}    ║`);
  console.log(`║  Cards already synced:     ${String(stats.cardsSkippedExisting).padStart(8)}    ║`);
  console.log(`║  Cards skipped (expired):  ${String(stats.cardsSkippedExpired).padStart(8)}    ║`);
  console.log(`║  stripeCustomerIds linked: ${String(stats.stripeCustomerIdsLinked).padStart(8)}    ║`);
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Errors:                   ${String(stats.errors).padStart(8)}    ║`);
  console.log('╚══════════════════════════════════════════╝');

  if (stats.errorDetails.length > 0) {
    console.log('\nError details:');
    for (const e of stats.errorDetails.slice(0, 10)) {
      console.log(`  - ${e.stripeCustomerId}: ${e.error}`);
    }
    if (stats.errorDetails.length > 10) {
      console.log(`  ... and ${stats.errorDetails.length - 10} more`);
    }
  }

  if (dryRun && (stats.cardsCreated > 0 || stats.stripeCustomerIdsLinked > 0)) {
    console.log(`\nDry run complete. Run with --execute to apply changes.`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { clinic, execute, includeExpired, limit } = parseArgs();

  if (!execute) {
    console.log('DRY RUN — no database writes. Use --execute to apply.\n');
  }

  const clinicId = await resolveClinicId(clinic);

  const result = await runWithClinicContext(clinicId, () =>
    syncCardsForClinic(clinicId, {
      dryRun: !execute,
      includeExpired,
      limit: limit || undefined,
    }),
  );

  printReport(result);

  if (execute) {
    const localCount = await prisma.paymentMethod.count({
      where: { clinicId, stripePaymentMethodId: { not: null }, isActive: true },
    });
    console.log(`\nLocal active PaymentMethods with stripePaymentMethodId for this clinic: ${localCount}`);
  }
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
