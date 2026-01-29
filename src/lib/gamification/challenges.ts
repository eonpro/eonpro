/**
 * Challenge System
 * Manages clinic-wide and personal challenges
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { awardPoints, PointReason } from './points';
import { checkAchievements } from './achievements';

// Define types locally until Prisma is regenerated
export type ChallengeType = 'STREAK' | 'CUMULATIVE' | 'MILESTONE' | 'COMPETITION';

export interface ChallengeInfo {
  id: number;
  name: string;
  description: string;
  type: ChallengeType;
  imageUrl: string | null;
  startDate: Date;
  endDate: Date;
  targetValue: number;
  targetUnit: string;
  points: number;
  isActive: boolean;
  isJoined: boolean;
  currentProgress: number;
  isCompleted: boolean;
  participantCount: number;
  daysRemaining: number;
}

export interface ChallengeLeaderboard {
  rank: number;
  displayName: string;
  progress: number;
  isCompleted: boolean;
}

/**
 * Get active challenges for a patient
 */
export async function getActiveChallenges(
  patientId: number,
  clinicId?: number
): Promise<ChallengeInfo[]> {
  const now = new Date();

  const challenges = await prisma.challenge.findMany({
    where: {
      isActive: true,
      startDate: { lte: now },
      endDate: { gte: now },
      OR: [
        { isPublic: true },
        { clinicId: clinicId || undefined },
      ],
    },
    include: {
      participants: {
        where: { patientId },
      },
      _count: {
        select: { participants: true },
      },
    },
    orderBy: { endDate: 'asc' },
  });

  return challenges.map((c: { id: number; name: string; description: string; type: ChallengeType; imageUrl: string | null; startDate: Date; endDate: Date; targetValue: number; targetUnit: string; points: number; isActive: boolean; participants: Array<{ currentValue: number; completedAt: Date | null }>; _count: { participants: number } }) => {
    const participation = c.participants[0];
    const daysRemaining = Math.max(0, Math.ceil((c.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

    return {
      id: c.id,
      name: c.name,
      description: c.description,
      type: c.type,
      imageUrl: c.imageUrl,
      startDate: c.startDate,
      endDate: c.endDate,
      targetValue: c.targetValue,
      targetUnit: c.targetUnit,
      points: c.points,
      isActive: c.isActive,
      isJoined: !!participation,
      currentProgress: participation?.currentValue || 0,
      isCompleted: !!participation?.completedAt,
      participantCount: c._count.participants,
      daysRemaining,
    };
  });
}

/**
 * Join a challenge
 */
export async function joinChallenge(patientId: number, challengeId: number): Promise<void> {
  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
  });

  if (!challenge) {
    throw new Error('Challenge not found');
  }

  if (!challenge.isActive) {
    throw new Error('Challenge is not active');
  }

  const now = new Date();
  if (now < challenge.startDate || now > challenge.endDate) {
    throw new Error('Challenge is not currently running');
  }

  // Check if already joined
  const existing = await prisma.challengeParticipant.findUnique({
    where: {
      challengeId_patientId: { challengeId, patientId },
    },
  });

  if (existing) {
    throw new Error('Already joined this challenge');
  }

  await prisma.challengeParticipant.create({
    data: {
      challengeId,
      patientId,
      currentValue: 0,
    },
  });

  logger.info('Patient joined challenge', { patientId, challengeId, challengeName: challenge.name });
}

/**
 * Update challenge progress
 */
export async function updateChallengeProgress(
  patientId: number,
  challengeId: number,
  incrementValue: number
): Promise<{ completed: boolean; newProgress: number }> {
  const participant = await prisma.challengeParticipant.findUnique({
    where: {
      challengeId_patientId: { challengeId, patientId },
    },
    include: { challenge: true },
  });

  if (!participant) {
    throw new Error('Not a participant in this challenge');
  }

  if (participant.completedAt) {
    // Already completed
    return { completed: true, newProgress: participant.currentValue };
  }

  const newValue = participant.currentValue + incrementValue;
  const completed = newValue >= participant.challenge.targetValue;

  const updated = await prisma.challengeParticipant.update({
    where: { id: participant.id },
    data: {
      currentValue: newValue,
      ...(completed && { completedAt: new Date() }),
    },
  });

  if (completed) {
    // Award points
    await awardPoints(
      patientId,
      participant.challenge.points,
      PointReason.CHALLENGE_COMPLETED,
      `Completed: ${participant.challenge.name}`
    );

    // Check for achievement
    if (participant.challenge.badge) {
      await checkAchievements(patientId, {
        type: 'special',
        value: 1,
      });
    }

    logger.info('Patient completed challenge', {
      patientId,
      challengeId,
      challengeName: participant.challenge.name,
      points: participant.challenge.points,
    });
  }

  return { completed, newProgress: updated.currentValue };
}

/**
 * Get challenge leaderboard
 */
export async function getChallengeLeaderboard(
  challengeId: number,
  limit: number = 10
): Promise<ChallengeLeaderboard[]> {
  const participants = await prisma.challengeParticipant.findMany({
    where: { challengeId },
    orderBy: [
      { completedAt: 'asc' }, // Completed first, earliest completion wins
      { currentValue: 'desc' }, // Then by progress
    ],
    take: limit,
    include: {
      patient: {
        select: { firstName: true },
      },
    },
  });

  return participants.map((p: { patient: { firstName: string }; currentValue: number; completedAt: Date | null }, index: number) => ({
    rank: index + 1,
    displayName: `${p.patient.firstName.charAt(0)}***`,
    progress: p.currentValue,
    isCompleted: !!p.completedAt,
  }));
}

/**
 * Leave a challenge
 */
export async function leaveChallenge(patientId: number, challengeId: number): Promise<void> {
  await prisma.challengeParticipant.delete({
    where: {
      challengeId_patientId: { challengeId, patientId },
    },
  });

  logger.info('Patient left challenge', { patientId, challengeId });
}

/**
 * Create a new challenge (admin only)
 */
export async function createChallenge(data: {
  clinicId?: number;
  name: string;
  description: string;
  type: ChallengeType;
  imageUrl?: string;
  startDate: Date;
  endDate: Date;
  targetValue: number;
  targetUnit: string;
  points: number;
  badge?: string;
  isPublic?: boolean;
}): Promise<number> {
  const challenge = await prisma.challenge.create({
    data: {
      clinicId: data.clinicId,
      name: data.name,
      description: data.description,
      type: data.type,
      imageUrl: data.imageUrl,
      startDate: data.startDate,
      endDate: data.endDate,
      targetValue: data.targetValue,
      targetUnit: data.targetUnit,
      points: data.points,
      badge: data.badge,
      isPublic: data.isPublic ?? true,
    },
  });

  logger.info('Challenge created', { challengeId: challenge.id, name: challenge.name });

  return challenge.id;
}

/**
 * Challenge type display names
 */
export const CHALLENGE_TYPE_NAMES: Record<ChallengeType, string> = {
  STREAK: 'Streak Challenge',
  CUMULATIVE: 'Cumulative Goal',
  MILESTONE: 'Milestone',
  COMPETITION: 'Competition',
};
