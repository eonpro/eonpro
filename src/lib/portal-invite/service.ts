/**
 * Patient Portal Invite Service
 * =============================
 * Creates one-time invite tokens and sends "Create your portal account" via email or SMS.
 * Used by: manual "Send portal invite" from admin, auto-invite on first payment/order.
 */

import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { sendTemplatedEmail, EmailTemplate } from '@/lib/email';
import { decryptPatientPHI, DEFAULT_PHI_FIELDS } from '@/lib/security/phi-encryption';
import { sendSMS, formatPhoneNumber } from '@/lib/integrations/twilio/smsService';

const TOKEN_BYTES = 32;
const INVITE_EXPIRY_DAYS = 7;

export type PortalInviteTrigger = 'manual' | 'first_payment' | 'first_order';

export type PortalInviteChannel = 'email' | 'sms' | 'both';

export interface CreatePortalInviteOptions {
  createdById?: number;
  /** Delivery channel. Default 'email'. 'both' sends email first, then SMS. */
  channel?: PortalInviteChannel;
  /** Base URL for the invite link (e.g. from request origin). Overrides env when set. */
  baseUrlOverride?: string;
}

export interface CreatePortalInviteResult {
  success: boolean;
  expiresAt?: Date;
  error?: string;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

/**
 * Check if we have already sent an invite for this trigger for this patient (idempotency).
 */
async function hasExistingUnusedInvite(
  patientId: number,
  trigger: PortalInviteTrigger
): Promise<boolean> {
  const existing = await prisma.patientPortalInvite.findFirst({
    where: {
      patientId,
      trigger,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  return !!existing;
}

/**
 * Create a one-time portal invite for a patient and send the email.
 * Idempotent for same patient+trigger: does not create a second invite if a valid unused one exists.
 */
export async function createAndSendPortalInvite(
  patientId: number,
  trigger: PortalInviteTrigger,
  options?: CreatePortalInviteOptions
): Promise<CreatePortalInviteResult> {
  try {
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        user: { select: { id: true } },
        clinic: { select: { name: true } },
      },
    });

    if (!patient) {
      logger.warn('[PortalInvite] Patient not found', { patientId });
      return { success: false, error: 'Patient not found' };
    }

    if (patient.user) {
      logger.info('[PortalInvite] Patient already has portal access', { patientId });
      return { success: false, error: 'Patient already has portal access' };
    }

    // Decrypt PHI (email, firstName, phone, etc.) before using for invite
    let decrypted: typeof patient;
    try {
      decrypted = decryptPatientPHI(patient as unknown as Record<string, unknown>, [
        ...DEFAULT_PHI_FIELDS,
      ]) as typeof patient;
    } catch (decryptErr) {
      const msg = decryptErr instanceof Error ? decryptErr.message : 'Unknown error';
      logger.error('[PortalInvite] Failed to decrypt patient PHI', { patientId, error: msg });
      return {
        success: false,
        error: 'Unable to load patient contact details. Please try again or contact support.',
      };
    }
    const channel = options?.channel ?? 'email';
    const email = (decrypted.email || '').trim().toLowerCase();
    const phone = (decrypted.phone || '').trim();

    if (channel === 'both') {
      if (!email && !phone) {
        logger.warn('[PortalInvite] Patient has no email or phone', { patientId });
        return { success: false, error: 'Patient has no email or phone number' };
      }
    } else if (channel === 'sms') {
      if (!phone) {
        logger.warn('[PortalInvite] Patient has no phone for SMS invite', { patientId });
        return { success: false, error: 'Patient has no phone number' };
      }
    } else {
      if (!email) {
        logger.warn('[PortalInvite] Patient has no email', { patientId });
        return { success: false, error: 'Patient has no email address' };
      }
    }

    // Idempotency: if we already have a valid unused invite for this trigger, optionally resend or skip
    const hasUnused = await hasExistingUnusedInvite(patientId, trigger);
    if (hasUnused && trigger !== 'manual') {
      // Auto-triggers: do not create duplicate invites
      logger.info('[PortalInvite] Unused invite already exists for trigger', {
        patientId,
        trigger,
      });
      const existing = await prisma.patientPortalInvite.findFirst({
        where: { patientId, trigger, usedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      });
      return {
        success: true,
        expiresAt: existing?.expiresAt ?? undefined,
      };
    }

    const plainToken = generateToken();
    const tokenHash = hashToken(plainToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);

    await prisma.patientPortalInvite.create({
      data: {
        patientId,
        tokenHash,
        expiresAt,
        trigger,
        createdById: options?.createdById ?? null,
      },
    });

    // Prefer request origin (baseUrlOverride) so invite link matches the domain the user is on.
    const baseUrl =
      (options?.baseUrlOverride && options.baseUrlOverride.replace(/\/$/, '')) ||
      process.env.APP_URL ||
      process.env.NEXTAUTH_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      (typeof window !== 'undefined' ? `${window.location.origin}` : 'https://app.eonpro.io');
    const inviteLink = `${baseUrl}/register?invite=${encodeURIComponent(plainToken)}`;

    const firstName = (decrypted.firstName || 'Patient').trim();
    const clinicName = patient.clinic?.name || 'Your Clinic';

    const sendEmail = (channel === 'email' || channel === 'both') && !!email;
    const sendSms = (channel === 'sms' || channel === 'both') && !!phone;

    if (sendEmail) {
      const emailResult = await sendTemplatedEmail({
        to: email,
        template: EmailTemplate.PATIENT_PORTAL_INVITE,
        data: {
          firstName,
          clinicName,
          inviteLink,
          expiresIn: `${INVITE_EXPIRY_DAYS} days`,
        },
      });
      if (!emailResult.success) {
        logger.warn('[PortalInvite] Email send failed', {
          patientId,
          error: emailResult.error,
        });
        if (!sendSms) {
          return { success: false, error: emailResult.error ?? 'Failed to send email.' };
        }
      } else {
        logger.info('[PortalInvite] Invite email sent', {
          patientId,
          trigger,
          clinicId: patient.clinicId,
        });
      }
    }

    if (sendSms) {
      const smsBody = `${clinicName}: Create your patient portal account. This link expires in ${INVITE_EXPIRY_DAYS} days. ${inviteLink}`;
      const smsResult = await sendSMS({
        to: formatPhoneNumber(phone),
        body: smsBody,
        clinicId: patient.clinicId,
        patientId: patient.id,
        templateType: 'PORTAL_INVITE',
      });
      if (!smsResult.success) {
        const errMsg = smsResult.blocked
          ? (smsResult.blockReason ?? smsResult.error)
          : (smsResult.error ?? 'SMS send failed');
        logger.warn('[PortalInvite] SMS send failed', { patientId, error: errMsg });
        if (!sendEmail) {
          return { success: false, error: errMsg };
        }
      } else {
        // Record in chat so staff can see the sent invite
        try {
          await prisma.patientChatMessage.create({
            data: {
              patientId,
              clinicId: patient.clinicId,
              message: smsBody,
              direction: 'OUTBOUND',
              channel: 'SMS',
              senderType: 'SYSTEM',
              senderId: options?.createdById ?? null,
              senderName: 'System',
              status: smsResult.messageId ? 'DELIVERED' : 'SENT',
              externalId: smsResult.messageId ?? null,
              deliveredAt: smsResult.messageId ? new Date() : null,
              metadata: { trigger, type: 'portal_invite' },
            },
          });
        } catch (chatErr) {
          const msg = chatErr instanceof Error ? chatErr.message : 'Unknown error';
          logger.warn('[PortalInvite] Failed to create chat record (non-fatal)', {
            patientId,
            error: msg,
          });
        }

        logger.info('[PortalInvite] Invite SMS sent', {
          patientId,
          trigger,
          clinicId: patient.clinicId,
        });
      }
    }

    return { success: true, expiresAt };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('[PortalInvite] Failed to create/send invite', {
      patientId,
      trigger,
      error: message,
    });
    return { success: false, error: message };
  }
}

/**
 * Fire-and-forget portal invite on payment/invoice.
 * Always-on across all brands — no per-clinic setting required.
 * Safe to call from any payment path; never throws, never blocks the caller.
 */
export async function triggerPortalInviteOnPayment(patientId: number): Promise<void> {
  try {
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, user: { select: { id: true } } },
    });

