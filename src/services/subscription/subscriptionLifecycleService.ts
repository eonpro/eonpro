/**
 * Subscription Lifecycle Service
 * ==============================
 *
 * Manages the full lifecycle of patient subscriptions:
 * - Create (start) a subscription via Stripe
 * - Pause a subscription (pause_collection in Stripe)
 * - Resume a paused subscription
 * - Cancel a subscription (immediate or at period end)
 *
 * Each action:
 * 1. Updates Stripe first (source of truth for billing)
 * 2. Syncs local Subscription record
 * 3. Logs a SubscriptionAction for audit
 * 4. Manages RefillQueue entries (cancel/hold/schedule)
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getStripeForClinic, type StripeContext } from '@/lib/stripe/connect';
import { StripeCustomerService } from '@/services/stripe/customerService';
import type Stripe from 'stripe';
import type {
  Subscription,
  SubscriptionActionType,
  RefillStatus,
} from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

export interface CreateSubscriptionInput {
  patientId: number;
  clinicId: number;
  planId: string;
  planName: string;
  planDescription?: string;
  amount: number;
  interval: 'month' | 'quarter' | 'semiannual' | 'year';
  intervalCount: number;
  vialCount: number;
  paymentMethodId?: number;
  stripePaymentMethodId?: string;
  metadata?: Record<string, string>;
}

export interface PauseSubscriptionInput {
  subscriptionId: number;
  reason?: string;
  pausedBy: number;
  resumeAt?: Date;
}

export interface ResumeSubscriptionInput {
  subscriptionId: number;
  resumedBy: number;
}

export interface CancelSubscriptionInput {
  subscriptionId: number;
  reason?: string;
  canceledBy: number;
  cancelAtPeriodEnd?: boolean;
}

export interface SubscriptionLifecycleResult {
  success: boolean;
  subscription?: Subscription;
  error?: string;
}

// ============================================================================
// Helpers
// ============================================================================

const REFILL_ACTIVE_STATUSES: RefillStatus[] = [
  'SCHEDULED',
  'PENDING_PAYMENT',
  'PENDING_ADMIN',
  'APPROVED',
  'PENDING_PROVIDER',
];

function mapIntervalToStripe(interval: string, intervalCount: number): { interval: 'day' | 'week' | 'month' | 'year'; interval_count: number } {
  switch (interval) {
    case 'year':
      return { interval: 'year', interval_count: 1 };
    case 'semiannual':
      return { interval: 'month', interval_count: 6 };
    case 'quarter':
      return { interval: 'month', interval_count: 3 };
    case 'month':
    default:
      return { interval: 'month', interval_count: intervalCount || 1 };
  }
}

function calculatePeriodEnd(startDate: Date, interval: string, intervalCount: number): Date {
  const end = new Date(startDate);
  switch (interval) {
    case 'year':
      end.setFullYear(end.getFullYear() + 1);
      break;
    case 'semiannual':
      end.setMonth(end.getMonth() + 6);
      break;
    case 'quarter':
      end.setMonth(end.getMonth() + 3);
      break;
    case 'month':
    default:
      end.setMonth(end.getMonth() + (intervalCount || 1));
      break;
  }
  return end;
}

async function logSubscriptionAction(
  subscriptionId: number,
  actionType: SubscriptionActionType,
  details?: {
    reason?: string;
    pausedUntil?: Date;
    previousPlanId?: string;
    newPlanId?: string;
    previousAmount?: number;
    newAmount?: number;
    cancellationReason?: string;
  }
): Promise<void> {
  await prisma.subscriptionAction.create({
    data: {
      subscriptionId,
      actionType,
      reason: details?.reason,
      pausedUntil: details?.pausedUntil,
      previousPlanId: details?.previousPlanId,
      newPlanId: details?.newPlanId,
      previousAmount: details?.previousAmount,
      newAmount: details?.newAmount,
      cancellationReason: details?.cancellationReason,
    },
  });
}

async function getStripeContextForSubscription(
  clinicId: number
): Promise<StripeContext> {
  return getStripeForClinic(clinicId);
}

// ============================================================================
// Create Subscription
// ============================================================================

export async function createSubscription(
  input: CreateSubscriptionInput
): Promise<SubscriptionLifecycleResult> {
  const {
    patientId,
    clinicId,
    planId,
    planName,
    planDescription,
    amount,
    interval,
    intervalCount,
    vialCount,
    paymentMethodId,
    stripePaymentMethodId,
    metadata,
  } = input;

  const now = new Date();
  const periodEnd = calculatePeriodEnd(now, interval, intervalCount);

  // 1. Create local Subscription record first (pending Stripe)
  let subscription: Subscription;
  try {
    subscription = await prisma.subscription.create({
      data: {
        patientId,
        clinicId,
        planId,
        planName,
        planDescription: planDescription || `${planName} subscription`,
        amount,
        interval: interval,
        intervalCount,
        status: 'ACTIVE',
        startDate: now,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        nextBillingDate: periodEnd,
        vialCount,
        refillIntervalDays: vialCount === 6 ? 180 : vialCount === 3 ? 90 : 30,
        paymentMethodId: paymentMethodId ?? undefined,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('[SubscriptionLifecycle] Failed to create local subscription', {
      patientId,
      clinicId,
      error: message,
    });
    return { success: false, error: message };
  }

  // 2. Create Stripe Subscription
  try {
    const stripeContext = await getStripeContextForSubscription(clinicId);
    const { stripe, stripeAccountId } = stripeContext;

    const customer = await StripeCustomerService.getOrCreateCustomer(patientId);
    const stripeInterval = mapIntervalToStripe(interval, intervalCount);

    const priceData: any = {
      currency: 'usd',
      unit_amount: amount,
      product_data: { name: planName },
      recurring: {
        interval: stripeInterval.interval,
        interval_count: stripeInterval.interval_count,
      },
    };

    const subParams: Stripe.SubscriptionCreateParams = {
      customer: customer.id,
      items: [{ price_data: priceData }],
      metadata: {
        clinicId: String(clinicId),
        patientId: String(patientId),
        planId,
        localSubscriptionId: String(subscription.id),
        ...metadata,
      },
      ...(stripePaymentMethodId
        ? { default_payment_method: stripePaymentMethodId }
        : {}),
    };

    const requestOptions: Stripe.RequestOptions = stripeAccountId
      ? { stripeAccount: stripeAccountId }
      : {};

    const stripeSub = await stripe.subscriptions.create(subParams, requestOptions);

    // 3. Update local record with Stripe ID
    subscription = await prisma.subscription.update({
      where: { id: subscription.id },
      data: { stripeSubscriptionId: stripeSub.id },
    });

    logger.info('[SubscriptionLifecycle] Created Stripe subscription', {
      subscriptionId: subscription.id,
      stripeSubscriptionId: stripeSub.id,
      patientId,
      clinicId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('[SubscriptionLifecycle] Stripe subscription creation failed', {
      subscriptionId: subscription.id,
      patientId,
      error: message,
    });
    // Mark local subscription as failed but keep it for retry
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        metadata: { stripeError: message } as object,
      },
    });
    // Still return success for the local record; Stripe can be retried
  }

  // 4. Log SubscriptionAction
  await logSubscriptionAction(subscription.id, 'CREATED', {
    reason: `Started ${planName} plan`,
  });

  // 5. Schedule first refill → straight to provider queue
  try {
    const { triggerRefillForSubscriptionPayment } = await import(
      '@/services/refill/refillQueueService'
    );
    await triggerRefillForSubscriptionPayment(subscription.id);
  } catch (err) {
    logger.error('[SubscriptionLifecycle] Failed to schedule initial refill', {
      subscriptionId: subscription.id,
      error: err instanceof Error ? err.message : 'Unknown',
    });
  }

  // 6. Tag patient
  try {
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { tags: true },
    });
    const currentTags = (patient?.tags as string[]) || [];
    const subscriptionTag = `subscription-${planName.toLowerCase().replace(/\s+/g, '-')}`;
    const newTags = [...new Set([...currentTags, subscriptionTag, 'active-subscription'])];
    await prisma.patient.update({
      where: { id: patientId },
      data: { tags: newTags },
    });
  } catch {
    // Non-blocking
  }

  return { success: true, subscription };
}

// ============================================================================
// Pause Subscription
// ============================================================================

export async function pauseSubscription(
  input: PauseSubscriptionInput
): Promise<SubscriptionLifecycleResult> {
  const { subscriptionId, reason, pausedBy, resumeAt } = input;

  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
  });

  if (!subscription) {
    return { success: false, error: 'Subscription not found' };
  }

  if (subscription.status !== 'ACTIVE') {
    return { success: false, error: `Cannot pause subscription in ${subscription.status} status` };
  }

  // 1. Pause in Stripe
  if (subscription.stripeSubscriptionId && subscription.clinicId) {
    try {
      const stripeContext = await getStripeContextForSubscription(subscription.clinicId);
      const { stripe, stripeAccountId } = stripeContext;

      const requestOptions: Stripe.RequestOptions = stripeAccountId
        ? { stripeAccount: stripeAccountId }
        : {};

      const pauseParams: Stripe.SubscriptionUpdateParams = {
        pause_collection: {
          behavior: 'void',
          ...(resumeAt ? { resumes_at: Math.floor(resumeAt.getTime() / 1000) } : {}),
        },
      };

      await stripe.subscriptions.update(
        subscription.stripeSubscriptionId,
        pauseParams,
        requestOptions
      );

      logger.info('[SubscriptionLifecycle] Paused Stripe subscription', {
        subscriptionId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('[SubscriptionLifecycle] Failed to pause Stripe subscription', {
        subscriptionId,
        error: message,
      });
      return { success: false, error: `Stripe error: ${message}` };
    }
  }

  // 2. Update local record
  const updated = await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      status: 'PAUSED',
      pausedAt: new Date(),
      resumeAt: resumeAt ?? null,
      nextBillingDate: null,
    },
  });

  // 3. Log action
  await logSubscriptionAction(subscriptionId, 'PAUSED', {
    reason,
    pausedUntil: resumeAt,
  });

  // 4. Hold all active refills for this subscription
  await prisma.refillQueue.updateMany({
    where: {
      subscriptionId,
      status: { in: REFILL_ACTIVE_STATUSES },
    },
    data: {
      status: 'ON_HOLD',
      adminNotes: `Subscription paused${reason ? `: ${reason}` : ''}`,
    },
  });

  logger.info('[SubscriptionLifecycle] Subscription paused', {
    subscriptionId,
    patientId: subscription.patientId,
    reason,
  });

  return { success: true, subscription: updated };
}

// ============================================================================
// Resume Subscription
// ============================================================================

export async function resumeSubscription(
  input: ResumeSubscriptionInput
): Promise<SubscriptionLifecycleResult> {
  const { subscriptionId, resumedBy } = input;

  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
  });

  if (!subscription) {
    return { success: false, error: 'Subscription not found' };
  }

  if (subscription.status !== 'PAUSED') {
    return { success: false, error: `Cannot resume subscription in ${subscription.status} status` };
  }

  // 1. Resume in Stripe
  if (subscription.stripeSubscriptionId && subscription.clinicId) {
    try {
      const stripeContext = await getStripeContextForSubscription(subscription.clinicId);
      const { stripe, stripeAccountId } = stripeContext;

      const requestOptions: Stripe.RequestOptions = stripeAccountId
        ? { stripeAccount: stripeAccountId }
        : {};

      await stripe.subscriptions.update(
        subscription.stripeSubscriptionId,
        { pause_collection: '' as any },
        requestOptions
      );

      logger.info('[SubscriptionLifecycle] Resumed Stripe subscription', {
        subscriptionId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('[SubscriptionLifecycle] Failed to resume Stripe subscription', {
        subscriptionId,
        error: message,
      });
      return { success: false, error: `Stripe error: ${message}` };
    }
  }

  // 2. Update local record
  const now = new Date();
  const periodEnd = calculatePeriodEnd(now, subscription.interval, subscription.intervalCount);

  const updated = await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      status: 'ACTIVE',
      pausedAt: null,
      resumeAt: null,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      nextBillingDate: periodEnd,
    },
  });

  // 3. Log action
  await logSubscriptionAction(subscriptionId, 'RESUMED');

  // 4. Schedule a new refill
  try {
    const { triggerRefillForSubscriptionPayment } = await import(
      '@/services/refill/refillQueueService'
    );
    await triggerRefillForSubscriptionPayment(subscriptionId);
  } catch (err) {
    logger.error('[SubscriptionLifecycle] Failed to schedule refill on resume', {
      subscriptionId,
      error: err instanceof Error ? err.message : 'Unknown',
    });
  }

  logger.info('[SubscriptionLifecycle] Subscription resumed', {
    subscriptionId,
    patientId: subscription.patientId,
  });

  return { success: true, subscription: updated };
}

// ============================================================================
// Cancel Subscription
// ============================================================================

export async function cancelSubscription(
  input: CancelSubscriptionInput
): Promise<SubscriptionLifecycleResult> {
  const { subscriptionId, reason, canceledBy, cancelAtPeriodEnd = true } = input;

  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
  });

  if (!subscription) {
    return { success: false, error: 'Subscription not found' };
  }

  if (subscription.status === 'CANCELED') {
    return { success: false, error: 'Subscription is already canceled' };
  }

  // 1. Cancel in Stripe
  if (subscription.stripeSubscriptionId && subscription.clinicId) {
    try {
      const stripeContext = await getStripeContextForSubscription(subscription.clinicId);
      const { stripe, stripeAccountId } = stripeContext;

      const requestOptions: Stripe.RequestOptions = stripeAccountId
        ? { stripeAccount: stripeAccountId }
        : {};

      if (cancelAtPeriodEnd) {
        await stripe.subscriptions.update(
          subscription.stripeSubscriptionId,
          { cancel_at_period_end: true },
          requestOptions
        );
      } else {
        await stripe.subscriptions.cancel(
          subscription.stripeSubscriptionId,
          requestOptions
        );
      }

      logger.info('[SubscriptionLifecycle] Canceled Stripe subscription', {
        subscriptionId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        cancelAtPeriodEnd,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('[SubscriptionLifecycle] Failed to cancel Stripe subscription', {
        subscriptionId,
        error: message,
      });
      return { success: false, error: `Stripe error: ${message}` };
    }
  }

  // 2. Update local record
  const now = new Date();
  const updated = await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      status: cancelAtPeriodEnd ? subscription.status : 'CANCELED',
      canceledAt: now,
      endedAt: cancelAtPeriodEnd ? undefined : now,
      nextBillingDate: cancelAtPeriodEnd ? subscription.nextBillingDate : null,
      metadata: {
        ...(subscription.metadata as object || {}),
        cancelAtPeriodEnd,
        cancellationReason: reason,
      },
    },
  });

  // 3. Log action
  await logSubscriptionAction(subscriptionId, 'CANCELLED', {
    reason,
    cancellationReason: reason,
  });

  // 4. Cancel active refills (immediate cancel) or leave them (period-end cancel)
  if (!cancelAtPeriodEnd) {
    await prisma.refillQueue.updateMany({
      where: {
        subscriptionId,
        status: { in: REFILL_ACTIVE_STATUSES },
      },
      data: {
        status: 'CANCELLED',
        adminNotes: `Subscription canceled${reason ? `: ${reason}` : ''}`,
      },
    });
  }

  // 5. Remove active-subscription tag
  try {
    const patient = await prisma.patient.findUnique({
      where: { id: subscription.patientId },
      select: { tags: true },
    });
    const currentTags = (patient?.tags as string[]) || [];
    const activeSubs = await prisma.subscription.count({
      where: {
        patientId: subscription.patientId,
        status: 'ACTIVE',
        id: { not: subscriptionId },
      },
    });
    if (activeSubs === 0) {
      await prisma.patient.update({
        where: { id: subscription.patientId },
        data: {
          tags: currentTags.filter((t) => t !== 'active-subscription'),
        },
      });
    }
  } catch {
    // Non-blocking
  }

  logger.info('[SubscriptionLifecycle] Subscription canceled', {
    subscriptionId,
    patientId: subscription.patientId,
    cancelAtPeriodEnd,
    reason,
  });

  return { success: true, subscription: updated };
}

// ============================================================================
// Utility: Get subscription with enriched data
// ============================================================================

export async function getSubscriptionWithDetails(subscriptionId: number) {
  return prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      patient: { select: { id: true, clinicId: true, stripeCustomerId: true } },
      actions: { orderBy: { createdAt: 'desc' }, take: 10 },
      refillQueue: { orderBy: { createdAt: 'desc' }, take: 5 },
      payments: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  });
}

export async function getActiveSubscriptionForPatient(patientId: number) {
  return prisma.subscription.findFirst({
    where: {
      patientId,
      status: { in: ['ACTIVE', 'PAUSED', 'PAST_DUE'] },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      actions: { orderBy: { createdAt: 'desc' }, take: 5 },
      refillQueue: {
        where: { status: { in: ['SCHEDULED', 'PENDING_PAYMENT', 'PENDING_ADMIN', 'APPROVED', 'PENDING_PROVIDER'] } },
        orderBy: { nextRefillDate: 'asc' },
        take: 1,
      },
    },
  });
}
