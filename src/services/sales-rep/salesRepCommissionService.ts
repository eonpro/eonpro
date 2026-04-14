/**
 * Sales Rep Commission Service
 * HIPAA-COMPLIANT: Never stores or processes patient-identifiable information.
 *
 * Handles:
 * - Commission event creation from Stripe payments
 * - Base commission calculations (flat/percent, initial/recurring differentiation)
 * - Volume-based weekly tiers (retroactive and non-retroactive)
 * - Product/bundle-specific commission overrides
 * - Multi-item bonus logic
 * - Override commissions (manager earns % of subordinate's gross revenue)
 * - Idempotent event processing
 * - Refund/chargeback reversals
 * - Approval of pending commissions past hold period
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getDatePartsInTz, midnightInTz } from '@/lib/utils/timezone';
import type { CommissionEventStatus, CommissionPlanType } from '@prisma/client';
import { COMMISSION_ELIGIBLE_ROLES } from '@/lib/constants/commission-eligible-roles';

/** Count-based tiers: minSales/maxSales + flat amountCents per commissioned sale */
const VOLUME_TIER_BASIS_SALE_COUNT = 'SALE_COUNT';
/** Revenue-based tiers: sum of initial (non-recurring) sale amounts Mon–Sun (clinic TZ); tier adds additionalPercentBps */
const VOLUME_TIER_BASIS_WEEKLY_REVENUE = 'WEEKLY_REVENUE_CENTS';

// ============================================================================
// Types
// ============================================================================

export interface SalesRepPaymentEventData {
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
  itemCount?: number;
  productId?: number;
  productBundleId?: number;
}

export interface SalesRepCommissionResult {
  success: boolean;
  commissionEventId?: number;
  commissionAmountCents?: number;
  skipped?: boolean;
  skipReason?: string;
  error?: string;
}

export interface SalesRepRefundEventData {
  clinicId: number;
  stripeEventId: string;
  stripeObjectId: string;
  stripeEventType: string;
  amountCents: number;
  occurredAt: Date;
  reason?: string;
}

interface CommissionBreakdown {
  baseCommissionCents: number;
  volumeTierBonusCents: number;
  productBonusCents: number;
  multiItemBonusCents: number;
  totalCommissionCents: number;
  volumeTierResult: VolumeTierResult | null;
}

// ============================================================================
// Base Commission Calculation
// ============================================================================

function calculateBaseCommission(
  eventAmountCents: number,
  planType: CommissionPlanType,
  flatAmountCents: number | null,
  percentBps: number | null
): number {
  if (planType === 'FLAT') {
    return flatAmountCents || 0;
  }
  if (planType === 'PERCENT' && percentBps) {
    return Math.round((eventAmountCents * percentBps) / 10000);
  }
  return 0;
}

// ============================================================================
// Volume Tier Resolution
// ============================================================================

/**
 * Compute Monday-Sunday week bounds in the clinic's local timezone.
 * Without this, serverless UTC times shift the week boundary by up to a day.
 */
function getWeekBounds(timezone: string = 'America/New_York'): { weekStart: Date; weekEnd: Date } {
  const { year, month, day, dayOfWeek } = getDatePartsInTz(timezone);
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const weekStart = midnightInTz(year, month, day + diffToMonday, timezone);
  const sundayEnd = midnightInTz(year, month, day + diffToMonday + 7, timezone);
  const weekEnd = new Date(sundayEnd.getTime() - 1);

  return { weekStart, weekEnd };
}

type VolumeTierResult =
  | {
      kind: 'COUNT_FLAT';
      amountCents: number;
      salesCount: number;
      windowStart: Date;
      windowEnd: Date;
      crossedNewTier: boolean;
      previousTierAmount: number;
    }
  | {
      kind: 'REVENUE_PERCENT';
      additionalPercentBps: number;
      windowStart: Date;
      windowEnd: Date;
      crossedNewTier: boolean;
      previousAdditionalPercentBps: number;
      weeklyRevenueCentsAfterSale: number;
    };

