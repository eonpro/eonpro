/**
 * Health Score API
 * Calculates and returns patient's health score based on multiple metrics
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { handleApiError } from '@/domains/shared/errors';
import { prisma } from '@/lib/db';
import { logPHIAccess } from '@/lib/audit/hipaa-audit';

/**
 * GET /api/patient-portal/health-score
 * Calculate and return patient's health score
 */
export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    if (!user.patientId) {
      return NextResponse.json(
        { error: 'Patient ID required', code: 'PATIENT_ID_REQUIRED' },
        { status: 400 }
      );
    }

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const safeQuery = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
      try { return await fn(); } catch { return fallback; }
    };
    const pid = user.patientId;
    const empty: never[] = [];

    const [
      weightLogs,
      previousWeightLogs,
      waterLogs,
      previousWaterLogs,
      exerciseLogs,
      previousExerciseLogs,
      sleepLogs,
      previousSleepLogs,
      streaks,
    ] = await Promise.all([
      safeQuery(() => prisma.patientWeightLog.findMany({
        where: { patientId: pid, recordedAt: { gte: weekAgo } },
        orderBy: { recordedAt: 'desc' },
      }), empty),
      safeQuery(() => prisma.patientWeightLog.findMany({
        where: { patientId: pid, recordedAt: { gte: twoWeeksAgo, lt: weekAgo } },
        orderBy: { recordedAt: 'desc' },
      }), empty),
      safeQuery(() => prisma.patientWaterLog.findMany({
        where: { patientId: pid, recordedAt: { gte: weekAgo } },
      }), empty),
      safeQuery(() => prisma.patientWaterLog.findMany({
        where: { patientId: pid, recordedAt: { gte: twoWeeksAgo, lt: weekAgo } },
      }), empty),
      safeQuery(() => prisma.patientExerciseLog.findMany({
        where: { patientId: pid, recordedAt: { gte: weekAgo } },
      }), empty),
      safeQuery(() => prisma.patientExerciseLog.findMany({
        where: { patientId: pid, recordedAt: { gte: twoWeeksAgo, lt: weekAgo } },
      }), empty),
      safeQuery(() => prisma.patientSleepLog.findMany({
        where: { patientId: pid, recordedAt: { gte: weekAgo } },
      }), empty),
      safeQuery(() => prisma.patientSleepLog.findMany({
        where: { patientId: pid, recordedAt: { gte: twoWeeksAgo, lt: weekAgo } },
      }), empty),
      safeQuery(() => prisma.patientStreak.findMany({
        where: { patientId: pid },
      }), empty),
    ]);

    // Calculate metrics
    const metrics = [];

    // Weight Progress (0-100)
    let weightScore = 50; // Default
    let weightTrend: 'up' | 'down' | 'stable' = 'stable';
    let weightValue = 0;
    let weightTrendText = '';

    if (weightLogs.length > 0) {
      // Get first ever weight
      const firstWeight = await safeQuery(() => prisma.patientWeightLog.findFirst({
        where: { patientId: pid },
        orderBy: { recordedAt: 'asc' },
      }), null);

      if (firstWeight) {
        const latestWeight = weightLogs[0].weight;
        weightValue = -(firstWeight.weight - latestWeight); // Negative = loss

        // Score based on progress (up to 25 lbs loss = 100 score)
        weightScore = Math.min(100, Math.max(0, 50 + (weightValue / 25) * 50));

        // Weekly trend
        if (weightLogs.length >= 2) {
          const weekStart = weightLogs[weightLogs.length - 1].weight;
          const weeklyChange = weekStart - latestWeight;
          weightTrend = weeklyChange > 0.5 ? 'up' : weeklyChange < -0.5 ? 'down' : 'stable';
          weightTrendText = `${weeklyChange > 0 ? '-' : '+'}${Math.abs(weeklyChange).toFixed(1)} this week`;
        }
      }
    }

    metrics.push({
      id: 'weight',
      name: 'Weight Progress',
      value: weightValue.toFixed(1),
      unit: 'lbs',
      target: -25,
      trend: weightTrend,
      trendValue: weightTrendText,
      score: Math.round(weightScore),
      lastUpdated: weightLogs.length > 0 ? formatLastUpdated(weightLogs[0].recordedAt) : 'No data',
    });

    // Hydration (0-100)
    const totalWater = waterLogs.reduce((sum: number, log: any) => sum + log.amount, 0);
    const avgWater = waterLogs.length > 0 ? totalWater / 7 : 0;
    const previousTotalWater = previousWaterLogs.reduce(
      (sum: number, log: any) => sum + log.amount,
      0
    );
    const previousAvgWater = previousWaterLogs.length > 0 ? previousTotalWater / 7 : 0;
    const waterScore = Math.min(100, (avgWater / 64) * 100);
    const waterTrend: 'up' | 'down' | 'stable' =
      avgWater > previousAvgWater + 5 ? 'up' : avgWater < previousAvgWater - 5 ? 'down' : 'stable';

    metrics.push({
      id: 'hydration',
      name: 'Hydration',
      value: Math.round(avgWater),
      unit: 'oz/day avg',
      target: 64,
      trend: waterTrend,
      trendValue:
        waterTrend === 'up'
          ? `+${Math.round(avgWater - previousAvgWater)}oz from last week`
          : waterTrend === 'down'
            ? `${Math.round(avgWater - previousAvgWater)}oz from last week`
            : 'Same as last week',
      score: Math.round(waterScore),
      lastUpdated: waterLogs.length > 0 ? 'Today' : 'No data',
    });

    // Exercise (0-100)
    const totalExercise = exerciseLogs.reduce((sum: number, log: any) => sum + log.duration, 0);
    const previousTotalExercise = previousExerciseLogs.reduce(
      (sum: number, log: any) => sum + log.duration,
      0
    );
    const exerciseScore = Math.min(100, (totalExercise / 150) * 100);
    const exerciseTrend: 'up' | 'down' | 'stable' =
      totalExercise > previousTotalExercise + 15
        ? 'up'
        : totalExercise < previousTotalExercise - 15
          ? 'down'
          : 'stable';

    metrics.push({
      id: 'exercise',
      name: 'Exercise',
      value: totalExercise,
      unit: 'min/week',
      target: 150,
      trend: exerciseTrend,
      trendValue:
        exerciseTrend !== 'stable'
          ? `${totalExercise > previousTotalExercise ? '+' : ''}${totalExercise - previousTotalExercise}min from last week`
          : 'Same as last week',
      score: Math.round(exerciseScore),
      lastUpdated:
        exerciseLogs.length > 0 ? formatLastUpdated(exerciseLogs[0].recordedAt) : 'No data',
    });

    // Sleep (0-100)
    const totalSleep = sleepLogs.reduce((sum: number, log: any) => sum + (log.duration || 0), 0);
    const avgSleep = sleepLogs.length > 0 ? totalSleep / sleepLogs.length : 0;
    const sleepScore = Math.min(100, (avgSleep / 8) * 100);
    const previousTotalSleep = previousSleepLogs.reduce(
      (sum: number, log: any) => sum + (log.duration || 0),
      0
    );
    const previousAvgSleep =
      previousSleepLogs.length > 0 ? previousTotalSleep / previousSleepLogs.length : 0;
    const sleepTrend: 'up' | 'down' | 'stable' =
      avgSleep > previousAvgSleep + 0.5
        ? 'up'
        : avgSleep < previousAvgSleep - 0.5
          ? 'down'
          : 'stable';

    metrics.push({
      id: 'sleep',
      name: 'Sleep',
      value: avgSleep.toFixed(1),
      unit: 'hrs/night',
      target: 8,
      trend: sleepTrend,
      trendValue:
        sleepTrend === 'stable'
          ? 'Same as last week'
          : `${sleepTrend === 'up' ? '+' : ''}${(avgSleep - previousAvgSleep).toFixed(1)}hrs`,
      score: Math.round(sleepScore),
      lastUpdated: sleepLogs.length > 0 ? formatLastUpdated(sleepLogs[0].recordedAt) : 'No data',
    });

    // Streak Score (0-100)
    const weightStreak = streaks.find((s: { streakType: string }) => s.streakType === 'WEIGHT_LOG');
    const streakDays = weightStreak?.currentStreak || 0;
    const streakScore = Math.min(100, streakDays * 5); // 20+ days = 100

    metrics.push({
      id: 'streak',
      name: 'Logging Streak',
      value: streakDays,
      unit: 'days',
      trend: streakDays >= 7 ? 'up' : 'stable',
      trendValue: streakDays >= 14 ? 'Personal best!' : streakDays >= 7 ? 'Keep it going!' : '',
      score: Math.round(streakScore),
      lastUpdated: streakDays > 0 ? 'Active' : 'Start logging',
    });

    // Calculate overall score (weighted average)
    const weights = {
      weight: 0.3,
      hydration: 0.15,
      exercise: 0.2,
      sleep: 0.15,
      streak: 0.2,
    };

    const overallScore = Math.round(
      metrics.reduce((sum, metric) => {
        const weight = weights[metric.id as keyof typeof weights] || 0.1;
        return sum + metric.score * weight;
      }, 0)
    );

    // Generate insights
    const insights: string[] = [];
    if (waterScore < 80) {
      insights.push(
        'Drinking more water can help with medication effectiveness and reduce side effects.'
      );
    }
    if (exerciseScore < 70) {
      insights.push(
        `Adding ${Math.max(0, 150 - totalExercise)} more minutes of exercise this week would boost your score.`
      );
    }
    if (weightScore >= 80) {
      insights.push('Your weight progress is excellent! Keep maintaining your healthy habits.');
    }
    if (streakDays >= 7) {
      insights.push(`Great job maintaining a ${streakDays}-day logging streak!`);
    }
    if (insights.length === 0) {
      insights.push('Keep up the good work! Consistency is key to success.');
    }

    // previousScore and weeklyTrend require actual historical health score snapshots.
    // When a health score history table/snapshots exist, compute from real data.
    await logPHIAccess(req, user, 'HealthScore', String(user.patientId), user.patientId, {
      overallScore,
    });

    return NextResponse.json({
      overallScore,
      previousScore: null, // TODO: compute from historical snapshots when available
      metrics,
      insights,
      weeklyTrend: null, // TODO: compute from historical daily scores when available
    });
  } catch (error) {
    return handleApiError(error, { context: { route: 'GET /api/patient-portal/health-score' } });
  }
}, { roles: ['patient'] });

function formatLastUpdated(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}
