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

    // Get affiliate with related data
    const [affiliate, payoutMethod, taxDocuments] = await Promise.all([
      prisma.affiliate.findUnique({
        where: { id: affiliateId },
        include: {
          currentTier: true,
          user: {
            select: {
              email: true,
              phone: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.affiliatePayoutMethod.findFirst({
        where: {
          affiliateId,
          isActive: true,
        },
        select: {
          id: true,
          methodType: true,
          last4: true,
          bankName: true,
          accountEmail: true,
          isVerified: true,
        },
      }),
      prisma.affiliateTaxDocument.findFirst({
        where: {
          affiliateId,
          documentType: 'W9',
          status: 'APPROVED',
        },
      }),
    ]);

    if (!affiliate) {
      return NextResponse.json({ error: 'Affiliate not found' }, { status: 404 });
    }

    // Calculate year-to-date earnings
    const startOfYear = new Date(new Date().getFullYear(), 0, 1);
    const ytdEarnings = await prisma.affiliateCommissionEvent.aggregate({
      where: {
        affiliateId,
        status: { in: ['APPROVED', 'PAID'] },
        createdAt: { gte: startOfYear },
      },
      _sum: { commissionAmountCents: true },
    });

    return NextResponse.json({
      profile: {
        displayName: affiliate.displayName,
        email: affiliate.user?.email || affiliate.contactEmail || '',
        phone: affiliate.user?.phone || affiliate.contactPhone || '',
        tier: affiliate.currentTier?.name || 'Standard',
        joinedAt: affiliate.createdAt.toISOString(),
        avatarUrl: affiliate.avatarUrl,
      },
      payoutMethod: payoutMethod ? {
        type: payoutMethod.methodType === 'PAYPAL' ? 'paypal' : 'bank',
        last4: payoutMethod.last4,
        bankName: payoutMethod.bankName,
        email: payoutMethod.accountEmail,
        isVerified: payoutMethod.isVerified,
      } : null,
      preferences: {
        emailNotifications: affiliate.emailNotifications ?? true,
        smsNotifications: affiliate.smsNotifications ?? false,
        weeklyReport: affiliate.weeklyReport ?? true,
      },
      taxStatus: {
        hasValidW9: !!taxDocuments,
        yearToDateEarnings: ytdEarnings._sum.commissionAmountCents || 0,
        threshold: 60000, // $600 threshold for 1099
      },
    });
  } catch (error) {
    logger.error('[Affiliate Account] GET error', {
      error: error instanceof Error ? error.message : 'Unknown error',
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
    const { emailNotifications, smsNotifications, weeklyReport } = body;

    // Update preferences
    const updated = await prisma.affiliate.update({
      where: { id: affiliateId },
      data: {
        ...(typeof emailNotifications === 'boolean' && { emailNotifications }),
        ...(typeof smsNotifications === 'boolean' && { smsNotifications }),
        ...(typeof weeklyReport === 'boolean' && { weeklyReport }),
      },
      select: {
        emailNotifications: true,
        smsNotifications: true,
        weeklyReport: true,
      },
    });

    return NextResponse.json({
      preferences: {
        emailNotifications: updated.emailNotifications ?? true,
        smsNotifications: updated.smsNotifications ?? false,
        weeklyReport: updated.weeklyReport ?? true,
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
