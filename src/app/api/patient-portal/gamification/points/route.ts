/**
 * Patient Portal - Points API
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { handleApiError } from '@/domains/shared/errors';
import { getPatientPoints, getPointsHistory, getLeaderboard } from '@/lib/gamification/points';
import { logPHIAccess } from '@/lib/audit/hipaa-audit';

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
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
      const history = await getPointsHistory(user.patientId, limit);
      return NextResponse.json({ history });
    }

    if (action === 'leaderboard') {
      const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 100);
      const leaderboard = await getLeaderboard(user.clinicId || undefined, limit);
      return NextResponse.json({ leaderboard });
    }

    const points = await getPatientPoints(user.patientId);

    await logPHIAccess(req, user, 'GamificationPoints', String(user.patientId), user.patientId, {
      action: action || 'overview',
    });

    return NextResponse.json(points);
  } catch (error) {
    return handleApiError(error, { context: { route: 'GET /api/patient-portal/gamification/points' } });
  }
}, { roles: ['patient'] });
