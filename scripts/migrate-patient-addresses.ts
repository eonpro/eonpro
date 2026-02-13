#!/usr/bin/env npx tsx
/**
 * Patient Address Migration Script
 * =================================
 * Updates existing patients that have incomplete addresses by:
 * 1. Re-parsing combined address strings stored in metadata or address1
 * 2. Validating with SmartyStreets (if configured)
 * 3. Updating the patient record with standardized address components
 *
 * Usage:
 *   npx tsx scripts/migrate-patient-addresses.ts [options]
 *
 * Options:
 *   --dry-run       Preview changes without saving (default: true)
 *   --clinic=ID     Only process patients for a specific clinic
 *   --limit=N       Limit number of patients to process (default: 100)
 *   --validate      Use SmartyStreets validation (requires API keys)
 *   --force         Run without confirmation prompt
 *
 * Examples:
 *   npx tsx scripts/migrate-patient-addresses.ts --dry-run
 *   npx tsx scripts/migrate-patient-addresses.ts --clinic=5 --limit=50
 *   npx tsx scripts/migrate-patient-addresses.ts --dry-run=false --validate
 */

import { PrismaClient } from '@prisma/client';
import {
  parseAddressString,
  normalizeState,
  normalizeZip,
} from '../src/lib/address';
import { validateAndStandardizeAddress, isSmartyStreetsConfigured } from '../src/lib/address/smartystreets';
import { logAddressValidationEvent } from '../src/lib/address/analytics';

const prisma = new PrismaClient();

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: true,
    clinicId: null as number | null,
    limit: 100,
    validate: false,
    force: false,
  };

  for (const arg of args) {
    if (arg === '--dry-run' || arg === '--dry-run=true') {
      options.dryRun = true;
    } else if (arg === '--dry-run=false') {
      options.dryRun = false;
    } else if (arg.startsWith('--clinic=')) {
      options.clinicId = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--validate') {
      options.validate = true;
    } else if (arg === '--force') {
      options.force = true;
    }
  }

  return options;
}

interface MigrationResult {
  patientId: number;
  clinicId: number;
  email: string;
  before: {
    address1: string;
    address2: string | null;
    city: string;
    state: string;
    zip: string;
  };
  after: {
    address1: string;
    address2: string;
    city: string;
    state: string;
    zip: string;
  };
  source: 'address1_parsing' | 'metadata_parsing' | 'smarty_standardization';
  wasUpdated: boolean;
  error?: string;
}

async function findPatientsWithIncompleteAddresses(
  clinicId: number | null,
  limit: number
) {
  const where: any = {
    OR: [
      // Missing city (empty string)
      { city: '' },
      // Missing ZIP (empty string)
      { zip: '' },
      // Has combined address in address1 (contains comma)
      { address1: { contains: ',' } },
    ],
  };

  if (clinicId) {
    where.clinicId = clinicId;
  }

  return prisma.patient.findMany({
    where,
    take: limit,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      clinicId: true,
      email: true,
      address1: true,
      address2: true,
      city: true,
      state: true,
      zip: true,
      createdAt: true,
    },
  });
}

async function processPatient(
  patient: Awaited<ReturnType<typeof findPatientsWithIncompleteAddresses>>[0],
  options: { validate: boolean; dryRun: boolean }
): Promise<MigrationResult> {
  const result: MigrationResult = {
    patientId: patient.id,
    clinicId: patient.clinicId,
    email: patient.email,
    before: {
      address1: patient.address1,
      address2: patient.address2,
      city: patient.city,
      state: patient.state,
      zip: patient.zip,
    },
    after: {
      address1: patient.address1,
      address2: patient.address2 || '',
      city: patient.city,
      state: patient.state,
      zip: patient.zip,
    },
    source: 'address1_parsing',
    wasUpdated: false,
  };

  try {
    // Check if address1 looks like a combined address (contains comma)
    if (patient.address1 && patient.address1.includes(',')) {
      console.log(`  Parsing combined address: "${patient.address1.substring(0, 50)}..."`);

      const parsed = parseAddressString(patient.address1);

      // Only use parsed values if we got meaningful components
      if (parsed.city || parsed.state || parsed.zip) {
        result.after = {
          address1: parsed.address1,
          address2: parsed.address2,
          city: parsed.city || patient.city,
          state: normalizeState(parsed.state) || patient.state,
          zip: normalizeZip(parsed.zip) || patient.zip,
        };
        result.source = 'address1_parsing';

        console.log(`    Parsed: ${result.after.address1}, ${result.after.city}, ${result.after.state} ${result.after.zip}`);
      }
    }

    // If still incomplete and validation is enabled, try SmartyStreets
    if (options.validate && isSmartyStreetsConfigured()) {
      const hasCompleteAddress =
        result.after.address1 &&
        result.after.city &&
        result.after.state &&
        result.after.zip;

      if (hasCompleteAddress) {
        console.log(`  Validating with SmartyStreets...`);

        const validated = await validateAndStandardizeAddress(
          {
            address1: result.after.address1,
            address2: result.after.address2,
            city: result.after.city,
            state: result.after.state,
            zip: result.after.zip,
          },
          { useExternalValidation: true, timeout: 5000 }
        );

        if (validated.isValid && validated.wasStandardized) {
          result.after = {
            address1: validated.address1,
            address2: validated.address2,
            city: validated.city,
            state: validated.state,
            zip: validated.zip,
          };
          result.source = 'smarty_standardization';
          console.log(`    Standardized: ${result.after.address1}, ${result.after.city}, ${result.after.state} ${result.after.zip}`);
        }
      }
    }

    // Determine if anything changed
    const hasChanges =
      result.after.address1 !== result.before.address1 ||
      result.after.address2 !== (result.before.address2 || '') ||
      result.after.city !== result.before.city ||
      result.after.state !== result.before.state ||
      result.after.zip !== result.before.zip;

    if (hasChanges) {
      if (!options.dryRun) {
        await prisma.patient.update({
          where: { id: patient.id },
          data: {
            address1: result.after.address1,
            address2: result.after.address2 || null,
            city: result.after.city,
            state: result.after.state,
            zip: result.after.zip,
          },
        });

        // Log analytics
        await logAddressValidationEvent({
          type: 'PARSE_SUCCESS',
          clinicId: patient.clinicId,
          patientId: patient.id,
          source: 'migration',
          inputFormat: 'combined_string',
          originalInput: patient.address1,
          parsedAddress: result.after,
          wasStandardized: result.source === 'smarty_standardization',
        });
      }
      result.wasUpdated = !options.dryRun;
    }

    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    return result;
  }
}

