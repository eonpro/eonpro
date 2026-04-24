/**
 * Unit tests for notifyPaymentReceived
 * ====================================
 *
 * Exercises the per-channel error isolation, idempotency, clinic-scoped
 * toggle, and PHI-decryption contract of the orchestrator.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Module mocks ----------------------------------------------------------

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const patientFindUnique = vi.fn();
const notificationFindFirst = vi.fn();
const notificationCreate = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    patient: { findUnique: (...args: unknown[]) => patientFindUnique(...args) },
    notification: {
      findFirst: (...args: unknown[]) => notificationFindFirst(...args),
      create: (...args: unknown[]) => notificationCreate(...args),
    },
  },
}));

vi.mock('@/lib/security/phi-encryption', () => ({
  decryptPatientPHI: (patient: Record<string, unknown>) => ({ ...patient }),
  DEFAULT_PHI_FIELDS: ['firstName', 'lastName', 'email', 'phone'],
}));

const getAutomationConfig = vi.fn();
const sendPaymentReceivedEmail = vi.fn();
vi.mock('@/lib/email/automations', () => ({
  AutomationTrigger: {
    PAYMENT_RECEIVED: 'payment_received',
    PRESCRIPTION_READY: 'prescription_ready',
  },
  sendPaymentReceivedEmail: (...args: unknown[]) =>
    sendPaymentReceivedEmail(...(args as Parameters<typeof sendPaymentReceivedEmail>)),
  sendPrescriptionReadyEmail: vi.fn(),
  getAutomationConfig: (...args: unknown[]) =>
    getAutomationConfig(...(args as Parameters<typeof getAutomationConfig>)),
}));

const sendPaymentReceivedSMS = vi.fn();
vi.mock('@/lib/integrations/twilio/smsService', () => ({
  sendPaymentReceivedSMS: (...args: unknown[]) =>
    sendPaymentReceivedSMS(...(args as Parameters<typeof sendPaymentReceivedSMS>)),
  sendPrescriptionReady: vi.fn(),
}));

const triggerPortalInviteOnPayment = vi.fn();
vi.mock('@/lib/portal-invite/service', () => ({
  triggerPortalInviteOnPayment: (...args: unknown[]) =>
    triggerPortalInviteOnPayment(...(args as Parameters<typeof triggerPortalInviteOnPayment>)),
}));

// --- System under test ------------------------------------------------------
import { notifyPaymentReceived } from '../paymentNotifications';

const PATIENT = {
  id: 42,
  clinicId: 7,
  firstName: 'Jane',
  lastName: 'Smith',
  email: 'jane@example.com',
  phone: '+15551234567',
  smsConsent: true,
  user: { id: 99 },
};

describe('notifyPaymentReceived', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    patientFindUnique.mockResolvedValue(PATIENT);
    notificationFindFirst.mockResolvedValue(null);
    notificationCreate.mockResolvedValue({ id: 1 });
    getAutomationConfig.mockResolvedValue({
      trigger: 'payment_received',
      enabled: true,
      smsEnabled: true,
      recipientType: 'patient',
    });
    triggerPortalInviteOnPayment.mockResolvedValue(undefined);
    sendPaymentReceivedEmail.mockResolvedValue({ success: true });
    sendPaymentReceivedSMS.mockResolvedValue({ success: true });
  });

  it('fires portal invite, email, and SMS when all toggles are on', async () => {
    const result = await notifyPaymentReceived({
      patientId: 42,
      invoiceId: 100,
      amountCents: 29900,
      paymentSource: 'stripe_connect_pi',
    });

    expect(triggerPortalInviteOnPayment).toHaveBeenCalledWith(42);
    expect(sendPaymentReceivedEmail).toHaveBeenCalledWith({
      customerEmail: 'jane@example.com',
      customerName: 'Jane Smith',
      amount: 299.0,
      invoiceNumber: '100',
    });
    expect(sendPaymentReceivedSMS).toHaveBeenCalledWith(42, {
      amountFormatted: '299.00',
      invoiceNumber: '100',
    });
    expect(result.portalInvite.success).toBe(true);
    expect(result.email.success).toBe(true);
    expect(result.sms.success).toBe(true);
    expect(result.skipped).toBeUndefined();
  });

  it('writes a Notification row for idempotency and skips on replay', async () => {
    // First call: no prior Notification → acquire lock + send
    const first = await notifyPaymentReceived({
      patientId: 42,
      invoiceId: 100,
      amountCents: 29900,
      paymentSource: 'stripe_connect_pi',
    });
    expect(notificationCreate).toHaveBeenCalledTimes(1);
    expect(sendPaymentReceivedEmail).toHaveBeenCalledTimes(1);
    expect(first.skipped).toBeUndefined();

    // Simulate replay — Notification row now exists.
    notificationFindFirst.mockResolvedValueOnce({ id: 1 });
    const second = await notifyPaymentReceived({
      patientId: 42,
      invoiceId: 100,
      amountCents: 29900,
      paymentSource: 'airtable_wellmedr_invoice',
    });
    expect(second.skipped).toBe('duplicate');
    // No additional comms should fire.
    expect(sendPaymentReceivedEmail).toHaveBeenCalledTimes(1);
    expect(sendPaymentReceivedSMS).toHaveBeenCalledTimes(1);
    expect(triggerPortalInviteOnPayment).toHaveBeenCalledTimes(1);
  });

  it('skips SMS channel when clinic toggle smsEnabled=false', async () => {
    getAutomationConfig.mockResolvedValueOnce({
      trigger: 'payment_received',
      enabled: true,
      smsEnabled: false,
      recipientType: 'patient',
    });

    const result = await notifyPaymentReceived({
      patientId: 42,
      invoiceId: 100,
      amountCents: 29900,
      paymentSource: 'stripe_connect_pi',
    });

    expect(sendPaymentReceivedEmail).toHaveBeenCalled();
    expect(sendPaymentReceivedSMS).not.toHaveBeenCalled();
    expect(result.sms.attempted).toBe(false);
  });

  it('skips email channel when clinic toggle enabled=false', async () => {
    getAutomationConfig.mockResolvedValueOnce({
      trigger: 'payment_received',
      enabled: false,
      smsEnabled: true,
      recipientType: 'patient',
    });

    await notifyPaymentReceived({
      patientId: 42,
      invoiceId: 100,
      amountCents: 29900,
      paymentSource: 'stripe_connect_pi',
    });
    expect(sendPaymentReceivedEmail).not.toHaveBeenCalled();
    // Portal invite and SMS still fire — they are separate primitives.
    expect(triggerPortalInviteOnPayment).toHaveBeenCalled();
    expect(sendPaymentReceivedSMS).toHaveBeenCalled();
  });

  it('does not throw when the email provider errors', async () => {
    sendPaymentReceivedEmail.mockRejectedValueOnce(new Error('SES down'));

    const result = await notifyPaymentReceived({
      patientId: 42,
      invoiceId: 100,
      amountCents: 29900,
      paymentSource: 'stripe_connect_pi',
    });
    expect(result.email.success).toBe(false);
    expect(result.email.error).toBe('SES down');
    // SMS and portal invite still attempted.
    expect(result.sms.attempted).toBe(true);
    expect(result.portalInvite.attempted).toBe(true);
  });

  it('does not throw when the SMS provider errors', async () => {
    sendPaymentReceivedSMS.mockRejectedValueOnce(new Error('Twilio rate limit'));

    const result = await notifyPaymentReceived({
      patientId: 42,
      invoiceId: 100,
      amountCents: 29900,
      paymentSource: 'stripe_connect_pi',
    });
    expect(result.sms.success).toBe(false);
    expect(result.sms.error).toBe('Twilio rate limit');
    // Email still attempted.
    expect(result.email.attempted).toBe(true);
  });

  it('skips entire delivery when patient has no email and no phone', async () => {
    patientFindUnique.mockResolvedValueOnce({
      ...PATIENT,
      email: '',
      phone: '',
    });

    const result = await notifyPaymentReceived({
      patientId: 42,
      invoiceId: 100,
      amountCents: 29900,
      paymentSource: 'stripe_connect_pi',
    });
    expect(result.skipped).toBe('no_email_and_no_phone');
    expect(sendPaymentReceivedEmail).not.toHaveBeenCalled();
    expect(sendPaymentReceivedSMS).not.toHaveBeenCalled();
  });

  it('never throws when the patient lookup crashes', async () => {
    patientFindUnique.mockRejectedValueOnce(new Error('DB offline'));

    await expect(
      notifyPaymentReceived({
        patientId: 42,
        invoiceId: 100,
        amountCents: 29900,
        paymentSource: 'stripe_connect_pi',
      })
    ).resolves.toBeDefined();
  });
});
