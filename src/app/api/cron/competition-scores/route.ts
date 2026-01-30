/**
 * Competition Score Update Cron Job
 * 
 * POST /api/cron/competition-scores
 * 
 * Updates scores for all active competitions, recalculates rankings,
 * and handles status transitions (scheduled -> active -> completed).
 * 
 * Should be called every 5 minutes via Vercel Cron or external scheduler.
 * 
 * @security Requires CRON_SECRET header for authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { updateAllActiveCompetitionScores } from '@/services/affiliate/leaderboardService';

// Verify cron secret
function verifyCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  
  // In development, allow without secret
  if (process.env.NODE_ENV === 'development') {
    return true;
  }
  
  // Check for secret in header
  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${cronSecret}`) {
    return true;
  }
  
  // Also check x-cron-secret header (Vercel cron uses this)
  const cronHeader = request.headers.get('x-cron-secret');
  if (cronHeader === cronSecret) {
    return true;
  }
  
  return false;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Verify authentication
    if (!verifyCronSecret(request)) {
      logger.warn('[Cron Competition Scores] Unauthorized request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    logger.info('[Cron Competition Scores] Starting score update');

    // Update all active competition scores
    const result = await updateAllActiveCompetitionScores();

    const duration = Date.now() - startTime;
    
    logger.info('[Cron Competition Scores] Update completed', {
      updated: result.updated,
      errors: result.errors,
      durationMs: duration,
    });

    return NextResponse.json({
      success: true,
      updated: result.updated,
      errors: result.errors,
      durationMs: duration,
    });

  } catch (error) {
    logger.error('[Cron Competition Scores] Update failed', { error });
    return NextResponse.json(
      { error: 'Failed to update competition scores' },
      { status: 500 }
    );
  }
}

// Also support GET for easier testing/manual triggers
export async function GET(request: NextRequest) {
  return POST(request);
}
