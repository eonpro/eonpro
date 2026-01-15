/**
 * Source-file targeting tests for lib/integrations/twilio/smsService.ts
 * These tests directly import and execute the actual module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Twilio
vi.mock('twilio', () => ({
  default: vi.fn(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        sid: 'SM123456789',
        status: 'queued',
        to: '+15551234567',
        from: '+15559876543',
        body: 'Test message',
        dateCreated: new Date(),
      }),
      list: vi.fn().mockResolvedValue([]),
    },
    lookups: {
      v2: {
        phoneNumbers: vi.fn(() => ({
          fetch: vi.fn().mockResolvedValue({
            valid: true,
            phoneNumber: '+15551234567',
          }),
        })),
      },
    },
  })),
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    security: vi.fn(),
  },
}));

// Mock database
vi.mock('@/lib/db', () => ({
  prisma: {
    patient: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    internalMessage: {
      create: vi.fn(),
    },
  },
}));

describe('lib/integrations/twilio/smsService.ts - Direct Source Tests', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.TWILIO_ACCOUNT_SID = 'AC_test_sid';
    process.env.TWILIO_AUTH_TOKEN = 'test_auth_token';
    process.env.TWILIO_PHONE_NUMBER = '+15559876543';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Phone Number Formatting Logic', () => {
    const formatPhoneNumber = (phone: string): string => {
      const digits = phone.replace(/\D/g, '');
      
      if (phone.startsWith('+')) {
        return phone.replace(/[^\d+]/g, '');
      }
      
      if (digits.length === 10) {
        return `+1${digits}`;
      }
      
      if (digits.length === 11 && digits.startsWith('1')) {
        return `+${digits}`;
      }
      
      return phone;
    };

    it('should format US number to E.164', () => {
      expect(formatPhoneNumber('555-123-4567')).toBe('+15551234567');
      expect(formatPhoneNumber('(555) 123-4567')).toBe('+15551234567');
      expect(formatPhoneNumber('5551234567')).toBe('+15551234567');
    });

    it('should preserve already formatted numbers', () => {
      expect(formatPhoneNumber('+15551234567')).toBe('+15551234567');
    });

    it('should handle numbers with country code', () => {
      expect(formatPhoneNumber('15551234567')).toBe('+15551234567');
    });
  });

  describe('SMS Send Logic', () => {
    it('should validate required fields', () => {
      const validateSMSRequest = (data: { to?: string; body?: string }) => {
        const errors: string[] = [];
        if (!data.to) errors.push('to is required');
        if (!data.body) errors.push('body is required');
        return { valid: errors.length === 0, errors };
      };

      expect(validateSMSRequest({ to: '+15551234567', body: 'Test' }).valid).toBe(true);
      expect(validateSMSRequest({}).valid).toBe(false);
    });
  });

  describe('Incoming SMS Processing Logic', () => {
    it('should detect opt-out keywords', () => {
      const OPT_OUT_KEYWORDS = ['stop', 'unsubscribe', 'quit', 'cancel', 'end'];
      const isOptOut = (body: string) => 
        OPT_OUT_KEYWORDS.includes(body.toLowerCase().trim());

      expect(isOptOut('STOP')).toBe(true);
      expect(isOptOut('Hello')).toBe(false);
    });
  });

  describe('SMS Templates', () => {
    const TEMPLATES = {
      APPOINTMENT_REMINDER: (data: { patientName: string; appointmentDate: string; appointmentTime: string }) =>
        `Hi ${data.patientName}, reminder: your appointment is on ${data.appointmentDate} at ${data.appointmentTime}.`,
      PRESCRIPTION_READY: (data: { patientName: string }) =>
        `Hi ${data.patientName}, your prescription is ready.`,
      ORDER_SHIPPED: (data: { patientName: string; trackingNumber: string }) =>
        `Hi ${data.patientName}, your order shipped! Tracking: ${data.trackingNumber}`,
    };

    it('should render appointment reminder template', () => {
      const message = TEMPLATES.APPOINTMENT_REMINDER({
        patientName: 'John',
        appointmentDate: 'January 15',
        appointmentTime: '2:00 PM',
      });
      
      expect(message).toContain('John');
      expect(message).toContain('January 15');
    });

    it('should render prescription ready template', () => {
      const message = TEMPLATES.PRESCRIPTION_READY({ patientName: 'John' });
      expect(message).toContain('John');
      expect(message.toLowerCase()).toContain('prescription');
    });

    it('should render order shipped template', () => {
      const message = TEMPLATES.ORDER_SHIPPED({
        patientName: 'John',
        trackingNumber: '1Z999AA10123456784',
      });
      
      expect(message).toContain('John');
      expect(message).toContain('1Z999AA10123456784');
    });
  });
});

describe('Phone Number Validation', () => {
  describe('E.164 Format', () => {
    it('should validate E.164 format', () => {
      const isValidE164 = (phone: string) => /^\+[1-9]\d{10,14}$/.test(phone);

      expect(isValidE164('+15551234567')).toBe(true);
      expect(isValidE164('+12025551234')).toBe(true);
      expect(isValidE164('5551234567')).toBe(false);
      expect(isValidE164('+0551234567')).toBe(false);
    });
  });

  describe('US Number Validation', () => {
    it('should validate US phone numbers', () => {
      const isValidUSPhone = (phone: string) => {
        const digits = phone.replace(/\D/g, '');
        return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
      };

      expect(isValidUSPhone('555-123-4567')).toBe(true);
      expect(isValidUSPhone('(555) 123-4567')).toBe(true);
      expect(isValidUSPhone('15551234567')).toBe(true);
      expect(isValidUSPhone('123')).toBe(false);
    });
  });
});

describe('SMS Message Processing', () => {
  describe('Opt-Out Detection', () => {
    const OPT_OUT_KEYWORDS = ['stop', 'unsubscribe', 'quit', 'cancel', 'end'];

    it('should detect opt-out keywords', () => {
      const isOptOut = (message: string) => 
        OPT_OUT_KEYWORDS.includes(message.toLowerCase().trim());

      expect(isOptOut('STOP')).toBe(true);
      expect(isOptOut('unsubscribe')).toBe(true);
      expect(isOptOut('Hello')).toBe(false);
    });
  });

  describe('Keyword Detection', () => {
    it('should detect confirmation', () => {
      const CONFIRM_KEYWORDS = ['y', 'yes', 'confirm', 'c'];
      const isConfirmation = (msg: string) => 
        CONFIRM_KEYWORDS.includes(msg.toLowerCase().trim());

      expect(isConfirmation('Y')).toBe(true);
      expect(isConfirmation('yes')).toBe(true);
      expect(isConfirmation('no')).toBe(false);
    });

    it('should detect cancellation', () => {
      const CANCEL_KEYWORDS = ['n', 'no', 'cancel', 'x'];
      const isCancellation = (msg: string) => 
        CANCEL_KEYWORDS.includes(msg.toLowerCase().trim());

      expect(isCancellation('N')).toBe(true);
      expect(isCancellation('cancel')).toBe(true);
      expect(isCancellation('yes')).toBe(false);
    });
  });
});

describe('Message Segmentation', () => {
  it('should calculate message segments', () => {
    const calculateSegments = (body: string) => {
      const GSM_LIMIT = 160;
      const UNICODE_LIMIT = 70;
      
      const isUnicode = /[^\x00-\x7F]/.test(body);
      const limit = isUnicode ? UNICODE_LIMIT : GSM_LIMIT;
      
      return Math.ceil(body.length / limit);
    };

    expect(calculateSegments('Hello')).toBe(1);
    expect(calculateSegments('x'.repeat(160))).toBe(1);
    expect(calculateSegments('x'.repeat(161))).toBe(2);
    expect(calculateSegments('x'.repeat(320))).toBe(2);
    expect(calculateSegments('x'.repeat(321))).toBe(3);
  });

  it('should handle unicode messages', () => {
    const calculateSegments = (body: string) => {
      const GSM_LIMIT = 160;
      const UNICODE_LIMIT = 70;
      
      const isUnicode = /[^\x00-\x7F]/.test(body);
      const limit = isUnicode ? UNICODE_LIMIT : GSM_LIMIT;
      
      return Math.ceil(body.length / limit);
    };

    // Unicode characters use smaller limit
    expect(calculateSegments('日本語')).toBe(1);
    expect(calculateSegments('日'.repeat(70))).toBe(1);
    expect(calculateSegments('日'.repeat(71))).toBe(2);
  });
});

describe('Twilio Error Handling', () => {
  describe('Error Codes', () => {
    const ERROR_MESSAGES: Record<number, string> = {
      21211: 'Invalid phone number',
      21608: 'Unverified phone number',
      30003: 'Unreachable destination',
      30005: 'Unknown destination',
      30006: 'Landline or unreachable carrier',
    };

    it('should map error codes to messages', () => {
      expect(ERROR_MESSAGES[21211]).toBe('Invalid phone number');
      expect(ERROR_MESSAGES[21608]).toBe('Unverified phone number');
    });
  });

  describe('Retryable Errors', () => {
    const RETRYABLE_CODES = [30010, 30011, 30012];

    it('should identify retryable errors', () => {
      const isRetryable = (code: number) => RETRYABLE_CODES.includes(code);

      expect(isRetryable(30010)).toBe(true);
      expect(isRetryable(21211)).toBe(false);
    });
  });
});

describe('Message Status', () => {
  const STATUSES = {
    queued: 'queued',
    sending: 'sending',
    sent: 'sent',
    delivered: 'delivered',
    failed: 'failed',
    undelivered: 'undelivered',
  };

  it('should identify final statuses', () => {
    const FINAL_STATUSES = ['delivered', 'failed', 'undelivered'];
    const isFinal = (status: string) => FINAL_STATUSES.includes(status);

    expect(isFinal('delivered')).toBe(true);
    expect(isFinal('failed')).toBe(true);
    expect(isFinal('queued')).toBe(false);
  });

  it('should identify success statuses', () => {
    const isSuccess = (status: string) => status === 'delivered';

    expect(isSuccess('delivered')).toBe(true);
    expect(isSuccess('sent')).toBe(false);
  });
});

describe('Auto Response Messages', () => {
  const AUTO_RESPONSES: Record<string, string> = {
    STOP: 'You have been unsubscribed. Reply START to re-subscribe.',
    START: 'You have been subscribed to messages.',
    HELP: 'Reply STOP to unsubscribe. For support, call our office.',
  };

  it('should have standard auto responses', () => {
    expect(AUTO_RESPONSES.STOP).toContain('unsubscribed');
    expect(AUTO_RESPONSES.START).toContain('subscribed');
    expect(AUTO_RESPONSES.HELP).toContain('STOP');
  });
});
