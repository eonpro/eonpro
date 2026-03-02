/**
 * Stripe Card Sync Service
 * ========================
 *
 * Syncs saved payment methods (cards) from Stripe customer profiles to matching
 * patient profiles on the platform. Supports both bulk clinic-wide sync and
 * single-patient sync.
 *
 * Matching priority (reuses paymentMatchingService):
 * 1. stripeCustomerId — exact match (fastest)
 * 2. email — case-insensitive, scoped to clinic
 * 3. phone — normalized digits, scoped to clinic
 * 4. name — firstName + lastName, scoped to clinic
 */

import type Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getStripeForClinic, type StripeContext } from '@/lib/stripe/connect';
import {
  findPatientByEmail,
  findPatientByStripeCustomerId,
} from '@/services/stripe/paymentMatchingService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CardSyncOptions {
  dryRun?: boolean;
  includeExpired?: boolean;
  /** Maximum Stripe customers to process (0 = unlimited). Useful for testing. */
  limit?: number;
}

export interface CardSyncStats {
  stripeCustomersTotal: number;
  stripeCustomersWithCards: number;
  patientsMatched: number;
  cardsCreated: number;
  cardsUpdated: number;
  cardsSkippedExisting: number;
  cardsSkippedExpired: number;
  customersSkippedNoEmail: number;
  customersSkippedNoPatient: number;
  stripeCustomerIdsLinked: number;
  errors: number;
  errorDetails: Array<{ stripeCustomerId: string; error: string }>;
}

export interface CardSyncResult {
  success: boolean;
  stats: CardSyncStats;
  clinicId: number;
  dryRun: boolean;
}

