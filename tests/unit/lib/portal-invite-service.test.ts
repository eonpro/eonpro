/**
 * Patient Portal Invite Service — Behavior Tests
 * ===============================================
 *
 * Covers the 2026-05-03 hardening:
 *  1. Manual resend INVALIDATES prior unused tokens before issuing a new one.
 *     Phase 3.1 — prevents stale links from continuing to work after staff
 *     re-issues an invite at a patient's request.
 *  2. Auto-trigger send failures (trigger !== 'manual') fire Sentry
 *     captureMessage(level: 'error', regression: 'portal-invite-auto-send-failed')
 *     AND a Slack alertWarning so operators are notified that a patient who
 *     just paid will not receive an invite.
 *  3. Manual triggers do NOT fire the tripwire (operator already sees the
 *     API response, no need to spam #alerts).
 *  4. Benign skips ("Patient already has portal access", "Patient not found")
 *     are NOT treated as failures — those return success: true OR a known
 *     error string and must not page operators.
 *
 * Mock-based — does not hit the database or send real emails/SMS.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  patientFindUnique: vi.fn(),
  inviteFindFirst: vi.fn(),
  inviteCreate: vi.fn(),
  inviteUpdateMany: vi.fn(),
  chatCreate: vi.fn(),
  decryptPatientPHI: vi.fn(),
  sendTemplatedEmail: vi.fn(),
  sendSMS: vi.fn(),
  formatPhoneNumber: vi.fn((p: string) => p),
  getClinicUrl: vi.fn((sub: string) => `https://${sub}.eonpro.io`),
  sentryCaptureMessage: vi.fn(),
  alertWarning: vi.fn(),
  loggerWarn: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    patient: { findUnique: mocks.patientFindUnique },
    patientPortalInvite: {
      findFirst: mocks.inviteFindFirst,
      create: mocks.inviteCreate,
      updateMany: mocks.inviteUpdateMany,
    },
    patientChatMessage: { create: mocks.chatCreate },
  },
}));

vi.mock('@/lib/security/phi-encryption', () => ({
  decryptPatientPHI: mocks.decryptPatientPHI,
  DEFAULT_PHI_FIELDS: ['firstName', 'lastName', 'email', 'phone'],
}));

vi.mock('@/lib/email', () => ({
  sendTemplatedEmail: mocks.sendTemplatedEmail,
  EmailTemplate: { PATIENT_PORTAL_INVITE: 'patient_portal_invite' },
}));

vi.mock('@/lib/integrations/twilio/smsService', () => ({
  sendSMS: mocks.sendSMS,
  formatPhoneNumber: mocks.formatPhoneNumber,
}));

vi.mock('@/lib/clinic/utils', () => ({
  getClinicUrl: mocks.getClinicUrl,
}));

vi.mock('@sentry/nextjs', () => ({
  captureMessage: mocks.sentryCaptureMessage,
}));

vi.mock('@/lib/observability/slack-alerts', () => ({
  alertWarning: mocks.alertWarning,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    debug: vi.fn(),
    security: vi.fn(),
  },
}));

import { createAndSendPortalInvite } from '@/lib/portal-invite/service';

const PATIENT_ID = 4242;
const CLINIC_ID = 7;

function makePatient(overrides: Record<string, unknown> = {}) {
  return {
    id: PATIENT_ID,
    clinicId: CLINIC_ID,
    email: 'enc:patient@example.com',
    firstName: 'enc:Sarah',
    lastName: 'enc:Clark',
    phone: 'enc:+15551234567',
    user: null,
    clinic: { name: 'Wellmedr LLC', subdomain: 'wellmedr', customDomain: null },
    ...overrides,
  };
}

function makeDecrypted(overrides: Record<string, unknown> = {}) {
  return {
    id: PATIENT_ID,
    clinicId: CLINIC_ID,
    email: 'patient@example.com',
    firstName: 'Sarah',
    lastName: 'Clark',
    phone: '+15551234567',
    ...overrides,
  };
}

describe('createAndSendPortalInvite — manual resend invalidation (Phase 3.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.patientFindUnique.mockResolvedValue(makePatient());
    mocks.decryptPatientPHI.mockImplementation((p: any) => ({ ...p, ...makeDecrypted() }));
    mocks.inviteFindFirst.mockResolvedValue(null);
    mocks.inviteUpdateMany.mockResolvedValue({ count: 0 });
    mocks.inviteCreate.mockResolvedValue({ id: 1 });
    mocks.sendTemplatedEmail.mockResolvedValue({ success: true });
    mocks.sendSMS.mockResolvedValue({ success: true, messageId: 'sm_1' });
    mocks.chatCreate.mockResolvedValue({ id: 1 });
  });

  it('marks prior unused invites as used before issuing a new manual invite', async () => {
    const result = await createAndSendPortalInvite(PATIENT_ID, 'manual', { channel: 'email' });

    expect(result.success).toBe(true);
    // Phase 3.1 contract: invalidate prior unused/unexpired invites for THIS patient
    expect(mocks.inviteUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          patientId: PATIENT_ID,
          usedAt: null,
          expiresAt: { gt: expect.any(Date) },
        }),
        data: expect.objectContaining({ usedAt: expect.any(Date) }),
      })
    );
    // New invite still created
    expect(mocks.inviteCreate).toHaveBeenCalledTimes(1);
  });

  it('does NOT invalidate prior tokens for auto triggers (idempotency preserved)', async () => {
    // Auto trigger with existing unused invite → service short-circuits to success
    mocks.inviteFindFirst.mockResolvedValue({
      id: 99,
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    });

    const result = await createAndSendPortalInvite(PATIENT_ID, 'first_payment', {
      channel: 'both',
    });

    expect(result.success).toBe(true);
    expect(mocks.inviteUpdateMany).not.toHaveBeenCalled();
    expect(mocks.inviteCreate).not.toHaveBeenCalled();
  });
});

describe('createAndSendPortalInvite — auto-trigger tripwire (Phase 2.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.patientFindUnique.mockResolvedValue(makePatient());
    mocks.decryptPatientPHI.mockImplementation((p: any) => ({ ...p, ...makeDecrypted() }));
    mocks.inviteFindFirst.mockResolvedValue(null);
    mocks.inviteUpdateMany.mockResolvedValue({ count: 0 });
    mocks.inviteCreate.mockResolvedValue({ id: 1 });
    mocks.chatCreate.mockResolvedValue({ id: 1 });
  });

  it('fires Sentry + Slack when both email AND SMS fail on a first_payment trigger', async () => {
    mocks.sendTemplatedEmail.mockResolvedValue({ success: false, error: 'SES throttled' });
    mocks.sendSMS.mockResolvedValue({ success: false, error: 'Twilio 21610 (unsubscribed)' });

    const result = await createAndSendPortalInvite(PATIENT_ID, 'first_payment', {
      channel: 'both',
    });

    expect(result.success).toBe(false);
    expect(mocks.sentryCaptureMessage).toHaveBeenCalledTimes(1);
    const [msg, ctx] = mocks.sentryCaptureMessage.mock.calls[0];
    expect(msg).toMatch(/portal[- ]invite/i);
    expect(ctx).toEqual(
      expect.objectContaining({
        level: 'error',
        tags: expect.objectContaining({
          regression: 'portal-invite-auto-send-failed',
        }),
        extra: expect.objectContaining({
          patientId: PATIENT_ID,
          clinicId: CLINIC_ID,
          trigger: 'first_payment',
        }),
      })
    );
    expect(mocks.alertWarning).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire tripwire when manual send fails (operator sees the API response)', async () => {
    mocks.sendTemplatedEmail.mockResolvedValue({ success: false, error: 'SES throttled' });

    const result = await createAndSendPortalInvite(PATIENT_ID, 'manual', { channel: 'email' });

    expect(result.success).toBe(false);
    expect(mocks.sentryCaptureMessage).not.toHaveBeenCalled();
    expect(mocks.alertWarning).not.toHaveBeenCalled();
  });

  it('does NOT fire tripwire when patient already has portal access (benign skip)', async () => {
    mocks.patientFindUnique.mockResolvedValue(makePatient({ user: { id: 9 } }));

    const result = await createAndSendPortalInvite(PATIENT_ID, 'first_payment', {
      channel: 'both',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already has portal access/i);
    expect(mocks.sentryCaptureMessage).not.toHaveBeenCalled();
    expect(mocks.alertWarning).not.toHaveBeenCalled();
  });

  it('does NOT fire tripwire when patient not found (benign skip)', async () => {
    mocks.patientFindUnique.mockResolvedValue(null);

    const result = await createAndSendPortalInvite(PATIENT_ID, 'first_payment', {
      channel: 'both',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
    expect(mocks.sentryCaptureMessage).not.toHaveBeenCalled();
    expect(mocks.alertWarning).not.toHaveBeenCalled();
  });

  it('does NOT fire tripwire when patient has no email AND no phone (benign skip — actionable by staff, not engineers)', async () => {
    mocks.decryptPatientPHI.mockImplementation((p: any) => ({
      ...p,
      ...makeDecrypted({ email: '', phone: '' }),
    }));

    const result = await createAndSendPortalInvite(PATIENT_ID, 'first_payment', {
      channel: 'both',
    });

    expect(result.success).toBe(false);
    expect(mocks.sentryCaptureMessage).not.toHaveBeenCalled();
    expect(mocks.alertWarning).not.toHaveBeenCalled();
  });

  it('still succeeds (no tripwire) when email fails but SMS succeeds with channel:both', async () => {
    mocks.sendTemplatedEmail.mockResolvedValue({ success: false, error: 'SES throttled' });
    mocks.sendSMS.mockResolvedValue({ success: true, messageId: 'sm_1' });

    const result = await createAndSendPortalInvite(PATIENT_ID, 'first_payment', {
      channel: 'both',
    });

    expect(result.success).toBe(true);
    expect(mocks.sentryCaptureMessage).not.toHaveBeenCalled();
    expect(mocks.alertWarning).not.toHaveBeenCalled();
  });
});
