/**
 * Prescription Notification Orchestrator
 * =====================================
 * Single source of truth for patient-facing communications when a provider
 * approves / signs / completes a prescription.
 *
 * Invariants:
 *   - Fire-and-forget: never throws to the caller.
 *   - Per-channel error isolation: email and SMS failures are independent.
 *   - Respects patient `smsConsent` (enforced by `sendPrescriptionReady`).
 *   - Clinic-scoped enable toggles via `EmailAutomation` (see workstream 4).
 *   - Also fires `notificationEvents.prescriptionReady` for admin in-app feed.
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { decryptPatientPHI, DEFAULT_PHI_FIELDS } from '@/lib/security/phi-encryption';
import { AutomationTrigger } from '@/lib/email/automations';
import {
  sendPrescriptionReadyEmail,
  getAutomationConfig,
} from '@/lib/email/automations';
import { sendPrescriptionReady } from '@/lib/integrations/twilio/smsService';
import { notificationEvents } from '@/services/notification/notificationEvents';

export type PrescriptionSource = 'invoice' | 'refill' | 'order';

export interface NotifyPrescriptionReadyInput {
  patientId: number;
  /** Stable reference for the prescription (e.g. invoice-123, refill-456). */
  prescriptionRef: string;
  /** Display name of the medication for the email template. */
  medicationName: string;
  /** Source entity so we can short-circuit duplicate deliveries. */
  source: PrescriptionSource;
  /** Database id of the source entity for idempotency. */
  sourceEntityId: number;
  /** Optional provider identity for admin-facing in-app notification. */
  providerId?: number;
  providerName?: string;
}

export interface NotifyPrescriptionReadyResult {
  skipped?: 'duplicate' | 'no_patient' | 'no_contact';
  email: { attempted: boolean; success?: boolean; error?: string };
  sms: { attempted: boolean; success?: boolean; blocked?: boolean; error?: string };
  adminNotified: boolean;
}

const IDEMPOTENCY_SOURCE_TYPE = 'rx_approved_patient_notice';

async function acquireRxIdempotencyLock(input: {
  patientUserId: number;
  clinicId: number | null;
  sourceKey: string;
  medicationName: string;
}): Promise<boolean> {
  try {
    const existing = await prisma.notification.findFirst({
      where: {
        userId: input.patientUserId,
        sourceType: IDEMPOTENCY_SOURCE_TYPE,
        sourceId: input.sourceKey,
      },
      select: { id: true },
    });
    if (existing) return false;

    await prisma.notification.create({
      data: {
        userId: input.patientUserId,
        clinicId: input.clinicId,
        category: 'PRESCRIPTION',
        priority: 'NORMAL',
        title: 'Prescription approved',
        message: `${input.medicationName} prescription approved`,
        sourceType: IDEMPOTENCY_SOURCE_TYPE,
        sourceId: input.sourceKey,
        metadata: {
          medicationName: input.medicationName,
          sourceKey: input.sourceKey,
        },
      },
    });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (/Unique|P2002/.test(msg)) return false;
    logger.warn('[notifyPrescriptionReady] Idempotency check failed (continuing)', {
      sourceKey: input.sourceKey,
      error: msg,
    });
    return true;
  }
}

/**
 * Fire-and-forget patient notification when an Rx is approved.
 * Safe to call from any provider/admin approval path; never throws.
 */
export async function notifyPrescriptionReady(
  input: NotifyPrescriptionReadyInput
): Promise<NotifyPrescriptionReadyResult> {
  const result: NotifyPrescriptionReadyResult = {
    email: { attempted: false },
    sms: { attempted: false },
    adminNotified: false,
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
      logger.warn('[notifyPrescriptionReady] Patient not found', {
        patientId: input.patientId,
        prescriptionRef: input.prescriptionRef,
      });
      result.skipped = 'no_patient';
      return result;
    }

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
      logger.warn('[notifyPrescriptionReady] Patient has no email or phone', {
        patientId: patient.id,
        prescriptionRef: input.prescriptionRef,
      });
      result.skipped = 'no_contact';
      return result;
    }

    // Idempotency — only if the patient has a user account to anchor the row.
    const sourceKey = `${input.source}:${input.sourceEntityId}`;
    if (patient.user?.id) {
      const acquired = await acquireRxIdempotencyLock({
        patientUserId: patient.user.id,
        clinicId: patient.clinicId,
        sourceKey,
        medicationName: input.medicationName,
      });
      if (!acquired) {
        logger.info('[notifyPrescriptionReady] Duplicate delivery skipped', {
          patientId: patient.id,
          sourceKey,
        });
        result.skipped = 'duplicate';
        return result;
      }
    }

    const config = await getAutomationConfig(
      AutomationTrigger.PRESCRIPTION_READY,
      patient.clinicId ?? undefined
    );
    const emailEnabled = config?.enabled !== false;
    const smsEnabled = config?.smsEnabled !== false;

    // 1) Email
    if (emailEnabled && decryptedEmail) {
      result.email.attempted = true;
      try {
        const emailResult = await sendPrescriptionReadyEmail({
          patientEmail: decryptedEmail,
          patientName,
          medicationName: input.medicationName,
        });
        result.email.success = emailResult.success;
        if (!emailResult.success) {
          result.email.error = emailResult.error;
        }
      } catch (err) {
        result.email.success = false;
        result.email.error = err instanceof Error ? err.message : 'Unknown error';
        logger.warn('[notifyPrescriptionReady] Email failed (non-fatal)', {
          patientId: patient.id,
          prescriptionRef: input.prescriptionRef,
          error: result.email.error,
        });
      }
    }

    // 2) SMS
    if (smsEnabled && decryptedPhone) {
      result.sms.attempted = true;
      try {
        const smsResult = await sendPrescriptionReady(patient.id, input.prescriptionRef);
        result.sms.success = smsResult.success;
        result.sms.blocked = smsResult.blocked;
        if (!smsResult.success) {
          result.sms.error = smsResult.error;
        }
      } catch (err) {
        result.sms.success = false;
        result.sms.error = err instanceof Error ? err.message : 'Unknown error';
        logger.warn('[notifyPrescriptionReady] SMS failed (non-fatal)', {
          patientId: patient.id,
          prescriptionRef: input.prescriptionRef,
          error: result.sms.error,
        });
      }
    }

    // 3) Admin in-app record
    if (patient.clinicId) {
      try {
        await notificationEvents.prescriptionReady({
          clinicId: patient.clinicId,
          patientId: patient.id,
          patientName,
          medicationName: input.medicationName,
          providerId: input.providerId,
          providerName: input.providerName,
        });
        result.adminNotified = true;
      } catch (err) {
        logger.warn('[notifyPrescriptionReady] Admin notification failed (non-fatal)', {
          patientId: patient.id,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    logger.info('[notifyPrescriptionReady] Delivery attempted', {
      patientId: patient.id,
      clinicId: patient.clinicId,
      prescriptionRef: input.prescriptionRef,
      source: input.source,
      emailSuccess: result.email.success,
      smsSuccess: result.sms.success,
      smsBlocked: result.sms.blocked,
      adminNotified: result.adminNotified,
    });

    return result;
  } catch (err) {
    logger.error('[notifyPrescriptionReady] Unexpected failure (non-fatal)', {
      patientId: input.patientId,
      prescriptionRef: input.prescriptionRef,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    return result;
  }
}
