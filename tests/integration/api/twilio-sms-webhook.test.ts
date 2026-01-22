/**
 * Twilio SMS Webhook Integration Tests
 *
 * Tests incoming SMS handling for patient chat
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Prisma
const mockPrismaPatient = {
  findFirst: vi.fn(),
};

const mockPrismaChatMessage = {
  create: vi.fn(),
  findFirst: vi.fn(),
};

vi.mock('@/lib/db', () => ({
  basePrisma: {
    patient: mockPrismaPatient,
    patientChatMessage: mockPrismaChatMessage,
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@/lib/integrations/twilio/smsService', () => ({
  validatePhoneNumber: vi.fn(() => true),
  formatPhoneNumber: vi.fn((phone) => phone.startsWith('+') ? phone : `+1${phone}`),
}));

describe('Twilio Incoming SMS Webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'test';
  });

  describe('POST /api/webhooks/twilio/incoming-sms', () => {
    const mockPatient = {
      id: 1,
      firstName: 'John',
      lastName: 'Doe',
      phone: '+15551234567',
      clinicId: 1,
    };

    it('should create chat message from known patient SMS', async () => {
      mockPrismaPatient.findFirst.mockResolvedValue(mockPatient);
      mockPrismaChatMessage.findFirst.mockResolvedValue(null);
      mockPrismaChatMessage.create.mockResolvedValue({
        id: 1,
        patientId: 1,
        message: 'Hello from patient',
        direction: 'INBOUND',
        channel: 'SMS',
      });

      const { POST } = await import('@/app/api/webhooks/twilio/incoming-sms/route');

      // Create form-encoded body like Twilio sends
      const body = new URLSearchParams({
        From: '+15551234567',
        To: '+16623663631',
        Body: 'Hello from patient',
        MessageSid: 'SM123456',
        AccountSid: 'AC123456',
      }).toString();

      const request = new Request('http://localhost:3000/api/webhooks/twilio/incoming-sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });

      const response = await POST(request as any);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/xml');

      const responseText = await response.text();
      expect(responseText).toContain('<Response>');
      expect(responseText).toContain('Our team will respond shortly');

      // Verify message was created
      expect(mockPrismaChatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            patientId: 1,
            direction: 'INBOUND',
            channel: 'SMS',
            senderType: 'PATIENT',
          }),
        })
      );
    });

    it('should handle unknown phone number gracefully', async () => {
      mockPrismaPatient.findFirst.mockResolvedValue(null);

      const { POST } = await import('@/app/api/webhooks/twilio/incoming-sms/route');

      const body = new URLSearchParams({
        From: '+15559999999',
        To: '+16623663631',
        Body: 'Unknown sender',
        MessageSid: 'SM999999',
      }).toString();

      const request = new Request('http://localhost:3000/api/webhooks/twilio/incoming-sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });

      const response = await POST(request as any);

      expect(response.status).toBe(200);
      const responseText = await response.text();
      expect(responseText).toContain("couldn't find your account");

      // Should NOT create a message
      expect(mockPrismaChatMessage.create).not.toHaveBeenCalled();
    });

    it('should reject requests without required fields', async () => {
      const { POST } = await import('@/app/api/webhooks/twilio/incoming-sms/route');

      const body = new URLSearchParams({
        From: '+15551234567',
        // Missing Body
      }).toString();

      const request = new Request('http://localhost:3000/api/webhooks/twilio/incoming-sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });

      const response = await POST(request as any);

      expect(response.status).toBe(400);
    });

    it('should use existing thread if available', async () => {
      mockPrismaPatient.findFirst.mockResolvedValue(mockPatient);
      mockPrismaChatMessage.findFirst.mockResolvedValue({
        threadId: 'sms_1_existing_thread',
      });
      mockPrismaChatMessage.create.mockResolvedValue({ id: 2 });

      const { POST } = await import('@/app/api/webhooks/twilio/incoming-sms/route');

      const body = new URLSearchParams({
        From: '+15551234567',
        Body: 'Follow up message',
        MessageSid: 'SM789',
      }).toString();

      const request = new Request('http://localhost:3000/api/webhooks/twilio/incoming-sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });

      await POST(request as any);

      // Should use existing thread
      expect(mockPrismaChatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            threadId: 'sms_1_existing_thread',
          }),
        })
      );
    });
  });
});