async function resolveVolumeTier(
  salesRepId: number,
  clinicId: number,
  planId: number,
  volumeTierBasis: string,
  pendingEventAmountCents: number,
  applyRevenueTiersToThisPayment: boolean
): Promise<VolumeTierResult | null> {
  const tiers = await prisma.salesRepVolumeCommissionTier.findMany({
    where: { planId },
    orderBy:
      volumeTierBasis === VOLUME_TIER_BASIS_WEEKLY_REVENUE
        ? [{ minRevenueCents: 'asc' }, { id: 'asc' }]
        : [{ minSales: 'asc' }, { id: 'asc' }],
  });

  if (tiers.length === 0) return null;

  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { timezone: true },
  });
  const bounds = getWeekBounds(
    (clinic as { timezone?: string } | null)?.timezone || 'America/New_York'
  );
  const windowStart = bounds.weekStart;
  const windowEnd = bounds.weekEnd;

  if (volumeTierBasis === VOLUME_TIER_BASIS_WEEKLY_REVENUE) {
    if (!applyRevenueTiersToThisPayment || pendingEventAmountCents <= 0) return null;

    const sumRow = await prisma.salesRepCommissionEvent.aggregate({
      where: {
        salesRepId,
        clinicId,
        occurredAt: { gte: windowStart, lte: windowEnd },
        status: { in: ['PENDING', 'APPROVED', 'PAID'] },
        isRecurring: false,
      },
      _sum: { eventAmountCents: true },
    });
    const previousRevenue = sumRow._sum.eventAmountCents ?? 0;
    const currentRevenue = previousRevenue + pendingEventAmountCents;

    const findTierByRevenue = (revenueCents: number) => {
      let matched: (typeof tiers)[number] | null = null;
      for (const tier of tiers) {
        const min = tier.minRevenueCents;
        if (min != null && revenueCents >= min) {
          matched = tier;
        }
      }
      return matched;
    };

    const currentTier = findTierByRevenue(currentRevenue);
    if (!currentTier || currentTier.additionalPercentBps == null) return null;

    const previousTier = previousRevenue > 0 ? findTierByRevenue(previousRevenue) : null;
    const additionalPercentBps = currentTier.additionalPercentBps;
    const previousAdditionalPercentBps = previousTier?.additionalPercentBps ?? 0;
    const crossedNewTier = additionalPercentBps > previousAdditionalPercentBps;

    return {
      kind: 'REVENUE_PERCENT',
      additionalPercentBps,
      previousAdditionalPercentBps,
      crossedNewTier,
      windowStart,
      windowEnd,
      weeklyRevenueCentsAfterSale: currentRevenue,
    };
  }

  const salesCount = await prisma.salesRepCommissionEvent.count({
    where: {
      salesRepId,
      clinicId,
      occurredAt: { gte: windowStart, lte: windowEnd },
      status: { in: ['PENDING', 'APPROVED', 'PAID'] },
    },
  });

  const previousCount = salesCount;
  const currentCount = salesCount + 1;

  const findTier = (count: number) => {
    let matched: (typeof tiers)[number] | null = null;
    for (const tier of tiers) {
      if (count >= tier.minSales && (tier.maxSales === null || count <= tier.maxSales)) {
        matched = tier;
      }
    }
    if (!matched && count > (tiers[tiers.length - 1]?.minSales ?? 0)) {
      matched = tiers.find((t) => t.maxSales === null) || null;
    }
    return matched;
  };

  const currentTier = findTier(currentCount);
  if (!currentTier) return null;

  const previousTier = previousCount > 0 ? findTier(previousCount) : null;
  const crossedNewTier = !previousTier || currentTier.amountCents > previousTier.amountCents;

  return {
    kind: 'COUNT_FLAT',
    amountCents: currentTier.amountCents,
    salesCount: currentCount,
    windowStart,
    windowEnd,
    crossedNewTier,
    previousTierAmount: previousTier?.amountCents || 0,
  };
}

/**
 * When volumeTierRetroactive=true and a new sale pushes the rep into a higher tier,
 * update all earlier events in the same window to the higher tier amount / rate.
 */
