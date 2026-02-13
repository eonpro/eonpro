/**
 * Appointment Reminders Processing API
 *
 * Cron job endpoint to process pending appointment reminders
 * Should be called by a scheduled task (e.g., Vercel Cron, AWS EventBridge)
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import {
  processPendingReminders,
  getReminderStats,
} from '@/lib/scheduling/appointment-reminder.service';

// Verify cron secret for security
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // If no cron secret is set, allow in development
  if (!cronSecret && process.env.NODE_ENV === 'development') {
    return true;
  }

  if (!cronSecret) {
    logger.warn('CRON_SECRET not configured');
    return false;
  }

  return authHeader === `Bearer ${cronSecret}`;
}

/**
 * POST /api/scheduling/reminders/process
 * Process all pending appointment reminders
 *
 * This endpoint should be called by a cron job every minute
 *
 * Vercel cron example (vercel.json):
 * {
 *   "crons": [{
 *     "path": "/api/scheduling/reminders/process",
 *     "schedule": "* * * * *"
 *   }]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authorization
    if (!verifyCronSecret(request)) {
      logger.warn('Unauthorized cron request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    logger.info('Starting reminder processing cron job');

    const stats = await processPendingReminders();

    logger.info('Reminder processing completed', stats);

    return NextResponse.json({
      success: true,
      processed: stats.processed,
      successful: stats.successful,
      failed: stats.failed,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Reminder processing cron failed', { error: errorMessage });
    return NextResponse.json(
      { error: 'Failed to process reminders', details: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * GET /api/scheduling/reminders/process
 * Get reminder processing stats
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authorization
    if (!verifyCronSecret(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const clinicId = searchParams.get('clinicId');
    const days = searchParams.get('days');

    const stats = await getReminderStats(
      clinicId ? parseInt(clinicId) : undefined,
      days ? parseInt(days) : 30
    );

    return NextResponse.json({
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get reminder stats', { error: errorMessage });
    return NextResponse.json({ error: 'Failed to get reminder stats' }, { status: 500 });
  }
}
