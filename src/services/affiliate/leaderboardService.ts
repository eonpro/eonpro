/**
 * Affiliate Leaderboard Service
 * 
 * Handles leaderboard calculations, competition scoring, and rankings.
 * Used by both the API routes and the cron job for updating scores.
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export interface LeaderboardEntry {
  rank: number;
  affiliateId: number;
  displayName: string;
  leaderboardAlias: string | null;
  isOptedIn: boolean;
  value: number;
  formattedValue: string;
}

export interface CompetitionStanding {
  rank: number;
  affiliateId: number;
  displayName: string;
  currentValue: number;
  formattedValue: string;
}

type LeaderboardMetric = 'CLICKS' | 'CONVERSIONS' | 'REVENUE' | 'CONVERSION_RATE' | 'NEW_CUSTOMERS';
type LeaderboardPeriod = 'week' | 'month' | 'all_time';

/**
 * Get date range for a period
 */
function getDateRange(period: LeaderboardPeriod): { from: Date; to: Date } {
  const now = new Date();
  const to = now;
  let from: Date;

  switch (period) {
    case 'week':
      from = new Date(now);
      from.setDate(now.getDate() - 7);
      break;
    case 'month':
      from = new Date(now);
      from.setMonth(now.getMonth() - 1);
      break;
    case 'all_time':
    default:
      from = new Date('2020-01-01'); // Beginning of time
      break;
  }

  return { from, to };
}

/**
 * Format a metric value for display
 */
