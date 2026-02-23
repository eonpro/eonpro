/**
 * Find and fix patients with incomplete searchIndex (null, empty, or only one token
 * like "eon-7914" with no name/email/phone). These patients don't show up in search
 * when looking up by name.
 *
 * Usage:
 *   DRY_RUN=true npx tsx scripts/fix-incomplete-search-index.ts              # preview all
 *   DRY_RUN=true npx tsx scripts/fix-incomplete-search-index.ts --clinic eonmeds
 *   npx tsx scripts/fix-incomplete-search-index.ts                           # fix all
 *   npx tsx scripts/fix-incomplete-search-index.ts --clinic eonmeds          # fix eonmeds only
 *
 * Requires: DATABASE_URL, PHI_ENCRYPTION_KEY (for decryption).
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { isSearchIndexIncomplete } from '../src/lib/utils/search';

const prisma = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN === 'true';
const BATCH_SIZE = 200;

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
    if (parts.length !== 3) return encryptedData;
    if (!parts.every((p) => /^[A-Za-z0-9+/]+=*$/.test(p) && p.length >= 2)) {
      return encryptedData;
    }
    const key = getEncryptionKey();
    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const encrypted = Buffer.from(parts[2], 'base64');
    const algorithm = 'aes-256-gcm';
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return null;
  }
}

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

async function main() {
  const args = process.argv.slice(2);
  const clinicIdx = args.indexOf('--clinic');
  const clinicSub = clinicIdx >= 0 ? args[clinicIdx + 1] : null;

  let clinicId: number | undefined;
  if (clinicSub) {
    const c = await prisma.clinic.findUnique({
      where: { subdomain: clinicSub },
      select: { id: true, name: true },
    });
    if (!c) {
      console.error(`Clinic not found: ${clinicSub}`);
      process.exit(1);
    }
    clinicId = c.id;
    console.log(`Clinic: ${c.name} (subdomain: ${clinicSub}, id: ${c.id})`);
  }

  const baseWhere = clinicId ? { clinicId } : {};

  // Count: null/empty (existing backfill) + incomplete (single-token) in application layer
  const totalNull = await prisma.patient.count({
    where: { ...baseWhere, OR: [{ searchIndex: null }, { searchIndex: '' }] },
  });

  console.log('='.repeat(70));
  console.log('  Fix Incomplete Patient Search Index');
  console.log(`  Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '🚀 LIVE (writing to DB)'}`);
  console.log('='.repeat(70));
  console.log(`  Null/empty searchIndex in scope: ${totalNull}`);

  let cursor: number | undefined;
  let processed = 0;
  let updated = 0;
  let errors = 0;
  let incompleteCount = 0;

  while (true) {
    const batch = await prisma.patient.findMany({
      where: {
        ...baseWhere,
        ...(cursor !== undefined ? { id: { gt: cursor } } : {}),
      },
      select: {
        id: true,
        patientId: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        searchIndex: true,
      },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
    });

    if (batch.length === 0) break;

    const needingFix = batch.filter((p) => isSearchIndexIncomplete(p.searchIndex));
    incompleteCount += needingFix.length;

    for (const patient of needingFix) {
      if (DRY_RUN) {
        updated++;
        if (updated <= 5 || updated % 500 === 0) {
          console.log(`  [${updated}] Would fix Patient #${patient.id} (${patient.patientId ?? 'no-id'}) — current index: "${(patient.searchIndex ?? '').substring(0, 40)}"`);
        }
        processed++;
        continue;
      }
      try {
        const searchIndex = buildSearchIndex(patient);
        if (!searchIndex) continue;

        await prisma.patient.update({
          where: { id: patient.id },
          data: { searchIndex },
        });
        updated++;
        if (updated <= 5 || updated % 500 === 0) {
          console.log(
            `  [${updated}] Patient #${patient.id} (${patient.patientId ?? 'no-id'}) → "${searchIndex.substring(0, 60)}${searchIndex.length > 60 ? '...' : ''}"`
          );
        }
      } catch (err) {
        errors++;
        console.error(`  ❌ Patient #${patient.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
      processed++;
    }

    cursor = batch[batch.length - 1].id;
    process.stdout.write(`  Scanned to id ${cursor}, fixed ${updated} so far\r`);
  }

  console.log('\n');
  console.log('='.repeat(70));
  console.log('  Results:');
  console.log(`    Patients with incomplete searchIndex: ${incompleteCount}`);
  console.log(`    Updated: ${updated}`);
  console.log(`    Errors: ${errors}`);
  console.log(`    Mode: ${DRY_RUN ? 'DRY RUN (no changes made)' : 'LIVE'}`);
  console.log('='.repeat(70));

  if (DRY_RUN && updated > 0) {
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