async function applyRetroactiveTierUpdate(
  tx: any,
  salesRepId: number,
  clinicId: number,
  tierResult: VolumeTierResult,
  newEventId: number
): Promise<number> {
  if (tierResult.kind === 'REVENUE_PERCENT') {
    if (!tierResult.crossedNewTier) return 0;

    const prior = await tx.salesRepCommissionEvent.findMany({
      where: {
        salesRepId,
        clinicId,
        occurredAt: { gte: tierResult.windowStart, lte: tierResult.windowEnd },
        status: { in: ['PENDING', 'APPROVED', 'PAID'] },
        id: { not: newEventId },
        isRecurring: false,
      },
      select: {
        id: true,
        eventAmountCents: true,
        volumeTierBonusCents: true,
        commissionAmountCents: true,
      },
    });

    let n = 0;
    for (const ev of prior) {
      const newVol = Math.round((ev.eventAmountCents * tierResult.additionalPercentBps) / 10000);
      const delta = newVol - ev.volumeTierBonusCents;
      if (delta === 0) continue;
      await tx.salesRepCommissionEvent.update({
        where: { id: ev.id },
        data: {
          volumeTierBonusCents: newVol,
          commissionAmountCents: ev.commissionAmountCents + delta,
        },
      });
      n += 1;
    }

    if (n > 0) {
      logger.info('[SalesRepCommission] Retroactive revenue-tier update applied', {
        salesRepId,
        clinicId,
        eventsUpdated: n,
        newAdditionalPercentBps: tierResult.additionalPercentBps,
        previousAdditionalPercentBps: tierResult.previousAdditionalPercentBps,
      });
    }
    return n;
  }

  if (!tierResult.crossedNewTier || tierResult.previousTierAmount >= tierResult.amountCents) {
    return 0;
  }

  const diff = tierResult.amountCents - tierResult.previousTierAmount;

  const updated = await tx.salesRepCommissionEvent.updateMany({
    where: {
      salesRepId,
      clinicId,
      occurredAt: { gte: tierResult.windowStart, lte: tierResult.windowEnd },
      status: { in: ['PENDING', 'APPROVED', 'PAID'] },
      id: { not: newEventId },
      volumeTierBonusCents: { lt: tierResult.amountCents },
    },
    data: {
      volumeTierBonusCents: tierResult.amountCents,
      commissionAmountCents: { increment: diff },
    },
  });

  if (updated.count > 0) {
    logger.info('[SalesRepCommission] Retroactive tier update applied', {
      salesRepId,
      clinicId,
      eventsUpdated: updated.count,
      newTierAmountCents: tierResult.amountCents,
      previousTierAmountCents: tierResult.previousTierAmount,
      diffPerEvent: diff,
    });
  }

  return updated.count;
}

// ============================================================================
// Product/Bundle Commission Override
// ============================================================================

async function resolveProductBonus(
  planId: number,
  eventAmountCents: number,
  productId?: number,
  productBundleId?: number
): Promise<number> {
  if (!productId && !productBundleId) return 0;

  const rules = await prisma.salesRepProductCommission.findMany({
    where: { planId },
  });

  for (const rule of rules) {
    const matches =
      (productId && rule.productId === productId) ||
      (productBundleId && rule.productBundleId === productBundleId);

    if (matches) {
      if (rule.bonusType === 'FLAT') {
        return rule.flatAmountCents || 0;
      }
      if (rule.bonusType === 'PERCENT' && rule.percentBps) {
        return Math.round((eventAmountCents * rule.percentBps) / 10000);
      }
      return 0;
    }
  }

  return 0;
}

// ============================================================================
// Multi-Item Bonus
// ============================================================================

function calculateMultiItemBonus(
  plan: {
    multiItemBonusEnabled: boolean;
    multiItemBonusType: string | null;
    multiItemBonusPercentBps: number | null;
    multiItemBonusFlatCents: number | null;
    multiItemMinQuantity: number | null;
  },
  eventAmountCents: number,
  itemCount: number
): number {
  if (!plan.multiItemBonusEnabled) return 0;

  const minQty = plan.multiItemMinQuantity ?? 2;
  if (itemCount < minQty) return 0;

  if (plan.multiItemBonusType === 'FLAT') {
    return (plan.multiItemBonusFlatCents || 0) * (itemCount - 1);
  }
  if (plan.multiItemBonusType === 'PERCENT' && plan.multiItemBonusPercentBps) {
    return Math.round((eventAmountCents * plan.multiItemBonusPercentBps) / 10000);
  }
  return 0;
}

