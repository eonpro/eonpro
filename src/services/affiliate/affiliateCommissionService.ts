/**
 * Affiliate Commission Service
 * HIPAA-COMPLIANT: Never stores or processes patient-identifiable information
 *
 * This service handles:
 * - Commission event creation from Stripe payments
 * - Commission calculations (flat/percent)
 * - Tiered commission rates
 * - Product-specific commission rates
 * - Promotional bonus commissions
 * - Recurring commission handling
 * - Idempotent event processing
 * - Refund/chargeback reversals
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getRequestId } from '@/lib/observability/request-context';
import type { CommissionEventStatus, CommissionPlanType } from '@prisma/client';
import { performFraudCheck, processFraudCheckResult, type FraudCheckRequest } from './fraudDetectionService';

// ============================================================================
// Types
// ============================================================================

export interface PaymentEventData {
  clinicId: number;
  patientId: number;
  stripeEventId: string;
  stripeObjectId: string;
  stripeEventType: string;
  amountCents: number;
  occurredAt: Date;
  isFirstPayment?: boolean;
  isRecurring?: boolean;
  recurringMonth?: number;
  subscriptionId?: string;
  productSku?: string;
  productCategory?: string;
  metadata?: Record<string, any>;
}

export interface CommissionBreakdown {
  baseCommissionCents: number;
  tierBonusCents: number;
  productAdjustmentCents: number;
  promotionBonusCents: number;
  recurringMultiplier: number;
  totalCommissionCents: number;
  tierName?: string;
  promotionName?: string;
  appliedProductRule?: string;
  /** Promotion IDs to increment usage for — caller must do this inside their transaction */
  appliedPromotionIds: number[];
}

export interface CommissionResult {
  success: boolean;
  commissionEventId?: number;
  commissionAmountCents?: number;
  skipped?: boolean;
  skipReason?: string;
  error?: string;
}

export interface RefundEventData {
  clinicId: number;
  stripeEventId: string;
  stripeObjectId: string; // Original payment object ID
  stripeEventType: string;
  amountCents: number;
  occurredAt: Date;
  reason?: string;
}

// ============================================================================
// Commission Calculation
// ============================================================================

/**
 * Calculate base commission amount based on plan type
 * @param eventAmountCents - Payment amount in cents
 * @param planType - 'FLAT' or 'PERCENT'
 * @param flatAmountCents - Flat commission amount (for FLAT type)
 * @param percentBps - Percentage in basis points (1000 = 10%)
 */
export function calculateCommission(
  eventAmountCents: number,
  planType: CommissionPlanType,
  flatAmountCents: number | null,
  percentBps: number | null
): number {
  if (planType === 'FLAT') {
    return flatAmountCents || 0;
  }

  if (planType === 'PERCENT' && percentBps) {
    // percentBps / 10000 gives the decimal percentage
    // e.g., 1000 bps = 10% = 0.10
    return Math.round((eventAmountCents * percentBps) / 10000);
  }

  return 0;
}

// ============================================================================
// Enhanced Commission Calculation with Tiers, Products, Promotions
// ============================================================================

/**
 * Get the affiliate's current tier based on their performance
 */
async function getAffiliateTier(
  affiliateId: number,
  planId: number
): Promise<{
  tierId: number;
  tierName: string;
  percentBps: number | null;
  flatAmountCents: number | null;
  bonusCents: number | null;
} | null> {
  // Get affiliate's lifetime stats
  const affiliate = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
    select: {
      lifetimeConversions: true,
      lifetimeRevenueCents: true,
    },
  });

  if (!affiliate) return null;

  // Get all tiers for this plan, sorted by level descending
  const tiers = await prisma.affiliateCommissionTier.findMany({
    where: { planId },
    orderBy: { level: 'desc' },
  });

  // Find the highest tier the affiliate qualifies for
  for (const tier of tiers) {
    const meetsConversions = affiliate.lifetimeConversions >= tier.minConversions;
    const meetsRevenue = affiliate.lifetimeRevenueCents >= tier.minRevenueCents;

    if (meetsConversions && meetsRevenue) {
      return {
        tierId: tier.id,
        tierName: tier.name,
        percentBps: tier.percentBps,
        flatAmountCents: tier.flatAmountCents,
        bonusCents: tier.bonusCents,
      };
    }
  }

  return null;
}

