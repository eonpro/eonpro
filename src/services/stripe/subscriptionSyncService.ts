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
import { findPatientByEmail } from '@/services/stripe/paymentMatchingService';
import { calculateIntervalDays } from '@/services/refill/refillQueueService';
import { parsePackageMonthsFromPlan } from '@/lib/shipment-schedule/shipmentScheduleService';
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
 * Extract amount (cents), interval, plan info, and refill-relevant fields from Stripe subscription.
 * When product is expanded (data.items.data.price.product), planName comes from Stripe Product name
 * (e.g. "Tirzepatide Injection - 3 Month Supply"). vialCount/refillIntervalDays are derived for refill queue.
 */
function extractSubscriptionDetails(sub: Stripe.Subscription): {
  amount: number;
  currency: string;
  interval: string;
  intervalCount: number;
  planId: string;
  planName: string;
  planDescription: string;
  vialCount: number;
  refillIntervalDays: number;
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

  // Refill scheduling: derive vialCount from plan name (1/3/6/12 month) so refill queue logic is correct
  const packageMonths = parsePackageMonthsFromPlan(planName);
  const vialCount = packageMonths >= 1 ? Math.min(packageMonths, 12) : 1;
  const refillIntervalDays = calculateIntervalDays(vialCount);

  return {
    amount,
    currency,
    interval,
    intervalCount,
    planId,
    planName,
    planDescription,
    vialCount,
    refillIntervalDays,
  };
}

/**
 * Sync a Stripe subscription (created or updated) to our Subscription model.
 * Idempotent: upserts by stripeSubscriptionId.
 *
 * Patient resolution order:
 * 1. Fast path: find patient by stripeCustomerId.
 * 2. Email fallback (Connect clinics like Wellmedr): fetch Stripe customer email,
 *    findPatientByEmail scoped to clinicId, and set stripeCustomerId for future events.
 *
 * @param stripeSubscription - The Stripe subscription object
 * @param _eventId - Optional Stripe event ID (for logging)
 * @param options.clinicId - Clinic ID resolved from webhook (enables email fallback for Connect)
 * @param options.stripeAccountId - Connected account ID (for fetching customer on Connect)
 */
