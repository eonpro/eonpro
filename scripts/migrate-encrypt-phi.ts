#!/usr/bin/env tsx
/**
 * Migration Script: Encrypt Existing PHI Data
 * This script encrypts all existing patient PHI in the database
 * Run with: npx tsx scripts/migrate-encrypt-phi.ts
 */

import { prisma } from '../src/lib/db';
import { encryptPHI, isEncrypted } from '../src/lib/security/phi-encryption';
// Using console for migration script

async function migratePatientPHI() {
  console.log('Starting PHI encryption migration...');
  
  try {
    // Get all patients
    const patients = await prisma.patient.findMany({
      select: {
        id: true,
        email: true,
        phone: true,
        dob: true,
      }
    });
    
    console.log(`Found ${patients.length} patients to process`);
    
    let encrypted = 0;
    let skipped = 0;
    let failed = 0;
    
    for (const patient of patients) {
      try {
        // Check if already encrypted
        if (isEncrypted(patient.email) && 
            isEncrypted(patient.phone) && 
            isEncrypted(patient.dob)) {
          skipped++;
          continue;
        }
        
        // Encrypt PHI fields
        const updates: any = {};
        
        if (patient.email && !isEncrypted(patient.email)) {
          updates.email = encryptPHI(patient.email);
        }
        
        if (patient.phone && !isEncrypted(patient.phone)) {
          updates.phone = encryptPHI(patient.phone);
        }
        
        if (patient.dob && !isEncrypted(patient.dob)) {
          updates.dob = encryptPHI(patient.dob);
        }
        
        
        if (Object.keys(updates).length > 0) {
          await prisma.patient.update({
            where: { id: patient.id },
            data: updates
          });
          
          encrypted++;
          
          if (encrypted % 100 === 0) {
            console.log(`Progress: ${encrypted} encrypted, ${skipped} skipped`);
          }
        }
      } catch (error) {
        console.error(`Failed to encrypt patient ${patient.id}:`, error);
        failed++;
      }
    }
    
    console.info('\nMigration complete:');
    console.info(`- Encrypted: ${encrypted} patients`);
    console.info(`- Skipped (already encrypted): ${skipped} patients`);
    console.info(`- Failed: ${failed} patients`);
    
    if (failed > 0) {
      console.error('\n⚠️  Some patients failed to encrypt. Check logs for details.');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Verify environment
if (!process.env.ENCRYPTION_KEY) {
  console.error('❌ ENCRYPTION_KEY environment variable is required');
  console.error('Generate with: openssl rand -hex 32');
  process.exit(1);
}

if (process.env.ENCRYPTION_KEY.length !== 64) {
  console.error('❌ ENCRYPTION_KEY must be 32 bytes (64 hex characters)');
  process.exit(1);
}

// Confirmation prompt for production
if (process.env.NODE_ENV === 'production') {
  console.info('⚠️  WARNING: Running in PRODUCTION mode');
  console.info('This will encrypt all patient PHI in the database.');
  console.info('Make sure you have a backup before proceeding.');
  console.info('\nPress Ctrl+C to cancel, or wait 10 seconds to continue...');
  
  setTimeout(() => {
    migratePatientPHI();
  }, 10000);
} else {
  migratePatientPHI();
}