/**
 * Get applicable product rate for a specific product/category
 */
async function getProductRate(
  planId: number,
  productSku?: string,
  productCategory?: string,
  amountCents?: number
): Promise<{
  percentBps: number | null;
  flatAmountCents: number | null;
  ruleName: string;
} | null> {
  // Get all active product rules for this plan, sorted by priority
  const rules = await prisma.affiliateProductRate.findMany({
    where: {
      planId,
      isActive: true,
    },
    orderBy: { priority: 'desc' },
  });

  for (const rule of rules) {
    // Check SKU match
    if (rule.productSku && productSku && rule.productSku === productSku) {
      return {
        percentBps: rule.percentBps,
        flatAmountCents: rule.flatAmountCents,
        ruleName: `SKU: ${rule.productSku}`,
      };
    }

    // Check category match
    if (
      rule.productCategory &&
      productCategory &&
      rule.productCategory.toLowerCase() === productCategory.toLowerCase()
    ) {
      return {
        percentBps: rule.percentBps,
        flatAmountCents: rule.flatAmountCents,
        ruleName: `Category: ${rule.productCategory}`,
      };
    }

    // Check price range match
    if (amountCents && rule.minPriceCents !== null && rule.maxPriceCents !== null) {
      if (amountCents >= rule.minPriceCents && amountCents <= rule.maxPriceCents) {
        return {
          percentBps: rule.percentBps,
          flatAmountCents: rule.flatAmountCents,
          ruleName: `Price range: $${rule.minPriceCents / 100}-$${rule.maxPriceCents / 100}`,
        };
      }
    }
  }

  return null;
}

/**
 * Get applicable promotions for current time
 */
async function getActivePromotions(
  planId: number,
  affiliateId: number,
  refCode?: string,
  orderAmountCents?: number
): Promise<
  Array<{
    id: number;
    name: string;
    bonusPercentBps: number | null;
    bonusFlatCents: number | null;
  }>
> {
  const now = new Date();

  const promotions = await prisma.affiliatePromotion.findMany({
    where: {
      planId,
      isActive: true,
      startsAt: { lte: now },
      endsAt: { gte: now },
    },
  });

  const applicable: Array<{
    id: number;
    name: string;
    bonusPercentBps: number | null;
    bonusFlatCents: number | null;
  }> = [];

  for (const promo of promotions) {
    // Check max uses
    if (promo.maxUses && promo.usesCount >= promo.maxUses) {
      continue;
    }

    // Check minimum order amount
    if (promo.minOrderCents && orderAmountCents && orderAmountCents < promo.minOrderCents) {
      continue;
    }

    // Check affiliate targeting
    if (promo.affiliateIds) {
      const targetIds = promo.affiliateIds as number[];
      if (!targetIds.includes(affiliateId)) {
        continue;
      }
    }

    // Check ref code targeting
    if (promo.refCodes && refCode) {
      const targetCodes = promo.refCodes as string[];
      if (!targetCodes.includes(refCode)) {
        continue;
      }
    }

    applicable.push({
      id: promo.id,
      name: promo.name,
      bonusPercentBps: promo.bonusPercentBps,
      bonusFlatCents: promo.bonusFlatCents,
    });
  }

  return applicable;
}

/**
 * Calculate recurring commission multiplier based on plan settings
 */
function calculateRecurringMultiplier(
  recurringMonth: number,
  recurringMonths: number | null,
  recurringDecayPct: number | null
): number {
  // Check if within recurring window
  if (recurringMonths !== null && recurringMonth > recurringMonths) {
    return 0; // No commission after window
  }

  // Apply decay after first year (month 12)
  if (recurringDecayPct !== null && recurringMonth > 12) {
    return recurringDecayPct / 100;
  }

  return 1; // Full commission
}

/**
 * Calculate full commission with tiers, product rates, and promotions
 * Supports separate commission rates for initial vs recurring payments
 */
