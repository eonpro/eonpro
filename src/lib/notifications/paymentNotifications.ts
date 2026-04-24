/**
 * Payment Notification Orchestrator
 * =================================
 * Single source of truth for patient-facing communications on a successful payment.
 *
 * All payment entry points (Stripe Connect PI, Stripe platform invoice, Airtable
 * wellmedr-invoice webhook, etc.) should call `notifyPaymentReceived` exactly once
 * per payment. The helper is:
 *   - Fire-and-forget: never throws to the caller.
 *   - Per-channel error-isolated: an email failure does not block SMS, and vice versa.
 *   - Idempotent across webhook replays via the `Notification` row keyed by
 *     (patient user, sourceType='payment_receipt', sourceId=invoiceId).
 *   - Clinic-configurable via the `EmailAutomation` table (see workstream 4).
 *
 * Channels fired (when enabled + patient consent allows):
 *   1. Portal invite (email + SMS) — skipped automatically if patient already has portal access.
 *   2. PAYMENT_RECEIVED receipt email (SES).
 *   3. PAYMENT_RECEIVED receipt SMS (Twilio) — respects `patient.smsConsent`.
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { decryptPatientPHI, DEFAULT_PHI_FIELDS } from '@/lib/security/phi-encryption';
import { AutomationTrigger } from '@/lib/email/automations';
import { sendPaymentReceivedEmail } from '@/lib/email/automations';
import { sendPaymentReceivedSMS } from '@/lib/integrations/twilio/smsService';
import { triggerPortalInviteOnPayment } from '@/lib/portal-invite/service';
import { getAutomationConfig } from '@/lib/email/automations';

export type PaymentSource =
  | 'stripe_connect_pi'
  | 'stripe_platform_invoice'
  | 'airtable_wellmedr_invoice'
  | 'manual';

export interface NotifyPaymentReceivedInput {
  patientId: number;
  invoiceId: number;
  amountCents: number;
  paymentSource: PaymentSource;
  /** Optional display string for the invoice (e.g. Stripe invoice number). Falls back to internal id. */
  invoiceNumber?: string;
  /** Optional link to the hosted Stripe receipt PDF. */
  receiptUrl?: string;
  /** Optional description to include in the receipt body. */
  description?: string;
}

export interface NotifyPaymentReceivedResult {
  skipped?: 'duplicate' | 'no_patient' | 'no_email_and_no_phone';
  portalInvite: { attempted: boolean; success?: boolean };
  email: { attempted: boolean; success?: boolean; error?: string };
  sms: { attempted: boolean; success?: boolean; blocked?: boolean; error?: string };
}

/** sourceType tag used on the Notification row for idempotency. */
const IDEMPOTENCY_SOURCE_TYPE = 'payment_receipt';

/**
 * Deduplicate payment receipt deliveries across multiple webhook entry points.
 * Writes a single Notification row (or returns the existing one).
 * Returns true if this call should proceed, false if a previous call already handled it.
 */
async function acquireReceiptIdempotencyLock(input: {
  patientUserId: number;
  clinicId: number | null;
  invoiceId: number;
  paymentSource: PaymentSource;
  amountCents: number;
  patientName: string;
}): Promise<boolean> {
  try {
    const existing = await prisma.notification.findFirst({
      where: {
        userId: input.patientUserId,
        sourceType: IDEMPOTENCY_SOURCE_TYPE,
        sourceId: String(input.invoiceId),
      },
      select: { id: true },
    });
    if (existing) {
      return false;
    }

    await prisma.notification.create({
      data: {
        userId: input.patientUserId,
        clinicId: input.clinicId,
        category: 'PAYMENT',
        priority: 'NORMAL',
        title: 'Payment received',
        message: `Payment of $${(input.amountCents / 100).toFixed(2)} received`,
        sourceType: IDEMPOTENCY_SOURCE_TYPE,
        sourceId: String(input.invoiceId),
        metadata: {
          invoiceId: input.invoiceId,
          paymentSource: input.paymentSource,
          amountCents: input.amountCents,
          patientName: input.patientName,
        },
      },
    });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    // If the unique index race happens, treat it as "someone else got the lock".
    if (/Unique|P2002/.test(msg)) {
      return false;
    }
    logger.warn('[notifyPaymentReceived] Idempotency check failed (continuing)', {
      invoiceId: input.invoiceId,
      error: msg,
    });
    return true;
  }
}

/**
 * Fire-and-forget patient notification on payment success.
 * Safe to call from any payment path; never throws.
 */
