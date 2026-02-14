/**
 * Affiliate Data Retention Cron
 *
 * HIPAA-compliant data lifecycle management for affiliate touches.
 * Runs daily to:
 * 1. Anonymize PII (fingerprints, IP hashes) from touches older than 90 days
 * 2. Archive touches older than 2 years (mark as archived)
 * 3. Log all cleanup actions for compliance audit
 *
 * Uses PostgreSQL advisory lock to prevent concurrent runs.
 *
 * Vercel Cron: Configure in vercel.json
 * {
 *   "crons": [{
 *     "path": "/api/cron/affiliate-data-retention",
 *     "schedule": "0 3 * * *"
 *   }]
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

// Stable lock key for data retention cron (arbitrary unique integer, different from payouts)
const DATA_RETENTION_LOCK_KEY = 8675310;

// Retention thresholds
const ANONYMIZE_AFTER_DAYS = 90;
const ARCHIVE_AFTER_YEARS = 2;
const BATCH_SIZE = 1000; // Process in batches to avoid long-running queries

/**
 * Acquire a PostgreSQL advisory lock to prevent concurrent cron runs.
 */
async function acquireCronLock(): Promise<boolean> {
  try {
    const result = await prisma.$queryRaw<[{ pg_try_advisory_lock: boolean }]>(
      Prisma.sql`SELECT pg_try_advisory_lock(${DATA_RETENTION_LOCK_KEY})`
    );
    return result[0]?.pg_try_advisory_lock === true;
  } catch (error) {
    logger.warn('[DataRetentionCron] Failed to acquire advisory lock', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return false;
  }
}

async function releaseCronLock(): Promise<void> {
  try {
    await prisma.$queryRaw(
      Prisma.sql`SELECT pg_advisory_unlock(${DATA_RETENTION_LOCK_KEY})`
    );
  } catch (error) {
    logger.warn('[DataRetentionCron] Failed to release advisory lock', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
  }
}

/**
 * Anonymize PII fields from touches older than 90 days.
 * Sets visitorFingerprint and ipAddressHash to null.
 */
async function anonymizeOldTouches(): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - ANONYMIZE_AFTER_DAYS);

  let totalAnonymized = 0;
  let batchCount = 0;

  // Process in batches to avoid overwhelming the database
  while (true) {
    const result = await prisma.affiliateTouch.updateMany({
      where: {
        createdAt: { lt: cutoffDate },
        OR: [
          { visitorFingerprint: { not: '' } },
          { ipAddressHash: { not: null } },
        ],
        // Only process records that haven't been anonymized yet
        // (visitorFingerprint is non-null string or ipAddressHash is non-null)
      },
      data: {
        visitorFingerprint: 'ANONYMIZED',
        ipAddressHash: null,
        cookieId: null,
        userAgent: null,
      },
    });

    totalAnonymized += result.count;
    batchCount++;

    // If we processed less than batch size, we're done
    if (result.count < BATCH_SIZE || batchCount > 100) {
      break;
    }
  }

  return totalAnonymized;
}

/**
 * Archive touches older than 2 years.
 * Marks them with a metadata flag for potential cold storage migration.
 */
async function archiveOldTouches(): Promise<number> {
  const archiveCutoff = new Date();
  archiveCutoff.setFullYear(archiveCutoff.getFullYear() - ARCHIVE_AFTER_YEARS);

  // Use raw SQL to update with a metadata marker since AffiliateTouch
  // may not have an explicit 'archived' column
  const result = await prisma.$executeRaw`
    UPDATE "AffiliateTouch"
    SET
      "landingPage" = NULL,
      "referrerUrl" = NULL,
      "utmContent" = NULL,
      "utmTerm" = NULL,
      "subId1" = NULL,
      "subId2" = NULL,
      "subId3" = NULL,
      "subId4" = NULL,
      "subId5" = NULL
    WHERE "createdAt" < ${archiveCutoff}
      AND "landingPage" IS NOT NULL
  `;

  return result;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  // Verify cron authorization (Vercel cron secret or internal auth)
  const cronSecret = request.headers.get('authorization')?.replace('Bearer ', '');
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret && cronSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Acquire advisory lock
  const lockAcquired = await acquireCronLock();
  if (!lockAcquired) {
    logger.info('[DataRetentionCron] Skipping — another instance is running');
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'Lock held by another instance',
    });
  }

  try {
    logger.info('[DataRetentionCron] Starting data retention job');

    // Step 1: Anonymize PII from old touches
    const anonymizedCount = await anonymizeOldTouches();

    // Step 2: Archive very old touches
    const archivedCount = await archiveOldTouches();

    const durationMs = Date.now() - startTime;

    // HIPAA compliance audit log
    logger.security('[DataRetentionCron] Data retention completed', {
      anonymizedCount,
      archivedCount,
      anonymizeThresholdDays: ANONYMIZE_AFTER_DAYS,
      archiveThresholdYears: ARCHIVE_AFTER_YEARS,
      durationMs,
    });

    logger.info('[DataRetentionCron] Job completed', {
      anonymizedCount,
      archivedCount,
      durationMs,
    });

    return NextResponse.json({
      success: true,
      results: {
        anonymized: anonymizedCount,
        archived: archivedCount,
        durationMs,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[DataRetentionCron] Job failed', {
      error: errorMessage,
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json(
      { error: 'Data retention job failed', message: errorMessage },
      { status: 500 }
    );
  } finally {
    await releaseCronLock();
  }
}