export async function calculateEnhancedCommission(
  affiliateId: number,
  clinicId: number,
  plan: {
    id: number;
    planType: CommissionPlanType;
    flatAmountCents: number | null;
    percentBps: number | null;
    // Separate initial/recurring rates (new fields)
    initialPercentBps?: number | null;
    initialFlatAmountCents?: number | null;
    recurringPercentBps?: number | null;
    recurringFlatAmountCents?: number | null;
    tierEnabled: boolean;
    recurringEnabled: boolean;
    recurringMonths: number | null;
    recurringDecayPct: number | null;
  },
  eventAmountCents: number,
  options: {
    isFirstPayment?: boolean;
    isRecurring?: boolean;
    recurringMonth?: number;
    productSku?: string;
    productCategory?: string;
    refCode?: string;
  } = {}
): Promise<CommissionBreakdown> {
  let baseCommissionCents = 0;
  let tierBonusCents = 0;
  let productAdjustmentCents = 0;
  let promotionBonusCents = 0;
  let recurringMultiplier = 1;
  let tierName: string | undefined;
  let promotionName: string | undefined;
  let appliedProductRule: string | undefined;

  // 1. Determine which rates to use based on payment type
  // Priority: Initial/Recurring specific rates > Default rates
  let effectivePercentBps: number | null;
  let effectiveFlatCents: number | null;

  if (options.isRecurring) {
    // Use recurring-specific rates if available, otherwise fall back to default
    effectivePercentBps = plan.recurringPercentBps ?? plan.percentBps;
    effectiveFlatCents = plan.recurringFlatAmountCents ?? plan.flatAmountCents;
  } else if (options.isFirstPayment || !options.isRecurring) {
    // Use initial-specific rates if available, otherwise fall back to default
    effectivePercentBps = plan.initialPercentBps ?? plan.percentBps;
    effectiveFlatCents = plan.initialFlatAmountCents ?? plan.flatAmountCents;
  } else {
    // Fallback to default rates
    effectivePercentBps = plan.percentBps;
    effectiveFlatCents = plan.flatAmountCents;
  }

  // 2. Check for tier override
  if (plan.tierEnabled) {
    const tier = await getAffiliateTier(affiliateId, plan.id);
    if (tier) {
      tierName = tier.tierName;

      // Tier can override the rate
      if (tier.percentBps !== null) {
        effectivePercentBps = tier.percentBps;
      }
      if (tier.flatAmountCents !== null) {
        effectiveFlatCents = tier.flatAmountCents;
      }

      // Add tier bonus (one-time, tracked separately)
      if (tier.bonusCents) {
        tierBonusCents = tier.bonusCents;
      }
    }
  }

  // 3. Check for product-specific rate override
  const productRate = await getProductRate(
    plan.id,
    options.productSku,
    options.productCategory,
    eventAmountCents
  );

  if (productRate) {
    appliedProductRule = productRate.ruleName;

    // Calculate what the base commission would be
    const baseWithPlanRate = calculateCommission(
      eventAmountCents,
      plan.planType,
      effectiveFlatCents,
      effectivePercentBps
    );

    // Calculate with product rate
    const productCommission = calculateCommission(
      eventAmountCents,
      productRate.percentBps !== null ? 'PERCENT' : 'FLAT',
      productRate.flatAmountCents,
      productRate.percentBps
    );

    // Product adjustment is the difference
    productAdjustmentCents = productCommission - baseWithPlanRate;

    // Use product rate for base
    if (productRate.percentBps !== null) {
      effectivePercentBps = productRate.percentBps;
    }
    if (productRate.flatAmountCents !== null) {
      effectiveFlatCents = productRate.flatAmountCents;
    }
  }

  // 4. Calculate base commission with effective rates
  baseCommissionCents = calculateCommission(
    eventAmountCents,
    plan.planType,
    effectiveFlatCents,
    effectivePercentBps
  );

  // 5. Check for active promotions
  const promotions = await getActivePromotions(
    plan.id,
    affiliateId,
    options.refCode,
    eventAmountCents
  );

  const appliedPromotionIds: number[] = [];

  for (const promo of promotions) {
    promotionName = promo.name;

    if (promo.bonusPercentBps) {
      promotionBonusCents += Math.round((eventAmountCents * promo.bonusPercentBps) / 10000);
    }
    if (promo.bonusFlatCents) {
      promotionBonusCents += promo.bonusFlatCents;
    }

    // Collect promotion IDs — caller increments usesCount inside their transaction
    appliedPromotionIds.push(promo.id);
  }

  // 6. Apply recurring multiplier
  if (options.isRecurring && plan.recurringEnabled && options.recurringMonth) {
    recurringMultiplier = calculateRecurringMultiplier(
      options.recurringMonth,
      plan.recurringMonths,
      plan.recurringDecayPct
    );
  }

  // 7. Calculate total
  const preRecurringTotal = baseCommissionCents + tierBonusCents + promotionBonusCents;
  const totalCommissionCents = Math.round(preRecurringTotal * recurringMultiplier);

  return {
    baseCommissionCents,
    tierBonusCents,
    productAdjustmentCents,
    promotionBonusCents,
    recurringMultiplier,
    totalCommissionCents,
    tierName,
    promotionName,
    appliedProductRule,
    appliedPromotionIds,
  };
}

