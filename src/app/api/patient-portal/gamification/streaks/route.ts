/**
 * Patient Portal - Streaks API
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { handleApiError } from '@/domains/shared/errors';
import { getPatientStreaks, recordStreakActivity, StreakType } from '@/lib/gamification/streaks';
import { logPHIAccess, logPHIUpdate } from '@/lib/audit/hipaa-audit';

const streakSchema = z.object({
  streakType: z.enum([
    'DAILY_CHECK_IN',
    'WEIGHT_LOG',
    'WATER_LOG',
    'EXERCISE_LOG',
    'MEAL_LOG',
    'MEDICATION_TAKEN',
    'SLEEP_LOG',
  ]),
});

/**
 * GET /api/patient-portal/gamification/streaks
 * Get all streaks for the patient
 */
export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    if (!user.patientId) {
      return NextResponse.json(
        { error: 'Patient ID required', code: 'PATIENT_ID_REQUIRED' },
        { status: 400 }
      );
    }

    const streaks = await getPatientStreaks(user.patientId);

    await logPHIAccess(req, user, 'GamificationStreaks', String(user.patientId), user.patientId);

    return NextResponse.json({ streaks });
  } catch (error) {
    return handleApiError(error, { context: { route: 'GET /api/patient-portal/gamification/streaks' } });
  }
}, { roles: ['patient'] });

/**
 * POST /api/patient-portal/gamification/streaks
 * Record streak activity
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
    const parsed = streakSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid streak type', code: 'INVALID_STREAK_TYPE', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { streakType } = parsed.data;

    const streak = await recordStreakActivity({
      patientId: user.patientId,
      streakType: streakType as StreakType,
    });

    await logPHIUpdate(req, user, 'GamificationStreak', String(user.patientId), user.patientId, ['streakType'], {
      streakType,
    });

    return NextResponse.json({ streak });
  } catch (error) {
    return handleApiError(error, { context: { route: 'POST /api/patient-portal/gamification/streaks' } });
  }
}, { roles: ['patient'] });
