/**
 * Stripe Subscription Sync Service
 * =================================
 *
 * Syncs Stripe subscription events to the local Subscription model so that
 * MRR, ARR, and Active Subscriptions in the Finance Hub stay accurate and live.
 *
 * Used by: Stripe webhook (customer.subscription.created/updated/deleted).
 * Idempotent: upsert by stripeSubscriptionId; duplicate events are safe.
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import type Stripe from 'stripe';

// Map Stripe subscription status to our enum
const STRIPE_STATUS_TO_OUR: Record<
  string,
  'ACTIVE' | 'PAUSED' | 'CANCELED' | 'PAST_DUE' | 'EXPIRED'
> = {
  active: 'ACTIVE',
  trialing: 'ACTIVE',
  past_due: 'PAST_DUE',
  paused: 'PAUSED',
  canceled: 'CANCELED',
  unpaid: 'CANCELED',
  incomplete: 'ACTIVE', // may become active
  incomplete_expired: 'CANCELED',
};

export interface SyncSubscriptionResult {
  success: boolean;
  subscriptionId?: number;
  skipped?: boolean;
  reason?: string;
  error?: string;
}

/**
 * Get patient and clinic from Stripe customer ID.
 * Returns null if no patient is linked to this Stripe customer (we skip syncing until they are).
 */
async function findPatientByStripeCustomerId(
  stripeCustomerId: string
): Promise<{ patientId: number; clinicId: number } | null> {
  const patient = await prisma.patient.findFirst({
    where: { stripeCustomerId },
    select: { id: true, clinicId: true },
  });
  if (!patient?.clinicId) return null;
  return { patientId: patient.id, clinicId: patient.clinicId };
}

/**
 * Extract amount (cents), interval, and plan info from Stripe subscription.
 */
function extractSubscriptionDetails(sub: Stripe.Subscription): {
  amount: number;
  currency: string;
  interval: string;
  intervalCount: number;
  planId: string;
  planName: string;
  planDescription: string;
} {
  const item = sub.items?.data?.[0];
  const price = item?.price;
  const amount = price?.unit_amount ?? 0;
  const currency = (price?.currency ?? 'usd').toLowerCase();
  const recurring = price?.recurring;
  const interval = recurring?.interval ?? 'month';
  const intervalCount = recurring?.interval_count ?? 1;

  // Plan identity: prefer product name, fallback to price id
  let planId = price?.id ?? sub.id;
  let planName = 'Subscription';
  let planDescription = '';

  const product = price?.product;
  if (typeof product === 'object' && product && 'name' in product) {
    planName = (product as Stripe.Product).name ?? planName;
    planDescription = (product as Stripe.Product).description ?? '';
  } else if (sub.metadata?.planName) {
    planName = String(sub.metadata.planName);
  }
  if (sub.metadata?.planId) planId = String(sub.metadata.planId);

  return { amount, currency, interval, intervalCount, planId, planName, planDescription };
}

/**
 * Sync a Stripe subscription (created or updated) to our Subscription model.
 * Idempotent: upserts by stripeSubscriptionId.
 * Skips if no patient is linked to the Stripe customer (logs and returns skipped).
 */
