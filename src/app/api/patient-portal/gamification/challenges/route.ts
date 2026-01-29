/**
 * Patient Portal - Challenges API
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import {
  getActiveChallenges,
  joinChallenge,
  leaveChallenge,
  getChallengeLeaderboard,
} from '@/lib/gamification/challenges';
import { logger } from '@/lib/logger';

/**
 * GET /api/patient-portal/gamification/challenges
 * Get active challenges
 */
export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    if (!user.patientId) {
      return NextResponse.json({ error: 'Patient ID required' }, { status: 400 });
    }

    const searchParams = req.nextUrl.searchParams;
    const action = searchParams.get('action');

    if (action === 'leaderboard') {
      const challengeId = parseInt(searchParams.get('challengeId') || '0');
      if (!challengeId) {
        return NextResponse.json({ error: 'Challenge ID required' }, { status: 400 });
      }
      const leaderboard = await getChallengeLeaderboard(challengeId);
      return NextResponse.json({ leaderboard });
    }

    const challenges = await getActiveChallenges(user.patientId, user.clinicId || undefined);

    return NextResponse.json({ challenges });
  } catch (error) {
    logger.error('Failed to fetch challenges:', error);
    return NextResponse.json({ error: 'Failed to fetch challenges' }, { status: 500 });
  }
});

/**
 * POST /api/patient-portal/gamification/challenges
 * Join or leave a challenge
 */
export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    if (!user.patientId) {
      return NextResponse.json({ error: 'Patient ID required' }, { status: 400 });
    }

    const body = await req.json();
    const { action, challengeId } = body;

    if (!challengeId) {
      return NextResponse.json({ error: 'Challenge ID required' }, { status: 400 });
    }

    if (action === 'join') {
      await joinChallenge(user.patientId, challengeId);
      return NextResponse.json({ success: true, message: 'Joined challenge' });
    }

    if (action === 'leave') {
      await leaveChallenge(user.patientId, challengeId);
      return NextResponse.json({ success: true, message: 'Left challenge' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    logger.error('Failed to update challenge participation:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update challenge' },
      { status: 500 }
    );
  }
});
