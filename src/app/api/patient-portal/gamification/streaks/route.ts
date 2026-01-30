/**
 * Patient Portal - Streaks API
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
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
      return NextResponse.json(
        { error: 'Patient ID required', code: 'PATIENT_ID_REQUIRED' },
        { status: 400 }
      );
    }

    const streaks = await getPatientStreaks(user.patientId);

    return NextResponse.json({ streaks });
  } catch (error) {
    const errorId = crypto.randomUUID().slice(0, 8);
    logger.error(`[STREAKS_GET] Error ${errorId}:`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      patientId: user.patientId,
    });
    return NextResponse.json(
      { error: 'Failed to fetch streaks', errorId, code: 'STREAKS_FETCH_ERROR' },
      { status: 500 }
    );
  }
});

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
    const { streakType } = body;

    if (!streakType || !VALID_STREAK_TYPES.includes(streakType)) {
      return NextResponse.json(
        { error: 'Invalid streak type', code: 'INVALID_STREAK_TYPE' },
        { status: 400 }
      );
    }

    const streak = await recordStreakActivity({
      patientId: user.patientId,
      streakType: streakType as StreakType,
    });

    return NextResponse.json({ streak });
  } catch (error) {
    const errorId = crypto.randomUUID().slice(0, 8);
    logger.error(`[STREAKS_POST] Error ${errorId}:`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      patientId: user.patientId,
    });
    return NextResponse.json(
      { error: 'Failed to record streak', errorId, code: 'STREAK_RECORD_ERROR' },
      { status: 500 }
    );
  }
});