/**
 * Update affiliate's lifetime stats after a commission event
 */
export async function updateAffiliateLifetimeStats(
  affiliateId: number,
  eventAmountCents: number
): Promise<void> {
  await prisma.affiliate.update({
    where: { id: affiliateId },
    data: {
      lifetimeConversions: { increment: 1 },
      lifetimeRevenueCents: { increment: eventAmountCents },
    },
  });
}

// ============================================================================
// Get Effective Commission Plan
// ============================================================================

/**
 * Get the effective commission plan for an affiliate at a specific time
 */
export async function getEffectiveCommissionPlan(
  affiliateId: number,
  clinicId: number,
  atDate: Date
) {
  const assignment = await prisma.affiliatePlanAssignment.findFirst({
    where: {
      affiliateId,
      clinicId,
      effectiveFrom: { lte: atDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: atDate } }],
    },
    include: {
      commissionPlan: true,
    },
    orderBy: {
      effectiveFrom: 'desc',
    },
  });

  return assignment?.commissionPlan || null;
}

// ============================================================================
// Create Commission Event from Payment
// ============================================================================

/**
 * Process a payment event and create commission event if applicable
 * HIPAA-COMPLIANT: Only stores payment amounts and affiliate IDs, never patient data
 *
 * Enhanced with:
 * - Tiered commission rates
 * - Product-specific rates
 * - Promotional bonuses
 * - Recurring commission support
 */
