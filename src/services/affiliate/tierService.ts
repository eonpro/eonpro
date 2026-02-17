/**
 * Affiliate Tier Service
 *
 * Manages affiliate tier evaluation, upgrades, and bonuses.
 * Tiers provide:
 * - Increased commission rates
 * - One-time bonuses for reaching new tiers
 * - Additional perks
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getRequestId } from '@/lib/observability/request-context';

export interface TierInfo {
  id: number;
  name: string;
  level: number;
  percentBps: number | null;
  flatAmountCents: number | null;
  bonusCents: number | null;
  minConversions: number;
  minRevenueCents: number;
  perks: string[];
}

export interface TierEvaluation {
  currentTier: TierInfo | null;
  nextTier: TierInfo | null;
  progress: {
    conversions: number;
    conversionsNeeded: number;
    conversionsProgress: number; // 0-100%
    revenueCents: number;
    revenueNeeded: number;
    revenueProgress: number; // 0-100%
  };
  qualifiedAt: Date | null;
}

export interface TierUpgradeResult {
  upgraded: boolean;
  previousTier: TierInfo | null;
  newTier: TierInfo | null;
  bonusAwarded: number;
}

/**
 * Get all tiers for a commission plan
 */
export async function getPlanTiers(planId: number): Promise<TierInfo[]> {
  const tiers = await prisma.affiliateCommissionTier.findMany({
    where: { planId },
    orderBy: { level: 'asc' },
  });

  return tiers.map((tier: (typeof tiers)[number]) => ({
    id: tier.id,
    name: tier.name,
    level: tier.level,
    percentBps: tier.percentBps,
    flatAmountCents: tier.flatAmountCents,
    bonusCents: tier.bonusCents,
    minConversions: tier.minConversions,
    minRevenueCents: tier.minRevenueCents,
    perks: tier.perks ? (tier.perks as string[]) : [],
  }));
}

/**
 * Evaluate an affiliate's current tier status
 */
export async function evaluateAffiliateTier(
  affiliateId: number,
  planId: number
): Promise<TierEvaluation> {
  // Get affiliate stats
  const affiliate = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
    select: {
      lifetimeConversions: true,
      lifetimeRevenueCents: true,
      currentTierId: true,
      tierQualifiedAt: true,
    },
  });

  if (!affiliate) {
    throw new Error(`Affiliate ${affiliateId} not found`);
  }

  // Get all tiers
  const tiers = await getPlanTiers(planId);

  if (tiers.length === 0) {
    return {
      currentTier: null,
      nextTier: null,
      progress: {
        conversions: affiliate.lifetimeConversions,
        conversionsNeeded: 0,
        conversionsProgress: 100,
        revenueCents: affiliate.lifetimeRevenueCents,
        revenueNeeded: 0,
        revenueProgress: 100,
      },
      qualifiedAt: null,
    };
  }

  // Find current tier (highest qualified)
  let currentTier: TierInfo | null = null;
  let nextTier: TierInfo | null = null;

  for (let i = tiers.length - 1; i >= 0; i--) {
    const tier = tiers[i];
    const meetsConversions = affiliate.lifetimeConversions >= tier.minConversions;
    const meetsRevenue = affiliate.lifetimeRevenueCents >= tier.minRevenueCents;

    if (meetsConversions && meetsRevenue) {
      currentTier = tier;
      nextTier = tiers[i + 1] || null;
      break;
    }
  }

  // If no tier qualified, next tier is the first one
  if (!currentTier && tiers.length > 0) {
    nextTier = tiers[0];
  }

  // Calculate progress towards next tier
  const targetTier = nextTier || currentTier;
  const progress = {
    conversions: affiliate.lifetimeConversions,
    conversionsNeeded: targetTier?.minConversions || 0,
    conversionsProgress: targetTier?.minConversions
      ? Math.min(100, Math.round((affiliate.lifetimeConversions / targetTier.minConversions) * 100))
      : 100,
    revenueCents: affiliate.lifetimeRevenueCents,
    revenueNeeded: targetTier?.minRevenueCents || 0,
    revenueProgress: targetTier?.minRevenueCents
      ? Math.min(
          100,
          Math.round((affiliate.lifetimeRevenueCents / targetTier.minRevenueCents) * 100)
        )
      : 100,
  };

  return {
    currentTier,
    nextTier,
    progress,
    qualifiedAt: affiliate.tierQualifiedAt,
  };
}

