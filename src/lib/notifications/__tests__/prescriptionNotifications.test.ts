/**
 * Unit tests for notifyPrescriptionReady
 * ======================================
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
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
const sendPrescriptionReadyEmail = vi.fn();
vi.mock('@/lib/email/automations', () => ({
  AutomationTrigger: {
    PAYMENT_RECEIVED: 'payment_received',
    PRESCRIPTION_READY: 'prescription_ready',
  },
  sendPaymentReceivedEmail: vi.fn(),
  sendPrescriptionReadyEmail: (...args: unknown[]) =>
    sendPrescriptionReadyEmail(...(args as Parameters<typeof sendPrescriptionReadyEmail>)),
  getAutomationConfig: (...args: unknown[]) =>
    getAutomationConfig(...(args as Parameters<typeof getAutomationConfig>)),
}));

const sendPrescriptionReady = vi.fn();
vi.mock('@/lib/integrations/twilio/smsService', () => ({
  sendPaymentReceivedSMS: vi.fn(),
  sendPrescriptionReady: (...args: unknown[]) =>
    sendPrescriptionReady(...(args as Parameters<typeof sendPrescriptionReady>)),
}));

const prescriptionReadyEvent = vi.fn();
vi.mock('@/services/notification/notificationEvents', () => ({
  notificationEvents: {
    prescriptionReady: (...args: unknown[]) =>
      prescriptionReadyEvent(...(args as Parameters<typeof prescriptionReadyEvent>)),
  },
}));

import { notifyPrescriptionReady } from '../prescriptionNotifications';

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

describe('notifyPrescriptionReady', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    patientFindUnique.mockResolvedValue(PATIENT);
    notificationFindFirst.mockResolvedValue(null);
    notificationCreate.mockResolvedValue({ id: 1 });
    getAutomationConfig.mockResolvedValue({
      trigger: 'prescription_ready',
      enabled: true,
      smsEnabled: true,
      recipientType: 'patient',
    });
    sendPrescriptionReadyEmail.mockResolvedValue({ success: true });
    sendPrescriptionReady.mockResolvedValue({ success: true });
    prescriptionReadyEvent.mockResolvedValue(undefined);
  });

  it('fires email, SMS, and admin notification when all toggles are on', async () => {
    const result = await notifyPrescriptionReady({
      patientId: 42,
      prescriptionRef: 'invoice-100',
      medicationName: 'Semaglutide 0.5mg',
      source: 'invoice',
      sourceEntityId: 100,
      providerId: 5,
    });

    expect(sendPrescriptionReadyEmail).toHaveBeenCalledWith({
      patientEmail: 'jane@example.com',
      patientName: 'Jane Smith',
      medicationName: 'Semaglutide 0.5mg',
    });
    expect(sendPrescriptionReady).toHaveBeenCalledWith(42, 'invoice-100');
    expect(prescriptionReadyEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: 7,
        patientId: 42,
        medicationName: 'Semaglutide 0.5mg',
      })
    );
    expect(result.email.success).toBe(true);
    expect(result.sms.success).toBe(true);
    expect(result.adminNotified).toBe(true);
  });

  it('skips duplicate delivery on replay via the idempotency row', async () => {
    await notifyPrescriptionReady({
      patientId: 42,
      prescriptionRef: 'invoice-100',
      medicationName: 'Sema',
      source: 'invoice',
      sourceEntityId: 100,
    });
    expect(sendPrescriptionReady).toHaveBeenCalledTimes(1);

    notificationFindFirst.mockResolvedValueOnce({ id: 1 });
    const replay = await notifyPrescriptionReady({
      patientId: 42,
      prescriptionRef: 'invoice-100',
      medicationName: 'Sema',
      source: 'invoice',
      sourceEntityId: 100,
    });
    expect(replay.skipped).toBe('duplicate');
    expect(sendPrescriptionReady).toHaveBeenCalledTimes(1);
    expect(sendPrescriptionReadyEmail).toHaveBeenCalledTimes(1);
  });

  it('respects smsEnabled=false for the clinic', async () => {
    getAutomationConfig.mockResolvedValueOnce({
      trigger: 'prescription_ready',
      enabled: true,
      smsEnabled: false,
      recipientType: 'patient',
    });

    const result = await notifyPrescriptionReady({
      patientId: 42,
      prescriptionRef: 'invoice-100',
      medicationName: 'Sema',
      source: 'invoice',
      sourceEntityId: 100,
    });
    expect(sendPrescriptionReady).not.toHaveBeenCalled();
    expect(sendPrescriptionReadyEmail).toHaveBeenCalled();
    expect(result.sms.attempted).toBe(false);
  });

  it('does not throw when email errors', async () => {
    sendPrescriptionReadyEmail.mockRejectedValueOnce(new Error('SES down'));
    const result = await notifyPrescriptionReady({
      patientId: 42,
      prescriptionRef: 'refill-50',
      medicationName: 'Sema',
      source: 'refill',
      sourceEntityId: 50,
    });
    expect(result.email.success).toBe(false);
    expect(result.sms.attempted).toBe(true);
  });

  it('does not throw when SMS errors', async () => {
    sendPrescriptionReady.mockRejectedValueOnce(new Error('Twilio 429'));
    const result = await notifyPrescriptionReady({
      patientId: 42,
      prescriptionRef: 'refill-50',
      medicationName: 'Sema',
      source: 'refill',
      sourceEntityId: 50,
    });
    expect(result.sms.success).toBe(false);
    expect(result.email.attempted).toBe(true);
  });

  it('skips when patient has neither email nor phone', async () => {
    patientFindUnique.mockResolvedValueOnce({ ...PATIENT, email: '', phone: '' });
    const result = await notifyPrescriptionReady({
      patientId: 42,
      prescriptionRef: 'invoice-100',
      medicationName: 'Sema',
      source: 'invoice',
      sourceEntityId: 100,
    });
    expect(result.skipped).toBe('no_contact');
    expect(sendPrescriptionReadyEmail).not.toHaveBeenCalled();
    expect(sendPrescriptionReady).not.toHaveBeenCalled();
  });
});