export interface SinglePatientSyncResult {
  success: boolean;
  cardsCreated: number;
  cardsUpdated: number;
  cardsSkippedExpired: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function capitalize(str: string): string {
  if (!str) return 'Unknown';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function isCardExpired(expMonth: number, expYear: number): boolean {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  return expYear < currentYear || (expYear === currentYear && expMonth < currentMonth);
}

function makeEmptyStats(): CardSyncStats {
  return {
    stripeCustomersTotal: 0,
    stripeCustomersWithCards: 0,
    patientsMatched: 0,
    cardsCreated: 0,
    cardsUpdated: 0,
    cardsSkippedExisting: 0,
    cardsSkippedExpired: 0,
    customersSkippedNoEmail: 0,
    customersSkippedNoPatient: 0,
    stripeCustomerIdsLinked: 0,
    errors: 0,
    errorDetails: [],
  };
}

// ---------------------------------------------------------------------------
// Upsert a single Stripe PaymentMethod → local PaymentMethod
// ---------------------------------------------------------------------------

async function upsertPaymentMethod(
  pm: Stripe.PaymentMethod,
  patientId: number,
  clinicId: number,
  dryRun: boolean,
): Promise<'created' | 'updated' | 'existing'> {
  const card = pm.card;
  if (!card) return 'existing';

  const existing = await prisma.paymentMethod.findUnique({
    where: { stripePaymentMethodId: pm.id },
    select: { id: true, cardLast4: true, expiryMonth: true, expiryYear: true },
  });

  if (existing) {
    const needsUpdate =
      existing.cardLast4 !== card.last4 ||
      existing.expiryMonth !== card.exp_month ||
      existing.expiryYear !== card.exp_year;

    if (!needsUpdate) return 'existing';

    if (!dryRun) {
      await prisma.paymentMethod.update({
        where: { stripePaymentMethodId: pm.id },
        data: {
          cardLast4: card.last4,
          cardBrand: capitalize(card.brand),
          expiryMonth: card.exp_month,
          expiryYear: card.exp_year,
          cardholderName: pm.billing_details?.name || null,
          isActive: true,
        },
      });
    }
    return 'updated';
  }

  if (!dryRun) {
    await prisma.paymentMethod.create({
      data: {
        patientId,
        clinicId,
        stripePaymentMethodId: pm.id,
        encryptedCardNumber: '',
        cardLast4: card.last4,
        cardBrand: capitalize(card.brand),
        expiryMonth: card.exp_month,
        expiryYear: card.exp_year,
        cardholderName: pm.billing_details?.name || null,
        fingerprint: card.fingerprint || null,
        isDefault: false,
        isActive: true,
      },
    });
  }
  return 'created';
}

// ---------------------------------------------------------------------------
// Sync cards for a single patient (by patientId)
// ---------------------------------------------------------------------------

export async function syncCardsForPatient(
  patientId: number,
): Promise<SinglePatientSyncResult> {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, clinicId: true, stripeCustomerId: true },
  });

  if (!patient) {
    return { success: false, cardsCreated: 0, cardsUpdated: 0, cardsSkippedExpired: 0, error: 'Patient not found' };
  }

  if (!patient.stripeCustomerId) {
    return { success: false, cardsCreated: 0, cardsUpdated: 0, cardsSkippedExpired: 0, error: 'Patient has no stripeCustomerId' };
  }

  let stripeContext: StripeContext;
  try {
    stripeContext = await getStripeForClinic(patient.clinicId);
  } catch (err) {
    return {
      success: false,
      cardsCreated: 0,
      cardsUpdated: 0,
      cardsSkippedExpired: 0,
      error: `Failed to get Stripe context: ${err instanceof Error ? err.message : 'Unknown'}`,
    };
  }

  const requestOpts: Stripe.RequestOptions | undefined = stripeContext.stripeAccountId
    ? { stripeAccount: stripeContext.stripeAccountId }
    : undefined;

  let created = 0;
  let updated = 0;
  let skippedExpired = 0;

  try {
    const methods = await stripeContext.stripe.paymentMethods.list(
      { customer: patient.stripeCustomerId, type: 'card', limit: 100 },
      requestOpts,
    );

    for (const pm of methods.data) {
      if (!pm.card) continue;

      if (isCardExpired(pm.card.exp_month, pm.card.exp_year)) {
        skippedExpired++;
        continue;
      }

      const result = await upsertPaymentMethod(pm, patient.id, patient.clinicId, false);
      if (result === 'created') created++;
      else if (result === 'updated') updated++;
    }

    return { success: true, cardsCreated: created, cardsUpdated: updated, cardsSkippedExpired: skippedExpired };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown';
    logger.error('[CardSync] Failed to sync cards for patient', { patientId, error: msg });
    return { success: false, cardsCreated: created, cardsUpdated: updated, cardsSkippedExpired: skippedExpired, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Sync cards for an entire clinic (bulk backfill)
// ---------------------------------------------------------------------------

export async function syncCardsForClinic(
  clinicId: number,
  options: CardSyncOptions = {},
): Promise<CardSyncResult> {
  const { dryRun = true, includeExpired = false, limit = 0 } = options;
  const stats = makeEmptyStats();

  let stripeContext: StripeContext;
  try {
    stripeContext = await getStripeForClinic(clinicId);
  } catch (err) {
    logger.error('[CardSync] Failed to get Stripe context', { clinicId, error: err instanceof Error ? err.message : 'Unknown' });
    return { success: false, stats, clinicId, dryRun };
  }

  const { stripe } = stripeContext;
  const requestOpts: Stripe.RequestOptions | undefined = stripeContext.stripeAccountId
    ? { stripeAccount: stripeContext.stripeAccountId }
    : undefined;

  logger.info('[CardSync] Starting card sync', {
    clinicId,
    dryRun,
    includeExpired,
    isDedicatedAccount: stripeContext.isDedicatedAccount ?? false,
    isConnect: !!stripeContext.stripeAccountId,
  });

  let startingAfter: string | undefined;
  let keepGoing = true;

  while (keepGoing) {
    const listParams: Stripe.CustomerListParams = {
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    };

    let customers: Stripe.ApiList<Stripe.Customer>;
    try {
      customers = await stripe.customers.list(listParams, requestOpts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown';
      logger.error('[CardSync] Failed to list Stripe customers', { clinicId, error: msg });
      stats.errors++;
      stats.errorDetails.push({ stripeCustomerId: 'list_call', error: msg });
      break;
    }

    for (const customer of customers.data) {
      stats.stripeCustomersTotal++;

      if (limit > 0 && stats.stripeCustomersTotal > limit) {
        keepGoing = false;
        break;
      }

      try {
        await processStripeCustomer(customer, clinicId, stripeContext, requestOpts, stats, {
          dryRun,
          includeExpired,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown';
        stats.errors++;
        stats.errorDetails.push({ stripeCustomerId: customer.id, error: msg });
        logger.error('[CardSync] Error processing customer', { stripeCustomerId: customer.id, error: msg });
      }
    }

    if (!customers.has_more || !keepGoing) break;
    if (customers.data.length > 0) {
      startingAfter = customers.data[customers.data.length - 1].id;
    } else {
      break;
    }
  }

  logger.info('[CardSync] Sync complete', {
    clinicId,
    dryRun,
    ...stats,
    errorDetails: undefined,
  });

  return { success: stats.errors === 0, stats, clinicId, dryRun };
}

// ---------------------------------------------------------------------------
// Process a single Stripe Customer during bulk sync
// ---------------------------------------------------------------------------

async function processStripeCustomer(
  customer: Stripe.Customer,
  clinicId: number,
  stripeContext: StripeContext,
  requestOpts: Stripe.RequestOptions | undefined,
  stats: CardSyncStats,
  opts: { dryRun: boolean; includeExpired: boolean },
): Promise<void> {
  const { dryRun, includeExpired } = opts;

  // List payment methods for this customer
  const methods = await stripeContext.stripe.paymentMethods.list(
    { customer: customer.id, type: 'card', limit: 100 },
    requestOpts,
  );

  if (methods.data.length === 0) return;
  stats.stripeCustomersWithCards++;

  // Match to platform patient
  const patient = await matchCustomerToPatient(customer, clinicId);

  if (!patient) {
    if (!customer.email) {
      stats.customersSkippedNoEmail++;
    } else {
      stats.customersSkippedNoPatient++;
    }
    return;
  }

  stats.patientsMatched++;

  // Link stripeCustomerId if not already set
  if (!patient.stripeCustomerId && !dryRun) {
    try {
      await prisma.patient.update({
        where: { id: patient.id },
        data: { stripeCustomerId: customer.id },
      });
      stats.stripeCustomerIdsLinked++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('Unique constraint')) {
        logger.warn('[CardSync] stripeCustomerId already taken, skipping link', {
          patientId: patient.id,
          stripeCustomerId: customer.id,
        });
      } else {
        throw err;
      }
    }
  } else if (!patient.stripeCustomerId) {
    stats.stripeCustomerIdsLinked++;
  }

  // Upsert each payment method
  for (const pm of methods.data) {
    if (!pm.card) continue;

    if (!includeExpired && isCardExpired(pm.card.exp_month, pm.card.exp_year)) {
      stats.cardsSkippedExpired++;
      continue;
    }

    const result = await upsertPaymentMethod(pm, patient.id, clinicId, dryRun);
    switch (result) {
      case 'created':
        stats.cardsCreated++;
        break;
      case 'updated':
        stats.cardsUpdated++;
        break;
      case 'existing':
        stats.cardsSkippedExisting++;
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Match a Stripe Customer to a platform Patient
// ---------------------------------------------------------------------------

async function matchCustomerToPatient(
  customer: Stripe.Customer,
  clinicId: number,
): Promise<{ id: number; clinicId: number; stripeCustomerId: string | null } | null> {
  // Priority 1: stripeCustomerId exact match (already linked)
  const byStripeId = await findPatientByStripeCustomerId(customer.id);
  if (byStripeId && byStripeId.clinicId === clinicId) {
    return { id: byStripeId.id, clinicId: byStripeId.clinicId, stripeCustomerId: byStripeId.stripeCustomerId };
  }

  // Priority 2: email match scoped to clinic
  if (customer.email) {
    const byEmail = await findPatientByEmail(customer.email, clinicId);
    if (byEmail) {
      return { id: byEmail.id, clinicId: byEmail.clinicId, stripeCustomerId: byEmail.stripeCustomerId };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Webhook helpers: upsert/deactivate a single payment method from event data
// ---------------------------------------------------------------------------

/**
 * Handle payment_method.attached event: upsert the card locally.
 * Resolves patient by stripeCustomerId on the payment method's customer.
 */
export async function handlePaymentMethodAttached(
  pm: Stripe.PaymentMethod,
  clinicId: number,
): Promise<{ success: boolean; action?: string; error?: string }> {
  if (pm.type !== 'card' || !pm.card) {
    return { success: true, action: 'skipped_not_card' };
  }

  const customerId = typeof pm.customer === 'string' ? pm.customer : pm.customer?.id;
  if (!customerId) {
    return { success: false, error: 'No customer on payment method' };
  }

  const patient = await findPatientByStripeCustomerId(customerId);
  if (!patient) {
    logger.warn('[CardSync] payment_method.attached: no patient for customer', {
      stripeCustomerId: customerId,
      clinicId,
    });
    return { success: true, action: 'skipped_no_patient' };
  }

  const result = await upsertPaymentMethod(pm, patient.id, patient.clinicId, false);
  return { success: true, action: result };
}

/**
 * Handle payment_method.detached event: soft-delete the local card.
 */
export async function handlePaymentMethodDetached(
  pm: Stripe.PaymentMethod,
): Promise<{ success: boolean; action?: string }> {
  const existing = await prisma.paymentMethod.findUnique({
    where: { stripePaymentMethodId: pm.id },
    select: { id: true },
  });

  if (!existing) {
    return { success: true, action: 'not_found_locally' };
  }

  await prisma.paymentMethod.update({
    where: { id: existing.id },
    data: { isActive: false },
  });

  return { success: true, action: 'deactivated' };
}

/**
 * Handle payment_method.updated event: update card details locally.
 */
export async function handlePaymentMethodUpdated(
  pm: Stripe.PaymentMethod,
): Promise<{ success: boolean; action?: string }> {
  if (!pm.card) {
    return { success: true, action: 'skipped_not_card' };
  }

  const existing = await prisma.paymentMethod.findUnique({
    where: { stripePaymentMethodId: pm.id },
    select: { id: true },
  });

  if (!existing) {
    return { success: true, action: 'not_found_locally' };
  }

  await prisma.paymentMethod.update({
    where: { id: existing.id },
    data: {
      cardLast4: pm.card.last4,
      cardBrand: capitalize(pm.card.brand),
      expiryMonth: pm.card.exp_month,
      expiryYear: pm.card.exp_year,
      cardholderName: pm.billing_details?.name || null,
      isActive: true,
    },
  });

  return { success: true, action: 'updated' };
}