export async function notifyPaymentReceived(
  input: NotifyPaymentReceivedInput
): Promise<NotifyPaymentReceivedResult> {
  const result: NotifyPaymentReceivedResult = {
    portalInvite: { attempted: false },
    email: { attempted: false },
    sms: { attempted: false },
  };

  try {
    const patient = await prisma.patient.findUnique({
      where: { id: input.patientId },
      select: {
        id: true,
        clinicId: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        smsConsent: true,
        user: { select: { id: true } },
      },
    });

    if (!patient) {
      logger.warn('[notifyPaymentReceived] Patient not found', {
        patientId: input.patientId,
        invoiceId: input.invoiceId,
      });
      result.skipped = 'no_patient';
      return result;
    }

    // Decrypt PHI for outbound messaging
    const decrypted = decryptPatientPHI(
      patient as unknown as Record<string, unknown>,
      DEFAULT_PHI_FIELDS as unknown as (keyof typeof patient)[]
    ) as typeof patient;

    const decryptedEmail = (decrypted.email || '').trim();
    const decryptedPhone = (decrypted.phone || '').trim();
    const firstName = decrypted.firstName || 'Patient';
    const lastName = decrypted.lastName || '';
    const patientName = `${firstName} ${lastName}`.trim() || 'Patient';

    if (!decryptedEmail && !decryptedPhone) {
      logger.warn('[notifyPaymentReceived] Patient has no email or phone', {
        patientId: patient.id,
        invoiceId: input.invoiceId,
      });
      result.skipped = 'no_email_and_no_phone';
      return result;
    }

    // Idempotency: only the first caller for a given invoice performs the work.
    // Requires a patient user for the Notification FK. If the patient has no user
    // yet (common on first payment), we skip the lock and rely on per-channel
    // upstream idempotency (portal invite is idempotent; email/SMS rely on Stripe
    // webhook idempotency at the event level).
    if (patient.user?.id) {
      const acquired = await acquireReceiptIdempotencyLock({
        patientUserId: patient.user.id,
        clinicId: patient.clinicId,
        invoiceId: input.invoiceId,
        paymentSource: input.paymentSource,
        amountCents: input.amountCents,
        patientName,
      });
      if (!acquired) {
        logger.info('[notifyPaymentReceived] Duplicate delivery skipped', {
          patientId: patient.id,
          invoiceId: input.invoiceId,
          paymentSource: input.paymentSource,
        });
        result.skipped = 'duplicate';
        return result;
      }
    }

    // Clinic-scoped toggles
    const config = await getAutomationConfig(
      AutomationTrigger.PAYMENT_RECEIVED,
      patient.clinicId ?? undefined
    );
    const emailEnabled = config?.enabled !== false;
    const smsEnabled = config?.smsEnabled !== false;

    const amountFormatted = (input.amountCents / 100).toFixed(2);
    const invoiceNumber = input.invoiceNumber || String(input.invoiceId);

    // 1) Portal invite (fires regardless of PAYMENT_RECEIVED toggle — it is a
    // separate patient-experience primitive). No-ops if user already exists.
    result.portalInvite.attempted = true;
    try {
      await triggerPortalInviteOnPayment(patient.id);
      result.portalInvite.success = true;
    } catch (err) {
      result.portalInvite.success = false;
      logger.warn('[notifyPaymentReceived] Portal invite failed (non-fatal)', {
        patientId: patient.id,
        invoiceId: input.invoiceId,
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }

    // 2) Receipt email
    if (emailEnabled && decryptedEmail) {
      result.email.attempted = true;
      try {
        const emailResult = await sendPaymentReceivedEmail({
          customerEmail: decryptedEmail,
          customerName: patientName,
          amount: Number(amountFormatted),
          invoiceNumber,
        });
        result.email.success = emailResult.success;
        if (!emailResult.success) {
          result.email.error = emailResult.error;
        }
      } catch (err) {
        result.email.success = false;
        result.email.error = err instanceof Error ? err.message : 'Unknown error';
        logger.warn('[notifyPaymentReceived] Email failed (non-fatal)', {
          patientId: patient.id,
          invoiceId: input.invoiceId,
          error: result.email.error,
        });
      }
    }

    // 3) Receipt SMS
    if (smsEnabled && decryptedPhone) {
      result.sms.attempted = true;
      try {
        const smsResult = await sendPaymentReceivedSMS(patient.id, {
          amountFormatted,
          invoiceNumber,
        });
        result.sms.success = smsResult.success;
        result.sms.blocked = smsResult.blocked;
        if (!smsResult.success) {
          result.sms.error = smsResult.error;
        }
      } catch (err) {
        result.sms.success = false;
        result.sms.error = err instanceof Error ? err.message : 'Unknown error';
        logger.warn('[notifyPaymentReceived] SMS failed (non-fatal)', {
          patientId: patient.id,
          invoiceId: input.invoiceId,
          error: result.sms.error,
        });
      }
    }

    logger.info('[notifyPaymentReceived] Delivery attempted', {
      patientId: patient.id,
      clinicId: patient.clinicId,
      invoiceId: input.invoiceId,
      paymentSource: input.paymentSource,
      portalInviteSuccess: result.portalInvite.success,
      emailSuccess: result.email.success,
      smsSuccess: result.sms.success,
      smsBlocked: result.sms.blocked,
    });

    return result;
  } catch (err) {
    // Outer guard: never throw to the caller.
    logger.error('[notifyPaymentReceived] Unexpected failure (non-fatal)', {
      patientId: input.patientId,
      invoiceId: input.invoiceId,
      paymentSource: input.paymentSource,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    return result;
  }
}
