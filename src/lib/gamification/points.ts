/**
 * Points System
 * Manages patient points, levels, and rewards
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export enum PointReason {
  STREAK_STARTED = 'streak_started',
  STREAK_CONTINUED = 'streak_continued',
  STREAK_MILESTONE = 'streak_milestone',
  ACHIEVEMENT_UNLOCKED = 'achievement_unlocked',
  DAILY_LOGIN = 'daily_login',
  WEIGHT_LOGGED = 'weight_logged',
  WATER_LOGGED = 'water_logged',
  EXERCISE_LOGGED = 'exercise_logged',
  MEAL_LOGGED = 'meal_logged',
  CHALLENGE_COMPLETED = 'challenge_completed',
  REFERRAL_BONUS = 'referral_bonus',
  SPECIAL_BONUS = 'special_bonus',
}

export interface PatientPointsInfo {
  totalPoints: number;
  currentLevel: number;
  levelName: string;
  pointsToNextLevel: number;
  levelProgress: number; // 0-100
}

// Level thresholds and names
const LEVELS = [
  { level: 1, name: 'Beginner', minPoints: 0 },
  { level: 2, name: 'Explorer', minPoints: 100 },
  { level: 3, name: 'Achiever', minPoints: 300 },
  { level: 4, name: 'Champion', minPoints: 600 },
  { level: 5, name: 'Master', minPoints: 1000 },
  { level: 6, name: 'Legend', minPoints: 1500 },
  { level: 7, name: 'Elite', minPoints: 2500 },
  { level: 8, name: 'Hero', minPoints: 4000 },
  { level: 9, name: 'Titan', minPoints: 6000 },
  { level: 10, name: 'Legendary', minPoints: 10000 },
];

/**
 * Award points to a patient
 */
export async function awardPoints(
  patientId: number,
  points: number,
  reason: PointReason,
  description?: string
): Promise<PatientPointsInfo> {
  try {
    // Get or create patient points record
    let patientPoints = await prisma.patientPoints.findUnique({
      where: { patientId },
    });

    if (!patientPoints) {
      patientPoints = await prisma.patientPoints.create({
        data: {
          patientId,
          totalPoints: 0,
          currentLevel: 1,
          levelName: 'Beginner',
        },
      });
    }

    const newTotalPoints = patientPoints.totalPoints + points;
    const newLevel = calculateLevel(newTotalPoints);

    // Update points
    const updated = await prisma.patientPoints.update({
      where: { patientId },
      data: {
        totalPoints: newTotalPoints,
        currentLevel: newLevel.level,
        levelName: newLevel.name,
        ...(reason === PointReason.ACHIEVEMENT_UNLOCKED && {
          achievementPoints: { increment: points },
        }),
        ...(reason.startsWith('streak') && {
          streakPoints: { increment: points },
        }),
        ...(!reason.startsWith('streak') &&
          reason !== PointReason.ACHIEVEMENT_UNLOCKED && {
            activityPoints: { increment: points },
          }),
      },
    });

    // Record history
    await prisma.pointsHistory.create({
      data: {
        patientId,
        points,
        reason,
        description,
      },
    });

    // Log level up
    if (newLevel.level > patientPoints.currentLevel) {
      logger.info('Patient leveled up', {
        patientId,
        oldLevel: patientPoints.currentLevel,
        newLevel: newLevel.level,
        newLevelName: newLevel.name,
      });
    }

    return formatPointsInfo(updated);
  } catch (error) {
    logger.error('Failed to award points', { error, patientId, points, reason });
    throw error;
  }
}

/**
 * Get patient's points information
 */
export async function getPatientPoints(patientId: number): Promise<PatientPointsInfo> {
  let patientPoints = await prisma.patientPoints.findUnique({
    where: { patientId },
  });

  if (!patientPoints) {
    patientPoints = await prisma.patientPoints.create({
      data: {
        patientId,
        totalPoints: 0,
        currentLevel: 1,
        levelName: 'Beginner',
      },
    });
  }

  return formatPointsInfo(patientPoints);
}

/**
 * Get points history for a patient
 */