async function main() {
  const options = parseArgs();

  console.log('\n========================================');
  console.log('Patient Address Migration Script');
  console.log('========================================\n');

  console.log('Options:');
  console.log(`  Dry run:     ${options.dryRun ? 'YES (no changes will be saved)' : 'NO (changes WILL be saved)'}`);
  console.log(`  Clinic ID:   ${options.clinicId || 'ALL'}`);
  console.log(`  Limit:       ${options.limit}`);
  console.log(`  Validate:    ${options.validate ? 'YES (using SmartyStreets)' : 'NO'}`);
  console.log(`  SmartyStreets configured: ${isSmartyStreetsConfigured() ? 'YES' : 'NO'}`);
  console.log('');

  // Confirmation prompt (unless --force)
  if (!options.dryRun && !options.force) {
    console.log('⚠️  WARNING: This will modify patient records in the database.');
    console.log('    Run with --dry-run first to preview changes.');
    console.log('    Add --force to skip this prompt.\n');
    process.exit(1);
  }

  // Find patients with incomplete addresses
  console.log('Finding patients with incomplete addresses...\n');
  const patients = await findPatientsWithIncompleteAddresses(
    options.clinicId,
    options.limit
  );

  console.log(`Found ${patients.length} patients to process.\n`);

  if (patients.length === 0) {
    console.log('No patients need address migration.');
    return;
  }

  // Process each patient
  const results: MigrationResult[] = [];
  let successCount = 0;
  let errorCount = 0;
  let unchangedCount = 0;

  for (let i = 0; i < patients.length; i++) {
    const patient = patients[i];
    console.log(`[${i + 1}/${patients.length}] Processing patient ${patient.id} (${patient.email})...`);

    const result = await processPatient(patient, options);
    results.push(result);

    if (result.error) {
      errorCount++;
      console.log(`  ❌ Error: ${result.error}`);
    } else if (
      result.after.address1 !== result.before.address1 ||
      result.after.city !== result.before.city ||
      result.after.state !== result.before.state ||
      result.after.zip !== result.before.zip
    ) {
      successCount++;
      console.log(`  ✅ ${options.dryRun ? 'Would update' : 'Updated'}`);
    } else {
      unchangedCount++;
      console.log(`  ⏭️  No changes needed`);
    }
    console.log('');
  }

  // Summary
  console.log('\n========================================');
  console.log('Migration Summary');
  console.log('========================================\n');
  console.log(`Total processed:   ${patients.length}`);
  console.log(`${options.dryRun ? 'Would update' : 'Updated'}:      ${successCount}`);
  console.log(`Unchanged:         ${unchangedCount}`);
  console.log(`Errors:            ${errorCount}`);

  // Show sample results
  if (successCount > 0) {
    console.log('\nSample changes:');
    const changedResults = results
      .filter(r => !r.error && r.after.city !== r.before.city)
      .slice(0, 5);

    for (const r of changedResults) {
      console.log(`\n  Patient ${r.patientId}:`);
      console.log(`    Before: ${r.before.address1}, ${r.before.city}, ${r.before.state} ${r.before.zip}`);
      console.log(`    After:  ${r.after.address1}, ${r.after.city}, ${r.after.state} ${r.after.zip}`);
    }
  }

  if (options.dryRun) {
    console.log('\n💡 Run with --dry-run=false --force to apply changes.');
  }
}

main()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