export function formatMetricValue(metric: LeaderboardMetric, value: number): string {
  switch (metric) {
    case 'CLICKS':
    case 'CONVERSIONS':
    case 'NEW_CUSTOMERS':
      return value.toLocaleString();
    case 'REVENUE':
      return `$${(value / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    case 'CONVERSION_RATE':
      return `${(value / 100).toFixed(1)}%`; // Stored as basis points (100 = 1%)
    default:
      return value.toString();
  }
}

/**
 * Get global leaderboard for a specific metric and period
 */
export async function getGlobalLeaderboard(
  clinicId: number,
  metric: LeaderboardMetric,
  period: LeaderboardPeriod,
  limit: number = 50
): Promise<LeaderboardEntry[]> {
  const { from, to } = getDateRange(period);

  try {
    let results: Array<{
      affiliateId: number;
      displayName: string;
      leaderboardAlias: string | null;
      leaderboardOptIn: boolean;
      value: number;
    }> = [];

    switch (metric) {
      case 'CLICKS':
        results = await prisma.$queryRaw`
          SELECT 
            a.id as "affiliateId",
            a."displayName",
            a."leaderboardAlias",
            a."leaderboardOptIn",
            COUNT(t.id)::int as value
          FROM "Affiliate" a
          LEFT JOIN "AffiliateTouch" t ON t."affiliateId" = a.id 
            AND t."createdAt" >= ${from} 
            AND t."createdAt" <= ${to}
          WHERE a."clinicId" = ${clinicId}
            AND a.status = 'ACTIVE'
          GROUP BY a.id
          ORDER BY value DESC
          LIMIT ${limit}
        `;
        break;

      case 'CONVERSIONS':
        results = await prisma.$queryRaw`
          SELECT 
            a.id as "affiliateId",
            a."displayName",
            a."leaderboardAlias",
            a."leaderboardOptIn",
            COUNT(ce.id)::int as value
          FROM "Affiliate" a
          LEFT JOIN "AffiliateCommissionEvent" ce ON ce."affiliateId" = a.id 
            AND ce."occurredAt" >= ${from} 
            AND ce."occurredAt" <= ${to}
            AND ce.status != 'REVERSED'
          WHERE a."clinicId" = ${clinicId}
            AND a.status = 'ACTIVE'
          GROUP BY a.id
          ORDER BY value DESC
          LIMIT ${limit}
        `;
        break;

      case 'REVENUE':
        results = await prisma.$queryRaw`
          SELECT 
            a.id as "affiliateId",
            a."displayName",
            a."leaderboardAlias",
            a."leaderboardOptIn",
            COALESCE(SUM(ce."eventAmountCents"), 0)::int as value
          FROM "Affiliate" a
          LEFT JOIN "AffiliateCommissionEvent" ce ON ce."affiliateId" = a.id 
            AND ce."occurredAt" >= ${from} 
            AND ce."occurredAt" <= ${to}
            AND ce.status != 'REVERSED'
          WHERE a."clinicId" = ${clinicId}
            AND a.status = 'ACTIVE'
          GROUP BY a.id
          ORDER BY value DESC
          LIMIT ${limit}
        `;
        break;

      case 'CONVERSION_RATE':
        results = await prisma.$queryRaw`
          SELECT 
            a.id as "affiliateId",
            a."displayName",
            a."leaderboardAlias",
            a."leaderboardOptIn",
            CASE 
              WHEN COUNT(t.id) > 0 
              THEN (COUNT(ce.id)::float / COUNT(t.id)::float * 10000)::int
              ELSE 0 
            END as value
          FROM "Affiliate" a
          LEFT JOIN "AffiliateTouch" t ON t."affiliateId" = a.id 
            AND t."createdAt" >= ${from} 
            AND t."createdAt" <= ${to}
          LEFT JOIN "AffiliateCommissionEvent" ce ON ce."affiliateId" = a.id 
            AND ce."occurredAt" >= ${from} 
            AND ce."occurredAt" <= ${to}
            AND ce.status != 'REVERSED'
          WHERE a."clinicId" = ${clinicId}
            AND a.status = 'ACTIVE'
          GROUP BY a.id
          HAVING COUNT(t.id) >= 10
          ORDER BY value DESC
          LIMIT ${limit}
        `;
        break;

      case 'NEW_CUSTOMERS':
        results = await prisma.$queryRaw`
          SELECT 
            a.id as "affiliateId",
            a."displayName",
            a."leaderboardAlias",
            a."leaderboardOptIn",
            COUNT(DISTINCT ce."touchId")::int as value
          FROM "Affiliate" a
          LEFT JOIN "AffiliateCommissionEvent" ce ON ce."affiliateId" = a.id 
            AND ce."occurredAt" >= ${from} 
            AND ce."occurredAt" <= ${to}
            AND ce.status != 'REVERSED'
            AND ce."isRecurring" = false
          WHERE a."clinicId" = ${clinicId}
            AND a.status = 'ACTIVE'
          GROUP BY a.id
          ORDER BY value DESC
          LIMIT ${limit}
        `;
        break;
    }

    // Map to leaderboard entries with rank
    return results.map((r, index) => ({
      rank: index + 1,
      affiliateId: r.affiliateId,
      displayName: r.displayName,
      leaderboardAlias: r.leaderboardAlias,
      isOptedIn: r.leaderboardOptIn,
      value: r.value,
      formattedValue: formatMetricValue(metric, r.value),
    }));

  } catch (error) {
    logger.error('[LeaderboardService] Error getting global leaderboard', { error, metric, period });
    throw error;
  }
}

/**
 * Get affiliate's rank in the leaderboard
 */
export async function getAffiliateRank(
  affiliateId: number,
  clinicId: number,
  metric: LeaderboardMetric,
  period: LeaderboardPeriod
): Promise<{ rank: number; value: number; totalParticipants: number }> {
  const leaderboard = await getGlobalLeaderboard(clinicId, metric, period, 1000);
  
  const entry = leaderboard.find(e => e.affiliateId === affiliateId);
  
  return {
    rank: entry?.rank || leaderboard.length + 1,
    value: entry?.value || 0,
    totalParticipants: leaderboard.length,
  };
}

/**
 * Calculate score for a competition entry based on metric
 */
export async function calculateCompetitionScore(
  affiliateId: number,
  clinicId: number,
  metric: LeaderboardMetric,
  startDate: Date,
  endDate: Date
): Promise<number> {
  try {
    switch (metric) {
      case 'CLICKS': {
        const count = await prisma.affiliateTouch.count({
          where: {
            affiliateId,
            clinicId,
            createdAt: { gte: startDate, lte: endDate }
          }
        });
        return count;
      }

      case 'CONVERSIONS': {
        const count = await prisma.affiliateCommissionEvent.count({
          where: {
            affiliateId,
            clinicId,
            occurredAt: { gte: startDate, lte: endDate },
            status: { not: 'REVERSED' }
          }
        });
        return count;
      }

      case 'REVENUE': {
        const result = await prisma.affiliateCommissionEvent.aggregate({
          where: {
            affiliateId,
            clinicId,
            occurredAt: { gte: startDate, lte: endDate },
            status: { not: 'REVERSED' }
          },
          _sum: { eventAmountCents: true }
        });
        return result._sum.eventAmountCents || 0;
      }

      case 'CONVERSION_RATE': {
        const [clicks, conversions] = await Promise.all([
          prisma.affiliateTouch.count({
            where: {
              affiliateId,
              clinicId,
              createdAt: { gte: startDate, lte: endDate }
            }
          }),
          prisma.affiliateCommissionEvent.count({
            where: {
              affiliateId,
              clinicId,
              occurredAt: { gte: startDate, lte: endDate },
              status: { not: 'REVERSED' }
            }
          })
        ]);
        // Return as basis points (100 = 1%)
        return clicks > 0 ? Math.round((conversions / clicks) * 10000) : 0;
      }

      case 'NEW_CUSTOMERS': {
        const count = await prisma.affiliateCommissionEvent.count({
          where: {
            affiliateId,
            clinicId,
            occurredAt: { gte: startDate, lte: endDate },
            status: { not: 'REVERSED' },
            isRecurring: false
          }
        });
        return count;
      }

      default:
        return 0;
    }
  } catch (error) {
    logger.error('[LeaderboardService] Error calculating score', { error, affiliateId, metric });
    return 0;
  }
}

/**
 * Update all competition scores (called by cron job)
 */
export async function updateAllActiveCompetitionScores(): Promise<{
  updated: number;
  errors: number;
}> {
  let updated = 0;
  let errors = 0;

  try {
    // Get all active competitions
    const activeCompetitions = await prisma.affiliateCompetition.findMany({
      where: { status: 'ACTIVE' },
      include: {
        entries: {
          include: {
            affiliate: {
              select: { clinicId: true }
            }
          }
        }
      }
    });

    for (const competition of activeCompetitions) {
      try {
        // Update scores for each entry
        for (const entry of competition.entries) {
          const score = await calculateCompetitionScore(
            entry.affiliateId,
            entry.affiliate.clinicId,
            competition.metric as LeaderboardMetric,
            competition.startDate,
            competition.endDate
          );

          await prisma.affiliateCompetitionEntry.update({
            where: { id: entry.id },
            data: { currentValue: score }
          });
        }

        // Recalculate ranks
        const sortedEntries = competition.entries
          .sort((a, b) => b.currentValue - a.currentValue);

        for (let i = 0; i < sortedEntries.length; i++) {
          await prisma.affiliateCompetitionEntry.update({
            where: { id: sortedEntries[i].id },
            data: { rank: i + 1 }
          });
        }

        updated++;
      } catch (error) {
        logger.error('[LeaderboardService] Error updating competition scores', {
          competitionId: competition.id,
          error
        });
        errors++;
      }
    }

    // Also check for competitions that should be activated or completed
    const now = new Date();

    // Activate scheduled competitions
    await prisma.affiliateCompetition.updateMany({
      where: {
        status: 'SCHEDULED',
        startDate: { lte: now },
        endDate: { gt: now }
      },
      data: { status: 'ACTIVE' }
    });

    // Complete expired competitions
    await prisma.affiliateCompetition.updateMany({
      where: {
        status: 'ACTIVE',
        endDate: { lte: now }
      },
      data: { status: 'COMPLETED' }
    });

    return { updated, errors };
  } catch (error) {
    logger.error('[LeaderboardService] Error in updateAllActiveCompetitionScores', { error });
    throw error;
  }
}

/**
 * Get competition standings
 */
export async function getCompetitionStandings(
  competitionId: number
): Promise<CompetitionStanding[]> {
  const competition = await prisma.affiliateCompetition.findUnique({
    where: { id: competitionId },
    include: {
      entries: {
        orderBy: [{ rank: 'asc' }, { currentValue: 'desc' }],
        include: {
          affiliate: {
            select: { displayName: true }
          }
        }
      }
    }
  });

  if (!competition) {
    throw new Error('Competition not found');
  }

  return competition.entries.map((entry, index) => ({
    rank: entry.rank || index + 1,
    affiliateId: entry.affiliateId,
    displayName: entry.affiliate.displayName,
    currentValue: entry.currentValue,
    formattedValue: formatMetricValue(competition.metric as LeaderboardMetric, entry.currentValue),
  }));
}