    if (!patient) return;
    if (patient.user) return; // Already has portal access

    const result = await createAndSendPortalInvite(patientId, 'first_payment', {
      channel: 'both',
    });

    if (result.success) {
      logger.info('[PortalInvite] Auto-invite sent on payment', { patientId });
    } else if (result.error !== 'Patient already has portal access') {
      logger.warn('[PortalInvite] Auto-invite on payment skipped', {
        patientId,
        reason: result.error,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.warn('[PortalInvite] Auto-invite on payment failed (non-fatal)', {
      patientId,
      error: msg,
    });
  }
}

export interface ValidateInviteTokenResult {
  patientId: number;
  clinicId: number;
  patient: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    dob: string;
    clinicId: number;
  };
}

/**
 * Validate a one-time invite token. Returns patient info if valid and not used/expired.
 */
export async function validateInviteToken(
  plainToken: string
): Promise<ValidateInviteTokenResult | null> {
  if (!plainToken || plainToken.length < 32) return null;
  const tokenHash = hashToken(plainToken);

  const invite = await prisma.patientPortalInvite.findUnique({
    where: { tokenHash },
    include: {
      patient: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          dob: true,
          clinicId: true,
          user: { select: { id: true } },
        },
      },
    },
  });

  if (!invite || invite.usedAt || invite.expiresAt < new Date()) return null;
  if (invite.patient.user) return null; // Already has portal access

  const raw = invite.patient as unknown as Record<string, unknown>;
  const decrypted = decryptPatientPHI(raw, [...DEFAULT_PHI_FIELDS]);

  return {
    patientId: invite.patient.id,
    clinicId: invite.patient.clinicId,
    patient: {
      id: invite.patient.id,
      email: String(decrypted.email ?? ''),
      firstName: String(decrypted.firstName ?? ''),
      lastName: String(decrypted.lastName ?? ''),
      phone: String(decrypted.phone ?? ''),
      dob: String(decrypted.dob ?? ''),
      clinicId: invite.patient.clinicId,
    },
  };
}

/**
 * Mark an invite token as used (after successful registration).
 */
export async function markInviteTokenUsed(plainToken: string): Promise<boolean> {
  const tokenHash = hashToken(plainToken);
  const updated = await prisma.patientPortalInvite.updateMany({
    where: { tokenHash, usedAt: null },
    data: { usedAt: new Date() },
  });
  return updated.count > 0;
}
