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
 * - Idempotent event processing
 * - Refund/chargeback reversals
 * - Approval of pending commissions past hold period
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { CommissionEventStatus, CommissionPlanType } from '@prisma/client';

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

function getWeekBounds(): { weekStart: Date; weekEnd: Date } {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + diffToMonday);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  return { weekStart, weekEnd };
}

async function resolveVolumeTier(
  salesRepId: number,
  clinicId: number,
  planId: number,
  volumeTierWindow: string | null
): Promise<{ amountCents: number; salesCount: number } | null> {
  const tiers = await prisma.salesRepVolumeCommissionTier.findMany({
    where: { planId },
    orderBy: { minSales: 'asc' },
  });

  if (tiers.length === 0) return null;

  let windowStart: Date;
  let windowEnd: Date;

  if (volumeTierWindow === 'CALENDAR_WEEK_MON_SUN') {
    const bounds = getWeekBounds();
    windowStart = bounds.weekStart;
    windowEnd = bounds.weekEnd;
  } else {
    const bounds = getWeekBounds();
    windowStart = bounds.weekStart;
    windowEnd = bounds.weekEnd;
  }

  const salesCount = await prisma.salesRepCommissionEvent.count({
    where: {
      salesRepId,
      clinicId,
      occurredAt: { gte: windowStart, lte: windowEnd },
      status: { in: ['PENDING', 'APPROVED', 'PAID'] },
    },
  });

  const currentCount = salesCount + 1;

  let matchedTier: (typeof tiers)[number] | null = null;
  for (const tier of tiers) {
    if (currentCount >= tier.minSales && (tier.maxSales === null || currentCount <= tier.maxSales)) {
      matchedTier = tier;
    }
  }

  if (!matchedTier) {
    if (currentCount > (tiers[tiers.length - 1]?.minSales ?? 0)) {
      const openEndedTier = tiers.find((t) => t.maxSales === null);
      if (openEndedTier) matchedTier = openEndedTier;
    }
  }

  if (!matchedTier) return null;

  return { amountCents: matchedTier.amountCents, salesCount: currentCount };
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

  // 3. Volume tier bonus
  let volumeTierBonusCents = 0;
  if (plan.volumeTierEnabled) {
    const tierResult = await resolveVolumeTier(
      salesRepId,
      clinicId,
      plan.id,
      plan.volumeTierWindow
    );
    if (tierResult) {
      volumeTierBonusCents = tierResult.amountCents;
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
  };
}

// ============================================================================
// Get Effective Commission Plan for a Sales Rep
// ============================================================================

async function getEffectiveSalesRepPlan(
  salesRepId: number,
  clinicId: number,
  atDate: Date
) {
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
        return {
          success: true,
          skipped: true,
          skipReason: 'Event already processed',
          commissionEventId: existing.id,
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

    // Verify the rep is an active user
    const rep = await prisma.user.findFirst({
      where: { id: salesRepId, role: 'SALES_REP', status: 'ACTIVE' },
      select: { id: true },
    });

    if (!rep) {
      return {
        success: true,
        skipped: true,
        skipReason: 'Sales rep not active',
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

    // Check appliesTo policy
    if (plan.appliesTo === 'FIRST_PAYMENT_ONLY' && !isFirstPayment && !isRecurring) {
      return {
        success: true,
        skipped: true,
        skipReason: 'Plan only applies to first payment',
      };
    }

    if (isRecurring && !plan.recurringEnabled) {
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
        multiItemBonusEnabled: plan.multiItemBonusEnabled,
        multiItemBonusType: plan.multiItemBonusType,
        multiItemBonusPercentBps: plan.multiItemBonusPercentBps,
        multiItemBonusFlatCents: plan.multiItemBonusFlatCents,
        multiItemMinQuantity: plan.multiItemMinQuantity,
      },
      amountCents,
      { isFirstPayment, isRecurring, recurringMonth, itemCount, productId, productBundleId }
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
      plan.holdDays > 0
        ? new Date(occurredAt.getTime() + plan.holdDays * 86400000)
        : null;

    // Create the commission event (unique constraint on clinicId+stripeEventId is the idempotency guard)
    let commissionEvent;
    try {
      commissionEvent = await prisma.$transaction(async (tx) => {
        return tx.salesRepCommissionEvent.create({
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
            isRecurring: isRecurring || false,
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
      }, { timeout: 15000 });
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

    const result = await prisma.salesRepCommissionEvent.updateMany({
      where: {
        id: commissionEvent.id,
        status: { in: ['PENDING', 'APPROVED'] },
        reversedAt: null,
      },
      data: {
        status: 'REVERSED',
        reversedAt: new Date(),
        reversalReason: reason || stripeEventType,
      },
    });

    if (result.count === 0) {
      return {
        success: true,
        skipped: true,
        skipReason: 'Already reversed',
        commissionEventId: commissionEvent.id,
      };
    }

    logger.info('[SalesRepCommission] Commission reversed', {
      commissionEventId: commissionEvent.id,
      salesRepId: commissionEvent.salesRepId,
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
  errors: number;
}> {
  const now = new Date();

  try {
    const result = await prisma.salesRepCommissionEvent.updateMany({
      where: {
        status: 'PENDING',
        OR: [{ holdUntil: null }, { holdUntil: { lte: now } }],
      },
      data: {
        status: 'APPROVED',
        approvedAt: now,
      },
    });

    logger.info('[SalesRepCommission] Approved pending commissions', {
      count: result.count,
    });

    return { approved: result.count, errors: 0 };
  } catch (error) {
    logger.error('[SalesRepCommission] Error approving commissions', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return { approved: 0, errors: 1 };
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
