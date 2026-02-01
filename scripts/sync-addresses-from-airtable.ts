#!/usr/bin/env npx tsx
/**
 * Sync Patient Addresses from Airtable
 * =====================================
 * Fetches shipping_address from Airtable and updates patient records in the database.
 *
 * Required Environment Variables:
 *   AIRTABLE_API_KEY     - Airtable Personal Access Token
 *   AIRTABLE_BASE_ID     - Base ID (starts with "app")
 *   AIRTABLE_TABLE_NAME  - Table name (default: "2026 Q1 Fillout Intake - 1")
 *   DATABASE_URL         - PostgreSQL connection string
 *
 * Usage:
 *   AIRTABLE_API_KEY=pat... AIRTABLE_BASE_ID=app... npx tsx scripts/sync-addresses-from-airtable.ts [options]
 *
 * Options:
 *   --dry-run       Preview changes without saving (default: true)
 *   --limit=N       Limit number of records to process (default: 100)
 *   --force         Run without confirmation prompt
 *
 * Examples:
 *   # Preview what would be updated
 *   npx tsx scripts/sync-addresses-from-airtable.ts --dry-run
 *
 *   # Apply updates
 *   npx tsx scripts/sync-addresses-from-airtable.ts --dry-run=false --force
 */

import { PrismaClient } from '@prisma/client';
import { parseAddressString, normalizeState, normalizeZip } from '../src/lib/address';

const prisma = new PrismaClient();

// Configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME || 'Orders';
const WELLMEDR_CLINIC_ID = 7;

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: true,
    limit: 100,
    force: false,
  };

  for (const arg of args) {
    if (arg === '--dry-run' || arg === '--dry-run=true') {
      options.dryRun = true;
    } else if (arg === '--dry-run=false') {
      options.dryRun = false;
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--force') {
      options.force = true;
    }
  }

  return options;
}

interface AirtableRecord {
  id: string;
  fields: {
    email?: string;
    'customer_email'?: string;
    'shipping_address'?: string;
    'billing_address'?: string;
    state?: string;
    // Other fields we might need
    [key: string]: any;
  };
}

interface AirtableResponse {
  records: AirtableRecord[];
  offset?: string;
}

/**
 * Fetch records from Airtable
 */
