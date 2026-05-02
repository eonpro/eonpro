/**
 * Scheduled Payments Service
 * ==========================
 *
 * Single source of truth for the lifecycle of `ScheduledPayment` rows
 * (the post-dating mechanism on the patient profile Billing tab).
 *
 * Callable from:
 *   - the cron `/api/cron/process-scheduled-payments` (batch)
 *   - the manual "Process Now" action on `PATCH /api/v2/scheduled-payments/[id]`
 *
 * Replaces the old loopback `fetch('/api/stripe/payments/process')` call,
 * which silently 401'd because that route is wrapped in `withAuth` and does
 * not honor `x-cron-secret`. This module charges Stripe directly in-process
 * via the same primitives the saved-card branch of payments/process uses.
 *
 * Design notes:
 *   - **Stable idempotency key** derived from `ScheduledPayment.id` +
 *     `attemptCount` so a cron re-tick re-uses the same key.
 *   - **Bounded retries** (`MAX_ATTEMPTS = 3`) with backoff. Stripe
 *     `card_declined` / `card_error` is treated as terminal (no retry).
 *   - **Reminders** create an in-app `Notification` row (category PAYMENT)
 *     for the rep who scheduled the row, and email them via SES.
 *   - **Audit**: every state transition is logged via `auditLog`.
 *
 * @module services/billing/scheduledPaymentsService
 */

import Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { PaymentStatus, Prisma, type ScheduledPayment } from '@prisma/client';
import { getStripeForClinic } from '@/lib/stripe/connect';
import { StripeCustomerService } from '@/services/stripe/customerService';
import { createInvoiceForProcessedPayment } from '@/services/billing/createInvoiceForPayment';
import { sendEmail } from '@/lib/email';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { formatCurrency } from '@/lib/utils';

// ============================================================================
// Constants
// ============================================================================

/** Maximum AUTO_CHARGE attempts before flipping the row to terminal FAILED. */
export const MAX_ATTEMPTS = 3;

/** Default cron batch size. */
export const DEFAULT_BATCH_SIZE = 50;

/**
 * Backoff cutoff: a row that has already been attempted is only re-tried
 * once `lastAttemptAt` is older than `min(2^attemptCount * 1h, 24h)`.
 * Returns the cutoff Date relative to `now`; rows with `lastAttemptAt`
 * <= cutoff (or null) are eligible.
 */
export function backoffCutoff(now: Date, attemptCount: number): Date {
  const hours = Math.min(Math.pow(2, attemptCount), 24);
  return new Date(now.getTime() - hours * 60 * 60 * 1000);
}

// ============================================================================
// Types
// ============================================================================

export interface ProcessResult {
  processed: number;
  reminders: number;
  failed: number;
  retried: number;
  skipped: number;
  total: number;
}

export type ProcessOutcome =
  | { kind: 'PROCESSED'; paymentId?: number; invoiceId?: number }
  | { kind: 'REMINDER_FIRED' }
  | { kind: 'RETRY_SCHEDULED'; attemptCount: number; reason: string }
  | { kind: 'TERMINAL_FAILURE'; reason: string }
  | { kind: 'SKIPPED'; reason: string };

