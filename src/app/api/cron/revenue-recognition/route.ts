/**
 * Revenue Recognition Cron
 *
 * Runs monthly (1st of each month). Processes all pending recognition entries
 * for the previous month, generating journal entries that move deferred
 * revenue to recognized revenue.
 *
 * vercel.json schedule: "0 2 1 * *" (2 AM UTC on the 1st of each month)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron/tenant-isolation';
import { processMonthlyRecognition } from '@/services/finance/revenueRecognitionService';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const period = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;

    logger.info('[RevRec Cron] Starting monthly recognition', { period });

    const result = await processMonthlyRecognition(period);

    logger.info('[RevRec Cron] Complete', result);

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    logger.error('[RevRec Cron] Failed', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return NextResponse.json({ success: false, error: 'Processing failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
