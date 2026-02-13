/**
 * Patient Portal - Points API
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { getPatientPoints, getPointsHistory, getLeaderboard } from '@/lib/gamification/points';
import { logger } from '@/lib/logger';

/**
 * GET /api/patient-portal/gamification/points
 * Get patient's points information
 */
export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    if (!user.patientId) {
      return NextResponse.json(
        { error: 'Patient ID required', code: 'PATIENT_ID_REQUIRED' },
        { status: 400 }
      );
    }

    const searchParams = req.nextUrl.searchParams;
    const action = searchParams.get('action');

    if (action === 'history') {
      const limit = parseInt(searchParams.get('limit') || '50');
      const history = await getPointsHistory(user.patientId, limit);
      return NextResponse.json({ history });
    }

    if (action === 'leaderboard') {
      const limit = parseInt(searchParams.get('limit') || '10');
      const leaderboard = await getLeaderboard(user.clinicId || undefined, limit);
      return NextResponse.json({ leaderboard });
    }

    const points = await getPatientPoints(user.patientId);

    return NextResponse.json(points);
  } catch (error) {
    const errorId = crypto.randomUUID().slice(0, 8);
    logger.error(`[POINTS_GET] Error ${errorId}:`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      ...(process.env.NODE_ENV === 'development' && { stack: error instanceof Error ? error.stack : undefined }),
      patientId: user.patientId,
    });
    return NextResponse.json(
      { error: 'Failed to fetch points', errorId, code: 'POINTS_FETCH_ERROR' },
      { status: 500 }
    );
  }
});