// ============================================================================
// Enhanced Commission Calculation
// ============================================================================

async function calculateFullCommission(
  salesRepId: number,
  clinicId: number,
  plan: {
    id: number;
    planType: CommissionPlanType;
    flatAmountCents: number | null;
    percentBps: number | null;
    initialPercentBps: number | null;
    initialFlatAmountCents: number | null;
    recurringPercentBps: number | null;
    recurringFlatAmountCents: number | null;
    recurringEnabled: boolean;
    volumeTierEnabled: boolean;
    volumeTierWindow: string | null;
    volumeTierRetroactive: boolean;
    volumeTierBasis: string;
    multiItemBonusEnabled: boolean;
    multiItemBonusType: string | null;
    multiItemBonusPercentBps: number | null;
    multiItemBonusFlatCents: number | null;
    multiItemMinQuantity: number | null;
  },
  eventAmountCents: number,
  options: {
    isFirstPayment?: boolean;
    isRecurring?: boolean;
    recurringMonth?: number;
    itemCount?: number;
    productId?: number;
    productBundleId?: number;
  }
): Promise<CommissionBreakdown> {
  // 1. Determine effective rate (initial vs recurring vs default)
  let effectivePercentBps: number | null;
  let effectiveFlatCents: number | null;

  if (options.isRecurring) {
    effectivePercentBps = plan.recurringPercentBps ?? plan.percentBps;
    effectiveFlatCents = plan.recurringFlatAmountCents ?? plan.flatAmountCents;
  } else {
    effectivePercentBps = plan.initialPercentBps ?? plan.percentBps;
    effectiveFlatCents = plan.initialFlatAmountCents ?? plan.flatAmountCents;
  }

  // 2. Base commission
  const baseCommissionCents = calculateBaseCommission(
    eventAmountCents,
    plan.planType,
    effectiveFlatCents,
    effectivePercentBps
  );

  // 3. Volume tier bonus (sale-count flat $, or weekly initial-sale revenue → extra %)
  let volumeTierBonusCents = 0;
  let volumeTierResult: VolumeTierResult | null = null;
  if (plan.volumeTierEnabled) {
    const basis = plan.volumeTierBasis || VOLUME_TIER_BASIS_SALE_COUNT;
    const useRevenueTiers =
      basis === VOLUME_TIER_BASIS_WEEKLY_REVENUE &&
      plan.planType === 'PERCENT' &&
      !options.isRecurring;
    const useCountTiers = basis === VOLUME_TIER_BASIS_SALE_COUNT;

    if (useRevenueTiers || useCountTiers) {
      volumeTierResult = await resolveVolumeTier(
        salesRepId,
        clinicId,
        plan.id,
        basis,
        eventAmountCents,
        useRevenueTiers
      );
    }
    if (volumeTierResult?.kind === 'REVENUE_PERCENT') {
      volumeTierBonusCents = Math.round(
        (eventAmountCents * volumeTierResult.additionalPercentBps) / 10000
      );
    } else if (volumeTierResult?.kind === 'COUNT_FLAT') {
      volumeTierBonusCents = volumeTierResult.amountCents;
    }
  }

  // 4. Product/bundle bonus
  const productBonusCents = await resolveProductBonus(
    plan.id,
    eventAmountCents,
    options.productId,
    options.productBundleId
  );

  // 5. Multi-item bonus
  const multiItemBonusCents = calculateMultiItemBonus(
    plan,
    eventAmountCents,
    options.itemCount || 1
  );

  const totalCommissionCents =
    baseCommissionCents + volumeTierBonusCents + productBonusCents + multiItemBonusCents;

  return {
    baseCommissionCents,
    volumeTierBonusCents,
    productBonusCents,
    multiItemBonusCents,
    totalCommissionCents,
    volumeTierResult,
  };
}

// ============================================================================
// Get Effective Commission Plan for a Sales Rep
// ============================================================================

