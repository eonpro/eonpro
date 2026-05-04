#!/usr/bin/env npx tsx
/**
 * WellMedR Multi-Injectable Patient Audit (Phase P0 of
 * `feat/patient-portal-multi-injectable-schedule`)
 *
 * Read-only blast-radius scan: how many WellMedR patients are prescribed
 * ≥2 different injectable medication families today, and on which Order
 * topology? The answer decides whether the upcoming
 * `buildDosingSchedule` rewrite (per-family newest-Rx-wins) is the
 * dominant fix or merely defensive.
 *
 * Buckets reported:
 *   - SINGLE_FAMILY:     patient has only 1 injectable family (no gap)
 *   - SAME_ORDER:        ≥2 families, all on the same Order (renders OK today)
 *   - SPLIT_ORDERS:      ≥2 families, split across ≥2 Orders (CURRENTLY HIDDEN)
 *   - SHADOWED:          a SPLIT_ORDERS subset where the GLP-1 Order is the
 *                        newest, hiding an add-on whose Order is older —
 *                        the exact cohort the user reported
 *
 * PHI-safe: patientId / clinicId / family / SIG-shape-only. No names,
 * emails, DOBs, or addresses are read or written. Output paths:
 *   - /tmp/multi-injectable-audit-summary.json   (counts + bucket totals)
 *   - /tmp/multi-injectable-audit-sigs.txt       (anonymized SIG samples
 *                                                  for P1.5 cadence-parser fixtures)
 *
 * Usage:
 *   npx tsx scripts/audit-multi-injectable-patients.ts
 *   npx tsx scripts/audit-multi-injectable-patients.ts --clinic=wellmedr
 *   npx tsx scripts/audit-multi-injectable-patients.ts --days=180
 */

import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'node:fs';
import {
  getMedicationFamily,
  isSupplyMedication,
  type MedicationFamily,
} from '../src/lib/utils/rx-sig-parser';

const prisma = new PrismaClient();

interface Args {
  clinicSubdomain: string;
  daysWindow: number;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const hit = argv.find((a) => a.startsWith(`${flag}=`));
    return hit ? hit.split('=', 2)[1] : undefined;
  };
  const days = Number(get('--days') ?? '365');
  return {
    clinicSubdomain: (get('--clinic') ?? 'wellmedr').toLowerCase(),
    daysWindow: Number.isFinite(days) && days > 0 ? days : 365,
  };
}

type Bucket = 'SINGLE_FAMILY' | 'SAME_ORDER' | 'SPLIT_ORDERS' | 'SHADOWED';

interface PatientReport {
  patientId: number;
  clinicId: number;
  bucket: Bucket;
  families: MedicationFamily[];
  orderCount: number;
  newestOrderFamily: MedicationFamily | null;
  shadowedFamilies: MedicationFamily[];
}

interface SigSample {
  family: MedicationFamily;
  sig: string;
  daysSupply: number;
  quantity: string;
}