export async function processPaymentForCommission(
  data: PaymentEventData
): Promise<CommissionResult> {
  const {
    clinicId,
    patientId,
    stripeEventId,
    stripeObjectId,
    stripeEventType,
    amountCents,
    occurredAt,
    isFirstPayment,
    isRecurring,
    recurringMonth,
    productSku,
    productCategory,
  } = data;

  try {
    // Idempotency check: Don't process same event twice
    const existingEvent = await prisma.affiliateCommissionEvent.findUnique({
      where: {
        clinicId_stripeEventId: {
          clinicId,
          stripeEventId,
        },
      },
    });

    if (existingEvent) {
      logger.debug('[AffiliateCommission] Event already processed', {
        stripeEventId,
        existingEventId: existingEvent.id,
      });
      return {
        success: true,
        skipped: true,
        skipReason: 'Event already processed',
        commissionEventId: existingEvent.id,
      };
    }

    // Get patient's attribution affiliate
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        id: true,
        attributionAffiliateId: true,
        attributionRefCode: true,
        attributionFirstTouchAt: true,
      },
    });

    if (!patient?.attributionAffiliateId) {
      logger.debug('[AffiliateCommission] No affiliate attribution for patient', {
        patientId,
        clinicId,
      });
      return {
        success: true,
        skipped: true,
        skipReason: 'No affiliate attribution',
      };
    }

    const affiliateId = patient.attributionAffiliateId;
    const refCode = patient.attributionRefCode;

    // Verify affiliate is active and belongs to clinic
    const affiliate = await prisma.affiliate.findFirst({
      where: {
        id: affiliateId,
        clinicId,
        status: 'ACTIVE',
      },
    });

    if (!affiliate) {
      logger.debug('[AffiliateCommission] Affiliate not active or not in clinic', {
        affiliateId,
        clinicId,
      });
      return {
        success: true,
        skipped: true,
        skipReason: 'Affiliate not active',
      };
    }

    // Get effective commission plan
    const commissionPlan = await getEffectiveCommissionPlan(affiliateId, clinicId, occurredAt);

    if (!commissionPlan || !commissionPlan.isActive) {
      logger.debug('[AffiliateCommission] No active commission plan', {
        affiliateId,
        clinicId,
      });
      return {
        success: true,
        skipped: true,
        skipReason: 'No active commission plan',
      };
    }

    // Check if this is first payment and plan only applies to first payment
    if (commissionPlan.appliesTo === 'FIRST_PAYMENT_ONLY' && !isFirstPayment && !isRecurring) {
      logger.debug('[AffiliateCommission] Plan only applies to first payment', {
        affiliateId,
        isFirstPayment,
      });
      return {
        success: true,
        skipped: true,
        skipReason: 'Plan only applies to first payment',
      };
    }

    // Check recurring eligibility
    if (isRecurring && !commissionPlan.recurringEnabled) {
      logger.debug('[AffiliateCommission] Recurring commissions not enabled', {
        affiliateId,
        planId: commissionPlan.id,
      });
      return {
        success: true,
        skipped: true,
        skipReason: 'Recurring commissions not enabled',
      };
    }

    // Calculate enhanced commission with tiers, products, promotions
    // Pass initial/recurring specific rates for differentiated commission
    const breakdown = await calculateEnhancedCommission(
      affiliateId,
      clinicId,
      {
        id: commissionPlan.id,
        planType: commissionPlan.planType,
        flatAmountCents: commissionPlan.flatAmountCents,
        percentBps: commissionPlan.percentBps,
        // Support separate initial/recurring rates
        initialPercentBps: commissionPlan.initialPercentBps,
        initialFlatAmountCents: commissionPlan.initialFlatAmountCents,
        recurringPercentBps: commissionPlan.recurringPercentBps,
        recurringFlatAmountCents: commissionPlan.recurringFlatAmountCents,
        tierEnabled: commissionPlan.tierEnabled,
        recurringEnabled: commissionPlan.recurringEnabled,
        recurringMonths: commissionPlan.recurringMonths,
        recurringDecayPct: commissionPlan.recurringDecayPct,
      },
      amountCents,
      {
        isFirstPayment,
        isRecurring,
        recurringMonth,
        productSku,
        productCategory,
        refCode: refCode || undefined,
      }
    );

    if (breakdown.totalCommissionCents <= 0) {
      logger.debug('[AffiliateCommission] Zero commission calculated', {
        affiliateId,
        amountCents,
        breakdown,
      });
      return {
        success: true,
        skipped: true,
        skipReason: 'Zero commission',
      };
    }

    // Fraud detection: check before creating commission
    let fraudRiskLevel: string = 'LOW';
    try {
      const fraudRequest: FraudCheckRequest = {
        clinicId,
        affiliateId,
        patientId,
        eventAmountCents: amountCents,
      };
      const fraudResult = await performFraudCheck(fraudRequest);

      if (fraudResult.recommendation === 'reject') {
        logger.warn('[AffiliateCommission] Commission blocked by fraud detection', {
          affiliateId,
          clinicId,
          riskScore: fraudResult.riskScore,
          alerts: fraudResult.alerts.map(a => a.type),
        });
        return {
          success: true,
          skipped: true,
          skipReason: `Fraud detected: ${fraudResult.alerts.map(a => a.type).join(', ')}`,
        };
      }

      fraudRiskLevel = fraudResult.riskScore >= 70 ? 'HIGH' : fraudResult.riskScore >= 40 ? 'MEDIUM' : 'LOW';

      // Process fraud result asynchronously (create alerts if needed) — fire and forget
      processFraudCheckResult(fraudRequest, fraudResult).catch(err => {
        logger.error('[AffiliateCommission] Failed to process fraud result', {
          error: err instanceof Error ? err.message : 'Unknown error',
          affiliateId,
        });
      });
    } catch (fraudError) {
      // Fraud check failure should NOT block commission processing — log and continue
      logger.error('[AffiliateCommission] Fraud check failed, proceeding with commission', {
        error: fraudError instanceof Error ? fraudError.message : 'Unknown error',
        affiliateId,
        clinicId,
      });
    }

    // Calculate hold until date
    const holdUntil =
      commissionPlan.holdDays > 0
        ? new Date(occurredAt.getTime() + commissionPlan.holdDays * 24 * 60 * 60 * 1000)
        : null;

    // Create commission event + update lifetime stats in a single transaction.
    // The DB unique constraint on (clinicId, stripeEventId) is the ultimate idempotency
    // guarantee — if two concurrent Stripe webhook deliveries race past the pre-check,
    // the constraint violation (P2002) ensures only one succeeds.
    let commissionEvent;
    try {
      commissionEvent = await prisma.$transaction(async (tx) => {
        const event = await tx.affiliateCommissionEvent.create({
          data: {
            clinicId,
            affiliateId,
            stripeEventId,
            stripeObjectId,
            stripeEventType,
            eventAmountCents: amountCents,
            commissionAmountCents: breakdown.totalCommissionCents,
            baseCommissionCents: breakdown.baseCommissionCents,
            tierBonusCents: breakdown.tierBonusCents,
            promotionBonusCents: breakdown.promotionBonusCents,
            productAdjustmentCents: breakdown.productAdjustmentCents,
            commissionPlanId: commissionPlan.id,
            isRecurring: isRecurring || false,
            recurringMonth: recurringMonth || null,
          attributionModel: 'STORED', // From patient attribution
          status: fraudRiskLevel === 'HIGH' ? 'PENDING' : 'PENDING', // HIGH risk stays PENDING for manual review
            occurredAt,
            holdUntil,
            metadata: {
              refCode,
              planName: commissionPlan.name,
              planType: commissionPlan.planType,
              tierName: breakdown.tierName,
              promotionName: breakdown.promotionName,
              appliedProductRule: breakdown.appliedProductRule,
            recurringMultiplier: breakdown.recurringMultiplier,
            fraudCheck: { riskLevel: fraudRiskLevel },
            // HIPAA: Do NOT store patient name, email, or any identifiers
          },
          },
        });

        // Increment promotion usage counts atomically within the same transaction
        if (breakdown.appliedPromotionIds.length > 0) {
          await tx.affiliatePromotion.updateMany({
            where: { id: { in: breakdown.appliedPromotionIds } },
            data: { usesCount: { increment: 1 } },
          });
        }

        // Update affiliate's lifetime stats within the same transaction
        await tx.affiliate.update({
          where: { id: affiliateId },
          data: {
            lifetimeConversions: { increment: 1 },
            lifetimeRevenueCents: { increment: amountCents },
          },
        });

        return event;
      }, { timeout: 15000 });
    } catch (txError: unknown) {
      // Catch P2002 unique constraint violation = duplicate Stripe event (idempotent)
      if (txError && typeof txError === 'object' && 'code' in txError && (txError as { code: string }).code === 'P2002') {
        const existing = await prisma.affiliateCommissionEvent.findUnique({
          where: { clinicId_stripeEventId: { clinicId, stripeEventId } },
        });
        logger.debug('[AffiliateCommission] Duplicate event caught by constraint', {
          stripeEventId,
          existingEventId: existing?.id,
        });
        return {
          success: true,
          skipped: true,
          skipReason: 'Event already processed (constraint)',
          commissionEventId: existing?.id,
        };
      }
      throw txError; // Re-throw non-idempotency errors
    }

    logger.info('[AffiliateCommission] Commission event created', {
      requestId: getRequestId(),
      commissionEventId: commissionEvent.id,
      affiliateId,
      clinicId,
      commissionAmountCents: breakdown.totalCommissionCents,
      breakdown: {
        base: breakdown.baseCommissionCents,
        tier: breakdown.tierBonusCents,
        promotion: breakdown.promotionBonusCents,
        product: breakdown.productAdjustmentCents,
      },
      stripeEventId,
    });

    return {
      success: true,
      commissionEventId: commissionEvent.id,
      commissionAmountCents: breakdown.totalCommissionCents,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[AffiliateCommission] Error processing payment', {
      error: errorMessage,
      stripeEventId,
      clinicId,
    });
    return {
      success: false,
      error: errorMessage,
    };
  }
}

