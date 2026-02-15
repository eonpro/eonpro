/**
 * Patient Portal - Challenges API
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { handleApiError } from '@/domains/shared/errors';
import {
  getActiveChallenges,
  joinChallenge,
  leaveChallenge,
  getChallengeLeaderboard,
} from '@/lib/gamification/challenges';
import { logPHIAccess, logPHIUpdate } from '@/lib/audit/hipaa-audit';

const challengeActionSchema = z.object({
  action: z.enum(['join', 'leave', 'complete_task']),
  challengeId: z.number().positive(),
  taskId: z.number().positive().optional(),
});

/**
 * GET /api/patient-portal/gamification/challenges
 * Get active challenges
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

    if (action === 'leaderboard') {
      const challengeId = parseInt(searchParams.get('challengeId') || '0');
      if (!challengeId) {
        return NextResponse.json(
          { error: 'Challenge ID required', code: 'CHALLENGE_ID_REQUIRED' },
          { status: 400 }
        );
      }
      const leaderboard = await getChallengeLeaderboard(challengeId);
      return NextResponse.json({ leaderboard });
    }

    const challenges = await getActiveChallenges(user.patientId, user.clinicId || undefined);

    await logPHIAccess(req, user, 'GamificationChallenges', String(user.patientId), user.patientId, {
      action: action || 'list',
    });

    return NextResponse.json({ challenges });
  } catch (error) {
    return handleApiError(error, { context: { route: 'GET /api/patient-portal/gamification/challenges' } });
  }
}, { roles: ['patient'] });

/**
 * POST /api/patient-portal/gamification/challenges
 * Join or leave a challenge
 */
export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    if (!user.patientId) {
      return NextResponse.json(
        { error: 'Patient ID required', code: 'PATIENT_ID_REQUIRED' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const parsed = challengeActionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { action, challengeId } = parsed.data;

    if (action === 'join') {
      await joinChallenge(user.patientId, challengeId);

      await logPHIUpdate(req, user, 'GamificationChallenge', String(challengeId), user.patientId, ['membership'], {
        action: 'join',
        challengeId,
      });

      return NextResponse.json({ success: true, message: 'Joined challenge' });
    }

    if (action === 'leave') {
      await leaveChallenge(user.patientId, challengeId);

      await logPHIUpdate(req, user, 'GamificationChallenge', String(challengeId), user.patientId, ['membership'], {
        action: 'leave',
        challengeId,
      });

      return NextResponse.json({ success: true, message: 'Left challenge' });
    }

    return NextResponse.json({ error: 'Invalid action', code: 'INVALID_ACTION' }, { status: 400 });
  } catch (error) {
    return handleApiError(error, { context: { route: 'POST /api/patient-portal/gamification/challenges' } });
  }
}, { roles: ['patient'] });
