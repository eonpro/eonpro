/**
 * Patient Portal - Streaks API
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { getPatientStreaks, recordStreakActivity, StreakType } from '@/lib/gamification/streaks';
import { logger } from '@/lib/logger';

const VALID_STREAK_TYPES: StreakType[] = [
  'DAILY_CHECK_IN',
  'WEIGHT_LOG',
  'WATER_LOG',
  'EXERCISE_LOG',
  'MEAL_LOG',
  'MEDICATION_TAKEN',
  'SLEEP_LOG',
];

/**
 * GET /api/patient-portal/gamification/streaks
 * Get all streaks for the patient
 */
export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    if (!user.patientId) {
      return NextResponse.json({ error: 'Patient ID required' }, { status: 400 });
    }

    const streaks = await getPatientStreaks(user.patientId);

    return NextResponse.json({ streaks });
  } catch (error) {
    logger.error('Failed to fetch streaks:', error);
    return NextResponse.json({ error: 'Failed to fetch streaks' }, { status: 500 });
  }
});

/**
 * POST /api/patient-portal/gamification/streaks
 * Record streak activity
 */
export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    if (!user.patientId) {
      return NextResponse.json({ error: 'Patient ID required' }, { status: 400 });
    }

    const body = await req.json();
    const { streakType } = body;

    if (!streakType || !VALID_STREAK_TYPES.includes(streakType)) {
      return NextResponse.json({ error: 'Invalid streak type' }, { status: 400 });
    }

    const streak = await recordStreakActivity({
      patientId: user.patientId,
      streakType: streakType as StreakType,
    });

    return NextResponse.json({ streak });
  } catch (error) {
    logger.error('Failed to record streak:', error);
    return NextResponse.json({ error: 'Failed to record streak' }, { status: 500 });
  }
});
