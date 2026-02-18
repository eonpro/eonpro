#!/usr/bin/env npx tsx
/**
 * Backfill WellMedR Patient Addresses from Invoice Metadata
 * ==========================================================
 * Reads address data stored in invoice metadata and updates patient records.
 *
 * Usage:
 *   npx tsx scripts/backfill-wellmedr-addresses.ts           # dry run
 *   npx tsx scripts/backfill-wellmedr-addresses.ts --apply    # apply changes
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { decryptPHI } from '../src/lib/security/phi-encryption';
import { parseAddressString, normalizeState, normalizeZip } from '../src/lib/address';

const prisma = new PrismaClient();
const WELLMEDR_CLINIC_ID = 7;
const apply = process.argv.includes('--apply');

function safeDecrypt(value: unknown): string {
  if (value == null || value === '') return '';
  try {
    return decryptPHI(String(value));
  } catch {
    return '';
  }
}

async function main() {
  console.log('\n========================================');
  console.log('WellMedR Address Backfill from Invoice Metadata');
  console.log(`Mode: ${apply ? 'APPLY (changes WILL be saved)' : 'DRY RUN (preview only)'}`);
  console.log('========================================\n');

  // Find WellMedR patients with missing addresses
  const patients = await prisma.patient.findMany({
    where: {
      clinicId: WELLMEDR_CLINIC_ID,
      OR: [
        { address1: null },
        { address1: '' },
        { city: null },
        { city: '' },
        { zip: null },
        { zip: '' },
      ],
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      address1: true,
      city: true,
      state: true,
      zip: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  // Filter to genuinely empty addresses
  const patientsWithoutAddresses = patients.filter((p) => {
    const a1 = safeDecrypt(p.address1);
    const city = safeDecrypt(p.city);
    const state = safeDecrypt(p.state);
    const zip = safeDecrypt(p.zip);
    return !a1 && !city && !state && !zip;
  });

  console.log(`Total WellMedR patients with missing address fields: ${patients.length}`);
  console.log(`Patients with genuinely empty addresses: ${patientsWithoutAddresses.length}\n`);

  let updated = 0;
  let skipped = 0;

  for (const patient of patientsWithoutAddresses) {
    const email = safeDecrypt(patient.email);
    const name = `${safeDecrypt(patient.firstName)} ${safeDecrypt(patient.lastName)}`.trim();

    // Find invoices for this patient
    const invoices = await prisma.invoice.findMany({
      where: {
        patientId: patient.id,
        clinicId: WELLMEDR_CLINIC_ID,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, metadata: true },
      take: 5,
    });

    let foundAddress = false;

    for (const invoice of invoices) {
      const meta = invoice.metadata as Record<string, unknown> | null;
      if (!meta) continue;

      const addr1 = String(meta.addressLine1 || meta.address_line1 || '').trim();
      const addr2 = String(meta.addressLine2 || meta.address_line2 || '').trim();
      const city = String(meta.city || '').trim();
      const state = String(meta.state || '').trim();
      const zip = String(meta.zipCode || meta.zip || '').trim();

      let finalAddr1 = addr1;
      let finalAddr2 = addr2;
      let finalCity = city;
      let finalState = state;
      let finalZip = zip;

      // Try parsing combined address string if no individual components
      if (!finalCity && !finalState && !finalZip) {
        const rawAddress = String(meta.address || '').trim();
        if (rawAddress && rawAddress.includes(',')) {
          const parsed = parseAddressString(rawAddress);
          finalAddr1 = parsed.address1 || finalAddr1;
          finalAddr2 = parsed.address2 || finalAddr2;
          finalCity = parsed.city || finalCity;
          finalState = parsed.state || finalState;
          finalZip = parsed.zip || finalZip;
        }
      }

      if (!finalAddr1 && !finalCity && !finalZip) continue;

      const normalizedState = finalState ? normalizeState(finalState) : '';
      const normalizedZip = finalZip ? normalizeZip(finalZip) : '';
      const fullAddress = [finalAddr1, finalAddr2, finalCity, normalizedState, normalizedZip].filter(Boolean).join(', ');

      console.log(`  [${patient.id}] ${name} (${email})`);
      console.log(`    → ${fullAddress}`);

      if (apply) {
        const updateData: Record<string, string> = {};
        if (finalAddr1) updateData.address1 = finalAddr1;
        if (finalAddr2) updateData.address2 = finalAddr2;
        if (finalCity) updateData.city = finalCity;
        if (normalizedState) updateData.state = normalizedState;
        if (normalizedZip) updateData.zip = normalizedZip;

        await prisma.patient.update({
          where: { id: patient.id },
          data: updateData,
        });
        console.log(`    ✅ Updated`);
      } else {
        console.log(`    ✅ Would update (dry run)`);
      }

      foundAddress = true;
      updated++;
      break;
    }

    if (!foundAddress) {
      skipped++;
    }
  }

  console.log('\n========================================');
  console.log('Summary');
  console.log('========================================');
  console.log(`Patients without addresses:  ${patientsWithoutAddresses.length}`);
  console.log(`${apply ? 'Updated' : 'Would update'}:             ${updated}`);
  console.log(`Skipped (no metadata addr):  ${skipped}`);

  if (!apply && updated > 0) {
    console.log('\n💡 Run with --apply to save changes:');
    console.log('   npx tsx scripts/backfill-wellmedr-addresses.ts --apply\n');
  }
}

main()
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
