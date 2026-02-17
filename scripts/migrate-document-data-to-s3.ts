#!/usr/bin/env npx tsx
/**
 * MIGRATION SCRIPT: Backfill PatientDocument.data → S3
 * =====================================================
 *
 * Phase 3.3 of the Enterprise Remediation Roadmap.
 *
 * Scans PatientDocument records where:
 *   - `data IS NOT NULL`
 *   - `s3DataKey IS NULL`
 *   - `data` contains JSON (not binary PDF)
 *
 * For each matching record, uploads the JSON data to S3 and sets `s3DataKey`.
 *
 * Usage:
 *   # Dry run (no changes, just report)
 *   npx tsx scripts/migrate-document-data-to-s3.ts --dry-run
 *
 *   # Actual migration
 *   npx tsx scripts/migrate-document-data-to-s3.ts
 *
 *   # With custom batch size and rate limit
 *   npx tsx scripts/migrate-document-data-to-s3.ts --batch-size=100 --delay-ms=200
 *
 * Safety:
 *   - Idempotent: skips records that already have `s3DataKey`
 *   - Non-destructive: never deletes or nulls the `data` column
 *   - Resumable: processes in cursor-based batches
 *   - Rate-limited: configurable delay between batches
 *
 * @module scripts/migrate-document-data-to-s3
 */

import { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const BATCH_SIZE = parseInt(
  args.find((a) => a.startsWith('--batch-size='))?.split('=')[1] || '50',
  10
);
const DELAY_MS = parseInt(
  args.find((a) => a.startsWith('--delay-ms='))?.split('=')[1] || '100',
  10
);

// ---------------------------------------------------------------------------
// INITIALIZATION
// ---------------------------------------------------------------------------

const prisma = new PrismaClient();

let s3Available = false;
let putObjectCommand: any;
let s3Client: any;
let bucketName: string;

async function initS3() {
  try {
    const { isS3Enabled } = await import('../src/lib/integrations/aws/s3Config');
    if (!isS3Enabled()) {
      console.error('❌ S3 is not enabled. Set NEXT_PUBLIC_ENABLE_AWS_S3_STORAGE=true');
      process.exit(1);
    }

    const { s3Config } = await import('../src/lib/integrations/aws/s3Config');
    const { getS3Client } = await import('../src/lib/integrations/aws/s3Service');
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');

    s3Client = getS3Client();
    bucketName = s3Config.bucketName;
    putObjectCommand = PutObjectCommand;
    s3Available = true;

    console.log(`✅ S3 initialized (bucket: ${bucketName})`);
  } catch (err) {
    console.error('❌ Failed to initialize S3:', err);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function toBuffer(data: unknown): Buffer | null {
  if (!data) return null;
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  if (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    (data as any).type === 'Buffer' &&
    'data' in data
  ) {
    return Buffer.from((data as any).data);
  }
  return null;
}

function isJsonData(buffer: Buffer): boolean {
  if (buffer.length === 0) return false;
  const firstChar = buffer.toString('utf8', 0, 1);
  return firstChar === '{' || firstChar === '[';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// MIGRATION
// ---------------------------------------------------------------------------

async function migrate() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Phase 3.3: Migrate PatientDocument.data → S3');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Mode:       ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '🚀 LIVE'}`);
  console.log(`  Batch size: ${BATCH_SIZE}`);
  console.log(`  Delay:      ${DELAY_MS}ms between batches`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  if (!DRY_RUN) {
    await initS3();
  }

  // Count total candidates
  const totalCandidates = await prisma.patientDocument.count({
    where: {
      data: { not: null },
      s3DataKey: null,
    },
  });

  console.log(`📊 Found ${totalCandidates} documents with data but no s3DataKey`);

  if (totalCandidates === 0) {
    console.log('✅ Nothing to migrate. All documents are up to date.');
    return;
  }

  let processed = 0;
  let migrated = 0;
  let skippedBinary = 0;
  let errors = 0;
  let cursor: number | undefined;

  while (true) {
    const batch = await prisma.patientDocument.findMany({
      where: {
        data: { not: null },
        s3DataKey: null,
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: {
        id: true,
        patientId: true,
        clinicId: true,
        data: true,
        s3DataKey: true,
        category: true,
      },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
    });

    if (batch.length === 0) break;

    for (const doc of batch) {
      processed++;
      cursor = doc.id;

      const buffer = toBuffer(doc.data);
      if (!buffer || buffer.length === 0) {
        skippedBinary++;
        continue;
      }

      if (!isJsonData(buffer)) {
        skippedBinary++;
        continue;
      }

      const cId = doc.clinicId ?? 0;
      const key = `intake-data/${cId}/${doc.patientId}/${doc.id}.json`;

      if (DRY_RUN) {
        migrated++;
        if (migrated <= 10) {
          console.log(
            `  [DRY] Would migrate doc ${doc.id} → ${key} (${buffer.length} bytes)`
          );
        }
        continue;
      }

      try {
        await s3Client.send(
          new putObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: buffer,
            ContentType: 'application/json',
            ServerSideEncryption: 'AES256',
            Metadata: {
              clinicId: String(cId),
              patientId: String(doc.patientId),
              documentId: String(doc.id),
              type: 'intake-json-data',
              migratedAt: new Date().toISOString(),
            },
          })
        );

        await prisma.patientDocument.update({
          where: { id: doc.id },
          data: { s3DataKey: key },
        });

        migrated++;

        if (migrated % 100 === 0) {
          console.log(
            `  ✅ Migrated ${migrated}/${totalCandidates} (processed ${processed}, errors ${errors})`
          );
        }
      } catch (err) {
        errors++;
        console.error(
          `  ❌ Error migrating doc ${doc.id}:`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    // Rate limiting between batches
    if (DELAY_MS > 0 && batch.length === BATCH_SIZE) {
      await sleep(DELAY_MS);
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  MIGRATION COMPLETE');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Total processed:  ${processed}`);
  console.log(`  Migrated to S3:   ${migrated}`);
  console.log(`  Skipped (binary): ${skippedBinary}`);
  console.log(`  Errors:           ${errors}`);
  console.log(`  Mode:             ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  if (DRY_RUN && migrated > 0) {
    console.log('💡 Run without --dry-run to perform the actual migration.');
  }
}

// ---------------------------------------------------------------------------
// ENTRYPOINT
// ---------------------------------------------------------------------------

migrate()
  .catch((err) => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
