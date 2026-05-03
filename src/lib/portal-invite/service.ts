/**
 * Patient Portal Invite Service
 * =============================
 * Creates one-time invite tokens and sends "Create your portal account" via email or SMS.
 * Used by: manual "Send portal invite" from admin, auto-invite on first payment/order.
 */

import crypto from 'crypto';
import * as Sentry from '@sentry/nextjs';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { sendTemplatedEmail, EmailTemplate } from '@/lib/email';
import { decryptPatientPHI, DEFAULT_PHI_FIELDS } from '@/lib/security/phi-encryption';
import { sendSMS, formatPhoneNumber } from '@/lib/integrations/twilio/smsService';
import { getClinicUrl } from '@/lib/clinic/utils';
import { alertWarning } from '@/lib/observability/slack-alerts';

const TOKEN_BYTES = 32;
const INVITE_EXPIRY_DAYS = 7;

/** Production base domain for invite links. Never send localhost to patients. */
const INVITE_LINK_BASE_DOMAIN =
  process.env.PATIENT_PORTAL_INVITE_BASE_DOMAIN ||
  process.env.NEXT_PUBLIC_BASE_DOMAIN ||
  'eonpro.io';

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
        clinic: { select: { name: true, subdomain: true, customDomain: true } },
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

    // Phase 3.1: Manual resend MUST invalidate any prior unused tokens for this patient
    // before issuing a new one. Otherwise the patient could click an old link (or worse,
    // a leaked old link) and bypass the staff-initiated re-issue. Auto-triggers don't
    // hit this path because of the idempotency check above.
    if (trigger === 'manual') {
      try {
        const invalidated = await prisma.patientPortalInvite.updateMany({
          where: {
            patientId,
            usedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { usedAt: new Date() },
        });
        if (invalidated.count > 0) {
          logger.info('[PortalInvite] Invalidated prior unused tokens before manual resend', {
            patientId,
            invalidatedCount: invalidated.count,
          });
        }
      } catch (invalidateErr) {
        // Non-fatal: if invalidation fails the new token still works; the old one remains
        // valid until expiry but is harmless (single-use, expires in 7 days).
        logger.warn('[PortalInvite] Prior-token invalidation failed (non-fatal)', {
          patientId,
          error: invalidateErr instanceof Error ? invalidateErr.message : 'Unknown',
        });
      }
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

    // Use the patient's clinic subdomain only (e.g. wellmedr.eonpro.io). Do not use customDomain
    // for invite links so we never send unreachable domains like portal.wellmedr.com.
    let clinicPortalBase = patient.clinic?.subdomain
      ? getClinicUrl(patient.clinic.subdomain, undefined)
      : undefined;
    // Never send localhost to patients. If we got localhost (dev or misconfigured env), use production subdomain URL.
    if (clinicPortalBase && clinicPortalBase.includes('localhost')) {
      const baseDomain = INVITE_LINK_BASE_DOMAIN.includes('localhost')
        ? 'eonpro.io'
        : INVITE_LINK_BASE_DOMAIN;
      clinicPortalBase = baseDomain.includes(':')
        ? `https://${patient.clinic?.subdomain ?? 'app'}.eonpro.io`
        : `https://${patient.clinic?.subdomain ?? 'app'}.${baseDomain}`;
    }
    const baseUrl =
      (clinicPortalBase && clinicPortalBase.replace(/\/$/, '')) ||
      (options?.baseUrlOverride && options.baseUrlOverride.replace(/\/$/, '')) ||
      process.env.APP_URL ||
      process.env.NEXTAUTH_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      (typeof window !== 'undefined' ? `${window.location.origin}` : 'https://app.eonpro.io');
    // Final safety: if baseUrl is still localhost, force production patient portal URL for known subdomains
    const finalBaseUrl = (() => {
      if (baseUrl.includes('localhost')) {
        const sub = patient.clinic?.subdomain ?? 'app';
        return `https://${sub}.eonpro.io`;
      }
      return baseUrl;
    })();
    const inviteLink = `${finalBaseUrl}/patient-login?invite=${encodeURIComponent(plainToken)}`;

    const firstName = (decrypted.firstName || 'Patient').trim();
    // Strip " LLC" from clinic name for patient-facing copy (e.g. "Wellmedr LLC" → "Wellmedr").
    const clinicName =
      (patient.clinic?.name || 'Your Clinic').replace(/\s+LLC\.?$/i, '').trim() ||
      patient.clinic?.name ||
      'Your Clinic';

    const sendEmail = (channel === 'email' || channel === 'both') && !!email;
    const sendSms = (channel === 'sms' || channel === 'both') && !!phone;

    let emailDelivered = false;
    let smsDelivered = false;
    let lastEmailError: string | undefined;
    let lastSmsError: string | undefined;

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
        lastEmailError = emailResult.error ?? 'Failed to send email.';
        logger.warn('[PortalInvite] Email send failed', {
          patientId,
          error: lastEmailError,
        });
      } else {
        emailDelivered = true;
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
        lastSmsError = smsResult.blocked
          ? (smsResult.blockReason ?? smsResult.error ?? 'SMS blocked')
          : (smsResult.error ?? 'SMS send failed');
        logger.warn('[PortalInvite] SMS send failed', { patientId, error: lastSmsError });
      } else {
        smsDelivered = true;
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

    // Determine final delivery outcome.
    // - 'email' or 'sms' channel: success requires that single channel to deliver.
    // - 'both' channel: success requires AT LEAST ONE channel to deliver.
    const requiredEmail = channel === 'email';
    const requiredSms = channel === 'sms';
    const allDeliveriesFailed =
      (requiredEmail && !emailDelivered) ||
      (requiredSms && !smsDelivered) ||
      (channel === 'both' && !emailDelivered && !smsDelivered);

    if (allDeliveriesFailed) {
      const aggregateError =
        channel === 'both'
          ? `Email: ${lastEmailError ?? 'not attempted'} | SMS: ${lastSmsError ?? 'not attempted'}`
          : (lastEmailError ?? lastSmsError ?? 'Failed to send invite.');

      // Phase 2.1 tripwire: an automated trigger means a patient just paid (or
      // ordered) and we owe them a portal invite. If delivery failed AND the
      // failure is not a known benign skip (e.g. patient has no contact info,
      // already has portal access — those are surfaced earlier and don't reach
      // here), page operators so the gap doesn't accumulate silently the way
      // the WellMedR subscription leak did in May 2026.
      if (trigger !== 'manual') {
        emitPortalInviteFailureTripwire({
          patientId,
          clinicId: patient.clinicId,
          trigger,
          channel,
          emailDelivered,
          smsDelivered,
          lastEmailError,
          lastSmsError,
        });
      }

      return { success: false, error: aggregateError };
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
 * Phase 2.1 tripwire helper. Pages operators when an automated portal-invite
 * delivery fails. Manual triggers are excluded — the operator already sees
 * the API response. Benign skips ("Patient already has portal access",
 * "Patient not found", "no email or phone") return early before this point.
 *
 * Always non-fatal: Sentry/Slack failures are logged but never re-thrown so
 * that a degraded observability path can never block the (already-failed)
 * invite caller.
 */
function emitPortalInviteFailureTripwire(ctx: {
  patientId: number;
  clinicId: number;
  trigger: PortalInviteTrigger;
  channel: PortalInviteChannel;
  emailDelivered: boolean;
  smsDelivered: boolean;
  lastEmailError: string | undefined;
  lastSmsError: string | undefined;
}): void {
  try {
    Sentry.captureMessage('Portal invite auto-send failed', {
      level: 'error',
      tags: {
        regression: 'portal-invite-auto-send-failed',
        trigger: ctx.trigger,
        channel: ctx.channel,
      },
      extra: {
        patientId: ctx.patientId,
        clinicId: ctx.clinicId,
        trigger: ctx.trigger,
        channel: ctx.channel,
        emailDelivered: ctx.emailDelivered,
        smsDelivered: ctx.smsDelivered,
        lastEmailError: ctx.lastEmailError,
        lastSmsError: ctx.lastSmsError,
      },
    });
  } catch (sentryErr) {
    logger.warn('[PortalInvite] Sentry tripwire failed (non-fatal)', {
      patientId: ctx.patientId,
      error: sentryErr instanceof Error ? sentryErr.message : 'Unknown',
    });
  }

  alertWarning(
    'Patient portal invite auto-send failed',
    `Trigger: ${ctx.trigger}. Channel: ${ctx.channel}. Patient just paid/ordered but did not receive an invite. Email delivered: ${ctx.emailDelivered}. SMS delivered: ${ctx.smsDelivered}.`,
    {
      patientId: ctx.patientId,
      clinicId: ctx.clinicId,
      trigger: ctx.trigger,
      channel: ctx.channel,
      lastEmailError: ctx.lastEmailError,
      lastSmsError: ctx.lastSmsError,
    }
  ).catch((alertErr) => {
    logger.warn('[PortalInvite] Slack alert failed (non-fatal)', {
      patientId: ctx.patientId,
      error: alertErr instanceof Error ? alertErr.message : 'Unknown',
    });
  });
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