/**
 * Check and process tier upgrades for an affiliate.
 * Uses a Serializable transaction to prevent concurrent calls from
 * double-awarding the same tier bonus.
 * Returns bonus amount if upgraded.
 */
export async function checkAndProcessTierUpgrade(
  affiliateId: number,
  planId: number
): Promise<TierUpgradeResult> {
  // Get all tiers sorted by level (read-only, safe outside transaction)
  const tiers = await getPlanTiers(planId);

  // Perform the upgrade check + write inside a Serializable transaction
  // This prevents the read-then-write race where two concurrent calls both
  // see the old tier and both award the bonus
  return prisma.$transaction(async (tx) => {
    const affiliate = await tx.affiliate.findUnique({
      where: { id: affiliateId },
      select: {
        id: true,
        clinicId: true,
        lifetimeConversions: true,
        lifetimeRevenueCents: true,
        currentTierId: true,
      },
    });

    if (!affiliate) {
      throw new Error(`Affiliate ${affiliateId} not found`);
    }

    // Find the highest tier the affiliate qualifies for
    let qualifiedTier: TierInfo | null = null;

    for (let i = tiers.length - 1; i >= 0; i--) {
      const tier = tiers[i];
      if (
        affiliate.lifetimeConversions >= tier.minConversions &&
        affiliate.lifetimeRevenueCents >= tier.minRevenueCents
      ) {
        qualifiedTier = tier;
        break;
      }
    }

    // Check if this is an upgrade from current tier
    const currentTier = affiliate.currentTierId
      ? tiers.find((t) => t.id === affiliate.currentTierId)
      : null;

    // Only upgrade if the qualified tier is strictly higher than current
    const isUpgrade = qualifiedTier && (!currentTier || qualifiedTier.level > currentTier.level);

    if (!isUpgrade) {
      return {
        upgraded: false,
        previousTier: currentTier || null,
        newTier: currentTier || null,
        bonusAwarded: 0,
      };
    }

    // Process the upgrade within transaction
    await tx.affiliate.update({
      where: { id: affiliateId },
      data: {
        currentTierId: qualifiedTier!.id,
        tierQualifiedAt: new Date(),
      },
    });

    // Award tier bonus if applicable — persist as a commission event (not just logged)
    const bonusAwarded = qualifiedTier!.bonusCents || 0;

    if (bonusAwarded > 0) {
      await tx.affiliateCommissionEvent.create({
        data: {
          clinicId: affiliate.clinicId,
          affiliateId,
          stripeEventId: `tier-bonus-${affiliateId}-${qualifiedTier!.id}-${Date.now()}`,
          stripeObjectId: `tier-${qualifiedTier!.id}`,
          stripeEventType: 'tier_bonus',
          eventAmountCents: 0, // No order associated
          commissionAmountCents: bonusAwarded,
          baseCommissionCents: bonusAwarded,
          tierBonusCents: 0,
          promotionBonusCents: 0,
          productAdjustmentCents: 0,
          commissionPlanId: planId,
          isRecurring: false,
          attributionModel: 'TIER_BONUS',
          status: 'APPROVED', // Tier bonuses are immediately available
          occurredAt: new Date(),
          metadata: {
            type: 'tier_bonus',
            tierName: qualifiedTier!.name,
            tierLevel: qualifiedTier!.level,
            previousTier: currentTier?.name || 'None',
          },
        },
      });

      logger.info('[TierService] Tier bonus commission event created', {
        affiliateId,
        tierName: qualifiedTier!.name,
        bonusCents: bonusAwarded,
      });
    }

    logger.info('[TierService] Affiliate tier upgraded', {
      requestId: getRequestId(),
      affiliateId,
      previousTier: currentTier?.name || 'None',
      newTier: qualifiedTier!.name,
    });

    return {
      upgraded: true,
      previousTier: currentTier || null,
      newTier: qualifiedTier,
      bonusAwarded,
    };
  }, { isolationLevel: 'Serializable', timeout: 15000, maxWait: 5000 });
}