// ============================================================================
// Handle Refund/Chargeback Reversal
// ============================================================================

/**
 * Reverse commission event due to refund or chargeback
 * Only reverses if the commission plan has clawback enabled
 */
export async function reverseCommissionForRefund(data: RefundEventData): Promise<CommissionResult> {
  const { clinicId, stripeObjectId, stripeEventType, reason } = data;

  try {
    // Find the original commission event
    const commissionEvent = await prisma.affiliateCommissionEvent.findFirst({
      where: {
        clinicId,
        stripeObjectId,
        status: { in: ['PENDING', 'APPROVED'] }, // Can't reverse already paid or reversed
      },
      include: {
        affiliate: {
          include: {
            planAssignments: {
              include: {
                commissionPlan: true,
              },
              orderBy: {
                effectiveFrom: 'desc',
              },
              take: 1,
            },
          },
        },
      },
    });

    if (!commissionEvent) {
      logger.debug('[AffiliateCommission] No commission event found to reverse', {
        stripeObjectId,
        clinicId,
      });
      return {
        success: true,
        skipped: true,
        skipReason: 'No commission event found',
      };
    }

    // Check if clawback is enabled
    const currentPlan = commissionEvent.affiliate.planAssignments[0]?.commissionPlan;
    if (!currentPlan?.clawbackEnabled) {
      logger.debug('[AffiliateCommission] Clawback not enabled for plan', {
        commissionEventId: commissionEvent.id,
        planId: currentPlan?.id,
      });
      return {
        success: true,
        skipped: true,
        skipReason: 'Clawback not enabled',
      };
    }

    // Reverse the commission using optimistic concurrency.
    // The WHERE clause atomically checks reversedAt IS NULL and updates,
    // preventing concurrent refund events from double-reversing the same commission.
    const result = await prisma.affiliateCommissionEvent.updateMany({
      where: {
        id: commissionEvent.id,
        status: { in: ['PENDING', 'APPROVED'] },
        reversedAt: null, // Optimistic lock — only reverse if not already reversed
      },
      data: {
        status: 'REVERSED',
        reversedAt: new Date(),
        reversalReason: reason || stripeEventType,
      },
    });

    if (result.count === 0) {
      logger.info('[AffiliateCommission] Commission already reversed (idempotent)', {
        commissionEventId: commissionEvent.id,
        affiliateId: commissionEvent.affiliateId,
      });
      return {
        success: true,
        skipped: true,
        skipReason: 'Already reversed',
        commissionEventId: commissionEvent.id,
      };
    }

    logger.info('[AffiliateCommission] Commission reversed', {
      commissionEventId: commissionEvent.id,
      affiliateId: commissionEvent.affiliateId,
      reason,
    });

    return {
      success: true,
      commissionEventId: commissionEvent.id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[AffiliateCommission] Error reversing commission', {
      error: errorMessage,
      stripeObjectId,
      clinicId,
    });
    return {
      success: false,
      error: errorMessage,
    };
  }
}