async function fetchAirtableRecords(offset?: string): Promise<AirtableResponse> {
  const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`);

  // Request fields we need (Orders table uses customer_email, not email)
  url.searchParams.append('fields[]', 'customer_email');
  url.searchParams.append('fields[]', 'shipping_address');
  url.searchParams.append('fields[]', 'billing_address');

  // Filter for records with shipping_address
  url.searchParams.append('filterByFormula', 'AND({shipping_address} != "", {customer_email} != "")');

  if (offset) {
    url.searchParams.append('offset', offset);
  }

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Airtable API error: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Get all records from Airtable (handles pagination)
 */
async function getAllAirtableRecords(limit: number): Promise<AirtableRecord[]> {
  const allRecords: AirtableRecord[] = [];
  let offset: string | undefined;

  console.log('Fetching records from Airtable...');

  do {
    const response = await fetchAirtableRecords(offset);
    allRecords.push(...response.records);
    offset = response.offset;

    console.log(`  Fetched ${allRecords.length} records so far...`);

    if (allRecords.length >= limit) {
      break;
    }
  } while (offset);

  return allRecords.slice(0, limit);
}

interface SyncResult {
  email: string;
  patientId: number | null;
  airtableRecordId: string;
  before: {
    address1: string;
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
  status: 'updated' | 'no_change' | 'patient_not_found' | 'no_address' | 'error';
  error?: string;
}

async function main() {
  const options = parseArgs();

  console.log('\n========================================');
  console.log('Sync Addresses from Airtable');
  console.log('========================================\n');

  // Validate configuration
  if (!AIRTABLE_API_KEY) {
    console.error('❌ Missing AIRTABLE_API_KEY environment variable');
    console.log('\nTo get your API key:');
    console.log('1. Go to https://airtable.com/create/tokens');
    console.log('2. Create a new Personal Access Token');
    console.log('3. Add scopes: data.records:read');
    console.log('4. Add access to your WellMedR base');
    process.exit(1);
  }

  if (!AIRTABLE_BASE_ID) {
    console.error('❌ Missing AIRTABLE_BASE_ID environment variable');
    console.log('\nTo get your Base ID:');
    console.log('1. Open your Airtable base in a browser');
    console.log('2. Look at the URL: https://airtable.com/appXXXXXXXX/...');
    console.log('3. The Base ID starts with "app"');
    process.exit(1);
  }

  console.log('Options:');
  console.log(`  Dry run:     ${options.dryRun ? 'YES (no changes will be saved)' : 'NO (changes WILL be saved)'}`);
  console.log(`  Limit:       ${options.limit}`);
  console.log(`  Base ID:     ${AIRTABLE_BASE_ID}`);
  console.log(`  Table:       ${AIRTABLE_TABLE_NAME}`);
  console.log('');

  // Confirmation prompt
  if (!options.dryRun && !options.force) {
    console.log('⚠️  WARNING: This will modify patient records in the database.');
    console.log('    Run with --dry-run first to preview changes.');
    console.log('    Add --force to skip this prompt.\n');
    process.exit(1);
  }

  try {
    // Fetch records from Airtable
    const airtableRecords = await getAllAirtableRecords(options.limit);
    console.log(`\nFound ${airtableRecords.length} records with shipping addresses in Airtable.\n`);

    if (airtableRecords.length === 0) {
      console.log('No records to process.');
      return;
    }

    // Process each record
    const results: SyncResult[] = [];
    let updatedCount = 0;
    let notFoundCount = 0;
    let noChangeCount = 0;
    let errorCount = 0;

    for (let i = 0; i < airtableRecords.length; i++) {
      const record = airtableRecords[i];
      const email = (record.fields.email || record.fields.customer_email || '').toLowerCase().trim();
      const shippingAddress = record.fields.shipping_address || record.fields.billing_address || '';

      console.log(`[${i + 1}/${airtableRecords.length}] Processing ${email}...`);

      const result: SyncResult = {
        email,
        patientId: null,
        airtableRecordId: record.id,
        before: { address1: '', city: '', state: '', zip: '' },
        after: { address1: '', address2: '', city: '', state: '', zip: '' },
        status: 'no_address',
      };

      if (!email) {
        console.log('  ⏭️  Skipping - no email');
        results.push(result);
        continue;
      }

      if (!shippingAddress) {
        console.log('  ⏭️  Skipping - no shipping address');
        results.push(result);
        continue;
      }

      try {
        // Find patient by email
        const patient = await prisma.patient.findFirst({
          where: {
            email: { equals: email, mode: 'insensitive' },
            clinicId: WELLMEDR_CLINIC_ID,
          },
          select: {
            id: true,
            address1: true,
            address2: true,
            city: true,
            state: true,
            zip: true,
          },
        });

        if (!patient) {
          console.log('  ⚠️  Patient not found in database');
          result.status = 'patient_not_found';
          notFoundCount++;
          results.push(result);
          continue;
        }

        result.patientId = patient.id;
        result.before = {
          address1: patient.address1 || '',
          city: patient.city || '',
          state: patient.state || '',
          zip: patient.zip || '',
        };

        // Parse the shipping address (handle both JSON and string formats)
        console.log(`  📍 Parsing: "${shippingAddress.substring(0, 50)}..."`);

        let parsed;
        // Check if it's a JSON object
        if (shippingAddress.trim().startsWith('{')) {
          try {
            const jsonAddr = JSON.parse(shippingAddress);
            parsed = {
              address1: jsonAddr.address || jsonAddr.street || '',
              address2: jsonAddr.apartment || jsonAddr.apt || jsonAddr.suite || '',
              city: jsonAddr.city || '',
              state: normalizeState(jsonAddr.state || ''),
              zip: normalizeZip(jsonAddr.zipCode || jsonAddr.zip || jsonAddr.postalCode || ''),
            };
          } catch {
            // If JSON parse fails, treat as regular string
            parsed = parseAddressString(shippingAddress);
          }
        } else {
          parsed = parseAddressString(shippingAddress);
        }

        result.after = {
          address1: parsed.address1,
          address2: parsed.address2,
          city: parsed.city,
          state: normalizeState(parsed.state),
          zip: normalizeZip(parsed.zip),
        };

        console.log(`     → ${result.after.address1}, ${result.after.city}, ${result.after.state} ${result.after.zip}`);

        // Check if update is needed
        const needsUpdate =
          (!patient.address1 && result.after.address1) ||
          (!patient.city && result.after.city) ||
          (!patient.zip && result.after.zip);

        if (!needsUpdate) {
          console.log('  ⏭️  No update needed - address already complete');
          result.status = 'no_change';
          noChangeCount++;
          results.push(result);
          continue;
        }

        // Apply update
        if (!options.dryRun) {
          await prisma.patient.update({
            where: { id: patient.id },
            data: {
              address1: result.after.address1 || patient.address1,
              address2: result.after.address2 || patient.address2 || null,
              city: result.after.city || patient.city,
              state: result.after.state || patient.state,
              zip: result.after.zip || patient.zip,
            },
          });
          console.log('  ✅ Updated!');
        } else {
          console.log('  ✅ Would update (dry run)');
        }

        result.status = 'updated';
        updatedCount++;
        results.push(result);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.log(`  ❌ Error: ${errorMessage}`);
        result.status = 'error';
        result.error = errorMessage;
        errorCount++;
        results.push(result);
      }
    }

    // Summary
    console.log('\n========================================');
    console.log('Sync Summary');
    console.log('========================================\n');
    console.log(`Total processed:      ${airtableRecords.length}`);
    console.log(`${options.dryRun ? 'Would update' : 'Updated'}:         ${updatedCount}`);
    console.log(`No change needed:     ${noChangeCount}`);
    console.log(`Patient not found:    ${notFoundCount}`);
    console.log(`Errors:               ${errorCount}`);

    // Show sample updates
    if (updatedCount > 0) {
      console.log('\nSample updates:');
      const updated = results.filter(r => r.status === 'updated').slice(0, 5);
      for (const r of updated) {
        console.log(`\n  ${r.email} (Patient ${r.patientId}):`);
        console.log(`    Before: ${r.before.address1 || '(empty)'}, ${r.before.city || '(empty)'}, ${r.before.state} ${r.before.zip || '(empty)'}`);
        console.log(`    After:  ${r.after.address1}, ${r.after.city}, ${r.after.state} ${r.after.zip}`);
      }
    }

    if (options.dryRun) {
      console.log('\n💡 Run with --dry-run=false --force to apply changes.');
    }

  } catch (error) {
    console.error('\n❌ Sync failed:', error);
    process.exit(1);
  }
}

main()
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