async function getEffectiveSalesRepPlan(salesRepId: number, clinicId: number, atDate: Date) {
  const assignment = await prisma.salesRepPlanAssignment.findFirst({
    where: {
      salesRepId,
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
// Process Payment -> Create Commission Event
// ============================================================================

export async function processPaymentForSalesRepCommission(
  data: SalesRepPaymentEventData
): Promise<SalesRepCommissionResult> {
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
    itemCount,
    productId,
    productBundleId,
  } = data;

  try {
    // Idempotency: don't process the same Stripe event twice
    if (stripeEventId) {
      const existing = await prisma.salesRepCommissionEvent.findFirst({
        where: { clinicId, stripeEventId },
      });
      if (existing) {
        // Reconcile: ensure override commissions exist even on retry.
        // processOverrideCommissions is idempotent (checks before creating).
        if (existing.salesRepId && existing.patientId && existing.stripeEventId) {
          await processOverrideCommissions(
            existing.salesRepId,
            existing.clinicId,
            {
              amountCents: existing.eventAmountCents,
              stripeEventId: existing.stripeEventId,
              patientId: existing.patientId,
              occurredAt: existing.occurredAt,
              holdUntil: existing.holdUntil,
            },
            existing.id
          );
        }
        return {
          success: true,
          skipped: true,
          skipReason: 'Event already processed',
          commissionEventId: existing.id,
        };
      }
    }

    // Secondary dedup: prevent double-counting when the same payment triggers
    // multiple Stripe events (e.g. payment_intent.succeeded + invoice.paid).
    if (stripeEventId && patientId) {
      const duplicatePayment = await prisma.salesRepCommissionEvent.findFirst({
        where: {
          clinicId,
          patientId,
          eventAmountCents: amountCents,
          occurredAt: {
            gte: new Date(occurredAt.getTime() - 120_000),
            lte: new Date(occurredAt.getTime() + 120_000),
          },
          stripeEventType: { not: stripeEventType },
          status: { not: 'REVERSED' },
        },
      });
      if (duplicatePayment) {
        logger.info('[SalesRepCommission] Duplicate payment detected, skipping', {
          clinicId,
          existingEventId: duplicatePayment.id,
          existingEventType: duplicatePayment.stripeEventType,
          incomingEventType: stripeEventType,
          stripeEventId,
        });
        return {
          success: true,
          skipped: true,
          skipReason: `Payment already commissioned via ${duplicatePayment.stripeEventType}`,
          commissionEventId: duplicatePayment.id,
        };
      }
    }

    // Find the patient's active sales rep assignment
    const assignment = await prisma.patientSalesRepAssignment.findFirst({
      where: {
        patientId,
        clinicId,
        isActive: true,
      },
      select: { salesRepId: true },
    });

    if (!assignment) {
      return {
        success: true,
        skipped: true,
        skipReason: 'No sales rep assigned to patient',
      };
    }

    const salesRepId = assignment.salesRepId;

    // Verify the assigned employee is an active user with a commission-eligible role
    const rep = await prisma.user.findFirst({
      where: { id: salesRepId, role: { in: [...COMMISSION_ELIGIBLE_ROLES] }, status: 'ACTIVE' },
      select: { id: true },
    });

    if (!rep) {
      return {
        success: true,
        skipped: true,
        skipReason: 'Assigned employee not active or not eligible for commission',
      };
    }

    // Get effective commission plan
    const plan = await getEffectiveSalesRepPlan(salesRepId, clinicId, occurredAt);

    if (!plan || !plan.isActive) {
      return {
        success: true,
        skipped: true,
        skipReason: 'No active commission plan',
      };
    }

    // Reactivation window: if the plan defines reactivationDays and the patient's
    // last payment was more than that many days ago, treat this as a new sale.
    let effectiveIsFirstPayment = isFirstPayment;
    if (!effectiveIsFirstPayment && plan.reactivationDays) {
      const reactivationCutoff = new Date(
        occurredAt.getTime() - plan.reactivationDays * 86_400_000
      );
      const recentPayment = await prisma.payment.findFirst({
        where: {
          patientId,
          status: 'SUCCEEDED',
          createdAt: { gte: reactivationCutoff },
        },
        select: { id: true },
      });
      if (!recentPayment) {
        effectiveIsFirstPayment = true;
        logger.info('[SalesRepCommission] Patient reactivated after lapse period', {
          patientId,
          salesRepId,
          clinicId,
          reactivationDays: plan.reactivationDays,
        });
      }
    }

    // Check appliesTo policy — FIRST_PAYMENT_ONLY blocks ALL non-first payments
    if (plan.appliesTo === 'FIRST_PAYMENT_ONLY' && !effectiveIsFirstPayment) {
      return {
        success: true,
        skipped: true,
        skipReason: 'Plan only applies to first payment',
      };
    }

    // Infer isRecurring when not explicitly provided by the webhook.
    // If the patient has prior payments (effectiveIsFirstPayment=false), treat as recurring.
    const effectiveIsRecurring = isRecurring ?? effectiveIsFirstPayment === false;

    if (effectiveIsRecurring && !plan.recurringEnabled) {
      return {
        success: true,
        skipped: true,
        skipReason: 'Recurring commissions not enabled on plan',
      };
    }

    // Calculate commission
    const breakdown = await calculateFullCommission(
      salesRepId,
      clinicId,
      {
        id: plan.id,
        planType: plan.planType,
        flatAmountCents: plan.flatAmountCents,
        percentBps: plan.percentBps,
        initialPercentBps: plan.initialPercentBps,
        initialFlatAmountCents: plan.initialFlatAmountCents,
        recurringPercentBps: plan.recurringPercentBps,
        recurringFlatAmountCents: plan.recurringFlatAmountCents,
        recurringEnabled: plan.recurringEnabled,
        volumeTierEnabled: plan.volumeTierEnabled,
        volumeTierWindow: plan.volumeTierWindow,
        volumeTierRetroactive: plan.volumeTierRetroactive,
        volumeTierBasis: plan.volumeTierBasis || VOLUME_TIER_BASIS_SALE_COUNT,
        multiItemBonusEnabled: plan.multiItemBonusEnabled,
        multiItemBonusType: plan.multiItemBonusType,
        multiItemBonusPercentBps: plan.multiItemBonusPercentBps,
        multiItemBonusFlatCents: plan.multiItemBonusFlatCents,
        multiItemMinQuantity: plan.multiItemMinQuantity,
      },
      amountCents,
      {
        isFirstPayment: effectiveIsFirstPayment,
        isRecurring: effectiveIsRecurring,
        recurringMonth,
        itemCount,
        productId,
        productBundleId,
      }
    );

    if (breakdown.totalCommissionCents <= 0) {
      return {
        success: true,
        skipped: true,
        skipReason: 'Zero commission calculated',
      };
    }

    // Calculate hold date
    const holdUntil =
      plan.holdDays > 0 ? new Date(occurredAt.getTime() + plan.holdDays * 86400000) : null;

    let commissionEvent;
    try {
      commissionEvent = await prisma.$transaction(
        async (tx) => {
          const event = await tx.salesRepCommissionEvent.create({
            data: {
              clinicId,
              salesRepId,
              stripeEventId,
              stripeObjectId,
              stripeEventType,
              eventAmountCents: amountCents,
              commissionAmountCents: breakdown.totalCommissionCents,
              baseCommissionCents: breakdown.baseCommissionCents,
              volumeTierBonusCents: breakdown.volumeTierBonusCents,
              productBonusCents: breakdown.productBonusCents,
              multiItemBonusCents: breakdown.multiItemBonusCents,
              commissionPlanId: plan.id,
              patientId,
              isRecurring: effectiveIsRecurring,
              recurringMonth: recurringMonth || null,
              status: 'PENDING',
              occurredAt,
              holdUntil,
              metadata: {
                planName: plan.name,
                planType: plan.planType,
              },
            },
          });

          // Retroactive tier: if this sale crossed into a higher tier and the plan
          // has retroactive enabled, bump all earlier events in the window to the new tier.
          if (
            plan.volumeTierEnabled &&
            plan.volumeTierRetroactive &&
            breakdown.volumeTierResult?.crossedNewTier
          ) {
            await applyRetroactiveTierUpdate(
              tx,
              salesRepId,
              clinicId,
              breakdown.volumeTierResult,
              event.id
            );
          }

          return event;
        },
        { timeout: 15000 }
      );
    } catch (txError: unknown) {
      if (
        txError &&
        typeof txError === 'object' &&
        'code' in txError &&
        (txError as { code: string }).code === 'P2002'
      ) {
        const existing = await prisma.salesRepCommissionEvent.findFirst({
          where: { clinicId, stripeEventId },
        });
        return {
          success: true,
          skipped: true,
          skipReason: 'Event already processed (constraint)',
          commissionEventId: existing?.id,
        };
      }
      throw txError;
    }

    logger.info('[SalesRepCommission] Commission event created', {
      commissionEventId: commissionEvent.id,
      salesRepId,
      clinicId,
      commissionAmountCents: breakdown.totalCommissionCents,
      breakdown: {
        base: breakdown.baseCommissionCents,
        volumeTier: breakdown.volumeTierBonusCents,
        product: breakdown.productBonusCents,
        multiItem: breakdown.multiItemBonusCents,
      },
      stripeEventId,
    });

    // Process override commissions for any manager reps above this rep
    await processOverrideCommissions(
      salesRepId,
      clinicId,
      { amountCents, stripeEventId, patientId, occurredAt, holdUntil },
      commissionEvent.id
    );

    return {
      success: true,
      commissionEventId: commissionEvent.id,
      commissionAmountCents: breakdown.totalCommissionCents,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[SalesRepCommission] Error processing payment', {
      error: msg,
      stripeEventId,
      clinicId,
    });
    return { success: false, error: msg };
  }
}

// ============================================================================
// Reverse Commission (Refund / Chargeback)
// ============================================================================

export async function reverseSalesRepCommission(
  data: SalesRepRefundEventData
): Promise<SalesRepCommissionResult> {
  const { clinicId, stripeObjectId, stripeEventType, reason } = data;

  try {
    const commissionEvent = await prisma.salesRepCommissionEvent.findFirst({
      where: {
        clinicId,
        stripeObjectId,
        status: { in: ['PENDING', 'APPROVED'] },
      },
    });

    if (!commissionEvent) {
      return {
        success: true,
        skipped: true,
        skipReason: 'No commission event found to reverse',
      };
    }

    // Check clawback policy
    if (commissionEvent.commissionPlanId) {
      const plan = await prisma.salesRepCommissionPlan.findUnique({
        where: { id: commissionEvent.commissionPlanId },
        select: { clawbackEnabled: true },
      });
      if (!plan?.clawbackEnabled) {
        return {
          success: true,
          skipped: true,
          skipReason: 'Clawback not enabled on plan',
        };
      }
    }

    const now = new Date();
    const reversalData = {
      status: 'REVERSED' as const,
      reversedAt: now,
      reversalReason: reason || stripeEventType,
    };

    const result = await prisma.salesRepCommissionEvent.updateMany({
      where: {
        id: commissionEvent.id,
        status: { in: ['PENDING', 'APPROVED'] },
        reversedAt: null,
      },
      data: reversalData,
    });

    if (result.count === 0) {
      return {
        success: true,
        skipped: true,
        skipReason: 'Already reversed',
        commissionEventId: commissionEvent.id,
      };
    }

    // Also reverse any linked override commission events
    const overrideReversal = await prisma.salesRepOverrideCommissionEvent.updateMany({
      where: {
        sourceCommissionEventId: commissionEvent.id,
        status: { in: ['PENDING', 'APPROVED'] },
        reversedAt: null,
      },
      data: reversalData,
    });

    logger.info('[SalesRepCommission] Commission reversed', {
      commissionEventId: commissionEvent.id,
      salesRepId: commissionEvent.salesRepId,
      overrideEventsReversed: overrideReversal.count,
      reason,
    });

    return { success: true, commissionEventId: commissionEvent.id };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[SalesRepCommission] Error reversing commission', {
      error: msg,
      stripeObjectId,
      clinicId,
    });
    return { success: false, error: msg };
  }
}