async function main(): Promise<void> {
  const { clinicSubdomain, daysWindow } = parseArgs(process.argv.slice(2));
  const since = new Date(Date.now() - daysWindow * 24 * 60 * 60 * 1000);

  console.log('='.repeat(72));
  console.log('Multi-Injectable Patient Audit');
  console.log('='.repeat(72));
  console.log(`Clinic subdomain : ${clinicSubdomain}`);
  console.log(`Window           : last ${daysWindow} days (since ${since.toISOString()})`);
  console.log('='.repeat(72));

  const clinic = await prisma.clinic.findFirst({
    where: { subdomain: { contains: clinicSubdomain, mode: 'insensitive' } },
    select: { id: true, subdomain: true, name: true },
  });
  if (!clinic) {
    console.error(`No clinic found with subdomain LIKE '%${clinicSubdomain}%'`);
    process.exit(1);
  }
  console.log(`Resolved clinic  : id=${clinic.id} subdomain=${clinic.subdomain}`);

  const orders = await prisma.order.findMany({
    where: {
      clinicId: clinic.id,
      createdAt: { gte: since },
    },
    select: {
      id: true,
      patientId: true,
      createdAt: true,
      status: true,
      rxs: {
        select: {
          id: true,
          medicationKey: true,
          medName: true,
          quantity: true,
          sig: true,
          daysSupply: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`Loaded orders    : ${orders.length}`);

  const patientMap = new Map<
    number,
    {
      // family -> array of {orderId, orderCreatedAt}
      byFamily: Map<MedicationFamily, Array<{ orderId: number; createdAt: Date }>>;
      newestOrderFamily: MedicationFamily | null;
      newestOrderAt: Date | null;
    }
  >();

  // Sample one canonical SIG per family for the cadence-parser fixture set.
  const sigSamples = new Map<MedicationFamily, SigSample>();

  for (const order of orders) {
    const familiesOnOrder = new Set<MedicationFamily>();
    for (const rx of order.rxs) {
      if (isSupplyMedication(rx.medName)) continue;
      const family = getMedicationFamily({
        name: rx.medName,
        medicationKey: rx.medicationKey,
      });
      if (family === 'other') continue;
      familiesOnOrder.add(family);

      if (!sigSamples.has(family) && rx.sig) {
        sigSamples.set(family, {
          family,
          sig: rx.sig,
          daysSupply: rx.daysSupply,
          quantity: rx.quantity,
        });
      }
    }
    if (familiesOnOrder.size === 0) continue;

    const entry = patientMap.get(order.patientId) ?? {
      byFamily: new Map<MedicationFamily, Array<{ orderId: number; createdAt: Date }>>(),
      newestOrderFamily: null as MedicationFamily | null,
      newestOrderAt: null as Date | null,
    };
    for (const family of familiesOnOrder) {
      const list = entry.byFamily.get(family) ?? [];
      list.push({ orderId: order.id, createdAt: order.createdAt });
      entry.byFamily.set(family, list);
    }
    if (!entry.newestOrderAt || order.createdAt > entry.newestOrderAt) {
      entry.newestOrderAt = order.createdAt;
      // Pick a deterministic family for the newest Order — prefer GLP-1
      // (the dominant scheduling driver), else first by sort.
      entry.newestOrderFamily = familiesOnOrder.has('glp1')
        ? 'glp1'
        : [...familiesOnOrder].sort()[0];
    }
    patientMap.set(order.patientId, entry);
  }

  console.log(`Patients matched : ${patientMap.size}`);

  const reports: PatientReport[] = [];
  const bucketCounts: Record<Bucket, number> = {
    SINGLE_FAMILY: 0,
    SAME_ORDER: 0,
    SPLIT_ORDERS: 0,
    SHADOWED: 0,
  };

  for (const [patientId, entry] of patientMap.entries()) {
    const families = [...entry.byFamily.keys()].sort();

    if (families.length === 1) {
      bucketCounts.SINGLE_FAMILY += 1;
      reports.push({
        patientId,
        clinicId: clinic.id,
        bucket: 'SINGLE_FAMILY',
        families,
        orderCount: entry.byFamily.get(families[0])?.length ?? 0,
        newestOrderFamily: entry.newestOrderFamily,
        shadowedFamilies: [],
      });
      continue;
    }

    // Multi-family. Check whether ALL families share at least one common
    // Order (= SAME_ORDER) or whether they are split across orders.
    const orderIdSets = families.map(
      (f) => new Set((entry.byFamily.get(f) ?? []).map((o) => o.orderId))
    );
    const intersection = orderIdSets.reduce(
      (acc, s) => new Set([...acc].filter((x) => s.has(x))),
      orderIdSets[0]
    );

    if (intersection.size > 0) {
      bucketCounts.SAME_ORDER += 1;
      reports.push({
        patientId,
        clinicId: clinic.id,
        bucket: 'SAME_ORDER',
        families,
        orderCount: intersection.size,
        newestOrderFamily: entry.newestOrderFamily,
        shadowedFamilies: [],
      });
      continue;
    }

    // SPLIT_ORDERS — at least two families on different orders.
    // SHADOWED is the user-reported subset: GLP-1 is the newest order
    // family, and at least one add-on family's newest order is older.
    bucketCounts.SPLIT_ORDERS += 1;

    const shadowedFamilies: MedicationFamily[] = [];
    if (entry.newestOrderFamily === 'glp1' && entry.newestOrderAt) {
      for (const family of families) {
        if (family === 'glp1') continue;
        const list = entry.byFamily.get(family) ?? [];
        const newestForFamily = list.reduce<Date | null>(
          (acc, o) => (acc && acc > o.createdAt ? acc : o.createdAt),
          null
        );
        if (newestForFamily && newestForFamily < entry.newestOrderAt) {
          shadowedFamilies.push(family);
        }
      }
    }

    if (shadowedFamilies.length > 0) {
      bucketCounts.SHADOWED += 1;
    }

    reports.push({
      patientId,
      clinicId: clinic.id,
      bucket: 'SPLIT_ORDERS',
      families,
      orderCount: orderIdSets.reduce((acc, s) => acc + s.size, 0),
      newestOrderFamily: entry.newestOrderFamily,
      shadowedFamilies,
    });
  }

  const familyTallies = new Map<MedicationFamily, number>();
  for (const r of reports) {
    for (const f of r.families) {
      familyTallies.set(f, (familyTallies.get(f) ?? 0) + 1);
    }
  }

  console.log('');
  console.log('Bucket counts');
  console.log('-'.repeat(72));
  console.log(`  SINGLE_FAMILY  : ${bucketCounts.SINGLE_FAMILY}`);
  console.log(`  SAME_ORDER     : ${bucketCounts.SAME_ORDER}`);
  console.log(`  SPLIT_ORDERS   : ${bucketCounts.SPLIT_ORDERS}`);
  console.log(
    `   ↳ SHADOWED    : ${bucketCounts.SHADOWED}  ` +
      '(GLP-1 newest, hides ≥1 add-on; user-reported cohort)'
  );
  console.log('');
  console.log('Family prevalence (patients prescribed ≥1 active Rx in this family)');
  console.log('-'.repeat(72));
  for (const [family, n] of [...familyTallies.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${family.padEnd(14)} ${n}`);
  }
  console.log('');

  // PHI-safe outputs.
  const summaryPath = '/tmp/multi-injectable-audit-summary.json';
  writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        clinicId: clinic.id,
        clinicSubdomain: clinic.subdomain,
        windowDays: daysWindow,
        runAt: new Date().toISOString(),
        bucketCounts,
        familyTallies: Object.fromEntries(familyTallies),
        reports,
      },
      null,
      2
    )
  );
  console.log(`Wrote summary    : ${summaryPath}`);

  // Anonymized SIG samples for cadence-parser fixtures (P1.5).
  const sigsPath = '/tmp/multi-injectable-audit-sigs.txt';
  const sigBlock = [...sigSamples.values()]
    .map(
      (s) =>
        `[${s.family}] daysSupply=${s.daysSupply} quantity=${s.quantity}\n  SIG: ${s.sig}\n`
    )
    .join('\n');
  writeFileSync(sigsPath, sigBlock || '(no SIGs sampled)\n');
  console.log(`Wrote SIG samples: ${sigsPath} (${sigSamples.size} families)`);

  console.log('');
  console.log('Done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
