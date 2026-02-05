/**
 * Fix Encrypted Patient Names
 * ===========================
 * 
 * Finds patients where names appear encrypted but aren't decrypting properly,
 * and allows updating them with correct values.
 * 
 * Usage:
 *   npx tsx scripts/fix-encrypted-patient-names.ts --check
 *   npx tsx scripts/fix-encrypted-patient-names.ts --fix
 */

import * as dotenv from 'dotenv';
// Load .env.local which contains ENCRYPTION_KEY
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { PrismaClient } from '@prisma/client';
import { decryptPHI, encryptPHI, isEncrypted } from '../src/lib/security/phi-encryption';

const prisma = new PrismaClient();

interface PatientWithEncryptedName {
  id: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  clinicId: number | null;
  decryptedFirstName: string | null;
  decryptedLastName: string | null;
  decryptionFailed: boolean;
}

async function findPatientsWithEncryptedNames(): Promise<PatientWithEncryptedName[]> {
  const patients = await prisma.patient.findMany({
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      clinicId: true,
    },
    orderBy: { id: 'desc' },
    take: 500, // Check recent patients
  });

  const results: PatientWithEncryptedName[] = [];

  for (const patient of patients) {
    const firstNameEncrypted = isEncrypted(patient.firstName);
    const lastNameEncrypted = isEncrypted(patient.lastName);

    if (firstNameEncrypted || lastNameEncrypted) {
      let decryptedFirstName: string | null = null;
      let decryptedLastName: string | null = null;
      let decryptionFailed = false;

      try {
        decryptedFirstName = decryptPHI(patient.firstName);
      } catch {
        decryptionFailed = true;
      }

      try {
        decryptedLastName = decryptPHI(patient.lastName);
      } catch {
        decryptionFailed = true;
      }

      // Check if decryption returned the same encrypted value (meaning it failed silently)
      if (decryptedFirstName === patient.firstName || decryptedLastName === patient.lastName) {
        decryptionFailed = true;
      }

      // Check if decrypted names still look encrypted
      if (isEncrypted(decryptedFirstName) || isEncrypted(decryptedLastName)) {
        decryptionFailed = true;
      }

      results.push({
        id: patient.id,
        firstName: patient.firstName,
        lastName: patient.lastName,
        email: patient.email,
        clinicId: patient.clinicId,
        decryptedFirstName,
        decryptedLastName,
        decryptionFailed,
      });
    }
  }

  return results;
}

async function checkPatients() {
  console.log('🔍 Checking for patients with encrypted names...\n');

  const patients = await findPatientsWithEncryptedNames();

  if (patients.length === 0) {
    console.log('✅ No patients found with encrypted names that need attention.');
    return;
  }

  console.log(`Found ${patients.length} patients with encrypted names:\n`);

  for (const p of patients) {
    console.log(`Patient ID: ${p.id} (Clinic: ${p.clinicId})`);
    console.log(`  Raw firstName: ${p.firstName?.substring(0, 50)}...`);
    console.log(`  Raw lastName: ${p.lastName?.substring(0, 50)}...`);
    console.log(`  Decrypted: ${p.decryptedFirstName} ${p.decryptedLastName}`);
    console.log(`  Status: ${p.decryptionFailed ? '❌ DECRYPTION FAILED' : '✅ OK'}`);
    console.log('');
  }

  const failed = patients.filter(p => p.decryptionFailed);
  if (failed.length > 0) {
    console.log(`\n⚠️  ${failed.length} patients have names that cannot be decrypted.`);
    console.log('These may need manual correction or the data is corrupted.');
  }
}

// Manual name corrections - add patient IDs and correct names here
const NAME_CORRECTIONS: Record<number, { firstName: string; lastName: string }> = {
  9: { firstName: 'Test', lastName: 'Patient' },
  10: { firstName: 'Test', lastName: 'Patient' },
  // Patient 1 (nell4755@gmail.com) - add correct name when known
  // 1: { firstName: '???', lastName: '???' },
};

async function fixPatientNames() {
  console.log('🔧 Fixing patient names...\n');

  const patients = await findPatientsWithEncryptedNames();
  const failed = patients.filter(p => p.decryptionFailed);

  if (failed.length === 0) {
    console.log('✅ No patients need fixing - all names decrypt properly.');
    return;
  }

  console.log(`Found ${failed.length} patients that need name corrections.\n`);

  for (const p of failed) {
    const correction = NAME_CORRECTIONS[p.id];
    
    if (correction) {
      console.log(`Fixing patient ${p.id}: ${correction.firstName} ${correction.lastName}`);
      
      await prisma.patient.update({
        where: { id: p.id },
        data: {
          firstName: encryptPHI(correction.firstName),
          lastName: encryptPHI(correction.lastName),
        },
      });
      
      console.log(`  ✅ Updated`);
    } else {
      console.log(`Patient ${p.id} needs correction but no name provided in NAME_CORRECTIONS.`);
      console.log(`  Current encrypted: ${p.firstName?.substring(0, 40)}...`);
      console.log(`  Add to NAME_CORRECTIONS: ${p.id}: { firstName: '???', lastName: '???' }`);
    }
  }

  console.log('\n✅ Done!');
}

async function main() {
  const args = process.argv.slice(2);
  
  try {
    if (args.includes('--fix')) {
      await fixPatients();
    } else {
      await checkPatients();
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function fixPatients() {
  await fixPatientNames();
}

main().catch(console.error);
