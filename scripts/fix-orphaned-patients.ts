#!/usr/bin/env npx tsx
/**
 * Fix Orphaned Patients Script
 * ============================
 * 
 * Assigns clinicId to patients that don't have one.
 * Run this BEFORE making clinicId required in the schema.
 * 
 * Usage:
 *   DRY_RUN=true npx tsx scripts/fix-orphaned-patients.ts  # Preview
 *   npx tsx scripts/fix-orphaned-patients.ts               # Execute
 * 
 * Strategy:
 *   1. Patients with orders -> inherit from order's provider clinic
 *   2. Patients with SOAP notes -> inherit from provider clinic
 *   3. Remaining patients -> assign to default clinic (must specify)
 * 
 * @security Run during maintenance window
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface FixResult {
  total: number;
  fixed: number;
  fromOrders: number;
  fromSoapNotes: number;
  fromDefault: number;
  unfixable: number;
  errors: string[];
}

async function main() {
  const isDryRun = process.env.DRY_RUN === 'true';
  const defaultClinicId = process.env.DEFAULT_CLINIC_ID 
    ? parseInt(process.env.DEFAULT_CLINIC_ID, 10) 
    : null;

  console.log('\n========================================');
  console.log('FIX ORPHANED PATIENTS');
  console.log('========================================\n');
  
  if (isDryRun) {
    console.log('⚠️  DRY RUN MODE - No changes will be made\n');
  }

  const result: FixResult = {
    total: 0,
    fixed: 0,
    fromOrders: 0,
    fromSoapNotes: 0,
    fromDefault: 0,
    unfixable: 0,
    errors: [],
  };

  // Find all patients without clinicId
  const orphanedPatients = await prisma.patient.findMany({
    where: { clinicId: null },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      orders: {
        take: 1,
        select: {
          id: true,
          provider: {
            select: { clinicId: true },
          },
        },
      },
      soapNotes: {
        take: 1,
        select: {
          provider: {
            select: { clinicId: true },
          },
        },
      },
    },
  });

  result.total = orphanedPatients.length;
  console.log(`Found ${result.total} patients without clinicId\n`);

  if (result.total === 0) {
    console.log('✅ No orphaned patients found!\n');
    return;
  }

  for (const patient of orphanedPatients) {
    let assignedClinicId: number | null = null;
    let source = '';

    try {
      // Strategy 1: Try to get clinicId from orders
      if (patient.orders.length > 0 && patient.orders[0].provider?.clinicId) {
        assignedClinicId = patient.orders[0].provider.clinicId;
        source = 'order';
        result.fromOrders++;
      }
      // Strategy 2: Try to get clinicId from SOAP notes
      else if (patient.soapNotes.length > 0 && patient.soapNotes[0].provider?.clinicId) {
        assignedClinicId = patient.soapNotes[0].provider.clinicId;
        source = 'soapNote';
        result.fromSoapNotes++;
      }
      // Strategy 3: Use default clinic
      else if (defaultClinicId) {
        assignedClinicId = defaultClinicId;
        source = 'default';
        result.fromDefault++;
      }

      if (assignedClinicId) {
        if (!isDryRun) {
          await prisma.patient.update({
            where: { id: patient.id },
            data: { clinicId: assignedClinicId },
          });
        }
        result.fixed++;
        console.log(`  ✓ Patient ${patient.id} (${patient.email}) -> Clinic ${assignedClinicId} (from ${source})`);
      } else {
        result.unfixable++;
        console.log(`  ✗ Patient ${patient.id} (${patient.email}) -> No clinic found`);
      }
    } catch (err) {
      result.errors.push(`Patient ${patient.id}: ${err}`);
      console.log(`  ✗ Patient ${patient.id}: Error - ${err}`);
    }
  }

  // Summary
  console.log('\n========================================');
  console.log('SUMMARY');
  console.log('========================================');
  console.log(`Total orphaned: ${result.total}`);
  console.log(`Fixed: ${result.fixed}`);
  console.log(`  - From orders: ${result.fromOrders}`);
  console.log(`  - From SOAP notes: ${result.fromSoapNotes}`);
  console.log(`  - From default: ${result.fromDefault}`);
  console.log(`Unfixable: ${result.unfixable}`);
  console.log(`Errors: ${result.errors.length}`);
  console.log('========================================\n');

  if (result.unfixable > 0 && !defaultClinicId) {
    console.log('⚠️  Some patients could not be fixed.');
    console.log('   Set DEFAULT_CLINIC_ID env var to assign a default clinic.\n');
    console.log('   Example: DEFAULT_CLINIC_ID=1 npx tsx scripts/fix-orphaned-patients.ts\n');
  }

  if (isDryRun) {
    console.log('✅ Dry run complete. Run without DRY_RUN=true to apply changes.\n');
  } else if (result.unfixable > 0) {
    console.log('⚠️  Migration completed with unfixable patients.\n');
    process.exit(1);
  } else {
    console.log('✅ All orphaned patients have been fixed!\n');
    console.log('   You can now make clinicId required in the schema.\n');
  }
}

main()
  .catch((e) => {
    console.error('Script failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
