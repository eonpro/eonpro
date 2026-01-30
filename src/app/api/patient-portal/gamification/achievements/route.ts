/**
 * Patient Portal - Achievements API
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { getPatientAchievements, markAchievementsSeen } from '@/lib/gamification/achievements';
import { logger } from '@/lib/logger';

/**
 * GET /api/patient-portal/gamification/achievements
 * Get all achievements with progress for the patient
 */
export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    if (!user.patientId) {
      return NextResponse.json(
        { error: 'Patient ID required', code: 'PATIENT_ID_REQUIRED' },
        { status: 400 }
      );
    }

    const achievements = await getPatientAchievements(user.patientId);

    return NextResponse.json({ achievements });
  } catch (error) {
    const errorId = crypto.randomUUID().slice(0, 8);
    logger.error(`[ACHIEVEMENTS_GET] Error ${errorId}:`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      patientId: user.patientId,
    });
    return NextResponse.json(
      { error: 'Failed to fetch achievements', errorId, code: 'ACHIEVEMENTS_FETCH_ERROR' },
      { status: 500 }
    );
  }
});

/**
 * POST /api/patient-portal/gamification/achievements
 * Mark achievements as seen
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
    const { action, achievementIds } = body;

    if (action === 'mark_seen' && Array.isArray(achievementIds)) {
      await markAchievementsSeen(user.patientId, achievementIds);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: 'Invalid action', code: 'INVALID_ACTION' },
      { status: 400 }
    );
  } catch (error) {
    const errorId = crypto.randomUUID().slice(0, 8);
    logger.error(`[ACHIEVEMENTS_POST] Error ${errorId}:`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      patientId: user.patientId,
    });
    return NextResponse.json(
      { error: 'Failed to update achievements', errorId, code: 'ACHIEVEMENTS_UPDATE_ERROR' },
      { status: 500 }
    );
  }
});