interface SpWithPatient extends ScheduledPayment {
  patient: {
    id: number;
    clinicId: number;
    firstName: string | null;
    stripeCustomerId: string | null;
    paymentMethods: Array<{
      id: number;
      stripePaymentMethodId: string | null;
      cardLast4: string | null;
    }>;
  };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Cron entrypoint: processes due, eligible scheduled payments.
 * - PENDING + scheduledDate <= now
 * - attemptCount < MAX_ATTEMPTS
 * - Either never attempted, or last attempt older than backoff cutoff
 */
export async function processDuePayments(
  now: Date = new Date(),
  batchSize: number = DEFAULT_BATCH_SIZE
): Promise<ProcessResult> {
  const result: ProcessResult = {
    processed: 0,
    reminders: 0,
    failed: 0,
    retried: 0,
    skipped: 0,
    total: 0,
  };

  // Pull a generous superset and filter the per-row backoff window in JS,
  // since the cutoff depends on each row's individual attemptCount.
  const candidates = (await prisma.scheduledPayment.findMany({
    where: {
      status: 'PENDING',
      scheduledDate: { lte: now },
      attemptCount: { lt: MAX_ATTEMPTS },
    },
    include: {
      patient: {
        select: {
          id: true,
          clinicId: true,
          firstName: true,
          stripeCustomerId: true,
          paymentMethods: {
            where: { isActive: true },
            orderBy: [{ isDefault: 'desc' }, { lastUsedAt: 'desc' }],
            take: 1,
            select: {
              id: true,
              stripePaymentMethodId: true,
              cardLast4: true,
            },
          },
        },
      },
    },
    orderBy: { scheduledDate: 'asc' },
    take: batchSize * 2,
  })) as SpWithPatient[];

  const eligible = candidates.filter((sp) => {
    if (sp.attemptCount === 0) return true;
    if (!sp.lastAttemptAt) return true;
    const cutoff = backoffCutoff(now, sp.attemptCount);
    return sp.lastAttemptAt <= cutoff;
  });

  result.total = eligible.length;

  if (eligible.length === 0) {
    return result;
  }

  for (const sp of eligible.slice(0, batchSize)) {
    const outcome = await processOne(sp, now);

    switch (outcome.kind) {
      case 'PROCESSED':
        if (sp.type === 'REMINDER') result.reminders++;
        else result.processed++;
        break;
      case 'REMINDER_FIRED':
        result.reminders++;
        break;
      case 'RETRY_SCHEDULED':
        result.retried++;
        break;
      case 'TERMINAL_FAILURE':
        result.failed++;
        break;
      case 'SKIPPED':
        result.skipped++;
        break;
    }
  }

  logger.info('[ScheduledPayments] Batch complete', {
    ...result,
    candidateCount: candidates.length,
  });

  return result;
}

/**
 * Process a single scheduled payment by ID. Used by the manual "Process Now"
 * UI action. Returns the outcome so callers can react.
 */
export async function processScheduledPayment(
  id: number,
  opts?: { manualUserId?: number; now?: Date }
): Promise<ProcessOutcome> {
  const now = opts?.now ?? new Date();

  const sp = (await prisma.scheduledPayment.findUnique({
    where: { id },
    include: {
      patient: {
        select: {
          id: true,
          clinicId: true,
          firstName: true,
          stripeCustomerId: true,
          paymentMethods: {
            where: { isActive: true },
            orderBy: [{ isDefault: 'desc' }, { lastUsedAt: 'desc' }],
            take: 1,
            select: {
              id: true,
              stripePaymentMethodId: true,
              cardLast4: true,
            },
          },
        },
      },
    },
  })) as SpWithPatient | null;

  if (!sp) {
    return { kind: 'SKIPPED', reason: 'not found' };
  }

  if (sp.status !== 'PENDING') {
    return { kind: 'SKIPPED', reason: `status=${sp.status}` };
  }

  return processOne(sp, now, { manualUserId: opts?.manualUserId });
}

// ============================================================================
// Core single-row processor
// ============================================================================

async function processOne(
  sp: SpWithPatient,
  now: Date,
  opts?: { manualUserId?: number }
): Promise<ProcessOutcome> {
  try {
    if (sp.type === 'REMINDER') {
      await fireReminder(sp, now);
      return { kind: 'REMINDER_FIRED' };
    }

    return await chargeScheduledPayment(sp, now, opts);
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Unknown processing error';
    logger.error('[ScheduledPayments] Unhandled error processing row', {
      scheduledPaymentId: sp.id,
      patientId: sp.patientId,
      clinicId: sp.clinicId,
      type: sp.type,
      error: reason,
    });

    // Best-effort flip to FAILED so the row doesn't get stuck PENDING with no signal.
    await prisma.scheduledPayment
      .update({
        where: { id: sp.id },
        data: {
          status: 'FAILED',
          processedAt: now,
          lastAttemptAt: now,
          attemptCount: { increment: 1 },
          failureReason: reason,
          metadata: mergeMeta(sp.metadata, {
            processedByCron: !opts?.manualUserId,
            terminalError: true,
          }),
        },
      })
      .catch(() => {});

    await safeAudit({
      sp,
      eventType: AuditEventType.SYSTEM_ACCESS,
      action: 'scheduled_payment.process_error',
      outcome: 'FAILURE',
      reason,
      manualUserId: opts?.manualUserId,
    });

    return { kind: 'TERMINAL_FAILURE', reason };
  }
}

// ============================================================================
// REMINDER path
// ============================================================================

/**
 * Fire a REMINDER scheduled payment: flip status, write an in-app Notification,
 * email the rep who created it. All non-charge side-effects.
 */
export async function fireReminder(sp: SpWithPatient, now: Date = new Date()): Promise<void> {
  await prisma.scheduledPayment.update({
    where: { id: sp.id },
    data: {
      status: 'PROCESSED',
      processedAt: now,
      lastAttemptAt: now,
      attemptCount: { increment: 1 },
      failureReason: null,
      metadata: mergeMeta(sp.metadata, {
        processedByCron: true,
        processedAt: now.toISOString(),
        kind: 'reminder',
      }),
    },
  });

  await notifyRep({
    sp,
    title: 'Scheduled payment reminder due',
    message: `${formatCurrency(sp.amount)} for ${reminderSubject(sp)} — process this charge from the patient billing tab.`,
    priority: 'NORMAL',
  });

  await safeAudit({
    sp,
    eventType: AuditEventType.SYSTEM_ACCESS,
    action: 'scheduled_payment.reminder_fired',
    outcome: 'SUCCESS',
  });

  logger.info('[ScheduledPayments] Reminder fired', {
    scheduledPaymentId: sp.id,
    patientId: sp.patientId,
    clinicId: sp.clinicId,
  });
}

// ============================================================================
// AUTO_CHARGE path
// ============================================================================

/**
 * Charge a scheduled payment against the patient's saved default card.
 * Stable idempotency keying + DB-first PaymentRow + bounded retries.
 */
export async function chargeScheduledPayment(
  sp: SpWithPatient,
  now: Date = new Date(),
  opts?: { manualUserId?: number }
): Promise<ProcessOutcome> {
  const defaultCard = sp.patient.paymentMethods[0];
  if (!defaultCard?.stripePaymentMethodId) {
    return await markFailed(sp, now, {
      reason: 'No saved payment method with Stripe link',
      terminal: true,
      manualUserId: opts?.manualUserId,
    });
  }

  // Stable idempotency key derived from the row + attempt index.
  const attemptIdx = sp.attemptCount;
  const idempotencyKey = `sp_${sp.id}_attempt_${attemptIdx}`;

  // Look up the local PaymentMethod row (for clinic isolation + cosmetic fields).
  const localMethod = await prisma.paymentMethod.findFirst({
    where: { id: defaultCard.id, patientId: sp.patient.id, isActive: true },
    select: { id: true, stripePaymentMethodId: true, cardLast4: true, cardBrand: true },
  });

  if (!localMethod || !localMethod.stripePaymentMethodId) {
    return await markFailed(sp, now, {
      reason: 'Saved payment method missing or inactive',
      terminal: true,
      manualUserId: opts?.manualUserId,
    });
  }

  const cardLast4 = localMethod.cardLast4 ?? '????';
  const cardBrand = localMethod.cardBrand ?? 'Unknown';

  let stripeCtx: Awaited<ReturnType<typeof getStripeForClinic>>;
  try {
    stripeCtx = await getStripeForClinic(sp.patient.clinicId);
  } catch (err) {
    return await markFailed(sp, now, {
      reason: `Stripe context error: ${err instanceof Error ? err.message : String(err)}`,
      // No Stripe context configured for this clinic is terminal — retrying won't help.
      terminal: true,
      manualUserId: opts?.manualUserId,
    });
  }

  const stripe = stripeCtx.stripe;
  const connectOpts = stripeCtx.stripeAccountId
    ? { stripeAccount: stripeCtx.stripeAccountId }
    : undefined;

  // Resolve / create Stripe customer on the right account.
  let stripeCustomerId: string;
  try {
    const customer = await StripeCustomerService.getOrCreateCustomerForContext(
      sp.patient.id,
      stripe,
      connectOpts
    );
    stripeCustomerId = customer.id;
  } catch (err) {
    // Treat customer-resolution failure as transient (network / Stripe blip).
    return await markFailed(sp, now, {
      reason: `Customer resolution failed: ${err instanceof Error ? err.message : String(err)}`,
      terminal: false,
      manualUserId: opts?.manualUserId,
    });
  }

  // DB-first: create the PENDING Payment row before the Stripe call.
  const description = sp.description || sp.planName || 'Scheduled Payment';
  const pendingPayment = await prisma.payment.create({
    data: {
      patientId: sp.patient.id,
      amount: sp.amount,
      status: PaymentStatus.PENDING,
      paymentMethod: `Card ending ${cardLast4}`,
      description,
      notes: `Auto-charged from scheduled payment #${sp.id}`,
      metadata: {
        cardBrand,
        localPaymentMethodId: localMethod.id,
        stripePaymentMethodId: localMethod.stripePaymentMethodId,
        idempotencyKey,
        usedSavedCard: true,
        scheduledPaymentId: sp.id,
        attemptIdx,
      } as any,
    },
  });

  // Charge.
  let intent: Stripe.PaymentIntent;
  try {
    const intentParams: Stripe.PaymentIntentCreateParams = {
      amount: sp.amount,
      currency: 'usd',
      customer: stripeCustomerId,
      payment_method: localMethod.stripePaymentMethodId,
      description,
      confirm: true,
      off_session: true,
      metadata: {
        paymentId: pendingPayment.id.toString(),
        patientId: sp.patient.id.toString(),
        scheduledPaymentId: sp.id.toString(),
        idempotencyKey,
        source: 'scheduled_payment_cron',
      },
    };

    intent = await stripe.paymentIntents.create(intentParams, {
      idempotencyKey,
      ...(connectOpts ?? {}),
    });
  } catch (stripeError: unknown) {
    const errMsg = stripeError instanceof Error ? stripeError.message : 'Stripe charge failed';
    const stripeType = (stripeError as any)?.type as string | undefined;
    const stripeCode = (stripeError as any)?.code as string | undefined;
    const failedPiId = (stripeError as any)?.payment_intent?.id as string | undefined;

    await prisma.payment.update({
      where: { id: pendingPayment.id },
      data: {
        status: PaymentStatus.FAILED,
        failureReason: errMsg,
        ...(failedPiId ? { stripePaymentIntentId: failedPiId } : {}),
      },
    });

    // Card-level errors are terminal: same card will keep declining. Auth /
    // permissions / invalid request errors are also terminal — retry won't help.
    const terminal =
      stripeType === 'StripeCardError' ||
      stripeType === 'StripeInvalidRequestError' ||
      stripeType === 'StripeAuthenticationError' ||
      stripeType === 'StripePermissionError' ||
      stripeCode === 'card_declined' ||
      stripeCode === 'expired_card' ||
      stripeCode === 'incorrect_cvc' ||
      stripeCode === 'insufficient_funds';

    return await markFailed(sp, now, {
      reason: errMsg,
      terminal,
      manualUserId: opts?.manualUserId,
      stripePaymentIntentId: failedPiId,
    });
  }

  // Link PI immediately so a webhook racing us can find this row by ID.
  await prisma.payment.update({
    where: { id: pendingPayment.id },
    data: { stripePaymentIntentId: intent.id },
  });

  const stripeStatus =
    intent.status === 'succeeded'
      ? PaymentStatus.SUCCEEDED
      : intent.status === 'processing'
        ? PaymentStatus.PROCESSING
        : PaymentStatus.FAILED;

  if (stripeStatus === PaymentStatus.FAILED) {
    await prisma.payment.update({
      where: { id: pendingPayment.id },
      data: {
        status: PaymentStatus.FAILED,
        failureReason: `PaymentIntent status=${intent.status}`,
      },
    });
    return await markFailed(sp, now, {
      reason: `PaymentIntent status=${intent.status}`,
      terminal: false,
      manualUserId: opts?.manualUserId,
      stripePaymentIntentId: intent.id,
    });
  }

  // Success path: finalize Payment row + create matching Invoice (best effort).
  await prisma.payment.update({
    where: { id: pendingPayment.id },
    data: {
      status: stripeStatus,
      stripeChargeId:
        typeof intent.latest_charge === 'string'
          ? intent.latest_charge
          : (intent.latest_charge as any)?.id ?? null,
    },
  });

  await prisma.paymentMethod
    .update({
      where: { id: localMethod.id },
      data: { lastUsedAt: now },
    })
    .catch(() => {});

  let invoiceId: number | undefined;
  try {
    const inv = await createInvoiceForProcessedPayment({
      paymentId: pendingPayment.id,
      patientId: sp.patient.id,
      clinicId: sp.patient.clinicId,
      amount: sp.amount,
      description,
      stripePaymentIntentId: intent.id,
      stripeChargeId:
        typeof intent.latest_charge === 'string'
          ? intent.latest_charge
          : ((intent.latest_charge as any)?.id ?? null),
      planId: sp.planId,
      planName: sp.planName,
    });
    invoiceId = inv?.invoiceId;
  } catch (invErr) {
    // Non-blocking: charge succeeded; invoice creation is bookkeeping.
    logger.warn('[ScheduledPayments] Invoice creation failed (non-blocking)', {
      paymentId: pendingPayment.id,
      scheduledPaymentId: sp.id,
      error: invErr instanceof Error ? invErr.message : String(invErr),
    });
  }

  await prisma.scheduledPayment.update({
    where: { id: sp.id },
    data: {
      status: 'PROCESSED',
      processedAt: now,
      lastAttemptAt: now,
      attemptCount: { increment: 1 },
      paymentId: pendingPayment.id,
      failureReason: null,
      metadata: mergeMeta(sp.metadata, {
        processedByCron: !opts?.manualUserId,
        ...(opts?.manualUserId
          ? { manuallyProcessedBy: opts.manualUserId, manuallyProcessedAt: now.toISOString() }
          : {}),
        idempotencyKey,
        stripePaymentIntentId: intent.id,
        invoiceId: invoiceId ?? null,
      }),
    },
  });

  await safeAudit({
    sp,
    eventType: AuditEventType.SYSTEM_ACCESS,
    action: 'scheduled_payment.charged',
    outcome: 'SUCCESS',
    metadata: {
      paymentId: pendingPayment.id,
      stripePaymentIntentId: intent.id,
      amount: sp.amount,
      manual: !!opts?.manualUserId,
    },
    manualUserId: opts?.manualUserId,
  });

  logger.info('[ScheduledPayments] Auto-charge succeeded', {
    scheduledPaymentId: sp.id,
    patientId: sp.patientId,
    clinicId: sp.clinicId,
    paymentId: pendingPayment.id,
    invoiceId,
    stripePaymentIntentId: intent.id,
  });

  return { kind: 'PROCESSED', paymentId: pendingPayment.id, invoiceId };
}

// ============================================================================
// Failure handling
// ============================================================================

async function markFailed(
  sp: SpWithPatient,
  now: Date,
  args: {
    reason: string;
    terminal: boolean;
    manualUserId?: number;
    stripePaymentIntentId?: string;
  }
): Promise<ProcessOutcome> {
  const newAttemptCount = sp.attemptCount + 1;
  const isTerminal = args.terminal || newAttemptCount >= MAX_ATTEMPTS;

  await prisma.scheduledPayment.update({
    where: { id: sp.id },
    data: {
      status: isTerminal ? 'FAILED' : 'PENDING',
      lastAttemptAt: now,
      attemptCount: { increment: 1 },
      failureReason: args.reason,
      ...(isTerminal ? { processedAt: now } : {}),
      metadata: mergeMeta(sp.metadata, {
        processedByCron: !args.manualUserId,
        failureReason: args.reason,
        terminalAt: isTerminal ? now.toISOString() : undefined,
        ...(args.stripePaymentIntentId
          ? { lastStripePaymentIntentId: args.stripePaymentIntentId }
          : {}),
      }),
    },
  });

  await safeAudit({
    sp,
    eventType: AuditEventType.SYSTEM_ACCESS,
    action: isTerminal ? 'scheduled_payment.failed_terminal' : 'scheduled_payment.failed_retry',
    outcome: 'FAILURE',
    reason: args.reason,
    manualUserId: args.manualUserId,
    metadata: {
      attemptCount: newAttemptCount,
      ...(args.stripePaymentIntentId
        ? { stripePaymentIntentId: args.stripePaymentIntentId }
        : {}),
    },
  });

  if (isTerminal) {
    await notifyRep({
      sp,
      title: 'Scheduled payment failed',
      message: `${formatCurrency(sp.amount)} for ${reminderSubject(sp)} could not be auto-charged after ${newAttemptCount} attempt(s). Reason: ${args.reason}`,
      priority: 'HIGH',
      sourceIdSuffix: 'failed',
    }).catch(() => {});

    logger.error('[ScheduledPayments] Auto-charge terminal failure', {
      scheduledPaymentId: sp.id,
      patientId: sp.patientId,
      clinicId: sp.clinicId,
      attemptCount: newAttemptCount,
      reason: args.reason,
    });

    return { kind: 'TERMINAL_FAILURE', reason: args.reason };
  }

  logger.warn('[ScheduledPayments] Auto-charge transient failure — will retry', {
    scheduledPaymentId: sp.id,
    patientId: sp.patientId,
    clinicId: sp.clinicId,
    attemptCount: newAttemptCount,
    reason: args.reason,
  });

  return { kind: 'RETRY_SCHEDULED', attemptCount: newAttemptCount, reason: args.reason };
}

// ============================================================================
// Notifications + audit helpers
// ============================================================================

async function notifyRep(input: {
  sp: SpWithPatient;
  title: string;
  message: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  sourceIdSuffix?: string;
}): Promise<void> {
  const { sp, title, message, priority, sourceIdSuffix } = input;
  const sourceId = sourceIdSuffix
    ? `scheduled_payment:${sp.id}:${sourceIdSuffix}`
    : `scheduled_payment:${sp.id}`;

  // Lookup the rep + their email.
  const rep = await prisma.user.findUnique({
    where: { id: sp.createdBy },
    select: { id: true, email: true, firstName: true, role: true },
  });

  // 1) In-app Notification (deduped via sourceType + sourceId).
  try {
    const existing = await prisma.notification.findFirst({
      where: {
        userId: sp.createdBy,
        sourceType: 'cron',
        sourceId,
      },
      select: { id: true },
    });

    if (!existing) {
      await prisma.notification.create({
        data: {
          userId: sp.createdBy,
          clinicId: sp.clinicId,
          category: 'PAYMENT',
          priority,
          title,
          message,
          actionUrl: `/admin/patients/${sp.patientId}?tab=billing`,
          sourceType: 'cron',
          sourceId,
          metadata: {
            scheduledPaymentId: sp.id,
            patientId: sp.patientId,
            amount: sp.amount,
          },
        },
      });
    }
  } catch (err) {
    logger.warn('[ScheduledPayments] Failed to create rep Notification (non-blocking)', {
      scheduledPaymentId: sp.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 2) Email the rep — never include PHI in subject; body uses patient ID + initial.
  if (rep?.email) {
    const safeInitial = safeFirstNameInitial(sp.patient.firstName);
    const subject = title;
    const html = `
      <p>Hi ${escapeHtml(rep.firstName ?? 'there')},</p>
      <p>${escapeHtml(message)}</p>
      <p>
        Patient ref: <strong>P-${sp.patientId}${safeInitial ? ` (${safeInitial}.)` : ''}</strong><br/>
        Amount: <strong>${formatCurrency(sp.amount)}</strong><br/>
        Scheduled date: <strong>${sp.scheduledDate.toISOString().slice(0, 10)}</strong>
      </p>
      <p>
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://app.eonpro.io'}/admin/patients/${sp.patientId}?tab=billing">
          Open billing tab
        </a>
      </p>
      <p style="color:#666;font-size:12px">Scheduled payment #${sp.id} · ${sp.type === 'AUTO_CHARGE' ? 'Auto-charge' : 'Reminder'}</p>
    `;
    const text = `${message}\n\nPatient: P-${sp.patientId}${safeInitial ? ` (${safeInitial}.)` : ''}\nAmount: ${formatCurrency(sp.amount)}\nOpen: ${process.env.NEXT_PUBLIC_APP_URL || 'https://app.eonpro.io'}/admin/patients/${sp.patientId}?tab=billing`;

    await sendEmail({
      to: rep.email,
      subject,
      html,
      text,
      userId: rep.id,
      clinicId: sp.clinicId,
      sourceType: 'notification',
      sourceId,
    }).catch((err) => {
      logger.warn('[ScheduledPayments] Failed to email rep (non-blocking)', {
        scheduledPaymentId: sp.id,
        repUserId: rep.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
}

async function safeAudit(input: {
  sp: SpWithPatient;
  eventType: AuditEventType;
  action: string;
  outcome: 'SUCCESS' | 'FAILURE' | 'PARTIAL';
  reason?: string;
  metadata?: Record<string, unknown>;
  manualUserId?: number;
}): Promise<void> {
  try {
    await auditLog(null, {
      userId: input.manualUserId ?? input.sp.createdBy,
      userRole: input.manualUserId ? 'admin' : 'system',
      clinicId: input.sp.clinicId,
      eventType: input.eventType,
      resourceType: 'ScheduledPayment',
      resourceId: input.sp.id,
      patientId: input.sp.patientId,
      action: input.action,
      outcome: input.outcome,
      reason: input.reason,
      metadata: {
        scheduledPaymentId: input.sp.id,
        type: input.sp.type,
        amount: input.sp.amount,
        ...input.metadata,
      },
    });
  } catch (err) {
    // Audit must never break the cron loop. The audit module itself escalates
    // when ALL channels fail; we catch here only because the cron is the
    // last line of defense for these rows.
    logger.warn('[ScheduledPayments] Audit log failed (non-blocking)', {
      scheduledPaymentId: input.sp.id,
      action: input.action,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ============================================================================
// Pure helpers (kept exported for unit tests)
// ============================================================================

export function mergeMeta(
  existing: unknown,
  next: Record<string, unknown>
): Prisma.InputJsonValue {
  const base = existing && typeof existing === 'object' ? (existing as Record<string, unknown>) : {};
  return { ...base, ...next } as Prisma.InputJsonValue;
}

function reminderSubject(sp: SpWithPatient): string {
  if (sp.planName) return sp.planName;
  if (sp.description) return sp.description;
  return `patient P-${sp.patientId}`;
}

/**
 * Returns the first initial of the (possibly encrypted) first name, or an
 * empty string if none can be safely resolved. Never returns the full name.
 */
function safeFirstNameInitial(firstName: string | null | undefined): string {
  if (!firstName) return '';
  let plain: string | null = null;
  try {
    plain = decryptPHI(firstName);
  } catch {
    plain = null;
  }
  const candidate = plain ?? firstName;
  if (!candidate || typeof candidate !== 'string') return '';
  // If it still looks encrypted (contains ':' or hex blob), don't leak it.
  if (candidate.includes(':') || candidate.length > 32) return '';
  return candidate.charAt(0).toUpperCase();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
