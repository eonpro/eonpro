/**
 * Refill Scheduler Cron Job
 * =========================
 *
 * Processes due refills and auto-matches payments for Stripe-enabled clinics.
 *
 * 1. Find all SCHEDULED refills with nextRefillDate <= now
 * 2. Move them to PENDING_PAYMENT
 * 3. For Stripe-enabled clinics, attempt auto-match payment verification
 * 4. Report processing stats
 *
 * Vercel Cron: 0 * * * * (every hour)
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronAuth, runCronPerTenant } from '@/lib/cron/tenant-isolation';
import {
  processDueRefills,
  autoMatchPaymentForRefill,
} from '@/services/refill/refillQueueService';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/domains/shared/errors';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  return runRefillScheduler(req);
}

export async function POST(req: NextRequest) {
  return runRefillScheduler(req);
}

async function processRefillsForClinic(clinicId: number) {
  const { processed, errors } = await processDueRefills();

  let autoMatchedCount = 0;
  let autoMatchErrors = 0;

  const pendingRefills = await prisma.refillQueue.findMany({
    where: {
      status: 'PENDING_PAYMENT',
      paymentVerified: false,
    },
    select: { id: true },
    take: 100,
  });

  for (const refill of pendingRefills) {
    try {
      const matched = await autoMatchPaymentForRefill(refill.id);
      if (matched) autoMatchedCount++;
    } catch (err) {
      autoMatchErrors++;
      logger.error('[CRON refill-scheduler] Auto-match failed', {
        refillId: refill.id,
        clinicId,
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }
  }

  return { processed, processErrors: errors.length, autoMatchedCount, autoMatchErrors };
}

async function runRefillScheduler(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  logger.info('[CRON refill-scheduler] Starting refill scheduler run');

  try {
    const { results, totalDurationMs } = await runCronPerTenant({
      jobName: 'refill-scheduler',
      perClinic: processRefillsForClinic,
    });

    const totalProcessed = results.reduce((sum, r) => sum + (r.data?.processed ?? 0), 0);
    const totalAutoMatched = results.reduce((sum, r) => sum + (r.data?.autoMatchedCount ?? 0), 0);
    const totalErrors = results.reduce((sum, r) => sum + (r.data?.processErrors ?? 0) + (r.data?.autoMatchErrors ?? 0), 0);

    const result = {
      success: true,
      duration: totalDurationMs,
      clinicsProcessed: results.length,
      dueRefillsProcessed: totalProcessed,
      autoMatched: totalAutoMatched,
      totalErrors,
    };

    logger.info('[CRON refill-scheduler] Completed', result);

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, { route: 'GET /api/cron/refill-scheduler' });
  }
}
