#!/usr/bin/env npx tsx
/**
 * Dump clinic features for clinics 3, 7, 8 — Tenant Uniformity DB Truth Check
 * ===========================================================================
 *
 * Prints id, name, subdomain, customDomain, status, features JSON, and BLOODWORK_LABS
 * for clinics that map to eonmeds, wellmedr, ot subdomains.
 *
 * Usage:
 *   npx tsx scripts/dump-clinic-features-3-7-8.ts
 *   npx tsx scripts/dump-clinic-features-3-7-8.ts --all
 *
 * @see docs/ENTERPRISE_TENANT_UNIFORMITY_DIAGNOSIS.md
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TARGET_IDS = [3, 7, 8];

async function main() {
  const all = process.argv.includes('--all');

  const ids = all
    ? (await prisma.clinic.findMany({ where: { status: 'ACTIVE' }, select: { id: true } })).map(
        (c) => c.id
      )
    : TARGET_IDS;

  const clinics = await prisma.clinic.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      subdomain: true,
      customDomain: true,
      status: true,
      features: true,
    },
    orderBy: { id: 'asc' },
  });

  console.log('\n--- Clinic Features (BLOODWORK_LABS) ---\n');

  for (const c of clinics) {
    const features = (c.features as Record<string, unknown>) || {};
    const bloodwork = features.BLOODWORK_LABS;

    console.log(`Clinic ${c.id}: ${c.name}`);
    console.log(`  subdomain:     ${c.subdomain}`);
    console.log(`  customDomain:  ${c.customDomain ?? 'null'}`);
    console.log(`  status:        ${c.status}`);
    console.log(`  BLOODWORK_LABS raw: ${JSON.stringify(bloodwork)} (${typeof bloodwork})`);
    console.log(`  features keys: ${Object.keys(features).join(', ') || '(none)'}`);
    console.log('');
  }

  console.log('--- Expected mapping ---');
  console.log('  eonmeds.eonpro.io  -> clinic 3 (EONMeds)');
  console.log('  wellmedr.eonpro.io -> clinic 7 (Wellmedr)');
  console.log('  ot.eonpro.io       -> clinic 8 (Overtime)');
  console.log('');
  console.log('  BLOODWORK_LABS should be true or missing (defaults true) for Labs tab to show.');
  console.log('  Only explicit false hides the Labs tab.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
