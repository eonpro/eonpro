#!/usr/bin/env npx tsx
/**
 * PHI Encryption Migration Script
 * ================================
 * 
 * One-time migration to encrypt existing unencrypted PHI data.
 * Run this after enabling PHI encryption in the application.
 * 
 * Usage:
 *   npx tsx scripts/migrate-phi-encryption.ts
 * 
 * Environment:
 *   - ENCRYPTION_KEY: Required (64 hex chars)
 *   - DATABASE_URL: Required
 *   - DRY_RUN=true: Optional - preview changes without writing
 * 
 * @security CRITICAL - Run during maintenance window
 */

import { PrismaClient } from '@prisma/client';
import { encryptPHI, isEncrypted } from '../src/lib/security/phi-encryption';
import { logger } from '../src/lib/logger';

const prisma = new PrismaClient();

interface MigrationResult {
  model: string;
  field: string;
  processed: number;
  encrypted: number;
  skipped: number;
  errors: string[];
}

async function main() {
  const isDryRun = process.env.DRY_RUN === 'true';
  
  console.log('\n========================================');
  console.log('PHI ENCRYPTION MIGRATION');
  console.log('========================================\n');
  
  if (isDryRun) {
    console.log('⚠️  DRY RUN MODE - No changes will be made\n');
  }
  
  // Verify encryption key is configured
  if (!process.env.ENCRYPTION_KEY) {
    console.error('❌ ENCRYPTION_KEY environment variable is required');
    process.exit(1);
  }
  
  const results: MigrationResult[] = [];
  
  // 1. Migrate Patient SSN
  console.log('📋 Processing Patient SSN...');
  const ssnResult = await migratePatientSSN(isDryRun);
  results.push(ssnResult);
  
  // 2. Summary
  console.log('\n========================================');
  console.log('MIGRATION SUMMARY');
  console.log('========================================\n');
  
  let totalEncrypted = 0;
  let totalErrors = 0;
  
  for (const result of results) {
    console.log(`${result.model}.${result.field}:`);
    console.log(`  - Processed: ${result.processed}`);
    console.log(`  - Encrypted: ${result.encrypted}`);
    console.log(`  - Skipped (already encrypted): ${result.skipped}`);
    console.log(`  - Errors: ${result.errors.length}`);
    
    totalEncrypted += result.encrypted;
    totalErrors += result.errors.length;
    
    if (result.errors.length > 0) {
      console.log('  - Error details:');
      result.errors.slice(0, 5).forEach(e => console.log(`      ${e}`));
      if (result.errors.length > 5) {
        console.log(`      ... and ${result.errors.length - 5} more`);
      }
    }
    console.log('');
  }
  
  console.log('========================================');
  console.log(`Total encrypted: ${totalEncrypted}`);
  console.log(`Total errors: ${totalErrors}`);
  console.log('========================================\n');
  
  if (isDryRun) {
    console.log('✅ Dry run complete. Run without DRY_RUN=true to apply changes.\n');
  } else if (totalErrors > 0) {
    console.log('⚠️  Migration completed with errors. Please review.\n');
  } else {
    console.log('✅ Migration completed successfully!\n');
  }
}

async function migratePatientSSN(isDryRun: boolean): Promise<MigrationResult> {
  const result: MigrationResult = {
    model: 'Patient',
    field: 'ssn',
    processed: 0,
    encrypted: 0,
    skipped: 0,
    errors: [],
  };
  
  try {
    // Find all patients with SSN
    const patients = await prisma.patient.findMany({
      select: { id: true, ssn: true },
      where: {
        ssn: { not: null },
      },
    });
    
    result.processed = patients.length;
    console.log(`  Found ${patients.length} patients with SSN`);
    
    for (const patient of patients) {
      try {
        if (!patient.ssn) {
          continue;
        }
        
        // Check if already encrypted
        if (isEncrypted(patient.ssn)) {
          result.skipped++;
          continue;
        }
        
        // Encrypt
        const encryptedSSN = encryptPHI(patient.ssn);
        
        if (!isDryRun && encryptedSSN) {
          await prisma.patient.update({
            where: { id: patient.id },
            data: { ssn: encryptedSSN },
          });
        }
        
        result.encrypted++;
        
        // Progress indicator
        if (result.encrypted % 100 === 0) {
          console.log(`  ... encrypted ${result.encrypted} records`);
        }
        
      } catch (err) {
        result.errors.push(`Patient ${patient.id}: ${err}`);
      }
    }
    
  } catch (err) {
    result.errors.push(`Query error: ${err}`);
  }
  
  return result;
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
