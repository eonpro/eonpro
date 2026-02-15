/**
 * Patient Portal - Achievements API
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { handleApiError } from '@/domains/shared/errors';
import { getPatientAchievements, markAchievementsSeen } from '@/lib/gamification/achievements';
import { logPHIAccess, logPHIUpdate } from '@/lib/audit/hipaa-audit';

const achievementActionSchema = z.object({
  action: z.literal('mark_seen'),
  achievementIds: z.array(z.number().positive()).min(1).max(100),
});

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

    await logPHIAccess(req, user, 'GamificationAchievements', String(user.patientId), user.patientId);

    return NextResponse.json({ achievements });
  } catch (error) {
    return handleApiError(error, { context: { route: 'GET /api/patient-portal/gamification/achievements' } });
  }
}, { roles: ['patient'] });

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
    const parsed = achievementActionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { achievementIds } = parsed.data;
    await markAchievementsSeen(user.patientId, achievementIds);

    await logPHIUpdate(req, user, 'GamificationAchievements', String(user.patientId), user.patientId, ['seenStatus'], {
      achievementCount: achievementIds.length,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, { context: { route: 'POST /api/patient-portal/gamification/achievements' } });
  }
}, { roles: ['patient'] });
