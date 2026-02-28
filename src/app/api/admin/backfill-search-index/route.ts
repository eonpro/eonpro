/**
 * Backfill Patient Search Index
 * ==============================
 *
 * POST /api/admin/backfill-search-index
 *
 * Populates the `searchIndex` column for all patients that currently have it as NULL.
 * This enables fast DB-level search via pg_trgm GIN index instead of slow in-memory
 * decryption-based search.
 *
 * Process: For each patient without a searchIndex:
 *   1. Fetch encrypted PHI fields
 *   2. Decrypt them in memory
 *   3. Build searchIndex from plain-text values
 *   4. Update the patient record with the new searchIndex
 *
 * Processes patients in configurable batches (default 200) to manage memory usage.
 * Can be called multiple times safely (idempotent - skips already-indexed patients).
 *
 * Query params:
 *   - batchSize: Number of patients per batch (default 200, max 500)
 *   - clinicId: Optional - only backfill patients for a specific clinic
 *   - dryRun: If "true", count patients without running the backfill
 *
 * @module api/admin/backfill-search-index
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { buildPatientSearchIndex, buildIncompleteSearchIndexWhere } from '@/lib/utils/search';

const MAX_BATCH_SIZE = 500;
const DEFAULT_BATCH_SIZE = 200;

function safeDecrypt(value: unknown, fieldName: string, patientId: number): string {
  if (value == null || value === '') return '';
  try {
    return decryptPHI(String(value)) ?? '';
  } catch {
    logger.warn('Backfill: decryption failed', { fieldName, patientId });
    return '';
  }
}

export const POST = withAdminAuth(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const rawBatch = parseInt(searchParams.get('batchSize') || String(DEFAULT_BATCH_SIZE), 10);
  const batchSize = Math.min(Math.max(1, isNaN(rawBatch) ? DEFAULT_BATCH_SIZE : rawBatch), MAX_BATCH_SIZE);
  const clinicIdParam = searchParams.get('clinicId');
  const clinicId = clinicIdParam ? parseInt(clinicIdParam, 10) : undefined;
  const dryRun = searchParams.get('dryRun') === 'true';

  try {
    const whereNull = {
      ...buildIncompleteSearchIndexWhere(),
      ...(clinicId ? { clinicId } : {}),
    };

    const totalNull = await prisma.patient.count({ where: whereNull });

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        patientsWithoutSearchIndex: totalNull,
        message: `${totalNull} patients need searchIndex backfill`,
      });
    }

    if (totalNull === 0) {
      return NextResponse.json({
        success: true,
        message: 'All patients already have searchIndex populated',
        updated: 0,
        total: 0,
      });
    }

    logger.info('[BACKFILL] Starting searchIndex backfill', {
      patientsToProcess: totalNull,
      batchSize,
      clinicId: clinicId ?? 'all',
    });

    let totalUpdated = 0;
    let totalErrors = 0;
    let hasMore = true;

    while (hasMore) {
      const batch = await prisma.patient.findMany({
        where: whereNull,
        select: {
          id: true,
          patientId: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
        take: batchSize,
        orderBy: { id: 'asc' },
      });

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      for (const patient of batch) {
        try {
          const firstName = safeDecrypt(patient.firstName, 'firstName', patient.id);
          const lastName = safeDecrypt(patient.lastName, 'lastName', patient.id);
          const email = safeDecrypt(patient.email, 'email', patient.id);
          const phone = safeDecrypt(patient.phone, 'phone', patient.id);

          const searchIndex = buildPatientSearchIndex({
            firstName,
            lastName,
            email,
            phone,
            patientId: patient.patientId,
          });

          await prisma.patient.update({
            where: { id: patient.id },
            data: { searchIndex },
          });

          totalUpdated++;
        } catch (err) {
          totalErrors++;
          logger.error('[BACKFILL] Failed to update patient', {
            patientId: patient.id,
            error: err instanceof Error ? err.message : 'Unknown',
          });
        }
      }

      logger.info('[BACKFILL] Batch complete', {
        batchProcessed: batch.length,
        totalUpdated,
        totalErrors,
        remaining: totalNull - totalUpdated - totalErrors,
      });

      hasMore = batch.length === batchSize;
    }

    logger.info('[BACKFILL] SearchIndex backfill complete', {
      totalUpdated,
      totalErrors,
    });

    return NextResponse.json({
      success: true,
      message: `Backfill complete: ${totalUpdated} patients updated`,
      updated: totalUpdated,
      errors: totalErrors,
      total: totalNull,
    });
  } catch (error) {
    logger.error('[BACKFILL] SearchIndex backfill failed', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return NextResponse.json(
      { error: 'Backfill failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
});