// ============================================================================
// Approve Pending Commissions
// ============================================================================

/**
 * Approve all pending commissions that have passed their hold period
 * This should be run as a scheduled job
 */
export async function approvePendingCommissions(): Promise<{
  approved: number;
  errors: number;
}> {
  const now = new Date();

  try {
    const result = await prisma.affiliateCommissionEvent.updateMany({
      where: {
        status: 'PENDING',
        OR: [{ holdUntil: null }, { holdUntil: { lte: now } }],
      },
      data: {
        status: 'APPROVED',
        approvedAt: now,
      },
    });

    logger.info('[AffiliateCommission] Approved pending commissions', {
      count: result.count,
    });

    return {
      approved: result.count,
      errors: 0,
    };
  } catch (error) {
    logger.error('[AffiliateCommission] Error approving commissions', error);
    return {
      approved: 0,
      errors: 1,
    };
  }
}

// ============================================================================
// Check if Patient Has Prior Payments (for first_payment_only logic)
// ============================================================================

/**
 * Check if a patient has any prior successful payments
 */
export async function checkIfFirstPayment(
  patientId: number,
  currentPaymentId?: string
): Promise<boolean> {
  const priorPayments = await prisma.payment.count({
    where: {
      patientId,
      status: 'SUCCEEDED',
      stripePaymentIntentId: currentPaymentId ? { not: currentPaymentId } : undefined,
    },
  });

  return priorPayments === 0;
}

// ============================================================================
// Get Aggregated Commission Stats (HIPAA-SAFE)
// ============================================================================

/**
 * Get aggregated commission statistics for an affiliate
 * HIPAA-COMPLIANT: Returns only counts and totals, never patient data
 */
