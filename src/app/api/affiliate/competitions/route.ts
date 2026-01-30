/**
 * Affiliate Competitions API
 * 
 * GET /api/affiliate/competitions - List active and upcoming competitions
 * 
 * Returns competitions the affiliate can participate in, with their current standing.
 * 
 * @security Affiliate role only
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { formatMetricValue } from '@/services/affiliate/leaderboardService';

type CompetitionMetric = 'CLICKS' | 'CONVERSIONS' | 'REVENUE' | 'CONVERSION_RATE' | 'NEW_CUSTOMERS';

export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    // Get affiliate from user
    const affiliate = await prisma.affiliate.findUnique({
      where: { userId: user.id },
      select: { id: true, clinicId: true, status: true }
    });

    if (!affiliate) {
      return NextResponse.json({ error: 'Affiliate profile not found' }, { status: 404 });
    }

    if (affiliate.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Affiliate account is not active' }, { status: 403 });
    }

    // Get active and upcoming competitions for this clinic
    const competitions = await prisma.affiliateCompetition.findMany({
      where: {
        clinicId: affiliate.clinicId,
        status: { in: ['ACTIVE', 'SCHEDULED'] },
        isPublic: true,
      },
      include: {
        entries: {
          where: { affiliateId: affiliate.id },
          take: 1,
        },
        _count: {
          select: { entries: true }
        }
      },
      orderBy: [
        { status: 'asc' }, // ACTIVE first
        { startDate: 'asc' }
      ]
    });

    // Get top 3 for each competition
    const competitionsWithStandings = await Promise.all(
      competitions.map(async (comp) => {
        const topEntries = await prisma.affiliateCompetitionEntry.findMany({
          where: { competitionId: comp.id },
          orderBy: [
            { rank: 'asc' },
            { currentValue: 'desc' }
          ],
          take: 3,
          include: {
            affiliate: {
              select: {
                displayName: true,
                leaderboardOptIn: true,
                leaderboardAlias: true,
              }
            }
          }
        });

        const myEntry = comp.entries[0];
        const myRank = myEntry?.rank || null;

        // Calculate time remaining
        const now = new Date();
        const endDate = new Date(comp.endDate);
        const startDate = new Date(comp.startDate);
        const timeRemaining = endDate.getTime() - now.getTime();
        const timeToStart = startDate.getTime() - now.getTime();

        return {
          id: comp.id,
          name: comp.name,
          description: comp.description,
          metric: comp.metric,
          startDate: comp.startDate.toISOString(),
          endDate: comp.endDate.toISOString(),
          status: comp.status,
          prizeDescription: comp.prizeDescription,
          prizeValueCents: comp.prizeValueCents,
          participantCount: comp._count.entries,
          isParticipating: !!myEntry,
          myRank,
          myScore: myEntry?.currentValue || 0,
          myFormattedScore: myEntry 
            ? formatMetricValue(comp.metric as CompetitionMetric, myEntry.currentValue) 
            : null,
          timeRemainingMs: comp.status === 'ACTIVE' ? Math.max(0, timeRemaining) : null,
          timeToStartMs: comp.status === 'SCHEDULED' ? Math.max(0, timeToStart) : null,
          topParticipants: topEntries.map((entry, index) => ({
            rank: entry.rank || index + 1,
            displayName: entry.affiliate.leaderboardOptIn 
              ? (entry.affiliate.leaderboardAlias || entry.affiliate.displayName)
              : `Partner #${entry.affiliateId}`,
            value: entry.currentValue,
            formattedValue: formatMetricValue(comp.metric as CompetitionMetric, entry.currentValue),
            isCurrentUser: entry.affiliateId === affiliate.id,
          })),
        };
      })
    );

    // Separate active and upcoming
    const active = competitionsWithStandings.filter(c => c.status === 'ACTIVE');
    const upcoming = competitionsWithStandings.filter(c => c.status === 'SCHEDULED');

    return NextResponse.json({
      active,
      upcoming,
      total: competitionsWithStandings.length,
    });

  } catch (error) {
    logger.error('[Affiliate Competitions] Error fetching competitions', error);
    return NextResponse.json({ error: 'Failed to fetch competitions' }, { status: 500 });
  }
}, { roles: ['affiliate', 'super_admin', 'admin'] });
