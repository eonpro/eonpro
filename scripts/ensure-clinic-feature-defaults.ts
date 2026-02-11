#!/usr/bin/env npx ts-node
/**
 * Ensure all ACTIVE clinics have default feature flags set when missing.
 * Prevents tenant drift where one clinic misses a tab/feature due to missing DB keys.
 *
 * Merges defaults into clinic.features; does NOT overwrite explicit false.
 * @see docs/TENANT_CONFIG_DRIFT_CLINIC_8_DIAGNOSIS.md
 *
 * Usage:
 *   npx tsx scripts/ensure-clinic-feature-defaults.ts
 *   npx tsx scripts/ensure-clinic-feature-defaults.ts --dry-run
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_FEATURES: Record<string, boolean> = {
  BLOODWORK_LABS: true, // Labs tab on patient profile
};

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) console.log('DRY RUN - no changes will be written\n');

  const clinics = await prisma.clinic.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true, subdomain: true, customDomain: true, features: true },
  });

  console.log(`Found ${clinics.length} ACTIVE clinics\n`);

  let updated = 0;
  for (const clinic of clinics) {
    const current = (clinic.features as Record<string, unknown>) || {};
    const merged: Record<string, unknown> = { ...current };
    let changed = false;

    for (const [key, defaultValue] of Object.entries(DEFAULT_FEATURES)) {
      if (current[key] === undefined) {
        merged[key] = defaultValue;
        changed = true;
      }
    }

    if (changed) {
      updated++;
      console.log(`Clinic ${clinic.id} (${clinic.name}, subdomain=${clinic.subdomain}):`);
      console.log(`  Merging missing defaults: ${JSON.stringify(merged)}`);

      if (!dryRun) {
        await prisma.clinic.update({
          where: { id: clinic.id },
          data: { features: merged },
        });
      }
    }
  }

  console.log(`\n${dryRun ? 'Would update' : 'Updated'} ${updated} clinic(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
