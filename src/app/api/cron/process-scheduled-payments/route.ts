/**
 * Process Scheduled Payments Cron Job
 * ====================================
 *
 * Processes due `ScheduledPayment` rows on the patient profile Billing tab:
 *   - AUTO_CHARGE: charges the patient's saved card via the in-process
 *     scheduled-payments service (NO loopback HTTP call — that path 401'd).
 *   - REMINDER: flips the row to PROCESSED and notifies the rep who scheduled
 *     it via in-app Notification + SES email.
 *
 * All charging logic, retry/backoff, idempotency, audit, and notification
 * fan-out lives in `src/services/billing/scheduledPaymentsService.ts`.
 * This route is a thin entrypoint that just authenticates the cron and
 * delegates.
 *
 * Vercel Cron: every 30 minutes (see vercel.json).
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronAuth } from '@/lib/cron/tenant-isolation';
import { processDuePayments } from '@/services/billing/scheduledPaymentsService';

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await processDuePayments(new Date());

    logger.info('[CronScheduledPayments] Cron complete', { ...result });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    logger.error('[CronScheduledPayments] Fatal cron error', {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        error: 'Cron job failed',
        details: error instanceof Error ? error.message : 'Unknown',
      },
      { status: 500 }
    );
  }
}
