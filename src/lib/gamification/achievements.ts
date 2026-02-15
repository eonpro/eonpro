/**
 * Achievement System
 * Handles unlocking achievements and tracking progress
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { awardPoints, PointReason } from './points';
import { StreakType } from './streaks';

// Define types locally until Prisma is regenerated
export type AchievementCategory =
  | 'GETTING_STARTED'
  | 'CONSISTENCY'
  | 'WEIGHT_LOSS'
  | 'HEALTH_TRACKING'
  | 'ENGAGEMENT'
  | 'MILESTONES'
  | 'SPECIAL';

export type AchievementTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND';

export interface AchievementCriteria {
  type: 'streak' | 'weight_loss' | 'activity_count' | 'milestone' | 'special';
  streakType?: StreakType;
  activityType?: string;
  value: number;
}

export interface UnlockedAchievement {
  id: number;
  code: string;
  name: string;
  description: string;
  category: AchievementCategory;
  tier: AchievementTier;
  icon: string | null;
  points: number;
  unlockedAt: Date;
  seen: boolean;
}

export interface AchievementWithProgress {
  id: number;
  code: string;
  name: string;
  description: string;
  category: AchievementCategory;
  tier: AchievementTier;
  icon: string | null;
  points: number;
  isUnlocked: boolean;
  progress: number; // 0-100
  unlockedAt?: Date;
}

/**
 * Check if patient qualifies for any new achievements
 */
export async function checkAchievements(
  patientId: number,
  trigger: AchievementCriteria
): Promise<UnlockedAchievement[]> {
  try {
    // Get all achievements patient hasn't unlocked yet
    const unlockedIds = await prisma.patientAchievement.findMany({
      where: { patientId },
      select: { achievementId: true },
    });

    const unlockedIdSet = new Set(
      unlockedIds.map((a: { achievementId: number }) => a.achievementId)
    );

    const allAchievements = await prisma.achievement.findMany();

    const newlyUnlocked: UnlockedAchievement[] = [];

    for (const achievement of allAchievements) {
      // Skip if already unlocked
      if (unlockedIdSet.has(achievement.id)) continue;

      // Check if criteria matches
      const criteria = achievement.criteria as unknown as AchievementCriteria;
      const qualifies = await checkCriteria(patientId, criteria, trigger);

      if (qualifies) {
        // Unlock achievement
        const unlocked = await prisma.patientAchievement.create({
          data: {
            patientId,
            achievementId: achievement.id,
            progress: 100,
          },
        });

        // Award points
        await awardPoints(
          patientId,
          achievement.points,
          PointReason.ACHIEVEMENT_UNLOCKED,
          `Unlocked: ${achievement.name}`
        );

        newlyUnlocked.push({
          id: achievement.id,
          code: achievement.code,
          name: achievement.name,
          description: achievement.description,
          category: achievement.category,
          tier: achievement.tier,
          icon: achievement.icon,
          points: achievement.points,
          unlockedAt: unlocked.unlockedAt,
          seen: false,
        });

        logger.info('Achievement unlocked', {
          patientId,
          achievement: achievement.code,
          points: achievement.points,
        });
      }
    }

    return newlyUnlocked;
  } catch (error) {
    logger.error('Failed to check achievements', { error, patientId });
    return [];
  }
}

/**
 * Check if trigger matches achievement criteria
 */
async function checkCriteria(
  patientId: number,
  criteria: AchievementCriteria,
  trigger: AchievementCriteria
): Promise<boolean> {
  // Type must match
  if (criteria.type !== trigger.type) return false;

  switch (criteria.type) {
    case 'streak':
      // Check if streak type matches and value meets requirement
      if (criteria.streakType !== trigger.streakType) return false;
      return trigger.value >= criteria.value;

    case 'weight_loss':
      // Check total weight loss
      const weightLogs = await prisma.patientWeightLog.findMany({
        where: { patientId },
        orderBy: { recordedAt: 'asc' },
        take: 1,
      });
      if (weightLogs.length === 0) return false;

      const latestWeight = await prisma.patientWeightLog.findFirst({
        where: { patientId },
        orderBy: { recordedAt: 'desc' },
      });
      if (!latestWeight) return false;

      const weightLoss = weightLogs[0].weight - latestWeight.weight;
      return weightLoss >= criteria.value;

    case 'activity_count':
      // Check total number of activities
      let count = 0;
      switch (criteria.activityType) {
        case 'weight_log':
          count = await prisma.patientWeightLog.count({ where: { patientId } });
          break;
        case 'water_log':
          count = await prisma.patientWaterLog.count({ where: { patientId } });
          break;
        case 'exercise_log':
          count = await prisma.patientExerciseLog.count({ where: { patientId } });
          break;
        case 'message':
          count = await prisma.patientChatMessage.count({
            where: { patientId, senderType: 'PATIENT' },
          });
          break;
      }
      return count >= criteria.value;

    case 'milestone':
      // Special milestones (e.g., completed profile, first appointment)
      return trigger.value >= criteria.value;

    case 'special':
      // Special one-time achievements
      return trigger.value >= criteria.value;

    default:
      return false;
  }
}