export async function syncSubscriptionFromStripe(
  stripeSubscription: Stripe.Subscription,
  _eventId?: string
): Promise<SyncSubscriptionResult> {
  const stripeSubscriptionId = stripeSubscription.id;
  const customerId =
    typeof stripeSubscription.customer === 'string'
      ? stripeSubscription.customer
      : stripeSubscription.customer?.id;

  if (!customerId) {
    logger.warn('[SubscriptionSync] Subscription has no customer', { stripeSubscriptionId });
    return { success: true, skipped: true, reason: 'No customer on subscription' };
  }

  const patientAndClinic = await findPatientByStripeCustomerId(customerId);
  if (!patientAndClinic) {
    logger.info('[SubscriptionSync] No patient linked to Stripe customer, skipping', {
      stripeSubscriptionId,
      stripeCustomerId: customerId,
    });
    return { success: true, skipped: true, reason: 'No patient linked to Stripe customer' };
  }

  const { patientId, clinicId } = patientAndClinic;
  const status = STRIPE_STATUS_TO_OUR[stripeSubscription.status] ?? 'ACTIVE';
  const details = extractSubscriptionDetails(stripeSubscription);

  const currentPeriodStart = new Date(((stripeSubscription as any).current_period_start ?? 0) * 1000);
  const currentPeriodEnd = new Date(((stripeSubscription as any).current_period_end ?? 0) * 1000);
  const startDate = new Date((stripeSubscription.start_date ?? stripeSubscription.created) * 1000);
  const canceledAt = stripeSubscription.canceled_at
    ? new Date(stripeSubscription.canceled_at * 1000)
    : null;
  const endedAt = stripeSubscription.ended_at ? new Date(stripeSubscription.ended_at * 1000) : null;

  try {
    const subscription = await prisma.subscription.upsert({
      where: { stripeSubscriptionId },
      create: {
        clinicId,
        patientId,
        stripeSubscriptionId,
        planId: details.planId,
        planName: details.planName,
        planDescription: details.planDescription,
        status,
        amount: details.amount,
        currency: details.currency,
        interval: details.interval,
        intervalCount: details.intervalCount,
        startDate,
        currentPeriodStart,
        currentPeriodEnd,
        nextBillingDate: status === 'ACTIVE' ? currentPeriodEnd : null,
        canceledAt,
        endedAt,
        metadata: stripeSubscription.metadata ? (stripeSubscription.metadata as object) : undefined,
      },
      update: {
        status,
        amount: details.amount,
        currency: details.currency,
        interval: details.interval,
        intervalCount: details.intervalCount,
        currentPeriodStart,
        currentPeriodEnd,
        nextBillingDate: status === 'ACTIVE' ? currentPeriodEnd : null,
        canceledAt,
        endedAt,
        metadata: stripeSubscription.metadata ? (stripeSubscription.metadata as object) : undefined,
      },
    });

    logger.info('[SubscriptionSync] Upserted subscription', {
      subscriptionId: subscription.id,
      stripeSubscriptionId,
      patientId,
      clinicId,
      status,
    });

    return { success: true, subscriptionId: subscription.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[SubscriptionSync] Failed to upsert subscription', {
      stripeSubscriptionId,
      patientId,
      error: message,
    });
    return { success: false, error: message };
  }
}

/**
 * Mark a subscription as canceled (from customer.subscription.deleted or canceled).
 * Idempotent: safe to call multiple times for the same subscription.
 */
export async function cancelSubscriptionFromStripe(
  stripeSubscriptionId: string,
  canceledAt?: Date
): Promise<SyncSubscriptionResult> {
  try {
    const existing = await prisma.subscription.findUnique({
      where: { stripeSubscriptionId },
      select: { id: true, status: true },
    });

    if (!existing) {
      logger.info('[SubscriptionSync] No local subscription to cancel', { stripeSubscriptionId });
      return { success: true, skipped: true, reason: 'Subscription not in DB' };
    }

    if (existing.status === 'CANCELED') {
      return { success: true, subscriptionId: existing.id };
    }

    const resolvedCanceledAt = canceledAt ?? new Date();
    await prisma.subscription.update({
      where: { stripeSubscriptionId },
      data: {
        status: 'CANCELED',
        canceledAt: resolvedCanceledAt,
        endedAt: resolvedCanceledAt,
        nextBillingDate: null,
      },
    });

    logger.info('[SubscriptionSync] Marked subscription canceled', {
      subscriptionId: existing.id,
      stripeSubscriptionId,
    });

    return { success: true, subscriptionId: existing.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[SubscriptionSync] Failed to cancel subscription', {
      stripeSubscriptionId,
      error: message,
    });
    return { success: false, error: message };
  }
}
