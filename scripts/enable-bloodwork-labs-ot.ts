#!/usr/bin/env npx ts-node
/**
 * Enable BLOODWORK_LABS (Labs tab on patient profile) for the OT clinic.
 * Run against the DB that ot.eonpro.io uses (e.g. production).
 *
 * Usage:
 *   npx tsx scripts/enable-bloodwork-labs-ot.ts
 *
 * Requires DATABASE_URL in .env (or set for the target environment).
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Looking up OT clinic (subdomain "ot")...\n');

  const clinic = await prisma.clinic.findFirst({
    where: {
      OR: [
        { subdomain: { equals: 'ot', mode: 'insensitive' } },
        { name: { contains: 'Overtime', mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, subdomain: true, features: true },
  });

  if (!clinic) {
    console.error('No clinic found with subdomain "ot" or name containing "Overtime".');
    process.exit(1);
  }

  const current = (clinic.features as Record<string, unknown>) || {};
  if (current.BLOODWORK_LABS === true) {
    console.log('BLOODWORK_LABS is already true for this clinic. No change.');
    console.log(`  Clinic: ${clinic.name} (id=${clinic.id}, subdomain=${clinic.subdomain})`);
    return;
  }

  const merged = { ...current, BLOODWORK_LABS: true };
  await prisma.clinic.update({
    where: { id: clinic.id },
    data: { features: merged },
  });

  console.log('Updated clinic features: BLOODWORK_LABS = true');
  console.log(`  Clinic: ${clinic.name} (id=${clinic.id}, subdomain=${clinic.subdomain})`);
  console.log('\nRefresh ot.eonpro.io/patients/<id> (or ?tab=lab) — Labs tab should appear.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
