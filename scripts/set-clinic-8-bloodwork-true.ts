#!/usr/bin/env npx tsx
/**
 * One-off: Set clinic 8 BLOODWORK_LABS to true.
 * Usage: npx tsx scripts/set-clinic-8-bloodwork-true.ts
 */

import { Prisma } from '@prisma/client';
import { basePrisma } from '../src/lib/db';

async function main() {
  const clinic = await basePrisma.clinic.findUnique({
    where: { id: 8 },
    select: { id: true, name: true, features: true },
  });
  if (!clinic) {
    console.error('Clinic 8 not found');
    process.exit(1);
  }
  const current = (clinic.features as Record<string, unknown>) || {};
  const merged = { ...current, BLOODWORK_LABS: true };
  await basePrisma.clinic.update({
    where: { id: 8 },
    data: { features: merged as Prisma.InputJsonValue },
  });
  console.log('Clinic 8:', clinic.name);
  console.log('BLOODWORK_LABS set to true. Previous:', current.BLOODWORK_LABS);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => basePrisma.$disconnect());
