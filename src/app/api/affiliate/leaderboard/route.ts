/**
 * Affiliate Leaderboard API
 * 
 * GET /api/affiliate/leaderboard?metric=CLICKS|CONVERSIONS|REVENUE&period=week|month|all_time
 * 
 * Returns the global leaderboard for affiliates.
 * Only shows opt-in affiliates by name; others shown as "Partner #X"
 * 
 * @security Affiliate role only
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import {
  getGlobalLeaderboard,
  getAffiliateRank,
  type LeaderboardEntry,
} from '@/services/affiliate/leaderboardService';

type LeaderboardMetric = 'CLICKS' | 'CONVERSIONS' | 'REVENUE' | 'CONVERSION_RATE' | 'NEW_CUSTOMERS';
type LeaderboardPeriod = 'week' | 'month' | 'all_time';

export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    // Get affiliate from user
    const affiliate = await prisma.affiliate.findUnique({
      where: { userId: user.id },
      select: { 
        id: true, 
        clinicId: true, 
        status: true,
        displayName: true,
        leaderboardOptIn: true,
        leaderboardAlias: true,
      }
    });

    if (!affiliate) {
      return NextResponse.json(
        { error: 'Affiliate profile not found', code: 'AFFILIATE_NOT_FOUND' },
        { status: 404 }
      );
    }

    if (affiliate.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'Affiliate account is not active', code: 'AFFILIATE_INACTIVE' },
        { status: 403 }
      );
    }

    // Parse parameters
    const { searchParams } = new URL(req.url);
    const metricParam = searchParams.get('metric') || 'CONVERSIONS';
    const periodParam = searchParams.get('period') || 'month';

    const validMetrics: LeaderboardMetric[] = ['CLICKS', 'CONVERSIONS', 'REVENUE', 'CONVERSION_RATE', 'NEW_CUSTOMERS'];
    const validPeriods: LeaderboardPeriod[] = ['week', 'month', 'all_time'];

    const metric = validMetrics.includes(metricParam as LeaderboardMetric) 
      ? metricParam as LeaderboardMetric 
      : 'CONVERSIONS';
    const period = validPeriods.includes(periodParam as LeaderboardPeriod) 
      ? periodParam as LeaderboardPeriod 
      : 'month';

    // Get leaderboard
    const leaderboard = await getGlobalLeaderboard(affiliate.clinicId, metric, period, 50);

    // Process leaderboard - hide names for non-opt-in affiliates
    const processedLeaderboard = leaderboard.map(entry => ({
      rank: entry.rank,
      affiliateId: entry.affiliateId,
      displayName: entry.isOptedIn 
        ? (entry.leaderboardAlias || entry.displayName)
        : `Partner #${entry.affiliateId}`,
      value: entry.value,
      formattedValue: entry.formattedValue,
      isCurrentUser: entry.affiliateId === affiliate.id,
    }));

    // Get current user's rank
    const userRank = await getAffiliateRank(affiliate.id, affiliate.clinicId, metric, period);

    return NextResponse.json({
      leaderboard: processedLeaderboard,
      currentUser: {
        rank: userRank.rank,
        value: userRank.value,
        totalParticipants: userRank.totalParticipants,
        isOptedIn: affiliate.leaderboardOptIn,
        leaderboardAlias: affiliate.leaderboardAlias,
      },
      metric,
      period,
    });

  } catch (error) {
    const errorId = crypto.randomUUID().slice(0, 8);
    logger.error(`[AFFILIATE_LEADERBOARD_GET] Error ${errorId}:`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      userId: user.id,
    });
    return NextResponse.json(
      { error: 'Failed to fetch leaderboard', errorId, code: 'LEADERBOARD_FETCH_ERROR' },
      { status: 500 }
    );
  }
}, { roles: ['affiliate', 'super_admin', 'admin'] });