// ============================================================================
// Approve Pending Commissions Past Hold Period
// ============================================================================

export async function approvePendingSalesRepCommissions(): Promise<{
  approved: number;
  overrideApproved: number;
  errors: number;
}> {
  const now = new Date();
  const approvalWhere = {
    status: 'PENDING' as const,
    OR: [{ holdUntil: null }, { holdUntil: { lte: now } }],
  };
  const approvalData = {
    status: 'APPROVED' as const,
    approvedAt: now,
  };

  try {
    const [directResult, overrideResult] = await Promise.all([
      prisma.salesRepCommissionEvent.updateMany({
        where: approvalWhere,
        data: approvalData,
      }),
      prisma.salesRepOverrideCommissionEvent.updateMany({
        where: approvalWhere,
        data: approvalData,
      }),
    ]);

    logger.info('[SalesRepCommission] Approved pending commissions', {
      directApproved: directResult.count,
      overrideApproved: overrideResult.count,
    });

    return {
      approved: directResult.count,
      overrideApproved: overrideResult.count,
      errors: 0,
    };
  } catch (error) {
    logger.error('[SalesRepCommission] Error approving commissions', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return { approved: 0, overrideApproved: 0, errors: 1 };
  }
}

// ============================================================================
// Override Commissions (manager earns % of subordinate's gross revenue)
// ============================================================================

interface OverridePaymentData {
  amountCents: number;
  stripeEventId: string;
  patientId: number;
  occurredAt: Date;
  holdUntil: Date | null;
}

/**
 * After a direct commission event is created for a subordinate rep, check if any
 * override (manager) reps are assigned and create override commission events for each.
 * Idempotent via unique constraint on (clinicId, stripeEventId, overrideRepId).
 */
async function processOverrideCommissions(
  subordinateRepId: number,
  clinicId: number,
  paymentData: OverridePaymentData,
  sourceCommissionEventId: number
): Promise<void> {
  try {
    const overrides = await prisma.salesRepOverrideAssignment.findMany({
      where: {
        subordinateRepId,
        clinicId,
        isActive: true,
        effectiveFrom: { lte: paymentData.occurredAt },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: paymentData.occurredAt } }],
      },
    });

    if (overrides.length === 0) return;

    for (const override of overrides) {
      const existing = await prisma.salesRepOverrideCommissionEvent.findFirst({
        where: {
          clinicId,
          stripeEventId: paymentData.stripeEventId,
          overrideRepId: override.overrideRepId,
        },
      });
      if (existing) continue;

      const overrideAmountCents = Math.round(
        (paymentData.amountCents * override.overridePercentBps) / 10000
      );
      if (overrideAmountCents <= 0) continue;

      try {
        await prisma.salesRepOverrideCommissionEvent.create({
          data: {
            clinicId,
            overrideRepId: override.overrideRepId,
            subordinateRepId,
            sourceCommissionEventId,
            overrideAssignmentId: override.id,
            eventAmountCents: paymentData.amountCents,
            overridePercentBps: override.overridePercentBps,
            commissionAmountCents: overrideAmountCents,
            patientId: paymentData.patientId,
            stripeEventId: paymentData.stripeEventId,
            status: 'PENDING',
            occurredAt: paymentData.occurredAt,
            holdUntil: paymentData.holdUntil,
          },
        });

        logger.info('[SalesRepCommission] Override commission created', {
          overrideRepId: override.overrideRepId,
          subordinateRepId,
          overrideAmountCents,
          overridePercentBps: override.overridePercentBps,
          clinicId,
          sourceCommissionEventId,
        });
      } catch (createErr: unknown) {
        if (
          createErr &&
          typeof createErr === 'object' &&
          'code' in createErr &&
          (createErr as { code: string }).code === 'P2002'
        ) {
          continue;
        }
        throw createErr;
      }
    }
  } catch (error) {
    logger.error('[SalesRepCommission] Error processing override commissions', {
      error: error instanceof Error ? error.message : 'Unknown error',
      subordinateRepId,
      clinicId,
    });
  }
}

// ============================================================================
// Check if Patient Has Prior Payments (for first_payment_only logic)
// ============================================================================

export async function checkIfFirstPaymentForSalesRep(
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
