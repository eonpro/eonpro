/**
 * Backfill script: Populate `emailHash` and `dobHash` columns for all existing patients.
 *
 * These columns store deterministic HMAC-SHA256 hashes of normalized email and DOB,
 * enabling O(1) duplicate detection during intake without exposing plaintext.
 *
 * This script:
 *  1. Finds patients where emailHash IS NULL or dobHash IS NULL
 *  2. Decrypts their email and dob fields (handles both encrypted and plaintext)
 *  3. Computes HMAC-SHA256 hashes via computeEmailHash / computeDobHash
 *  4. Updates the hash columns
 *
 * Processes in batches of 500 for memory efficiency. Safe to re-run
 * (only touches records with NULL hash columns).
 *
 * Usage:
 *   DRY_RUN=true npx tsx scripts/backfill-patient-dedup-hashes.ts   # preview
 *   npx tsx scripts/backfill-patient-dedup-hashes.ts                 # execute
 *
 * For production, load env vars first:
 *   env $(grep -v '^#' .env.production.local | grep -v '^\s*$' | tr -d '\r' | xargs) \
 *     npx tsx scripts/backfill-patient-dedup-hashes.ts
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN === 'true';
const BATCH_SIZE = 500;

// ============================================================================
// Inline PHI decryption (avoids importing app modules from scripts)
// ============================================================================

const algorithm = 'aes-256-gcm';
const tagLength = 16;

function getEncryptionKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY env var must be a 64-char hex string (32 bytes). ' +
      'Set it before running this script.'
    );
  }
  return Buffer.from(keyHex, 'hex');
}

function tryDecrypt(value: string | null | undefined): string | null {
  if (!value) return null;
  const parts = value.split(':').map((p) => p.trim().replace(/\s/g, ''));
  if (parts.length !== 3) return value; // plaintext

  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const encrypted = Buffer.from(parts[2], 'base64');
    const decipher = crypto.createDecipheriv(algorithm, key, iv, { authTagLength: tagLength });
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    return value; // treat as plaintext on failure
  }
}

// ============================================================================
// HMAC hashing (mirrors src/lib/security/phi-encryption.ts logic)
// ============================================================================

const HMAC_ALGO = 'sha256';
const DEDUP_HMAC_CONTEXT = 'patient-dedup-v1';

let hmacKey: Buffer | null = null;

function getHmacKey(): Buffer {
  if (hmacKey) return hmacKey;
  const masterKey = getEncryptionKey();
  hmacKey = crypto.createHmac(HMAC_ALGO, masterKey).update(DEDUP_HMAC_CONTEXT).digest();
  return hmacKey;
}

function hmacHash(value: string): string {
  return crypto.createHmac(HMAC_ALGO, getHmacKey()).update(value).digest('hex');
}

const PLACEHOLDER_EMAILS = new Set([
  'unknown@example.com', 'unknown@intake.local', 'noemail@placeholder.local', '',
]);
const PLACEHOLDER_DOBS = new Set(['1900-01-01', '']);

function computeEmailHash(email: string | null): string | null {
  if (!email) return null;
  const normalized = email.toLowerCase().trim();
  if (PLACEHOLDER_EMAILS.has(normalized) || normalized.endsWith('@intake.local') || normalized.endsWith('@placeholder.local')) {
    return null;
  }
  return hmacHash(normalized);
}

function computeDobHash(dob: string | null): string | null {
  if (!dob) return null;
  const trimmed = dob.trim();
  if (PLACEHOLDER_DOBS.has(trimmed)) return null;

  let normalized = trimmed;
  const slashMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashMatch) {
    const [, mm, dd, yyyy] = slashMatch;
    normalized = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  } else if (trimmed.includes('T')) {
    normalized = trimmed.split('T')[0];
  }

  if (PLACEHOLDER_DOBS.has(normalized)) return null;
  return hmacHash(normalized);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log(`Backfill patient dedup hashes (DRY_RUN=${DRY_RUN})\n`);

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const batch = await prisma.patient.findMany({
      where: {
        OR: [{ emailHash: null }, { dobHash: null }],
      },
      select: { id: true, email: true, dob: true, emailHash: true, dobHash: true },
      take: BATCH_SIZE,
      orderBy: { id: 'asc' },
    });

    if (batch.length === 0) break;

    for (const patient of batch) {
      processed++;
      try {
        const plaintextEmail = tryDecrypt(patient.email);
        const plaintextDob = tryDecrypt(patient.dob);

        const emailH = patient.emailHash ?? computeEmailHash(plaintextEmail);
        const dobH = patient.dobHash ?? computeDobHash(plaintextDob);

        const needsUpdate =
          (patient.emailHash === null && emailH !== null) ||
          (patient.dobHash === null && dobH !== null);

        if (!needsUpdate) {
          skipped++;
          continue;
        }

        if (DRY_RUN) {
          console.log(
            `  [DRY] Patient ${patient.id}: emailHash=${emailH ? 'set' : 'null'}, dobHash=${dobH ? 'set' : 'null'}`
          );
        } else {
          await prisma.patient.update({
            where: { id: patient.id },
            data: {
              ...(patient.emailHash === null ? { emailHash: emailH } : {}),
              ...(patient.dobHash === null ? { dobHash: dobH } : {}),
            },
          });
        }
        updated++;
      } catch (err) {
        errors++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  [ERROR] Patient ${patient.id}: ${msg}`);
      }

      if (processed % 1000 === 0) {
        console.log(`  ... processed ${processed} (updated ${updated}, skipped ${skipped}, errors ${errors})`);
      }
    }
  }

  console.log(`\nDone. Processed ${processed}, updated ${updated}, skipped ${skipped}, errors ${errors}`);
  if (DRY_RUN) {
    console.log('(DRY RUN — no changes were written)');
  }
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
