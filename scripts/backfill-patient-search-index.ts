/**
 * Backfill script: Populate `searchIndex` column for all existing patients.
 *
 * The `searchIndex` column enables DB-level full-text search using a pg_trgm
 * GIN index, replacing the previous in-memory decryption-based search that
 * was capped at 2000 records. This scales to 10M+ records.
 *
 * This script:
 *  1. Finds all patients where searchIndex IS NULL
 *  2. Decrypts their PHI fields (firstName, lastName, email, phone)
 *  3. Builds a lowercased search index: "firstname lastname email phone_digits patientid"
 *  4. Updates the searchIndex column
 *
 * Processes in batches of 500 for memory efficiency. Safe to re-run
 * (only touches records with NULL searchIndex).
 *
 * Usage:
 *   DRY_RUN=true npx tsx scripts/backfill-patient-search-index.ts   # preview
 *   npx tsx scripts/backfill-patient-search-index.ts                 # execute
 *
 * For production, load env vars first:
 *   env $(grep -v '^#' .env.production.local | grep -v '^\s*$' | tr -d '\r' | xargs) \
 *     npx tsx scripts/backfill-patient-search-index.ts
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN === 'true';
const BATCH_SIZE = 500;

// ============================================================================
// PHI Decryption (inline to avoid import issues in standalone scripts)
// ============================================================================

const algorithm = 'aes-256-gcm';

function getEncryptionKey(): Buffer {
  const key = process.env.PHI_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('PHI_ENCRYPTION_KEY environment variable is required');
  }
  return Buffer.from(key, 'base64');
}

function decryptPHI(encryptedData: string | null | undefined): string | null {
  if (!encryptedData) return null;
  try {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) return encryptedData; // Not encrypted

    // Quick check if it looks like encrypted data
    if (!parts.every((p) => /^[A-Za-z0-9+/]+=*$/.test(p) && p.length >= 2)) {
      return encryptedData; // Not encrypted format
    }

    const key = getEncryptionKey();
    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const encrypted = Buffer.from(parts[2], 'base64');

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return null; // Decryption failed
  }
}

// ============================================================================
// Search Index Builder (inline to avoid import issues)
// ============================================================================

function buildSearchIndex(patient: {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  patientId: string | null;
}): string {
  const parts: string[] = [];

  const firstName = decryptPHI(patient.firstName);
  const lastName = decryptPHI(patient.lastName);
  const email = decryptPHI(patient.email);
  const phone = decryptPHI(patient.phone);

  if (firstName?.trim()) parts.push(firstName.toLowerCase().trim());
  if (lastName?.trim()) parts.push(lastName.toLowerCase().trim());
  if (email?.trim()) parts.push(email.toLowerCase().trim());
  if (phone?.trim()) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length > 0) parts.push(digits);
  }
  if (patient.patientId?.trim()) parts.push(patient.patientId.toLowerCase().trim());

  return parts.join(' ');
}

// ============================================================================
// Main Backfill
// ============================================================================

async function main() {
  console.log('='.repeat(70));
  console.log('  Patient Search Index Backfill');
  console.log(`  Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '🚀 LIVE (writing to DB)'}`);
  console.log('='.repeat(70));

  // Count total patients needing backfill
  const totalNull = await prisma.patient.count({
    where: { searchIndex: null },
  });
  const totalAll = await prisma.patient.count();

  console.log(`\n  Total patients: ${totalAll}`);
  console.log(`  Needing backfill (searchIndex IS NULL): ${totalNull}`);

  if (totalNull === 0) {
    console.log('\n  ✅ All patients already have a searchIndex. Nothing to do.');
    return;
  }

  let processed = 0;
  let updated = 0;
  let errors = 0;
  let cursor: number | undefined;

  console.log(`\n  Processing in batches of ${BATCH_SIZE}...\n`);

  while (true) {
    // Fetch batch using cursor-based pagination for consistency
    const batch = await prisma.patient.findMany({
      where: {
        searchIndex: null,
        ...(cursor !== undefined && { id: { gt: cursor } }),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        patientId: true,
      },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
    });

    if (batch.length === 0) break;

    for (const patient of batch) {
      try {
        const searchIndex = buildSearchIndex(patient);

        if (!DRY_RUN) {
          await prisma.patient.update({
            where: { id: patient.id },
            data: { searchIndex },
          });
        }

        updated++;

        // Log first few and then every 1000
        if (updated <= 3 || updated % 1000 === 0) {
          console.log(
            `  [${updated}/${totalNull}] Patient #${patient.id} (${patient.patientId || 'no-id'}) → "${searchIndex.substring(0, 80)}${searchIndex.length > 80 ? '...' : ''}"`
          );
        }
      } catch (err) {
        errors++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ❌ Error on patient #${patient.id}: ${msg}`);
      }

      processed++;
    }

    cursor = batch[batch.length - 1].id;

    // Progress update every batch
    const pct = ((processed / totalNull) * 100).toFixed(1);
    process.stdout.write(`  Progress: ${processed}/${totalNull} (${pct}%)  \r`);
  }

  console.log('\n');
  console.log('='.repeat(70));
  console.log(`  Results:`);
  console.log(`    Processed: ${processed}`);
  console.log(`    Updated:   ${updated}`);
  console.log(`    Errors:    ${errors}`);
  console.log(`    Mode:      ${DRY_RUN ? 'DRY RUN (no changes made)' : 'LIVE (changes committed)'}`);
  console.log('='.repeat(70));

  if (DRY_RUN) {
    console.log('\n  💡 Run without DRY_RUN=true to apply changes.');
  }
}

main()
  .catch((err) => {
    console.error('\n❌ Fatal error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
