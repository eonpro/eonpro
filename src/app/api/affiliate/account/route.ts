/**
 * Affiliate Account API
 * 
 * GET - Get affiliate profile, payout method, preferences, and tax status
 * PATCH - Update affiliate preferences
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAffiliateAuth } from '@/lib/auth/middleware';
import type { AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

/**
 * Handle account for legacy Influencer model users
 */
async function handleInfluencerAccount(influencerId: number, userId: number) {
  const [influencer, user] = await Promise.all([
    prisma.influencer.findUnique({
      where: { id: influencerId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        commissionRate: true,
        totalEarnings: true,
        createdAt: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, phone: true },
    }),
  ]);

  if (!influencer) {
    return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
  }

  return NextResponse.json({
    profile: {
      displayName: influencer.name,
      email: user?.email || influencer.email || '',
      phone: user?.phone || influencer.phone || '',
      tier: 'Partner',
      joinedAt: influencer.createdAt.toISOString(),
    },
    payoutMethod: null, // Legacy influencers don't have payout methods in new system
    preferences: {
      emailNotifications: true,
      smsNotifications: false,
      weeklyReport: true,
    },
    taxStatus: {
      hasValidW9: false,
      yearToDateEarnings: Math.round((influencer.totalEarnings || 0) * 100),
      threshold: 60000, // $600 threshold for 1099
    },
  });
}

async function handleGet(request: NextRequest, user: AuthUser) {
  try {
    const affiliateId = user.affiliateId;
    const influencerId = user.influencerId;
    
    // Handle legacy Influencer users
    if (!affiliateId && influencerId) {
      return handleInfluencerAccount(influencerId, user.id);
    }
    
    if (!affiliateId) {
      return NextResponse.json({ error: 'Not an affiliate' }, { status: 403 });
    }

    // Get affiliate basic data first
    const affiliate = await prisma.affiliate.findUnique({
      where: { id: affiliateId },
      select: {
        id: true,
        displayName: true,
        createdAt: true,
        currentTierId: true,
        leaderboardOptIn: true,
        leaderboardAlias: true,
        user: {
          select: {
            email: true,
            phone: true,
          },
        },
      },
    });

    if (!affiliate) {
      return NextResponse.json({ error: 'Affiliate not found' }, { status: 404 });
    }

    // Get tier name if exists
    let tierName = 'Standard';
    if (affiliate.currentTierId) {
      try {
        const tier = await prisma.affiliateCommissionTier.findUnique({
          where: { id: affiliate.currentTierId },
          select: { name: true },
        });
        if (tier) tierName = tier.name;
      } catch (error: unknown) {
        // Tier lookup failed, use default
        logger.warn('[Affiliate Account] Tier lookup failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }

    // Get payout method (optional, may not exist)
    let payoutMethod = null;
    try {
      const pm = await prisma.affiliatePayoutMethod.findFirst({
        where: { affiliateId, isDefault: true },
        select: {
          methodType: true,
          bankAccountLast4: true,
          bankName: true,
          paypalEmail: true,
          isVerified: true,
        },
      });
      if (pm) {
        payoutMethod = {
          type: pm.methodType === 'PAYPAL' ? 'paypal' : 'bank',
          last4: pm.bankAccountLast4,
          bankName: pm.bankName,
          email: pm.paypalEmail,
          isVerified: pm.isVerified,
        };
      }
    } catch (error: unknown) {
      // Payout method lookup failed, leave as null
      logger.warn('[Affiliate Account] Payout method lookup failed', { error: error instanceof Error ? error.message : 'Unknown error' });
    }

    // Get tax documents (optional)
    let hasValidW9 = false;
    try {
      const taxDoc = await prisma.affiliateTaxDocument.findFirst({
        where: {
          affiliateId,
          documentType: 'W9',
          status: 'VERIFIED',
        },
        select: { id: true },
      });
      hasValidW9 = !!taxDoc;
    } catch (error: unknown) {
      // Tax doc lookup failed
      logger.warn('[Affiliate Account] Tax document lookup failed', { error: error instanceof Error ? error.message : 'Unknown error' });
    }

    // Calculate year-to-date earnings (optional)
    let ytdEarnings = 0;
    try {
      const startOfYear = new Date(new Date().getFullYear(), 0, 1);
      const result = await prisma.affiliateCommissionEvent.aggregate({
        where: {
          affiliateId,
          status: { in: ['APPROVED', 'PAID'] },
          createdAt: { gte: startOfYear },
        },
        _sum: { commissionAmountCents: true },
      });
      ytdEarnings = result._sum.commissionAmountCents || 0;
    } catch (error: unknown) {
      // YTD calculation failed
      logger.warn('[Affiliate Account] YTD earnings calculation failed', { error: error instanceof Error ? error.message : 'Unknown error' });
    }

    return NextResponse.json({
      profile: {
        displayName: affiliate.displayName,
        email: affiliate.user?.email || '',
        phone: affiliate.user?.phone || '',
        tier: tierName,
        joinedAt: affiliate.createdAt.toISOString(),
      },
      payoutMethod,
      preferences: {
        emailNotifications: true,
        smsNotifications: false,
        weeklyReport: true,
      },
      leaderboard: {
        optIn: affiliate.leaderboardOptIn,
        alias: affiliate.leaderboardAlias,
      },
      taxStatus: {
        hasValidW9,
        yearToDateEarnings: ytdEarnings,
        threshold: 60000, // $600 threshold for 1099
      },
    });
  } catch (error) {
    logger.error('[Affiliate Account] GET error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: 'Failed to load account' },
      { status: 500 }
    );
  }
}

async function handlePatch(request: NextRequest, user: AuthUser) {
  try {
    const affiliateId = user.affiliateId;
    if (!affiliateId) {
      return NextResponse.json({ error: 'Not an affiliate' }, { status: 403 });
    }

    const body = await request.json();
    const { emailNotifications, smsNotifications, weeklyReport, leaderboardOptIn, leaderboardAlias } = body;

    // Update leaderboard settings if provided
    if (leaderboardOptIn !== undefined || leaderboardAlias !== undefined) {
      const updateData: Record<string, unknown> = {};
      if (leaderboardOptIn !== undefined) {
        updateData.leaderboardOptIn = leaderboardOptIn;
      }
      if (leaderboardAlias !== undefined) {
        // Validate alias length and characters
        if (leaderboardAlias && leaderboardAlias.length > 30) {
          return NextResponse.json({ error: 'Alias must be 30 characters or less' }, { status: 400 });
        }
        updateData.leaderboardAlias = leaderboardAlias || null;
      }

      await prisma.affiliate.update({
        where: { id: affiliateId },
        data: updateData,
      });
    }

    // Get updated affiliate data
    const affiliate = await prisma.affiliate.findUnique({
      where: { id: affiliateId },
      select: {
        leaderboardOptIn: true,
        leaderboardAlias: true,
      },
    });
    
    return NextResponse.json({
      preferences: {
        emailNotifications: emailNotifications ?? true,
        smsNotifications: smsNotifications ?? false,
        weeklyReport: weeklyReport ?? true,
      },
      leaderboard: {
        optIn: affiliate?.leaderboardOptIn ?? false,
        alias: affiliate?.leaderboardAlias ?? null,
      },
    });
  } catch (error) {
    logger.error('[Affiliate Account] PATCH error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Failed to update account' },
      { status: 500 }
    );
  }
}

export const GET = withAffiliateAuth(handleGet);
export const PATCH = withAffiliateAuth(handlePatch);
