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
import { verifyCronAuth } from '@/lib/cron/tenant-isolation';
import {
  processDueRefills,
  autoMatchPaymentForRefill,
} from '@/services/refill/refillQueueService';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/domains/shared/errors';

export async function GET(req: NextRequest) {
  return runRefillScheduler(req);
}

export async function POST(req: NextRequest) {
  return runRefillScheduler(req);
}

async function runRefillScheduler(req: NextRequest) {
  const startTime = Date.now();

  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  logger.info('[CRON refill-scheduler] Starting refill scheduler run');

  try {
    // 1. Process due refills (SCHEDULED → PENDING_PAYMENT)
    const { processed, errors } = await processDueRefills();

    logger.info('[CRON refill-scheduler] Processed due refills', {
      movedToPendingPayment: processed,
      errors: errors.length,
    });

    // 2. Auto-match payments for PENDING_PAYMENT refills in Stripe-enabled clinics
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
          error: err instanceof Error ? err.message : 'Unknown',
        });
      }
    }

    const duration = Date.now() - startTime;

    const result = {
      success: true,
      duration,
      dueRefillsProcessed: processed,
      dueRefillErrors: errors,
      pendingPaymentChecked: pendingRefills.length,
      autoMatched: autoMatchedCount,
      autoMatchErrors,
    };

    logger.info('[CRON refill-scheduler] Completed', result);

    return NextResponse.json(result);
  } catch (error) {
    const duration = Date.now() - startTime;
    const message = error instanceof Error ? error.message : 'Unknown error';

    logger.error('[CRON refill-scheduler] Fatal error', {
      error: message,
      duration,
    });

    return handleApiError(error, { route: 'GET /api/cron/refill-scheduler' });
  }
}
