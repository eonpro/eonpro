/**
 * Refill Scheduler Cron Job
 * =========================
 * 
 * This endpoint processes prescription refills that are due.
 * It should be called daily by an external cron service (e.g., Vercel Cron, AWS EventBridge).
 * 
 * Actions performed:
 * 1. Move SCHEDULED refills that are due → PENDING_PAYMENT
 * 2. Auto-match payments for Stripe-enabled clinics
 * 3. Send notifications (future enhancement)
 * 
 * Security:
 * - Protected by CRON_SECRET header
 * - Rate limited to prevent abuse
 * 
 * Vercel Cron Configuration (vercel.json):
 * {
 *   "crons": [{
 *     "path": "/api/cron/refill-scheduler",
 *     "schedule": "0 8 * * *"  // Daily at 8 AM UTC
 *   }]
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import {
  processDueRefills,
  autoMatchPaymentForRefill,
} from '@/services/refill';

// Environment variable for cron authentication
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * GET /api/cron/refill-scheduler
 * Process due refills (for Vercel Cron which uses GET)
 */
export async function GET(req: NextRequest) {
  return processRefillScheduler(req);
}

/**
 * POST /api/cron/refill-scheduler
 * Process due refills (for other cron services that prefer POST)
 */
export async function POST(req: NextRequest) {
  return processRefillScheduler(req);
}

async function processRefillScheduler(req: NextRequest) {
  const startTime = Date.now();

  try {
    // Verify cron secret (if configured)
    if (CRON_SECRET) {
      const authHeader = req.headers.get('authorization');
      const cronHeader = req.headers.get('x-cron-secret');
      
      const providedSecret = authHeader?.replace('Bearer ', '') || cronHeader;
      
      if (providedSecret !== CRON_SECRET) {
        logger.warn('[Refill Scheduler] Unauthorized cron request');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    logger.info('[Refill Scheduler] Starting scheduled job');

    // Step 1: Process due refills (SCHEDULED → PENDING_PAYMENT)
    const dueResult = await processDueRefills();

    logger.info('[Refill Scheduler] Processed due refills', {
      processed: dueResult.processed,
      errors: dueResult.errors.length,
    });

    // Step 2: Auto-match payments for Stripe-enabled clinics
    // Find refills in PENDING_PAYMENT status for Stripe clinics
    const pendingRefills = await prisma.refillQueue.findMany({
      where: {
        status: 'PENDING_PAYMENT',
        paymentVerified: false,
      },
      include: {
        clinic: {
          select: {
            id: true,
            stripeAccountId: true,
            stripePlatformAccount: true,
          },
        },
      },
    });

    let autoMatchedCount = 0;
    const autoMatchErrors: string[] = [];

    for (const refill of pendingRefills) {
      // Only auto-match for Stripe-enabled clinics
      if (!refill.clinic?.stripeAccountId && !refill.clinic?.stripePlatformAccount) {
        continue;
      }

      try {
        const matched = await autoMatchPaymentForRefill(refill.id);
        if (matched) {
          autoMatchedCount++;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        autoMatchErrors.push(`Refill ${refill.id}: ${message}`);
        logger.error('[Refill Scheduler] Auto-match error', {
          refillId: refill.id,
          error: message,
        });
      }
    }

    const stripeEnabledRefills = pendingRefills.filter((r: typeof pendingRefills[number]) => 
      r.clinic?.stripeAccountId || r.clinic?.stripePlatformAccount
    );

    logger.info('[Refill Scheduler] Auto-matched payments', {
      attempted: stripeEnabledRefills.length,
      matched: autoMatchedCount,
      errors: autoMatchErrors.length,
    });

    // Step 3: Get summary stats
    const stats = await prisma.refillQueue.groupBy({
      by: ['status'],
      _count: true,
      where: {
        status: {
          in: ['SCHEDULED', 'PENDING_PAYMENT', 'PENDING_ADMIN', 'APPROVED', 'PENDING_PROVIDER'],
        },
      },
    });

    const statusCounts = stats.reduce((acc: Record<string, number>, item: typeof stats[number]) => {
      acc[item.status] = item._count;
      return acc;
    }, {} as Record<string, number>);

    const duration = Date.now() - startTime;

    logger.info('[Refill Scheduler] Job completed', {
      duration,
      dueProcessed: dueResult.processed,
      autoMatched: autoMatchedCount,
      currentQueue: statusCounts,
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration,
      results: {
        dueRefillsProcessed: dueResult.processed,
        dueRefillsErrors: dueResult.errors.length,
        autoMatchAttempted: stripeEnabledRefills.length,
        autoMatchSucceeded: autoMatchedCount,
        autoMatchErrors: autoMatchErrors.length,
      },
      queueStatus: statusCounts,
      errors: [...dueResult.errors, ...autoMatchErrors],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const duration = Date.now() - startTime;

    logger.error('[Refill Scheduler] Job failed', {
      error: message,
      duration,
    });

    return NextResponse.json(
      {
        success: false,
        timestamp: new Date().toISOString(),
        duration,
        error: message,
      },
      { status: 500 }
    );
  }
}

/**
 * Health check for the cron job
 */
export async function OPTIONS(req: NextRequest) {
  return NextResponse.json({
    name: 'refill-scheduler',
    description: 'Processes due prescription refills and auto-matches payments',
    schedule: 'Daily at 8 AM UTC',
    endpoint: '/api/cron/refill-scheduler',
    methods: ['GET', 'POST'],
    authentication: CRON_SECRET ? 'Required (CRON_SECRET)' : 'None',
  });
}
