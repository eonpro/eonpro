/**
 * Affiliate Payout Scheduler
 *
 * Cron job for processing affiliate payouts.
 * Should run daily to:
 * - Approve pending commissions past hold period (per clinic)
 * - Process eligible payouts per clinic
 * - Clean up failed payouts (per clinic)
 *
 * Uses runCronPerTenant + runWithClinicContext for full tenant isolation.
 *
 * Vercel Cron: Configure in vercel.json
 * {
 *   "crons": [{
 *     "path": "/api/cron/affiliate-payouts",
 *     "schedule": "0 6 * * *"
 *   }]
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma, runWithClinicContext } from '@/lib/db';
import { logger } from '@/lib/logger';
import { processPayout, checkPayoutEligibility } from '@/services/affiliate/payoutService';
import { verifyCronAuth, runCronPerTenant } from '@/lib/cron/tenant-isolation';

// Stable lock key for the affiliate-payouts cron job (arbitrary unique integer)
const AFFILIATE_PAYOUT_LOCK_KEY = 8675309;

/**
 * Acquire a PostgreSQL advisory lock to prevent concurrent cron runs.
 * pg_try_advisory_lock is non-blocking: returns true if acquired, false if already held.
 * The lock is automatically released when the DB session ends.
 */
async function acquireCronLock(): Promise<boolean> {
  try {
    const result = await prisma.$queryRaw<[{ pg_try_advisory_lock: boolean }]>(
      Prisma.sql`SELECT pg_try_advisory_lock(${AFFILIATE_PAYOUT_LOCK_KEY})`
    );
    return result[0]?.pg_try_advisory_lock === true;
  } catch (error) {
    logger.warn('[PayoutCron] Failed to acquire advisory lock', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return false;
  }
}

async function releaseCronLock(): Promise<void> {
  try {
    await prisma.$queryRaw(
      Prisma.sql`SELECT pg_advisory_unlock(${AFFILIATE_PAYOUT_LOCK_KEY})`
    );
  } catch {
    // Best-effort release; lock auto-releases on session end
  }
}

interface PayoutScheduleResult {
  clinicId: number;
  affiliatesProcessed: number;
  payoutsCreated: number;
  totalAmountCents: number;
  errors: string[];
  approvedCommissions: number;
  failedPayoutsCleanedUp: number;
}

async function processClinicPayouts(clinicId: number): Promise<PayoutScheduleResult> {
  return runWithClinicContext(clinicId, async () => {
    const result: PayoutScheduleResult = {
      clinicId,
      affiliatesProcessed: 0,
      payoutsCreated: 0,
      totalAmountCents: 0,
      errors: [],
      approvedCommissions: 0,
      failedPayoutsCleanedUp: 0,
    };

    const now = new Date();

    // Approve pending commissions for this clinic only (hold period elapsed)
    const affiliateIds = await prisma.affiliate.findMany({
      where: { clinicId },
      select: { id: true },
    });
    const ids = affiliateIds.map((a) => a.id);
    if (ids.length > 0) {
      const approved = await prisma.affiliateCommissionEvent.updateMany({
        where: {
          affiliateId: { in: ids },
          status: 'PENDING',
          OR: [{ holdUntil: null }, { holdUntil: { lte: now } }],
        },
        data: { status: 'APPROVED', approvedAt: now },
      });
      result.approvedCommissions = approved.count;
    }

    const program = await prisma.affiliateProgram.findUnique({
      where: { clinicId },
      select: { isActive: true, minimumPayout: true, payoutFrequency: true },
    });

    if (!program?.isActive) {
      return result;
    }

    const affiliatesWithBalance = await prisma.affiliate.findMany({
      where: {
        clinicId,
        status: 'ACTIVE',
        commissionEvents: {
          some: { status: 'APPROVED', payoutId: null },
        },
      },
      select: { id: true, displayName: true },
    });

    for (const affiliate of affiliatesWithBalance) {
      result.affiliatesProcessed++;
      try {
        const eligibility = await checkPayoutEligibility(affiliate.id, clinicId);
        if (!eligibility.eligible) {
          logger.debug('[PayoutCron] Affiliate not eligible', {
            affiliateId: affiliate.id,
            reason: eligibility.reason,
          });
          continue;
        }

        const payoutMethod = await prisma.affiliatePayoutMethod.findFirst({
          where: { affiliateId: affiliate.id, isVerified: true, isDefault: true },
        });
        const anyMethod =
          payoutMethod ||
          (await prisma.affiliatePayoutMethod.findFirst({
            where: { affiliateId: affiliate.id, isVerified: true },
          }));

        if (!anyMethod) {
          result.errors.push(`Affiliate ${affiliate.id}: No payout method`);
          continue;
        }

        const payoutResult = await processPayout({
          clinicId,
          affiliateId: affiliate.id,
          amountCents: eligibility.availableAmountCents,
          methodType: anyMethod.methodType as any,
          notes: 'Automated scheduled payout',
        });

        if (payoutResult.success) {
          result.payoutsCreated++;
          result.totalAmountCents += eligibility.availableAmountCents;
        } else {
          result.errors.push(`Affiliate ${affiliate.id}: ${payoutResult.error}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Affiliate ${affiliate.id}: ${message}`);
      }
    }

    // Cleanup failed payouts for this clinic (retry by unassigning)
    const failedPayouts = await prisma.affiliatePayout.findMany({
      where: {
        clinicId,
        status: 'FAILED',
        failedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        notes: { not: { contains: 'retry_attempted' } },
      },
      take: 10,
    });

    for (const payout of failedPayouts) {
      // Atomically unassign commissions + cancel payout to prevent inconsistency
      await prisma.$transaction(async (tx) => {
        await tx.affiliateCommissionEvent.updateMany({
          where: { payoutId: payout.id },
          data: { payoutId: null },
        });
        await tx.affiliatePayout.update({
          where: { id: payout.id },
          data: {
            status: 'CANCELLED',
            notes: `${payout.notes || ''} | retry_attempted: ${new Date().toISOString()}`,
          },
        });
      });
      result.failedPayoutsCleanedUp++;
    }

    return result;
  });
}

export async function GET(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Acquire distributed lock to prevent concurrent cron executions
  const lockAcquired = await acquireCronLock();
  if (!lockAcquired) {
    logger.warn('[PayoutCron] Another instance is already running, skipping');
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'Another cron instance is already running',
    });
  }

  const startTime = Date.now();

  try {
    logger.info('[PayoutCron] Starting payout processing (per-tenant)');

    const { results, totalDurationMs } = await runCronPerTenant<PayoutScheduleResult>({
      jobName: 'affiliate-payouts',
      perClinic: async (clinicId) => processClinicPayouts(clinicId),
    });

    const summary = {
      duration: Date.now() - startTime,
      totalDurationMs,
      clinicsProcessed: results.length,
      commissionsApproved: results.reduce((sum, r) => sum + (r.data?.approvedCommissions ?? 0), 0),
      totalAffiliatesProcessed: results.reduce((sum, r) => sum + (r.data?.affiliatesProcessed ?? 0), 0),
      totalPayoutsCreated: results.reduce((sum, r) => sum + (r.data?.payoutsCreated ?? 0), 0),
      totalAmountCents: results.reduce((sum, r) => sum + (r.data?.totalAmountCents ?? 0), 0),
      failedPayoutsCleanedUp: results.reduce((sum, r) => sum + (r.data?.failedPayoutsCleanedUp ?? 0), 0),
      errors: results.flatMap((r) => r.data?.errors ?? (r.error ? [r.error] : [])),
    };

    logger.info('[PayoutCron] Payout processing complete', summary);

    await releaseCronLock();

    return NextResponse.json({
      success: true,
      summary,
      results: results.map((r) => ({
        clinicId: r.clinicId,
        success: r.success,
        data: r.data,
        error: r.error,
      })),
    });
  } catch (error) {
    await releaseCronLock();
    logger.error('[PayoutCron] Payout processing failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
