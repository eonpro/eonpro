#!/usr/bin/env npx tsx
/**
 * Audit Clinic Identity — Enterprise Incident
 * ===========================================
 *
 * Prints ALL ACTIVE clinics with BLOODWORK_LABS and detects duplicates:
 * - same customDomain across multiple rows
 * - same subdomain across multiple rows (schema has @unique so unlikely)
 * - same name across multiple rows
 *
 * Usage: npx tsx scripts/audit-clinic-identity.ts
 *
 * @see docs/ENTERPRISE_TENANT_UNIFORMITY_DIAGNOSIS.md
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const clinics = await prisma.clinic.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      status: true,
      subdomain: true,
      customDomain: true,
      features: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { id: 'asc' },
  });

  console.log('\n=== ACTIVE CLINICS ===\n');

  for (const c of clinics) {
    const features = (c.features as Record<string, unknown>) || {};
    const bloodwork = features.BLOODWORK_LABS;
    const bloodworkType = bloodwork === undefined ? 'undefined' : typeof bloodwork;

    console.log(`Clinic ${c.id}: ${c.name}`);
    console.log(`  subdomain:     ${c.subdomain}`);
    console.log(`  customDomain:  ${c.customDomain ?? 'null'}`);
    console.log(`  status:        ${c.status}`);
    console.log(`  BLOODWORK_LABS: raw=${JSON.stringify(bloodwork)} (${bloodworkType})`);
    console.log(`  createdAt:     ${c.createdAt.toISOString()}`);
    console.log(`  updatedAt:     ${c.updatedAt.toISOString()}`);
    console.log('');
  }

  const byCustomDomain = new Map<string, typeof clinics>();
  const bySubdomain = new Map<string, typeof clinics>();
  const byName = new Map<string, typeof clinics>();

  for (const c of clinics) {
    if (c.customDomain) {
      const key = c.customDomain.toLowerCase();
      if (!byCustomDomain.has(key)) byCustomDomain.set(key, []);
      byCustomDomain.get(key)!.push(c);
    }
    const subKey = c.subdomain.toLowerCase();
    if (!bySubdomain.has(subKey)) bySubdomain.set(subKey, []);
    bySubdomain.get(subKey)!.push(c);
    const nameKey = c.name.toLowerCase().trim();
    if (!byName.has(nameKey)) byName.set(nameKey, []);
    byName.get(nameKey)!.push(c);
  }

  const collisions: string[] = [];

  for (const [domain, list] of byCustomDomain) {
    if (list.length > 1) {
      collisions.push(`customDomain "${domain}" used by clinics: ${list.map((x) => x.id).join(', ')}`);
    }
  }
  for (const [sub, list] of bySubdomain) {
    if (list.length > 1) {
      collisions.push(`subdomain "${sub}" used by clinics: ${list.map((x) => x.id).join(', ')}`);
    }
  }
  for (const [name, list] of byName) {
    if (list.length > 1) {
      collisions.push(`name "${name}" used by clinics: ${list.map((x) => x.id).join(', ')}`);
    }
  }

  console.log('=== COLLISION REPORT ===\n');
  if (collisions.length === 0) {
    console.log('No collisions detected.');
  } else {
    collisions.forEach((c) => console.log(`  - ${c}`));
  }
  console.log('');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
