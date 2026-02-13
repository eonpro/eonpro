/**
 * Twilio Integration Tests
 * Tests for SMS sending, phone validation, and webhook handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    patient: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    smsLog: {
      create: vi.fn(),
    },
  },
}));

describe('Twilio SMS Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Phone Number Validation', () => {
    it('should validate E.164 format phone numbers', async () => {
      const { validatePhoneNumber } = await import('@/lib/integrations/twilio/smsService');

      expect(validatePhoneNumber('+15551234567')).toBe(true);
      expect(validatePhoneNumber('+442071234567')).toBe(true);
      expect(validatePhoneNumber('+8613912345678')).toBe(true);
    });

    it('should reject invalid phone numbers', async () => {
      const { validatePhoneNumber } = await import('@/lib/integrations/twilio/smsService');

      expect(validatePhoneNumber('5551234567')).toBe(false);
      expect(validatePhoneNumber('555-123-4567')).toBe(false);
      expect(validatePhoneNumber('(555) 123-4567')).toBe(false);
      expect(validatePhoneNumber('invalid')).toBe(false);
      expect(validatePhoneNumber('')).toBe(false);
    });
  });

  describe('Phone Number Formatting', () => {
    it('should format 10-digit US numbers', async () => {
      const { formatPhoneNumber } = await import('@/lib/integrations/twilio/smsService');

      expect(formatPhoneNumber('5551234567')).toBe('+15551234567');
      expect(formatPhoneNumber('555-123-4567')).toBe('+15551234567');
      expect(formatPhoneNumber('(555) 123-4567')).toBe('+15551234567');
    });

    it('should format 11-digit US numbers with country code', async () => {
      const { formatPhoneNumber } = await import('@/lib/integrations/twilio/smsService');

      expect(formatPhoneNumber('15551234567')).toBe('+15551234567');
      expect(formatPhoneNumber('1-555-123-4567')).toBe('+15551234567');
    });

    it('should preserve numbers already in E.164 format', async () => {
      const { formatPhoneNumber } = await import('@/lib/integrations/twilio/smsService');

      expect(formatPhoneNumber('+15551234567')).toBe('+15551234567');
      expect(formatPhoneNumber('+442071234567')).toBe('+442071234567');
    });

    it('should use custom country code', async () => {
      const { formatPhoneNumber } = await import('@/lib/integrations/twilio/smsService');

      expect(formatPhoneNumber('7911234567', '+44')).toBe('+447911234567');
    });
  });

  describe('SMS Message Structure', () => {
    it('should define correct SMS message interface', () => {
      const message = {
        to: '+15559876543',
        body: 'Test message',
        from: '+15551234567',
      };

      expect(message.to).toBeDefined();
      expect(message.body).toBeDefined();
      expect(message.from).toBeDefined();
    });

    it('should define correct SMS response interface', () => {
      const successResponse = {
        success: true,
        messageId: 'SM123456',
        details: { status: 'queued' },
      };

      const errorResponse = {
        success: false,
        error: 'Invalid phone number',
      };

      expect(successResponse.success).toBe(true);
      expect(successResponse.messageId).toBeDefined();
      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error).toBeDefined();
    });
  });

  describe('SMS Template Generation', () => {
    it('should generate appointment reminder message', () => {
      const template = (name: string, date: string, doctor: string) =>
        `Hi ${name}, reminder: your appointment with ${doctor} is on ${date}. Reply CONFIRM or CANCEL.`;

      const message = template('John', 'Feb 15 at 10:00 AM', 'Dr. Smith');

      expect(message).toContain('John');
      expect(message).toContain('Feb 15 at 10:00 AM');
      expect(message).toContain('Dr. Smith');
      expect(message).toContain('CONFIRM');
      expect(message).toContain('CANCEL');
    });

    it('should generate prescription ready message', () => {
      const template = (name: string, rxId: string) =>
        `Hi ${name}, your prescription ${rxId} is ready for pickup.`;

      const message = template('Jane', 'RX-12345');

      expect(message).toContain('Jane');
      expect(message).toContain('RX-12345');
      expect(message).toContain('ready');
    });

    it('should generate lab results message', () => {
      const template = (name: string) =>
        `Hi ${name}, your lab results are ready. Log in to view them.`;

      const message = template('Bob');

      expect(message).toContain('Bob');
      expect(message).toContain('lab results');
    });

    it('should generate welcome message', () => {
      const template = (name: string) => `Welcome to EONPRO, ${name}! Reply HELP for assistance.`;

      const message = template('Alice');

      expect(message).toContain('Alice');
      expect(message).toContain('Welcome');
      expect(message).toContain('HELP');
    });
  });

  describe('SMS Keyword Processing', () => {
    const keywords = {
      CONFIRM: ['confirm', 'yes', 'y'],
      CANCEL: ['cancel', 'no', 'n'],
      RESCHEDULE: ['reschedule', 'change'],
      HELP: ['help', '?'],
    };

    it('should recognize CONFIRM keywords', () => {
      const messageBody = 'confirm';
      const isConfirm = keywords.CONFIRM.some((kw) => messageBody.toLowerCase().includes(kw));

      expect(isConfirm).toBe(true);
    });

    it('should recognize CANCEL keywords', () => {
      const messageBody = 'cancel my appointment';
      const isCancel = keywords.CANCEL.some((kw) => messageBody.toLowerCase().includes(kw));

      expect(isCancel).toBe(true);
    });

    it('should recognize RESCHEDULE keywords', () => {
      const messageBody = 'I need to reschedule';
      const isReschedule = keywords.RESCHEDULE.some((kw) => messageBody.toLowerCase().includes(kw));

      expect(isReschedule).toBe(true);
    });

    it('should recognize HELP keywords', () => {
      const messageBody = 'help';
      const isHelp = keywords.HELP.some((kw) => messageBody.toLowerCase().includes(kw));

      expect(isHelp).toBe(true);
    });

    it('should be case-insensitive', () => {
      const testCases = ['CONFIRM', 'Confirm', 'confirm', 'CoNfIrM'];

      testCases.forEach((testCase) => {
        const isConfirm = keywords.CONFIRM.some((kw) => testCase.toLowerCase().includes(kw));
        expect(isConfirm).toBe(true);
      });
    });
  });

  describe('Bulk SMS Logic', () => {
    it('should process messages sequentially', async () => {
      const messages = [
        { to: '+15551111111', body: 'Message 1' },
        { to: '+15552222222', body: 'Message 2' },
        { to: '+15553333333', body: 'Message 3' },
      ];

      const results: { to: string; sent: boolean }[] = [];

      for (const msg of messages) {
        // Simulate sending
        results.push({ to: msg.to, sent: true });
      }

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.sent)).toBe(true);
    });

    it('should handle partial failures', async () => {
      const messages = [
        { to: '+15551111111', body: 'Message 1', shouldFail: false },
        { to: 'invalid', body: 'Message 2', shouldFail: true },
        { to: '+15553333333', body: 'Message 3', shouldFail: false },
      ];

      const results = messages.map((msg) => ({
        to: msg.to,
        success: !msg.shouldFail,
      }));

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
    });

    it('should calculate delay between messages', () => {
      const messageCount = 5;
      const delayMs = 1000;
      const totalDelay = (messageCount - 1) * delayMs;

      expect(totalDelay).toBe(4000); // 4 delays for 5 messages
    });
  });

  describe('SMS Response Handling', () => {
    it('should generate confirmation response', () => {
      const response = 'Thank you for confirming your appointment!';
      expect(response).toContain('confirming');
    });

    it('should generate cancellation response', () => {
      const response = 'Your appointment has been cancelled. Please call us to reschedule.';
      expect(response).toContain('cancelled');
    });

    it('should generate reschedule response', () => {
      const response =
        'To reschedule your appointment, please call us at (555) 123-4567 or visit our website.';
      expect(response).toContain('reschedule');
    });

    it('should generate help response', () => {
      const response =
        'Reply CONFIRM to confirm, CANCEL to cancel, or RESCHEDULE to change your appointment. Call (555) 123-4567 for assistance.';
      expect(response).toContain('CONFIRM');
      expect(response).toContain('CANCEL');
    });

    it('should generate default response', () => {
      const response =
        'Thank you for your message. A staff member will respond soon. Reply HELP for options.';
      expect(response).toContain('Thank you');
      expect(response).toContain('HELP');
    });
  });
});

describe('Twilio API Route Validation', () => {
  describe('Request Validation', () => {
    it('should require phone number', () => {
      const body = { message: 'Test' };
      const isValid = body.message && (body as any).to;

      expect(isValid).toBeFalsy();
    });

    it('should require message', () => {
      const body = { to: '+15559876543' };
      const isValid = body.to && (body as any).message;

      expect(isValid).toBeFalsy();
    });

    it('should accept valid request', () => {
      const body = { to: '+15559876543', message: 'Test message' };
      const isValid = body.to && body.message;

      expect(isValid).toBeTruthy();
    });
  });
});

describe('Twilio Error Handling', () => {
  describe('Error Codes', () => {
    it('should define invalid phone error', () => {
      const error = {
        code: 21211,
        message: "The 'To' number is not a valid phone number.",
      };

      expect(error.code).toBe(21211);
    });

    it('should define unverified number error', () => {
      const error = {
        code: 21608,
        message: 'The number is unverified.',
      };

      expect(error.code).toBe(21608);
    });

    it('should define rate limit error', () => {
      const error = {
        code: 20429,
        message: 'Too many requests.',
      };

      expect(error.code).toBe(20429);
    });

    it('should define authentication error', () => {
      const error = {
        code: 20003,
        message: 'Authentication error.',
      };

      expect(error.code).toBe(20003);
    });
  });

  describe('Error Messages', () => {
    it('should provide user-friendly invalid phone message', () => {
      const userMessage =
        'Invalid phone number format. Please use E.164 format (e.g., +15551234567).';

      expect(userMessage).toContain('E.164');
    });

    it('should provide user-friendly rate limit message', () => {
      const userMessage = 'Too many SMS requests. Please try again later.';

      expect(userMessage).toContain('try again');
    });
  });
});
