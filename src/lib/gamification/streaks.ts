/**
 * Streak Management Service
 * Tracks consecutive activity streaks for patients
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { awardPoints, PointReason } from './points';
import { checkAchievements } from './achievements';

// Define StreakType locally until Prisma is regenerated
export type StreakType =
  | 'DAILY_CHECK_IN'
  | 'WEIGHT_LOG'
  | 'WATER_LOG'
  | 'EXERCISE_LOG'
  | 'MEAL_LOG'
  | 'MEDICATION_TAKEN'
  | 'SLEEP_LOG';

export interface StreakUpdate {
  patientId: number;
  streakType: StreakType;
}

export interface StreakInfo {
  streakType: StreakType;
  currentStreak: number;
  longestStreak: number;
  lastActivityAt: Date | null;
  freezesRemaining: number;
  isActive: boolean;
}

/**
 * Record activity for a streak
 * Call this whenever a patient completes a streak-eligible activity
 */
export async function recordStreakActivity(update: StreakUpdate): Promise<StreakInfo> {
  const { patientId, streakType } = update;

  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Get or create streak record
    let streak = await prisma.patientStreak.findUnique({
      where: {
        patientId_streakType: { patientId, streakType },
      },
    });

    if (!streak) {
      // Create new streak
      streak = await prisma.patientStreak.create({
        data: {
          patientId,
          streakType,
          currentStreak: 1,
          longestStreak: 1,
          lastActivityAt: now,
          streakStartedAt: today,
        },
      });

      // Award points for starting streak
      await awardPoints(patientId, 5, PointReason.STREAK_STARTED, `Started ${streakType} streak`);

      logger.info('New streak started', { patientId, streakType });

      return formatStreakInfo(streak);
    }

    // Check if already logged today
    if (streak.lastActivityAt) {
      const lastActivity = new Date(streak.lastActivityAt);
      const lastActivityDate = new Date(
        lastActivity.getFullYear(),
        lastActivity.getMonth(),
        lastActivity.getDate()
      );

      if (lastActivityDate.getTime() === today.getTime()) {
        // Already logged today, no change
        return formatStreakInfo(streak);
      }
    }

    // Calculate days since last activity
    const daysSinceLastActivity = streak.lastActivityAt
      ? Math.floor((today.getTime() - new Date(streak.lastActivityAt).getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    let newCurrentStreak = streak.currentStreak;
    let newLongestStreak = streak.longestStreak;
    let newStreakStartedAt = streak.streakStartedAt;
    let usedFreeze = false;

    if (daysSinceLastActivity === 1) {
      // Consecutive day - increment streak
      newCurrentStreak += 1;
      if (newCurrentStreak > newLongestStreak) {
        newLongestStreak = newCurrentStreak;
      }
    } else if (daysSinceLastActivity === 2 && streak.freezesUsed < streak.freezesAllowed) {
      // Missed one day but can use freeze
      newCurrentStreak += 1;
      usedFreeze = true;
      if (newCurrentStreak > newLongestStreak) {
        newLongestStreak = newCurrentStreak;
      }
    } else {
      // Streak broken - start fresh
      newCurrentStreak = 1;
      newStreakStartedAt = today;
    }

    // Update streak
    const updatedStreak = await prisma.patientStreak.update({
      where: { id: streak.id },
      data: {
        currentStreak: newCurrentStreak,
        longestStreak: newLongestStreak,
        lastActivityAt: now,
        streakStartedAt: newStreakStartedAt,
        ...(usedFreeze && {
          freezesUsed: streak.freezesUsed + 1,
          lastFreezeAt: now,
        }),
      },
    });

    // Award points based on streak length
    const points = calculateStreakPoints(newCurrentStreak);
    await awardPoints(patientId, points, PointReason.STREAK_CONTINUED, `${streakType} streak day ${newCurrentStreak}`);

    // Check for streak-based achievements
    await checkAchievements(patientId, {
      type: 'streak',
      streakType,
      value: newCurrentStreak,
    });

    // Log milestone streaks
    if ([7, 14, 30, 60, 90, 100, 365].includes(newCurrentStreak)) {
      logger.info('Streak milestone reached', { patientId, streakType, days: newCurrentStreak });
    }

    return formatStreakInfo(updatedStreak);
  } catch (error) {
    logger.error('Failed to record streak activity', { error, patientId, streakType });
    throw error;
  }
}

/**
 * Get all streaks for a patient
 */
export async function getPatientStreaks(patientId: number): Promise<StreakInfo[]> {
  const streaks = await prisma.patientStreak.findMany({
    where: { patientId },
  });

  return streaks.map(formatStreakInfo);
}

/**
 * Get a specific streak
 */
export async function getStreak(patientId: number, streakType: StreakType): Promise<StreakInfo | null> {
  const streak = await prisma.patientStreak.findUnique({
    where: {
      patientId_streakType: { patientId, streakType },
    },
  });

  return streak ? formatStreakInfo(streak) : null;
}

/**
 * Reset monthly freeze allowance for all streaks
 * Should be called by a cron job at the start of each month
 */
export async function resetMonthlyFreezes(): Promise<void> {
  await prisma.patientStreak.updateMany({
    data: {
      freezesUsed: 0,
    },
  });

  logger.info('Monthly streak freezes reset');
}

/**
 * Calculate points earned for streak continuation
 */
function calculateStreakPoints(streakDays: number): number {
  if (streakDays >= 100) return 50;
  if (streakDays >= 60) return 30;
  if (streakDays >= 30) return 20;
  if (streakDays >= 14) return 15;
  if (streakDays >= 7) return 10;
  return 5;
}

/**
 * Format streak record to StreakInfo
 */
function formatStreakInfo(streak: {
  streakType: StreakType;
  currentStreak: number;
  longestStreak: number;
  lastActivityAt: Date | null;
  freezesUsed: number;
  freezesAllowed: number;
}): StreakInfo {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let isActive = false;
  if (streak.lastActivityAt) {
    const lastActivity = new Date(streak.lastActivityAt);
    const daysSinceLastActivity = Math.floor(
      (today.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
    );
    // Streak is active if logged today or yesterday (with freeze available)
    isActive = daysSinceLastActivity <= 1 ||
      (daysSinceLastActivity === 2 && streak.freezesUsed < streak.freezesAllowed);
  }

  return {
    streakType: streak.streakType,
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    lastActivityAt: streak.lastActivityAt,
    freezesRemaining: streak.freezesAllowed - streak.freezesUsed,
    isActive,
  };
}

/**
 * Streak type display names
 */
export const STREAK_DISPLAY_NAMES: Record<StreakType, string> = {
  DAILY_CHECK_IN: 'Daily Check-in',
  WEIGHT_LOG: 'Weight Logging',
  WATER_LOG: 'Water Intake',
  EXERCISE_LOG: 'Exercise',
  MEAL_LOG: 'Meal Logging',
  MEDICATION_TAKEN: 'Medication',
  SLEEP_LOG: 'Sleep Tracking',
};