export async function getPointsHistory(
  patientId: number,
  limit: number = 50
): Promise<
  Array<{
    points: number;
    reason: string;
    description: string | null;
    createdAt: Date;
  }>
> {
  const history = await prisma.pointsHistory.findMany({
    where: { patientId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      points: true,
      reason: true,
      description: true,
      createdAt: true,
    },
  });

  return history;
}

/**
 * Get leaderboard (opt-in patients only)
 */
export async function getLeaderboard(
  clinicId?: number,
  limit: number = 10
): Promise<
  Array<{
    rank: number;
    patientId: number;
    displayName: string;
    totalPoints: number;
    level: number;
    levelName: string;
  }>
> {
  // In a real implementation, you'd want to filter by patients who have opted in to leaderboards
  const topPatients = await prisma.patientPoints.findMany({
    orderBy: { totalPoints: 'desc' },
    take: limit,
    include: {
      patient: {
        select: {
          id: true,
          firstName: true,
          clinicId: true,
        },
      },
    },
    ...(clinicId && {
      where: {
        patient: { clinicId },
      },
    }),
  });

  return topPatients.map(
    (
      p: {
        patientId: number;
        patient: { id: number; firstName: string; clinicId: number };
        totalPoints: number;
        currentLevel: number;
        levelName: string;
      },
      index: number
    ) => ({
      rank: index + 1,
      patientId: p.patientId,
      displayName: `${p.patient.firstName.charAt(0)}***`, // Privacy: only show first initial
      totalPoints: p.totalPoints,
      level: p.currentLevel,
      levelName: p.levelName,
    })
  );
}

/**
 * Calculate level from total points
 */
function calculateLevel(totalPoints: number): { level: number; name: string } {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (totalPoints >= LEVELS[i].minPoints) {
      return LEVELS[i];
    }
  }
  return LEVELS[0];
}

/**
 * Format points info with level progress
 */
function formatPointsInfo(patientPoints: {
  totalPoints: number;
  currentLevel: number;
  levelName: string;
}): PatientPointsInfo {
  const currentLevelData = LEVELS.find((l) => l.level === patientPoints.currentLevel) || LEVELS[0];
  const nextLevelData = LEVELS.find((l) => l.level === patientPoints.currentLevel + 1);

  let pointsToNextLevel = 0;
  let levelProgress = 100;

  if (nextLevelData) {
    const pointsInCurrentLevel = patientPoints.totalPoints - currentLevelData.minPoints;
    const pointsForLevel = nextLevelData.minPoints - currentLevelData.minPoints;
    pointsToNextLevel = nextLevelData.minPoints - patientPoints.totalPoints;
    levelProgress = Math.round((pointsInCurrentLevel / pointsForLevel) * 100);
  }

  return {
    totalPoints: patientPoints.totalPoints,
    currentLevel: patientPoints.currentLevel,
    levelName: patientPoints.levelName,
    pointsToNextLevel,
    levelProgress,
  };
}

/**
 * Point reason display names
 */
export const POINT_REASON_NAMES: Record<PointReason, string> = {
  [PointReason.STREAK_STARTED]: 'Started a streak',
  [PointReason.STREAK_CONTINUED]: 'Continued streak',
  [PointReason.STREAK_MILESTONE]: 'Streak milestone',
  [PointReason.ACHIEVEMENT_UNLOCKED]: 'Achievement unlocked',
  [PointReason.DAILY_LOGIN]: 'Daily login',
  [PointReason.WEIGHT_LOGGED]: 'Logged weight',
  [PointReason.WATER_LOGGED]: 'Logged water intake',
  [PointReason.EXERCISE_LOGGED]: 'Logged exercise',
  [PointReason.MEAL_LOGGED]: 'Logged meal',
  [PointReason.CHALLENGE_COMPLETED]: 'Completed challenge',
  [PointReason.REFERRAL_BONUS]: 'Referral bonus',
  [PointReason.SPECIAL_BONUS]: 'Special bonus',
};

/**
 * Level info for display
 */
export const LEVEL_INFO = LEVELS;