export async function getAffiliateCommissionStats(
  affiliateId: number,
  clinicId: number,
  fromDate?: Date,
  toDate?: Date
) {
  const dateFilter = {
    ...(fromDate && { gte: fromDate }),
    ...(toDate && { lte: toDate }),
  };

  const [pendingStats, approvedStats, paidStats, reversedStats, dailyTrends] = await Promise.all([
    // Pending commissions
    prisma.affiliateCommissionEvent.aggregate({
      where: {
        affiliateId,
        clinicId,
        status: 'PENDING',
        ...(fromDate || toDate ? { occurredAt: dateFilter } : {}),
      },
      _sum: { commissionAmountCents: true },
      _count: true,
    }),

    // Approved commissions (ready for payout)
    prisma.affiliateCommissionEvent.aggregate({
      where: {
        affiliateId,
        clinicId,
        status: 'APPROVED',
        ...(fromDate || toDate ? { occurredAt: dateFilter } : {}),
      },
      _sum: { commissionAmountCents: true },
      _count: true,
    }),

    // Paid commissions
    prisma.affiliateCommissionEvent.aggregate({
      where: {
        affiliateId,
        clinicId,
        status: 'PAID',
        ...(fromDate || toDate ? { occurredAt: dateFilter } : {}),
      },
      _sum: { commissionAmountCents: true },
      _count: true,
    }),

    // Reversed commissions
    prisma.affiliateCommissionEvent.aggregate({
      where: {
        affiliateId,
        clinicId,
        status: 'REVERSED',
        ...(fromDate || toDate ? { occurredAt: dateFilter } : {}),
      },
      _sum: { commissionAmountCents: true },
      _count: true,
    }),

    // Daily breakdown (aggregated - no individual records)
    // Enterprise audit P0: use Prisma.sql + Prisma.join for dynamic WHERE to avoid SQL injection
    (() => {
      const conditions: Prisma.Sql[] = [
        Prisma.sql`"affiliateId" = ${affiliateId}`,
        Prisma.sql`"clinicId" = ${clinicId}`,
        Prisma.sql`"status" != 'REVERSED'`,
      ];
      if (fromDate) conditions.push(Prisma.sql`"occurredAt" >= ${fromDate}`);
      if (toDate) conditions.push(Prisma.sql`"occurredAt" <= ${toDate}`);
      const whereClause = Prisma.join(conditions, ' AND ');
      return prisma.$queryRaw<
        Array<{
          date: Date;
          conversions: number;
          revenue_cents: number | null;
          commission_cents: number | null;
        }>
      >(Prisma.sql`
        SELECT 
          DATE_TRUNC('day', "occurredAt") as date,
          COUNT(*)::int as conversions,
          SUM("eventAmountCents")::bigint as revenue_cents,
          SUM("commissionAmountCents")::bigint as commission_cents
        FROM "AffiliateCommissionEvent"
        WHERE ${whereClause}
        GROUP BY DATE_TRUNC('day', "occurredAt")
        ORDER BY date DESC
        LIMIT 90
      `);
    })(),
  ]);

  // Apply small-number suppression for HIPAA compliance
  // If daily count < 5, suppress the specific day data
  const suppressedTrends = (dailyTrends as any[]).map((day) => ({
    date: day.date,
    conversions: Number(day.conversions) < 5 ? '<5' : Number(day.conversions),
    revenueCents: Number(day.conversions) < 5 ? null : Number(day.revenue_cents),
    commissionCents: Number(day.conversions) < 5 ? null : Number(day.commission_cents),
  }));

  return {
    pending: {
      count: pendingStats._count,
      amountCents: pendingStats._sum.commissionAmountCents || 0,
    },
    approved: {
      count: approvedStats._count,
      amountCents: approvedStats._sum.commissionAmountCents || 0,
    },
    paid: {
      count: paidStats._count,
      amountCents: paidStats._sum.commissionAmountCents || 0,
    },
    reversed: {
      count: reversedStats._count,
      amountCents: reversedStats._sum.commissionAmountCents || 0,
    },
    totals: {
      conversions: pendingStats._count + approvedStats._count + paidStats._count,
      revenueCents:
        (pendingStats._sum.commissionAmountCents || 0) +
        (approvedStats._sum.commissionAmountCents || 0) +
        (paidStats._sum.commissionAmountCents || 0),
    },
    dailyTrends: suppressedTrends,
  };
}