export async function syncSubscriptionFromStripe(
  stripeSubscription: Stripe.Subscription,
  _eventId?: string,
  options?: { clinicId?: number; stripeAccountId?: string }
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

  let patientAndClinic = await findPatientByStripeCustomerId(customerId);

  // Email fallback: when stripeCustomerId not linked, resolve by Stripe customer email
  if (!patientAndClinic && customerId) {
    const resolvedClinicId = options?.clinicId;
    try {
      const { getStripeClient } = await import('@/lib/stripe/config');
      const stripe = getStripeClient();
      if (stripe) {
        const requestOpts: Stripe.RequestOptions | undefined = options?.stripeAccountId
          ? { stripeAccount: options.stripeAccountId }
          : undefined;
        const customer = await stripe.customers.retrieve(customerId, requestOpts);
        if (customer && !customer.deleted && 'email' in customer && customer.email) {
          const email = customer.email.trim().toLowerCase();
          const patient = await findPatientByEmail(email, resolvedClinicId || undefined);
          if (patient && patient.clinicId) {
            // Link stripeCustomerId so future events use the fast path
            await prisma.patient.update({
              where: { id: patient.id },
              data: { stripeCustomerId: customerId },
            });
            patientAndClinic = { patientId: patient.id, clinicId: patient.clinicId };
            logger.info('[SubscriptionSync] Matched patient by email fallback, linked stripeCustomerId', {
              stripeSubscriptionId,
              patientId: patient.id,
              clinicId: patient.clinicId,
            });
          }
        }
      }
    } catch (emailFallbackErr) {
      logger.warn('[SubscriptionSync] Email fallback failed (non-blocking)', {
        stripeSubscriptionId,
        error: emailFallbackErr instanceof Error ? emailFallbackErr.message : 'Unknown',
      });
    }
  }

  if (!patientAndClinic) {
    logger.info('[SubscriptionSync] No patient linked to Stripe customer (fast path + email fallback exhausted)', {
      stripeSubscriptionId,
      stripeCustomerId: customerId,
    });
    return { success: true, skipped: true, reason: 'No patient linked to Stripe customer' };
  }

  const { patientId, clinicId } = patientAndClinic;
  const status = STRIPE_STATUS_TO_OUR[stripeSubscription.status] ?? 'ACTIVE';
  const details = extractSubscriptionDetails(stripeSubscription);

  // In Stripe API 2025+, current_period_start/end moved from top-level to items.data[0]
  const item0 = stripeSubscription.items?.data?.[0] as any;
  const rawPeriodStart =
    (stripeSubscription as any).current_period_start ??
    item0?.current_period_start ??
    stripeSubscription.billing_cycle_anchor ??
    stripeSubscription.created;
  const rawPeriodEnd =
    (stripeSubscription as any).current_period_end ??
    item0?.current_period_end ??
    0;

  const currentPeriodStart = rawPeriodStart ? new Date(rawPeriodStart * 1000) : new Date();
  const currentPeriodEnd = rawPeriodEnd ? new Date(rawPeriodEnd * 1000) : null;
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
        vialCount: details.vialCount,
        refillIntervalDays: details.refillIntervalDays,
        startDate,
        currentPeriodStart,
        currentPeriodEnd: currentPeriodEnd ?? undefined,
        nextBillingDate: status === 'ACTIVE' ? (currentPeriodEnd ?? undefined) : undefined,
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
        vialCount: details.vialCount,
        refillIntervalDays: details.refillIntervalDays,
        currentPeriodStart,
        currentPeriodEnd: currentPeriodEnd ?? undefined,
        nextBillingDate: status === 'ACTIVE' ? (currentPeriodEnd ?? undefined) : undefined,
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
 * Sync a Stripe subscription to our Subscription model by matching customer email to a patient.
 * Use for backfills (e.g. Wellmedr) when subscriptions exist in Stripe but patients are matched by email.
 * Idempotent: upserts by stripeSubscriptionId. Does not log PHI (email).
 */
export async function syncSubscriptionFromStripeByEmail(
  stripeSubscription: Stripe.Subscription,
  customerEmail: string,
  clinicId: number
): Promise<SyncSubscriptionResult> {
  const stripeSubscriptionId = stripeSubscription.id;
  const normalizedEmail = customerEmail?.trim().toLowerCase();
  if (!normalizedEmail) {
    logger.warn('[SubscriptionSync] No customer email provided', { stripeSubscriptionId });
    return { success: true, skipped: true, reason: 'No customer email' };
  }

  const patient = await findPatientByEmail(normalizedEmail, clinicId);
  if (!patient) {
    logger.info('[SubscriptionSync] No patient match for subscription (email match)', {
      stripeSubscriptionId,
      clinicId,
    });
    return { success: true, skipped: true, reason: 'No patient match for email' };
  }

  const customerId =
    typeof stripeSubscription.customer === 'string'
      ? stripeSubscription.customer
      : stripeSubscription.customer?.id;

  const status = STRIPE_STATUS_TO_OUR[stripeSubscription.status] ?? 'ACTIVE';
  const details = extractSubscriptionDetails(stripeSubscription);

  // In Stripe API 2025+, current_period_start/end moved from top-level to items.data[0]
  const emailItem0 = stripeSubscription.items?.data?.[0] as any;
  const rawPeriodStartE =
    (stripeSubscription as any).current_period_start ??
    emailItem0?.current_period_start ??
    stripeSubscription.billing_cycle_anchor ??
    stripeSubscription.created;
  const rawPeriodEndE =
    (stripeSubscription as any).current_period_end ??
    emailItem0?.current_period_end ??
    0;

  const currentPeriodStart = rawPeriodStartE ? new Date(rawPeriodStartE * 1000) : new Date();
  const currentPeriodEnd = rawPeriodEndE ? new Date(rawPeriodEndE * 1000) : null;
  const startDate = new Date((stripeSubscription.start_date ?? stripeSubscription.created) * 1000);
  const canceledAt = stripeSubscription.canceled_at
    ? new Date(stripeSubscription.canceled_at * 1000)
    : null;
  const endedAt = stripeSubscription.ended_at ? new Date(stripeSubscription.ended_at * 1000) : null;

  try {
    const subscription = await prisma.$transaction(async (tx) => {
      if (customerId && !patient.stripeCustomerId) {
        await tx.patient.update({
          where: { id: patient.id },
          data: { stripeCustomerId: customerId },
        });
      }
      return tx.subscription.upsert({
        where: { stripeSubscriptionId },
        create: {
          clinicId,
          patientId: patient.id,
          stripeSubscriptionId,
          planId: details.planId,
          planName: details.planName,
          planDescription: details.planDescription,
          status,
          amount: details.amount,
          currency: details.currency,
          interval: details.interval,
          intervalCount: details.intervalCount,
          vialCount: details.vialCount,
          refillIntervalDays: details.refillIntervalDays,
          startDate,
          currentPeriodStart,
          currentPeriodEnd: currentPeriodEnd ?? undefined,
          nextBillingDate: status === 'ACTIVE' ? (currentPeriodEnd ?? undefined) : undefined,
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
          vialCount: details.vialCount,
          refillIntervalDays: details.refillIntervalDays,
          currentPeriodStart,
          currentPeriodEnd: currentPeriodEnd ?? undefined,
          nextBillingDate: status === 'ACTIVE' ? (currentPeriodEnd ?? undefined) : undefined,
          canceledAt,
          endedAt,
          metadata: stripeSubscription.metadata ? (stripeSubscription.metadata as object) : undefined,
        },
      });
    });

    logger.info('[SubscriptionSync] Upserted subscription (email match)', {
      subscriptionId: subscription.id,
      stripeSubscriptionId,
      patientId: patient.id,
      clinicId,
      status,
    });

    return { success: true, subscriptionId: subscription.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[SubscriptionSync] Failed to upsert subscription (email match)', {
      stripeSubscriptionId,
      patientId: patient.id,
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
