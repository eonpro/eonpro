#!/usr/bin/env tsx
/**
 * Cleanup Duplicate Addon Invoices
 * ==================================
 *
 * Identifies addon-only invoices (source: stripe-connect-addon or stripe-connect-addon-cron)
 * where the same patient already has an unprocessed main invoice (from Airtable) that includes
 * the same addons in its selectedAddons metadata. Marks the duplicates as prescriptionProcessed
 * so they no longer appear in the Rx queue.
 *
 * Usage:
 *   # Dry run (default) — shows what would be cleaned up
 *   npx tsx scripts/cleanup-duplicate-addon-invoices.ts
 *
 *   # Execute cleanup
 *   npx tsx scripts/cleanup-duplicate-addon-invoices.ts --fix
 *
 * For production:
 *   env $(grep -v '^#' .env.production.local | grep -v '^\s*$' | tr -d '\r' | xargs) \
 *     npx tsx scripts/cleanup-duplicate-addon-invoices.ts --fix
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ log: ['warn', 'error'] });
const DRY_RUN = !process.argv.includes('--fix');

async function main() {
  console.log(`\n=== Cleanup Duplicate Addon Invoices ===`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (pass --fix to execute)' : 'LIVE — will update records'}\n`);

  const addonInvoices = await prisma.invoice.findMany({
    where: {
      prescriptionProcessed: false,
      status: 'PAID',
      OR: [
        { metadata: { path: ['source'], equals: 'stripe-connect-addon' } },
        { metadata: { path: ['source'], equals: 'stripe-connect-addon-cron' } },
      ],
    },
    select: {
      id: true,
      patientId: true,
      clinicId: true,
      createdAt: true,
      metadata: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`Found ${addonInvoices.length} unprocessed addon-only invoices\n`);

  let duplicateCount = 0;
  const duplicateIds: number[] = [];

  for (const addon of addonInvoices) {
    const meta = addon.metadata as Record<string, unknown> | null;
    const addonAddons = Array.isArray(meta?.selectedAddons)
      ? (meta.selectedAddons as string[])
      : [];
    const source = (meta?.source as string) || 'unknown';

    const mainInvoice = await prisma.invoice.findFirst({
      where: {
        patientId: addon.patientId,
        clinicId: addon.clinicId,
        status: 'PAID',
        id: { not: addon.id },
        NOT: {
          OR: [
            { metadata: { path: ['source'], equals: 'stripe-connect-addon' } },
            { metadata: { path: ['source'], equals: 'stripe-connect-addon-cron' } },
          ],
        },
      },
      select: { id: true, metadata: true, prescriptionProcessed: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!mainInvoice) continue;

    const mainMeta = mainInvoice.metadata as Record<string, unknown> | null;
    const mainAddons = Array.isArray(mainMeta?.selectedAddons)
      ? (mainMeta.selectedAddons as string[])
      : [];

    const covered = addonAddons.length === 0 || addonAddons.every(
      (a) => mainAddons.includes(a) || mainAddons.includes('elite_bundle')
    );

    if (covered) {
      duplicateCount++;
      duplicateIds.push(addon.id);
      console.log(
        `  DUPLICATE: Invoice #${addon.id} (${source}, addons: [${addonAddons.join(',')}])` +
        ` → covered by main Invoice #${mainInvoice.id}` +
        ` (addons: [${mainAddons.join(',')}], processed: ${mainInvoice.prescriptionProcessed})`
      );
    }
  }

  console.log(`\nTotal duplicates found: ${duplicateCount}`);

  if (duplicateCount === 0) {
    console.log('Nothing to clean up.');
    return;
  }

  if (DRY_RUN) {
    console.log('\nDry run complete. Run with --fix to mark these as processed.');
  } else {
    console.log(`\nMarking ${duplicateIds.length} duplicate invoices as prescriptionProcessed...`);
    const result = await prisma.invoice.updateMany({
      where: { id: { in: duplicateIds } },
      data: {
        prescriptionProcessed: true,
        prescriptionProcessedAt: new Date(),
      },
    });
    console.log(`Updated ${result.count} invoices.`);
  }
}

main()
  .catch((err) => {
    console.error('Script failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