/**
 * Get all achievements with progress for a patient
 */
export async function getPatientAchievements(
  patientId: number
): Promise<AchievementWithProgress[]> {
  const [allAchievements, patientAchievements, streaks] = await Promise.all([
    prisma.achievement.findMany({
      where: { isSecret: false },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
    }),
    prisma.patientAchievement.findMany({
      where: { patientId },
    }),
    prisma.patientStreak.findMany({
      where: { patientId },
    }),
  ]);

  const unlockedMap = new Map<number, { achievementId: number; unlockedAt: Date }>(
    patientAchievements.map(
      (pa: { achievementId: number; unlockedAt: Date }) =>
        [pa.achievementId, pa] as [number, { achievementId: number; unlockedAt: Date }]
    )
  );

  const streakMap = new Map<StreakType, { currentStreak: number; longestStreak: number }>(
    streaks.map(
      (s: { streakType: StreakType; currentStreak: number; longestStreak: number }) =>
        [s.streakType, s] as [StreakType, { currentStreak: number; longestStreak: number }]
    )
  );

  return allAchievements.map(
    (achievement: {
      id: number;
      code: string;
      name: string;
      description: string;
      category: AchievementCategory;
      tier: AchievementTier;
      icon: string | null;
      points: number;
      criteria: unknown;
    }) => {
      const unlocked = unlockedMap.get(achievement.id);
      const criteria = achievement.criteria as unknown as AchievementCriteria;

      let progress = 0;
      if (unlocked) {
        progress = 100;
      } else {
        // Calculate progress toward achievement
        progress = calculateProgress(criteria, streakMap);
      }

      return {
        id: achievement.id,
        code: achievement.code,
        name: achievement.name,
        description: achievement.description,
        category: achievement.category,
        tier: achievement.tier,
        icon: achievement.icon,
        points: achievement.points,
        isUnlocked: !!unlocked,
        progress,
        unlockedAt: unlocked?.unlockedAt,
      };
    }
  );
}

/**
 * Calculate progress toward an achievement
 */
function calculateProgress(
  criteria: AchievementCriteria,
  streakMap: Map<StreakType, { currentStreak: number; longestStreak: number }>
): number {
  if (criteria.type === 'streak' && criteria.streakType) {
    const streak = streakMap.get(criteria.streakType);
    if (!streak) return 0;
    return Math.min(100, Math.round((streak.currentStreak / criteria.value) * 100));
  }

  // For other types, we'd need to query the database
  // For performance, return 0 and let the full check handle it
  return 0;
}

/**
 * Mark achievements as seen
 */
export async function markAchievementsSeen(
  patientId: number,
  achievementIds: number[]
): Promise<void> {
  await prisma.patientAchievement.updateMany({
    where: {
      patientId,
      achievementId: { in: achievementIds },
    },
    data: { seen: true },
  });
}

/**
 * Get unseen achievements for showing notifications
 */
export async function getUnseenAchievements(patientId: number): Promise<UnlockedAchievement[]> {
  const unseen = await prisma.patientAchievement.findMany({
    where: { patientId, seen: false },
    include: { achievement: true },
  });

  return unseen.map(
    (pa: {
      achievement: {
        id: number;
        code: string;
        name: string;
        description: string;
        category: AchievementCategory;
        tier: AchievementTier;
        icon: string | null;
        points: number;
      };
      unlockedAt: Date;
      seen: boolean;
    }) => ({
      id: pa.achievement.id,
      code: pa.achievement.code,
      name: pa.achievement.name,
      description: pa.achievement.description,
      category: pa.achievement.category,
      tier: pa.achievement.tier,
      icon: pa.achievement.icon,
      points: pa.achievement.points,
      unlockedAt: pa.unlockedAt,
      seen: pa.seen,
    })
  );
}

/**
 * Seed default achievements
 */
