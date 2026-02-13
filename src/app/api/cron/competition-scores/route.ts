/**
 * Competition Score Update Cron Job
 *
 * Updates scores for all active competitions per clinic.
 * Uses runCronPerTenant + runWithClinicContext for full tenant isolation.
 *
 * POST /api/cron/competition-scores
 * Schedule: every 5 minutes (Vercel Cron or external scheduler).
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { runWithClinicContext } from '@/lib/db';
import { updateActiveCompetitionScoresForClinic } from '@/services/affiliate/leaderboardService';
import { verifyCronAuth, runCronPerTenant } from '@/lib/cron/tenant-isolation';

type PerClinicResult = { updated: number; errors: number };

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  if (!verifyCronAuth(request)) {
    logger.warn('[Cron Competition Scores] Unauthorized request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    logger.info('[Cron Competition Scores] Starting score update (per-tenant)');

    const { results, totalDurationMs } = await runCronPerTenant<PerClinicResult>({
      jobName: 'competition-scores',
      perClinic: async (clinicId) => {
        return runWithClinicContext(clinicId, () => updateActiveCompetitionScoresForClinic(clinicId));
      },
    });

    const totalUpdated = results.reduce((sum, r) => sum + (r.data?.updated ?? 0), 0);
    const totalErrors = results.reduce((sum, r) => sum + (r.data?.errors ?? 0), 0);
    const duration = Date.now() - startTime;

    logger.info('[Cron Competition Scores] Update completed', {
      updated: totalUpdated,
      errors: totalErrors,
      totalDurationMs,
      durationMs: duration,
    });

    return NextResponse.json({
      success: true,
      updated: totalUpdated,
      errors: totalErrors,
      durationMs: duration,
      totalDurationMs,
    });
  } catch (error) {
    logger.error('[Cron Competition Scores] Update failed', { error });
    return NextResponse.json({ error: 'Failed to update competition scores' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
