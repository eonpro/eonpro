/**
 * FedEx Tracking Poller Cron Job
 * ==============================
 *
 * Polls FedEx Track API for all active (non-terminal) FedEx shipments
 * that haven't been updated in the last 2 hours. Updates
 * PatientShippingUpdate and Order records with live status.
 *
 * Vercel Cron: every 3 hours (0 0,3,6,9,12,15,18,21 * * *)
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronAuth } from '@/lib/cron/tenant-isolation';
import { handleApiError } from '@/domains/shared/errors';
import { pollActiveFedExShipments } from '@/lib/shipping/fedex-tracking-poller';

export async function GET(req: NextRequest) {
  return runFedExTrackingPoll(req);
}

export async function POST(req: NextRequest) {
  return runFedExTrackingPoll(req);
}

async function runFedExTrackingPoll(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  logger.info('[CRON fedex-tracking] Starting FedEx tracking poll');

  try {
    const result = await pollActiveFedExShipments();

    logger.info('[CRON fedex-tracking] Poll complete', result);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    return handleApiError(error, { route: 'CRON /api/cron/fedex-tracking' });
  }
}
