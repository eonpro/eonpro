#!/usr/bin/env npx tsx
/**
 * Generate SUBDOMAIN_CLINIC_ID_MAP from the database.
 *
 * Use this to set the env var in Vercel (or .env) so Edge middleware can
 * set clinic context for clinic subdomains (e.g. ot.eonpro.io) without a DB lookup.
 *
 * Usage:
 *   npx tsx scripts/generate-subdomain-clinic-map.ts
 *
 * Output: A line you can paste into SUBDOMAIN_CLINIC_ID_MAP=
 * Requires: DATABASE_URL in .env
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SKIP_SUBDOMAINS = ['www', 'app', 'api', 'admin', 'staging'];

async function main() {
  const clinics = await prisma.clinic.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, subdomain: true, name: true },
    orderBy: { subdomain: 'asc' },
  });

  const pairs: string[] = [];
  for (const c of clinics) {
    const sub = (c.subdomain || '').trim().toLowerCase();
    if (!sub || SKIP_SUBDOMAINS.includes(sub)) continue;
    pairs.push(`${sub}:${c.id}`);
  }

  const mapValue = pairs.join(',');
  console.log('\nSUBDOMAIN_CLINIC_ID_MAP (paste into Vercel env or .env):\n');
  if (mapValue) {
    console.log(`SUBDOMAIN_CLINIC_ID_MAP=${mapValue}\n`);
    console.log('Clinics included:');
    for (const c of clinics) {
      const sub = (c.subdomain || '').trim().toLowerCase();
      if (sub && !SKIP_SUBDOMAINS.includes(sub)) {
        console.log(`  - ${sub} -> ${c.id} (${c.name})`);
      }
    }
  } else {
    console.log('# No ACTIVE clinics with subdomain found. Add SUBDOMAIN_CLINIC_ID_MAP when you have clinics.\n');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
