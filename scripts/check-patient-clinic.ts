#!/usr/bin/env npx tsx
/**
 * Check Patient Clinic Assignment
 * ===============================
 * 
 * Verifies that patients have correct clinicId assignments.
 * Useful for debugging access issues.
 * 
 * Usage:
 *   npx tsx scripts/check-patient-clinic.ts [patientId...]
 *   npx tsx scripts/check-patient-clinic.ts 66 67 68    # Check specific patients
 *   npx tsx scripts/check-patient-clinic.ts             # Check all problematic patients
 * 
 * @security Contains PHI - do not log to external systems
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkPatient(patientId: number) {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      clinicId: true,
      createdAt: true,
      orders: {
        take: 1,
        select: {
          id: true,
          provider: {
            select: { 
              id: true,
              clinicId: true,
              user: {
                select: { email: true }
              }
            },
          },
        },
      },
      user: {
        select: { 
          id: true, 
          email: true 
        }
      }
    },
  });

  if (!patient) {
    console.log(`\n❌ Patient ${patientId}: NOT FOUND`);
    return null;
  }

  console.log(`\n=== Patient ${patient.id} ===`);
  console.log(`  Name: ${patient.firstName} ${patient.lastName}`);
  console.log(`  Email: ${patient.email}`);
  console.log(`  ClinicId: ${patient.clinicId ?? '❌ MISSING'}`);
  console.log(`  Created: ${patient.createdAt.toISOString()}`);
  
  if (patient.user) {
    console.log(`  LinkedUser: ID=${patient.user.id}, Email=${patient.user.email}`);
  } else {
    console.log(`  LinkedUser: None`);
  }

  if (patient.orders.length > 0) {
    const order = patient.orders[0];
    const providerClinicId = order.provider?.clinicId;
    console.log(`  LatestOrder: ID=${order.id}`);
    console.log(`    Provider: ID=${order.provider?.id}, ClinicId=${providerClinicId}`);
    
    if (patient.clinicId && providerClinicId && patient.clinicId !== providerClinicId) {
      console.log(`    ⚠️  MISMATCH: Patient clinic (${patient.clinicId}) != Provider clinic (${providerClinicId})`);
    }
  } else {
    console.log(`  LatestOrder: None`);
  }

  return patient;
}

async function findProblematicPatients() {
  // Find patients without clinicId
  const orphaned = await prisma.patient.findMany({
    where: { clinicId: null },
    select: { id: true },
  });

  // Find patients where their clinicId doesn't match their provider's clinicId
  const mismatched = await prisma.$queryRaw<{ id: number }[]>`
    SELECT DISTINCT p.id 
    FROM "Patient" p
    JOIN "Order" o ON o."patientId" = p.id
    JOIN "Provider" pr ON o."providerId" = pr.id
    WHERE p."clinicId" IS NOT NULL 
      AND pr."clinicId" IS NOT NULL 
      AND p."clinicId" != pr."clinicId"
    LIMIT 20
  `;

  return {
    orphaned: orphaned.map(p => p.id),
    mismatched: mismatched.map(p => p.id),
  };
}

async function main() {
  const args = process.argv.slice(2);

  console.log('\n========================================');
  console.log('CHECK PATIENT CLINIC ASSIGNMENT');
  console.log('========================================');

  if (args.length > 0) {
    // Check specific patient IDs
    for (const arg of args) {
      const patientId = parseInt(arg, 10);
      if (isNaN(patientId)) {
        console.log(`\n⚠️  Invalid patient ID: ${arg}`);
        continue;
      }
      await checkPatient(patientId);
    }
  } else {
    // Find and check problematic patients
    console.log('\nSearching for problematic patients...');
    
    const { orphaned, mismatched } = await findProblematicPatients();
    
    if (orphaned.length > 0) {
      console.log(`\n🔴 Found ${orphaned.length} patients without clinicId:`);
      for (const id of orphaned.slice(0, 10)) {
        await checkPatient(id);
      }
      if (orphaned.length > 10) {
        console.log(`\n   ... and ${orphaned.length - 10} more`);
      }
    } else {
      console.log('\n✅ No patients without clinicId');
    }

    if (mismatched.length > 0) {
      console.log(`\n🟡 Found ${mismatched.length} patients with mismatched clinic:`);
      for (const id of mismatched.slice(0, 10)) {
        await checkPatient(id);
      }
      if (mismatched.length > 10) {
        console.log(`\n   ... and ${mismatched.length - 10} more`);
      }
    } else {
      console.log('\n✅ No patients with mismatched clinic');
    }
  }

  console.log('\n========================================\n');
}

main()
  .catch((e) => {
    console.error('Script failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