/**
 * Get tier leaderboard for a clinic
 */
export async function getTierLeaderboard(
  clinicId: number,
  planId: number,
  limit: number = 10
): Promise<
  Array<{
    affiliateId: number;
    displayName: string;
    tier: TierInfo | null;
    conversions: number;
    revenueCents: number;
  }>
> {
  const affiliates = await prisma.affiliate.findMany({
    where: {
      clinicId,
      status: 'ACTIVE',
    },
    orderBy: [{ lifetimeRevenueCents: 'desc' }, { lifetimeConversions: 'desc' }],
    take: limit,
    select: {
      id: true,
      displayName: true,
      lifetimeConversions: true,
      lifetimeRevenueCents: true,
      currentTierId: true,
    },
  });

  // Get all tiers for lookup
  const tiers = await getPlanTiers(planId);
  const tierMap = new Map(tiers.map((t) => [t.id, t]));

  return affiliates.map((affiliate: (typeof affiliates)[number]) => ({
    affiliateId: affiliate.id,
    displayName: affiliate.displayName,
    tier: affiliate.currentTierId ? tierMap.get(affiliate.currentTierId) || null : null,
    conversions: affiliate.lifetimeConversions,
    revenueCents: affiliate.lifetimeRevenueCents,
  }));
}

/**
 * Recalculate tier for all affiliates (maintenance job)
 */
export async function recalculateAllTiers(
  clinicId: number,
  planId: number
): Promise<{
  processed: number;
  upgraded: number;
  downgraded: number;
}> {
  const affiliates = await prisma.affiliate.findMany({
    where: { clinicId, status: 'ACTIVE' },
    select: {
      id: true,
      currentTierId: true,
      lifetimeConversions: true,
      lifetimeRevenueCents: true,
    },
  });

  const tiers = await getPlanTiers(planId);
  let upgraded = 0;
  let downgraded = 0;

  for (const affiliate of affiliates) {
    // Find correct tier
    let correctTier: TierInfo | null = null;

    for (let i = tiers.length - 1; i >= 0; i--) {
      const tier = tiers[i];
      if (
        affiliate.lifetimeConversions >= tier.minConversions &&
        affiliate.lifetimeRevenueCents >= tier.minRevenueCents
      ) {
        correctTier = tier;
        break;
      }
    }

    const currentTierId = affiliate.currentTierId;
    const correctTierId = correctTier?.id || null;

    if (currentTierId !== correctTierId) {
      // Update tier
      await prisma.affiliate.update({
        where: { id: affiliate.id },
        data: {
          currentTierId: correctTierId,
          tierQualifiedAt: correctTierId ? new Date() : null,
        },
      });

      // Track direction
      if (!currentTierId && correctTierId) {
        upgraded++;
      } else if (currentTierId && !correctTierId) {
        downgraded++;
      } else if (currentTierId && correctTierId) {
        const currentLevel = tiers.find((t) => t.id === currentTierId)?.level || 0;
        const correctLevel = correctTier?.level || 0;
        if (correctLevel > currentLevel) {
          upgraded++;
        } else {
          downgraded++;
        }
      }
    }
  }

  logger.info('[TierService] Tier recalculation complete', {
    clinicId,
    processed: affiliates.length,
    upgraded,
    downgraded,
  });

  return {
    processed: affiliates.length,
    upgraded,
    downgraded,
  };
}
