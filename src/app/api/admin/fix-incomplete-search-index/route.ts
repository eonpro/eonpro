/**
 * Fix Incomplete Patient Search Index
 * ====================================
 *
 * POST /api/admin/fix-incomplete-search-index
 *
 * Finds patients whose searchIndex is null, empty, or only a single token
 * (e.g. just "eon-7914" with no name/email/phone) and rebuilds searchIndex
 * from decrypted PHI so they appear in admin search.
 *
 * Query params:
 *   - clinicId: Optional - only fix patients for this clinic
 *   - dryRun: If "true", count and return how many would be fixed (no updates)
 *   - batchSize: Max patients per batch (default 200, max 500)
 *
 * @module api/admin/fix-incomplete-search-index
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { buildPatientSearchIndex, isSearchIndexIncomplete } from '@/lib/utils/search';

const MAX_BATCH_SIZE = 500;
const DEFAULT_BATCH_SIZE = 200;

function safeDecrypt(value: unknown, fieldName: string, patientId: number): string {
  if (value == null || value === '') return '';
  try {
    return decryptPHI(String(value));
  } catch {
    logger.warn('[FIX-INCOMPLETE] Decryption failed', { fieldName, patientId });
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
    const baseWhere = clinicId ? { clinicId } : {};
    let totalFixed = 0;
    let totalErrors = 0;
    let cursor: number | undefined;

    if (dryRun) {
      let incompleteCount = 0;
      let dryRunCursor: number | undefined;
      while (true) {
        const batch = await prisma.patient.findMany({
          where: { ...baseWhere, ...(dryRunCursor !== undefined ? { id: { gt: dryRunCursor } } : {}) },
          select: { id: true, searchIndex: true },
          orderBy: { id: 'asc' },
          take: batchSize,
        });
        if (batch.length === 0) break;
        incompleteCount += batch.filter((p) => isSearchIndexIncomplete(p.searchIndex)).length;
        dryRunCursor = batch[batch.length - 1]?.id;
      }
      return NextResponse.json({
        success: true,
        dryRun: true,
        patientsWithIncompleteSearchIndex: incompleteCount,
        message: `${incompleteCount} patients have incomplete searchIndex and would be fixed`,
      });
    }

    logger.info('[FIX-INCOMPLETE] Starting fix incomplete searchIndex', {
      batchSize,
      clinicId: clinicId ?? 'all',
    });

    while (true) {
      const batch = await prisma.patient.findMany({
        where: { ...baseWhere, ...(cursor !== undefined ? { id: { gt: cursor } } : {}) },
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
        take: batchSize,
      });

      if (batch.length === 0) break;

      const needingFix = batch.filter((p) => isSearchIndexIncomplete(p.searchIndex));

      for (const patient of needingFix) {
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

          if (searchIndex) {
            await prisma.patient.update({
              where: { id: patient.id },
              data: { searchIndex },
            });
            totalFixed++;
          }
        } catch (err) {
          totalErrors++;
          logger.warn('[FIX-INCOMPLETE] Failed to update patient', {
            patientId: patient.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      cursor = batch[batch.length - 1]?.id;
      if (batch.length < batchSize) break;
    }

    logger.info('[FIX-INCOMPLETE] Complete', { totalFixed, totalErrors });

    return NextResponse.json({
      success: true,
      message: `Fixed searchIndex for ${totalFixed} patients`,
      updated: totalFixed,
      errors: totalErrors,
    });
  } catch (error) {
    logger.error('[FIX-INCOMPLETE] Failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Fix failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
});
