#!/usr/bin/env npx tsx
/**
 * Audit: Cross-Clinic Patient Leakage (WellMedR → EONMeds)
 * =========================================================
 *
 * Finds patients that were likely created in the wrong clinic due to the
 * DEFAULT_CLINIC_ID ordering bug in the Stripe webhook handler.
 *
 * Detection strategy:
 *   1. Find patients in EONMeds whose patientId starts with "WEL-" (WellMedR prefix)
 *   2. Find patients in EONMeds that have a duplicate (same email/phone) in WellMedR
 *   3. Find patients in EONMeds created from Stripe (source='stripe') around the time
 *      the DEFAULT_CLINIC_ID fallback was active
 *
 * Usage:
 *   DRY_RUN=true npx tsx scripts/audit-cross-clinic-patients.ts
 *   npx tsx scripts/audit-cross-clinic-patients.ts --fix
 *
 * @security Contains PHI — output to terminal only, never to external systems
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DRY_RUN = process.env.DRY_RUN !== 'false' && !process.argv.includes('--fix');

interface MisplacedPatient {
  id: number;
  patientId: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  clinicId: number;
  createdAt: Date;
  source: string | null;
  stripeCustomerId: string | null;
  wellmedrDuplicateId?: number;
  reason: string;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Cross-Clinic Patient Leakage Audit                        ║');
  console.log('║  Detecting WellMedR patients incorrectly in EONMeds        ║');
  console.log(`║  Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : '⚠️  LIVE — will reassign patients'}        ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Step 1: Identify the clinics
  const clinics = await prisma.clinic.findMany({
    where: {
      OR: [
        { subdomain: { contains: 'eonmeds', mode: 'insensitive' } },
        { name: { contains: 'eonmeds', mode: 'insensitive' } },
        { subdomain: { contains: 'wellmedr', mode: 'insensitive' } },
        { name: { contains: 'wellmedr', mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, subdomain: true },
  });

  const eonmeds = clinics.find(
    (c) =>
      c.subdomain?.toLowerCase().includes('eonmeds') ||
      c.name.toLowerCase().includes('eonmeds')
  );
  const wellmedr = clinics.find(
    (c) =>
      c.subdomain?.toLowerCase().includes('wellmedr') ||
      c.name.toLowerCase().includes('wellmedr')
  );

  if (!eonmeds || !wellmedr) {
    console.error('❌ Could not identify both clinics:');
    console.error(`   EONMeds: ${eonmeds ? `ID ${eonmeds.id} (${eonmeds.name})` : 'NOT FOUND'}`);
    console.error(`   WellMedR: ${wellmedr ? `ID ${wellmedr.id} (${wellmedr.name})` : 'NOT FOUND'}`);
    process.exit(1);
  }

  console.log(`EONMeds:  ID ${eonmeds.id} — "${eonmeds.name}" (${eonmeds.subdomain})`);
  console.log(`WellMedR: ID ${wellmedr.id} — "${wellmedr.name}" (${wellmedr.subdomain})\n`);

  const misplaced: MisplacedPatient[] = [];

  // Strategy 1: Patients in EONMeds with WEL- prefix in patientId
  console.log('── Strategy 1: EONMeds patients with WEL- prefix ──');
  const welPrefixPatients = await prisma.patient.findMany({
    where: {
      clinicId: eonmeds.id,
      patientId: { startsWith: 'WEL-' },
    },
    select: {
      id: true,
      patientId: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      clinicId: true,
      createdAt: true,
      source: true,
      stripeCustomerId: true,
    },
  });

  for (const p of welPrefixPatients) {
    misplaced.push({ ...p, reason: 'WEL- prefix in EONMeds clinic' });
  }
  console.log(`   Found: ${welPrefixPatients.length}\n`);

  // Strategy 2: EONMeds patients (from Stripe) that have a duplicate in WellMedR
  console.log('── Strategy 2: EONMeds Stripe patients with WellMedR duplicates ──');
  const eonmedsStripePatients = await prisma.patient.findMany({
    where: {
      clinicId: eonmeds.id,
      source: 'stripe',
    },
    select: {
      id: true,
      patientId: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      clinicId: true,
      createdAt: true,
      source: true,
      stripeCustomerId: true,
    },
  });

  let duplicateCount = 0;
  for (const p of eonmedsStripePatients) {
    if (!p.email && !p.phone && !p.stripeCustomerId) continue;

    // Check for a matching patient in WellMedR
    const conditions: any[] = [];
    if (p.stripeCustomerId) {
      conditions.push({ stripeCustomerId: p.stripeCustomerId });
    }
    if (p.email) {
      conditions.push({ email: { equals: p.email, mode: 'insensitive' } });
    }
    if (p.phone && p.phone.length >= 7) {
      conditions.push({ phone: { contains: p.phone.replace(/\D/g, '').slice(-10) } });
    }

    if (conditions.length === 0) continue;

    const wellmedrMatch = await prisma.patient.findFirst({
      where: {
        clinicId: wellmedr.id,
        OR: conditions,
      },
      select: { id: true },
    });

    if (wellmedrMatch) {
      if (!misplaced.find((m) => m.id === p.id)) {
        misplaced.push({
          ...p,
          wellmedrDuplicateId: wellmedrMatch.id,
          reason: `Duplicate of WellMedR patient #${wellmedrMatch.id}`,
        });
      }
      duplicateCount++;
    }
  }
  console.log(`   EONMeds Stripe patients checked: ${eonmedsStripePatients.length}`);
  console.log(`   With WellMedR duplicates: ${duplicateCount}\n`);

  // Strategy 3: Check the specific known patients from screenshots
  console.log('── Strategy 3: Verifying known affected patients ──');
  const knownEmails = ['elisin@outlook.com', 'christawaller@hotmail.com'];
  for (const email of knownEmails) {
    const records = await prisma.patient.findMany({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: {
        id: true,
        patientId: true,
        firstName: true,
        lastName: true,
        email: true,
        clinicId: true,
        createdAt: true,
        source: true,
        clinic: { select: { name: true, subdomain: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (records.length > 0) {
      console.log(`   ${email}:`);
      for (const r of records) {
        const marker = r.clinicId === eonmeds.id && records.some((o) => o.clinicId === wellmedr.id)
          ? ' ← MISPLACED'
          : '';
        console.log(
          `     #${r.id} (${r.patientId}) → ${r.clinic?.name} (clinic ${r.clinicId}) created ${r.createdAt.toISOString().split('T')[0]} source=${r.source}${marker}`
        );
      }
    }
  }

  // Summary
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`TOTAL MISPLACED PATIENTS FOUND: ${misplaced.length}`);
  console.log('══════════════════════════════════════════════════════════════\n');

  if (misplaced.length === 0) {
    console.log('✅ No misplaced patients detected.\n');
    await prisma.$disconnect();
    return;
  }

  // Print details
  for (const p of misplaced) {
    console.log(`  Patient #${p.id} (${p.patientId})`);
    console.log(`    Name: ${p.firstName} ${p.lastName}`);
    console.log(`    Created: ${p.createdAt.toISOString().split('T')[0]}`);
    console.log(`    Source: ${p.source}`);
    console.log(`    Reason: ${p.reason}`);
    if (p.wellmedrDuplicateId) {
      console.log(`    WellMedR duplicate: patient #${p.wellmedrDuplicateId}`);
    }
    console.log();
  }

  if (DRY_RUN) {
    console.log('ℹ️  DRY RUN — no changes made.');
    console.log('   To reassign these patients to WellMedR, run:');
    console.log('   npx tsx scripts/audit-cross-clinic-patients.ts --fix\n');
    console.log('   Patients with WellMedR duplicates should be MERGED (not just reassigned).');
    console.log('   Review each case manually before running --fix.\n');
  } else {
    console.log('⚠️  REASSIGNING patients to WellMedR...\n');

    let reassigned = 0;
    let skippedDuplicates = 0;

    for (const p of misplaced) {
      if (p.wellmedrDuplicateId) {
        // Has a duplicate in WellMedR — skip auto-reassign, needs manual merge
        console.log(`  ⏭️  #${p.id} SKIPPED — has WellMedR duplicate #${p.wellmedrDuplicateId} (needs manual merge)`);
        skippedDuplicates++;
        continue;
      }

      // Reassign clinic + update patientId prefix if needed
      const updates: any = { clinicId: wellmedr.id };
      if (p.patientId && !p.patientId.startsWith('WEL-')) {
        // Keep numeric part, change prefix
        const numericPart = p.patientId.replace(/^[A-Z]+-/, '');
        updates.patientId = `WEL-${numericPart}`;
      }

      await prisma.patient.update({
        where: { id: p.id },
        data: updates,
      });

      // Also reassign related invoices and payments
      await prisma.invoice.updateMany({
        where: { patientId: p.id, clinicId: eonmeds.id },
        data: { clinicId: wellmedr.id },
      });
      await prisma.payment.updateMany({
        where: { patientId: p.id, clinicId: eonmeds.id },
        data: { clinicId: wellmedr.id },
      });

      console.log(`  ✅ #${p.id} (${p.patientId}) → reassigned to WellMedR (clinic ${wellmedr.id})`);
      reassigned++;
    }

    console.log(`\n  Reassigned: ${reassigned}`);
    console.log(`  Skipped (need merge): ${skippedDuplicates}\n`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  prisma.$disconnect();
  process.exit(1);
});
