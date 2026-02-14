/**
 * Affiliate Account API
 *
 * GET - Get affiliate profile, payout method, preferences, and tax status
 * PATCH - Update affiliate preferences
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withAffiliateAuth } from '@/lib/auth/middleware';
import type { AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

const accountPatchSchema = z.object({
  emailNotifications: z.boolean().optional(),
  smsNotifications: z.boolean().optional(),
  weeklyReport: z.boolean().optional(),
  leaderboardOptIn: z.boolean().optional(),
  leaderboardAlias: z.string().max(30, 'Alias must be 30 characters or less').nullable().optional(),
});

async function handleGet(request: NextRequest, user: AuthUser) {
  try {
    const affiliateId = user.affiliateId;

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
        metadata: true,
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
        logger.warn('[Affiliate Account] Tier lookup failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
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
      logger.warn('[Affiliate Account] Payout method lookup failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
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
      logger.warn('[Affiliate Account] Tax document lookup failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
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
      logger.warn('[Affiliate Account] YTD earnings calculation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Extract notification preferences from metadata (persisted in PATCH handler)
    const meta = (affiliate.metadata && typeof affiliate.metadata === 'object' && !Array.isArray(affiliate.metadata))
      ? (affiliate.metadata as Record<string, unknown>)
      : {};
    const prefs = (meta.notificationPreferences && typeof meta.notificationPreferences === 'object')
      ? (meta.notificationPreferences as Record<string, unknown>)
      : {};

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
        emailNotifications: typeof prefs.emailNotifications === 'boolean' ? prefs.emailNotifications : true,
        smsNotifications: typeof prefs.smsNotifications === 'boolean' ? prefs.smsNotifications : false,
        weeklyReport: typeof prefs.weeklyReport === 'boolean' ? prefs.weeklyReport : true,
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
      ...(process.env.NODE_ENV === 'development' && { stack: error instanceof Error ? error.stack : undefined }),
    });
    return NextResponse.json({ error: 'Failed to load account' }, { status: 500 });
  }
}

async function handlePatch(request: NextRequest, user: AuthUser) {
  try {
    const affiliateId = user.affiliateId;
    if (!affiliateId) {
      return NextResponse.json({ error: 'Not an affiliate' }, { status: 403 });
    }

    const rawBody = await request.json();
    const parsed = accountPatchSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const {
      emailNotifications,
      smsNotifications,
      weeklyReport,
      leaderboardOptIn,
      leaderboardAlias,
    } = parsed.data;

    // Read current metadata to merge notification preferences
    const current = await prisma.affiliate.findUnique({
      where: { id: affiliateId },
      select: { metadata: true },
    });

    const currentMeta = (current?.metadata && typeof current.metadata === 'object' && !Array.isArray(current.metadata))
      ? (current.metadata as Record<string, unknown>)
      : {};
    const currentPrefs = (currentMeta.notificationPreferences && typeof currentMeta.notificationPreferences === 'object')
      ? (currentMeta.notificationPreferences as Record<string, unknown>)
      : {};

    // Merge only provided notification fields
    const hasNotifUpdate = emailNotifications !== undefined || smsNotifications !== undefined || weeklyReport !== undefined;
    const updatedPrefs = {
      ...currentPrefs,
      ...(emailNotifications !== undefined && { emailNotifications }),
      ...(smsNotifications !== undefined && { smsNotifications }),
      ...(weeklyReport !== undefined && { weeklyReport }),
    };

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (leaderboardOptIn !== undefined) {
      updateData.leaderboardOptIn = leaderboardOptIn;
    }
    if (leaderboardAlias !== undefined) {
      updateData.leaderboardAlias = leaderboardAlias || null;
    }
    if (hasNotifUpdate) {
      updateData.metadata = {
        ...currentMeta,
        notificationPreferences: updatedPrefs,
      };
    }

    const affiliate = await prisma.affiliate.update({
      where: { id: affiliateId },
      data: updateData,
      select: {
        leaderboardOptIn: true,
        leaderboardAlias: true,
        metadata: true,
      },
    });

    // Read back persisted preferences
    const meta = (affiliate.metadata && typeof affiliate.metadata === 'object' && !Array.isArray(affiliate.metadata))
      ? (affiliate.metadata as Record<string, unknown>)
      : {};
    const prefs = (meta.notificationPreferences && typeof meta.notificationPreferences === 'object')
      ? (meta.notificationPreferences as Record<string, unknown>)
      : {};

    return NextResponse.json({
      preferences: {
        emailNotifications: typeof prefs.emailNotifications === 'boolean' ? prefs.emailNotifications : true,
        smsNotifications: typeof prefs.smsNotifications === 'boolean' ? prefs.smsNotifications : false,
        weeklyReport: typeof prefs.weeklyReport === 'boolean' ? prefs.weeklyReport : true,
      },
      leaderboard: {
        optIn: affiliate.leaderboardOptIn ?? false,
        alias: affiliate.leaderboardAlias ?? null,
      },
    });
  } catch (error) {
    logger.error('[Affiliate Account] PATCH error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to update account' }, { status: 500 });
  }
}

export const GET = withAffiliateAuth(handleGet);
export const PATCH = withAffiliateAuth(handlePatch);