export async function seedDefaultAchievements(): Promise<void> {
  const defaultAchievements = [
    // Getting Started
    {
      code: 'first_weigh_in',
      name: 'First Step',
      description: 'Log your first weight',
      category: 'GETTING_STARTED' as AchievementCategory,
      tier: 'BRONZE' as AchievementTier,
      points: 10,
      criteria: { type: 'activity_count', activityType: 'weight_log', value: 1 },
      sortOrder: 1,
    },
    {
      code: 'profile_complete',
      name: 'All Set',
      description: 'Complete your profile',
      category: 'GETTING_STARTED' as AchievementCategory,
      tier: 'BRONZE' as AchievementTier,
      points: 15,
      criteria: { type: 'milestone', value: 1 },
      sortOrder: 2,
    },
    {
      code: 'first_message',
      name: 'Hello!',
      description: 'Send your first message to your care team',
      category: 'GETTING_STARTED' as AchievementCategory,
      tier: 'BRONZE' as AchievementTier,
      points: 10,
      criteria: { type: 'activity_count', activityType: 'message', value: 1 },
      sortOrder: 3,
    },

    // Consistency - Weight Streaks
    {
      code: 'streak_weight_7',
      name: 'Week Warrior',
      description: 'Log your weight 7 days in a row',
      category: 'CONSISTENCY' as AchievementCategory,
      tier: 'BRONZE' as AchievementTier,
      points: 25,
      criteria: { type: 'streak', streakType: 'WEIGHT_LOG', value: 7 },
      sortOrder: 10,
    },
    {
      code: 'streak_weight_14',
      name: 'Two Week Streak',
      description: 'Log your weight 14 days in a row',
      category: 'CONSISTENCY' as AchievementCategory,
      tier: 'SILVER' as AchievementTier,
      points: 50,
      criteria: { type: 'streak', streakType: 'WEIGHT_LOG', value: 14 },
      sortOrder: 11,
    },
    {
      code: 'streak_weight_30',
      name: 'Monthly Master',
      description: 'Log your weight 30 days in a row',
      category: 'CONSISTENCY' as AchievementCategory,
      tier: 'GOLD' as AchievementTier,
      points: 100,
      criteria: { type: 'streak', streakType: 'WEIGHT_LOG', value: 30 },
      sortOrder: 12,
    },
    {
      code: 'streak_weight_100',
      name: 'Century Club',
      description: 'Log your weight 100 days in a row',
      category: 'CONSISTENCY' as AchievementCategory,
      tier: 'PLATINUM' as AchievementTier,
      points: 500,
      criteria: { type: 'streak', streakType: 'WEIGHT_LOG', value: 100 },
      sortOrder: 13,
    },

    // Weight Loss Milestones
    {
      code: 'weight_loss_5',
      name: 'First Five',
      description: 'Lose 5 pounds',
      category: 'WEIGHT_LOSS' as AchievementCategory,
      tier: 'BRONZE' as AchievementTier,
      points: 50,
      criteria: { type: 'weight_loss', value: 5 },
      sortOrder: 20,
    },
    {
      code: 'weight_loss_10',
      name: 'Double Digits',
      description: 'Lose 10 pounds',
      category: 'WEIGHT_LOSS' as AchievementCategory,
      tier: 'SILVER' as AchievementTier,
      points: 100,
      criteria: { type: 'weight_loss', value: 10 },
      sortOrder: 21,
    },
    {
      code: 'weight_loss_25',
      name: 'Quarter Century',
      description: 'Lose 25 pounds',
      category: 'WEIGHT_LOSS' as AchievementCategory,
      tier: 'GOLD' as AchievementTier,
      points: 250,
      criteria: { type: 'weight_loss', value: 25 },
      sortOrder: 22,
    },
    {
      code: 'weight_loss_50',
      name: 'Half Way Hero',
      description: 'Lose 50 pounds',
      category: 'WEIGHT_LOSS' as AchievementCategory,
      tier: 'PLATINUM' as AchievementTier,
      points: 500,
      criteria: { type: 'weight_loss', value: 50 },
      sortOrder: 23,
    },

    // Health Tracking
    {
      code: 'hydration_streak_7',
      name: 'Hydration Hero',
      description: 'Log water intake 7 days in a row',
      category: 'HEALTH_TRACKING' as AchievementCategory,
      tier: 'BRONZE' as AchievementTier,
      points: 25,
      criteria: { type: 'streak', streakType: 'WATER_LOG', value: 7 },
      sortOrder: 30,
    },
    {
      code: 'exercise_streak_7',
      name: 'Active Week',
      description: 'Log exercise 7 days in a row',
      category: 'HEALTH_TRACKING' as AchievementCategory,
      tier: 'SILVER' as AchievementTier,
      points: 50,
      criteria: { type: 'streak', streakType: 'EXERCISE_LOG', value: 7 },
      sortOrder: 31,
    },
    {
      code: 'medication_streak_30',
      name: 'Medication Master',
      description: 'Log medication 30 days in a row',
      category: 'HEALTH_TRACKING' as AchievementCategory,
      tier: 'GOLD' as AchievementTier,
      points: 100,
      criteria: { type: 'streak', streakType: 'MEDICATION_TAKEN', value: 30 },
      sortOrder: 32,
    },
  ];

  for (const achievement of defaultAchievements) {
    await prisma.achievement.upsert({
      where: { code: achievement.code },
      update: achievement,
      create: achievement,
    });
  }

  logger.info('Default achievements seeded', { count: defaultAchievements.length });
}

/**
 * Achievement tier colors
 */
export const TIER_COLORS: Record<AchievementTier, { bg: string; text: string; border: string }> = {
  BRONZE: { bg: '#CD7F32', text: '#FFFFFF', border: '#A0522D' },
  SILVER: { bg: '#C0C0C0', text: '#1F2937', border: '#A9A9A9' },
  GOLD: { bg: '#FFD700', text: '#1F2937', border: '#DAA520' },
  PLATINUM: { bg: '#E5E4E2', text: '#1F2937', border: '#BDB7B0' },
  DIAMOND: { bg: '#B9F2FF', text: '#1F2937', border: '#87CEEB' },
};
