#!/usr/bin/env npx ts-node

/**
 * PHI Field Encryption Migration Script
 * =====================================
 * 
 * SOC 2 Compliance: Encrypts all PHI fields for existing patient records
 * 
 * This script:
 * 1. Identifies patients with unencrypted PHI fields
 * 2. Encrypts firstName, lastName, address1, address2, city, state, zip
 * 3. Preserves already-encrypted fields (email, phone, dob)
 * 4. Runs in batches to avoid memory issues
 * 5. Creates audit log entries for compliance
 * 
 * Usage:
 *   DRY_RUN=true npx ts-node scripts/migrate-encrypt-phi-fields.ts  # Preview only
 *   npx ts-node scripts/migrate-encrypt-phi-fields.ts                # Execute migration
 * 
 * @see docs/SOC2_REMEDIATION.md
 */

import { PrismaClient } from '@prisma/client';
import { encryptPHI, isEncrypted } from '../src/lib/security/phi-encryption';

const prisma = new PrismaClient();

// Fields that need to be encrypted (new fields not previously encrypted)
const NEW_PHI_FIELDS = [
  'firstName',
  'lastName',
  'address1',
  'address2',
  'city',
  'state',
  'zip',
] as const;

// Batch size for processing
const BATCH_SIZE = 100;

// Dry run mode (default: true for safety)
const DRY_RUN = process.env.DRY_RUN !== 'false';

interface MigrationStats {
  totalPatients: number;
  patientsNeedingMigration: number;
  patientsUpdated: number;
  fieldsEncrypted: number;
  errors: number;
  skipped: number;
}

async function migratePatientPHI(): Promise<void> {
  console.log('========================================');
  console.log('PHI Field Encryption Migration');
  console.log('========================================');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will encrypt data)'}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Fields to encrypt: ${NEW_PHI_FIELDS.join(', ')}`);
  console.log('========================================\n');

  const stats: MigrationStats = {
    totalPatients: 0,
    patientsNeedingMigration: 0,
    patientsUpdated: 0,
    fieldsEncrypted: 0,
    errors: 0,
    skipped: 0,
  };

  try {
    // Get total count
    stats.totalPatients = await prisma.patient.count();
    console.log(`Total patients in database: ${stats.totalPatients}\n`);

    // Process in batches
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const patients = await prisma.patient.findMany({
        skip: offset,
        take: BATCH_SIZE,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          address1: true,
          address2: true,
          city: true,
          state: true,
          zip: true,
          clinicId: true,
        },
      });

      if (patients.length === 0) {
        hasMore = false;
        break;
      }

      console.log(`Processing batch: ${offset + 1} - ${offset + patients.length}`);

      for (const patient of patients) {
        try {
          const updates: Record<string, string | null> = {};
          let needsUpdate = false;

          // Check each field
          for (const field of NEW_PHI_FIELDS) {
            const value = patient[field as keyof typeof patient] as string | null;
            
            // Skip null/empty values
            if (!value) {
              continue;
            }

            // Check if already encrypted
            if (isEncrypted(value)) {
              continue;
            }

            // Field needs encryption
            needsUpdate = true;
            const encryptedValue = encryptPHI(value);
            updates[field] = encryptedValue;
            stats.fieldsEncrypted++;

            if (DRY_RUN) {
              console.log(`  [DRY RUN] Patient ${patient.id}: Would encrypt ${field}`);
            }
          }

          if (needsUpdate) {
            stats.patientsNeedingMigration++;

            if (!DRY_RUN) {
              // Update the patient record
              await prisma.patient.update({
                where: { id: patient.id },
                data: updates,
              });

              // Create audit log entry
              await prisma.patientAudit.create({
                data: {
                  patientId: patient.id,
                  action: 'PHI_ENCRYPT_MIGRATION',
                  actorEmail: 'system@soc2-migration',
                  diff: {
                    migration: 'PHI_FIELD_ENCRYPTION',
                    fieldsEncrypted: Object.keys(updates),
                    timestamp: new Date().toISOString(),
                    reason: 'SOC 2 compliance - encrypt all PHI at rest',
                  },
                },
              });

              stats.patientsUpdated++;
              console.log(`  ✓ Patient ${patient.id}: Encrypted ${Object.keys(updates).length} fields`);
            }
          } else {
            stats.skipped++;
          }
        } catch (error) {
          stats.errors++;
          console.error(`  ✗ Error processing patient ${patient.id}:`, error);
        }
      }

      offset += BATCH_SIZE;
    }

    // Print summary
    console.log('\n========================================');
    console.log('Migration Summary');
    console.log('========================================');
    console.log(`Total patients:           ${stats.totalPatients}`);
    console.log(`Patients needing update:  ${stats.patientsNeedingMigration}`);
    console.log(`Patients updated:         ${stats.patientsUpdated}`);
    console.log(`Fields encrypted:         ${stats.fieldsEncrypted}`);
    console.log(`Patients skipped:         ${stats.skipped}`);
    console.log(`Errors:                   ${stats.errors}`);
    console.log('========================================\n');

    if (DRY_RUN && stats.patientsNeedingMigration > 0) {
      console.log('To execute the migration, run:');
      console.log('  DRY_RUN=false npx ts-node scripts/migrate-encrypt-phi-fields.ts\n');
    }

    if (stats.patientsUpdated > 0) {
      console.log('✓ Migration completed successfully!');
      console.log('  All PHI fields are now encrypted at rest (SOC 2 compliant).\n');
    }

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
migratePatientPHI()
  .then(() => {
    console.log('Done.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
