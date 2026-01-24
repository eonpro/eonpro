/**
 * Affiliate Payout Scheduler
 * 
 * Cron job for processing affiliate payouts.
 * Should run daily to:
 * - Approve pending commissions past hold period
 * - Process eligible payouts
 * - Clean up failed payouts
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
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { approvePendingCommissions } from '@/services/affiliate/affiliateCommissionService';
import { processPayout, checkPayoutEligibility } from '@/services/affiliate/payoutService';

// Verify cron secret
function verifyCronAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // No secret configured = allow (dev mode)
  
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${cronSecret}`;
}

interface PayoutScheduleResult {
  clinicId: number;
  affiliatesProcessed: number;
  payoutsCreated: number;
  totalAmountCents: number;
  errors: string[];
}

async function processClinicPayouts(clinicId: number): Promise<PayoutScheduleResult> {
  const result: PayoutScheduleResult = {
    clinicId,
    affiliatesProcessed: 0,
    payoutsCreated: 0,
    totalAmountCents: 0,
    errors: [],
  };

  // Get clinic's payout settings
  const program = await prisma.affiliateProgram.findUnique({
    where: { clinicId },
    select: {
      isActive: true,
      minimumPayout: true,
      payoutFrequency: true,
    },
  });

  if (!program?.isActive) {
    return result;
  }

  // Get all active affiliates with approved commissions
  const affiliatesWithBalance = await prisma.affiliate.findMany({
    where: {
      clinicId,
      status: 'ACTIVE',
      commissionEvents: {
        some: {
          status: 'APPROVED',
          payoutId: null,
        },
      },
    },
    select: {
      id: true,
      displayName: true,
    },
  });

  for (const affiliate of affiliatesWithBalance) {
    result.affiliatesProcessed++;

    try {
      // Check eligibility
      const eligibility = await checkPayoutEligibility(affiliate.id, clinicId);

      if (!eligibility.eligible) {
        logger.debug('[PayoutCron] Affiliate not eligible', {
          affiliateId: affiliate.id,
          reason: eligibility.reason,
        });
        continue;
      }

      // Get preferred payout method
      const payoutMethod = await prisma.affiliatePayoutMethod.findFirst({
        where: {
          affiliateId: affiliate.id,
          isVerified: true,
          isDefault: true,
        },
      });

      if (!payoutMethod) {
        // Try any verified method
        const anyMethod = await prisma.affiliatePayoutMethod.findFirst({
          where: {
            affiliateId: affiliate.id,
            isVerified: true,
          },
        });

        if (!anyMethod) {
          result.errors.push(`Affiliate ${affiliate.id}: No payout method`);
          continue;
        }
      }

      const methodToUse = payoutMethod || await prisma.affiliatePayoutMethod.findFirst({
        where: { affiliateId: affiliate.id, isVerified: true },
      });

      if (!methodToUse) continue;

      // Process payout
      const payoutResult = await processPayout({
        clinicId,
        affiliateId: affiliate.id,
        amountCents: eligibility.availableAmountCents,
        methodType: methodToUse.methodType as any,
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

  return result;
}

export async function GET(request: NextRequest) {
  // Verify authorization
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    logger.info('[PayoutCron] Starting payout processing');

    // Step 1: Approve pending commissions past hold period
    const approvalResult = await approvePendingCommissions();
    logger.info('[PayoutCron] Commissions approved', approvalResult);

    // Step 2: Get all active clinics with affiliate programs
    const clinics = await prisma.affiliateProgram.findMany({
      where: { isActive: true },
      select: { clinicId: true },
    });

    // Step 3: Process payouts for each clinic
    const results: PayoutScheduleResult[] = [];

    for (const { clinicId } of clinics) {
      const result = await processClinicPayouts(clinicId);
      results.push(result);
    }

    // Step 4: Cleanup - retry failed payouts older than 24 hours
    const failedPayouts = await prisma.affiliatePayout.findMany({
      where: {
        status: 'FAILED',
        failedAt: {
          lt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
        // Only retry once
        notes: {
          not: { contains: 'retry_attempted' },
        },
      },
      take: 10, // Limit retries per run
    });

    let retriesAttempted = 0;
    for (const payout of failedPayouts) {
      // Unassign commission events and mark for retry
      await prisma.affiliateCommissionEvent.updateMany({
        where: { payoutId: payout.id },
        data: { payoutId: null },
      });

      await prisma.affiliatePayout.update({
        where: { id: payout.id },
        data: {
          status: 'CANCELLED',
          notes: `${payout.notes || ''} | retry_attempted: ${new Date().toISOString()}`,
        },
      });

      retriesAttempted++;
    }

    const summary = {
      duration: Date.now() - startTime,
      commissionsApproved: approvalResult.approved,
      clinicsProcessed: results.length,
      totalAffiliatesProcessed: results.reduce((sum, r) => sum + r.affiliatesProcessed, 0),
      totalPayoutsCreated: results.reduce((sum, r) => sum + r.payoutsCreated, 0),
      totalAmountCents: results.reduce((sum, r) => sum + r.totalAmountCents, 0),
      failedPayoutsCleanedUp: retriesAttempted,
      errors: results.flatMap(r => r.errors),
    };

    logger.info('[PayoutCron] Payout processing complete', summary);

    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (error) {
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

// Also allow POST for manual triggering
export async function POST(request: NextRequest) {
  return GET(request);
}
