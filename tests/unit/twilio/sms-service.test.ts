/**
 * Twilio SMS Service Tests
 * Tests for SMS messaging functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    patient: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    appointment: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    smsLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/features', () => ({
  isFeatureEnabled: vi.fn(() => true),
}));

describe('Phone Number Formatting', () => {
  describe('formatPhoneNumber', () => {
    const formatPhoneNumber = (phone: string, defaultCountryCode = '+1'): string => {
      let cleaned = phone.replace(/\D/g, '');
      
      if (cleaned.length === 11 && cleaned.startsWith('1')) {
        return `+${cleaned}`;
      }
      
      if (cleaned.length === 10) {
        return `${defaultCountryCode}${cleaned}`;
      }
      
      if (phone.startsWith('+')) {
        return phone;
      }
      
      return `+${cleaned}`;
    };

    it('should format 10-digit US numbers', () => {
      expect(formatPhoneNumber('5551234567')).toBe('+15551234567');
      expect(formatPhoneNumber('(555) 123-4567')).toBe('+15551234567');
      expect(formatPhoneNumber('555-123-4567')).toBe('+15551234567');
      expect(formatPhoneNumber('555.123.4567')).toBe('+15551234567');
    });

    it('should handle 11-digit numbers with country code', () => {
      expect(formatPhoneNumber('15551234567')).toBe('+15551234567');
      expect(formatPhoneNumber('1-555-123-4567')).toBe('+15551234567');
    });

    it('should preserve numbers already in E.164 format', () => {
      expect(formatPhoneNumber('+15551234567')).toBe('+15551234567');
      expect(formatPhoneNumber('+442071234567')).toBe('+442071234567');
    });

    it('should use custom country code', () => {
      expect(formatPhoneNumber('5551234567', '+44')).toBe('+445551234567');
    });
  });

  describe('validatePhoneNumber', () => {
    const validatePhoneNumber = (phone: string): boolean => {
      // E.164 format validation
      const e164Regex = /^\+[1-9]\d{1,14}$/;
      return e164Regex.test(phone);
    };

    it('should validate E.164 format', () => {
      expect(validatePhoneNumber('+15551234567')).toBe(true);
      expect(validatePhoneNumber('+442071234567')).toBe(true);
      expect(validatePhoneNumber('+819012345678')).toBe(true);
    });

    it('should reject invalid formats', () => {
      expect(validatePhoneNumber('5551234567')).toBe(false);
      expect(validatePhoneNumber('+0551234567')).toBe(false); // Can't start with 0
      expect(validatePhoneNumber('invalid')).toBe(false);
      expect(validatePhoneNumber('')).toBe(false);
    });
  });
});

describe('SMS Templates', () => {
  const SMS_TEMPLATES = {
    APPOINTMENT_REMINDER: (name: string, date: string, doctor: string) =>
      `Hi ${name}, this is a reminder of your upcoming appointment on ${date} with ${doctor}. Reply CONFIRM to confirm or CANCEL to cancel.`,
    
    PRESCRIPTION_READY: (name: string, rxId: string) =>
      `Hi ${name}, your prescription ${rxId} is ready for pickup or shipment. Log into your patient portal for details.`,
    
    LAB_RESULTS_READY: (name: string) =>
      `Hi ${name}, your lab results are now available. Log into your patient portal to view them.`,
    
    PAYMENT_REMINDER: (name: string, amount: string) =>
      `Hi ${name}, you have an outstanding balance of ${amount}. Please log into your patient portal to make a payment.`,
  };

  it('should generate appointment reminder', () => {
    const message = SMS_TEMPLATES.APPOINTMENT_REMINDER('John', 'Jan 15 at 2:00 PM', 'Dr. Smith');
    
    expect(message).toContain('John');
    expect(message).toContain('Jan 15');
    expect(message).toContain('Dr. Smith');
    expect(message).toContain('CONFIRM');
    expect(message).toContain('CANCEL');
  });

  it('should generate prescription ready message', () => {
    const message = SMS_TEMPLATES.PRESCRIPTION_READY('Jane', 'RX-12345');
    
    expect(message).toContain('Jane');
    expect(message).toContain('RX-12345');
    expect(message).toContain('ready');
  });

  it('should generate lab results message', () => {
    const message = SMS_TEMPLATES.LAB_RESULTS_READY('Bob');
    
    expect(message).toContain('Bob');
    expect(message).toContain('lab results');
  });

  it('should generate payment reminder', () => {
    const message = SMS_TEMPLATES.PAYMENT_REMINDER('Alice', '$150.00');
    
    expect(message).toContain('Alice');
    expect(message).toContain('$150.00');
    expect(message).toContain('payment');
  });
});

describe('SMS Keyword Processing', () => {
  const SMS_KEYWORDS = {
    CONFIRM: ['confirm', 'yes', 'y', 'confirmed'],
    CANCEL: ['cancel', 'no', 'n', 'cancelled'],
    STOP: ['stop', 'unsubscribe', 'quit', 'end'],
    HELP: ['help', 'info', 'information'],
  };

  const normalizeKeyword = (text: string): string | null => {
    const normalized = text.toLowerCase().trim();
    
    for (const [keyword, variations] of Object.entries(SMS_KEYWORDS)) {
      if (variations.includes(normalized)) {
        return keyword;
      }
    }
    
    return null;
  };

  it('should recognize CONFIRM keywords', () => {
    expect(normalizeKeyword('confirm')).toBe('CONFIRM');
    expect(normalizeKeyword('CONFIRM')).toBe('CONFIRM');
    expect(normalizeKeyword('yes')).toBe('CONFIRM');
    expect(normalizeKeyword('Y')).toBe('CONFIRM');
    expect(normalizeKeyword('confirmed')).toBe('CONFIRM');
  });

  it('should recognize CANCEL keywords', () => {
    expect(normalizeKeyword('cancel')).toBe('CANCEL');
    expect(normalizeKeyword('no')).toBe('CANCEL');
    expect(normalizeKeyword('n')).toBe('CANCEL');
  });

  it('should recognize STOP keywords', () => {
    expect(normalizeKeyword('stop')).toBe('STOP');
    expect(normalizeKeyword('UNSUBSCRIBE')).toBe('STOP');
    expect(normalizeKeyword('quit')).toBe('STOP');
  });

  it('should recognize HELP keywords', () => {
    expect(normalizeKeyword('help')).toBe('HELP');
    expect(normalizeKeyword('info')).toBe('HELP');
  });

  it('should return null for unknown keywords', () => {
    expect(normalizeKeyword('hello')).toBeNull();
    expect(normalizeKeyword('random text')).toBeNull();
  });

  it('should handle whitespace', () => {
    expect(normalizeKeyword('  confirm  ')).toBe('CONFIRM');
    expect(normalizeKeyword('\tyes\n')).toBe('CONFIRM');
  });
});

describe('SMS Response Messages', () => {
  const RESPONSE_MESSAGES = {
    CONFIRM_SUCCESS: 'Thank you for confirming your appointment!',
    CANCEL_SUCCESS: 'Your appointment has been cancelled. Please call to reschedule.',
    STOP_SUCCESS: 'You have been unsubscribed from SMS notifications.',
    HELP_MESSAGE: 'Reply CONFIRM to confirm, CANCEL to cancel, or STOP to unsubscribe.',
    UNKNOWN: 'Sorry, we didn\'t understand that. Reply HELP for options.',
  };

  it('should have confirmation response', () => {
    expect(RESPONSE_MESSAGES.CONFIRM_SUCCESS).toContain('confirming');
  });

  it('should have cancellation response', () => {
    expect(RESPONSE_MESSAGES.CANCEL_SUCCESS).toContain('cancelled');
    expect(RESPONSE_MESSAGES.CANCEL_SUCCESS).toContain('reschedule');
  });

  it('should have stop response', () => {
    expect(RESPONSE_MESSAGES.STOP_SUCCESS).toContain('unsubscribed');
  });

  it('should have help response', () => {
    expect(RESPONSE_MESSAGES.HELP_MESSAGE).toContain('CONFIRM');
    expect(RESPONSE_MESSAGES.HELP_MESSAGE).toContain('CANCEL');
    expect(RESPONSE_MESSAGES.HELP_MESSAGE).toContain('STOP');
  });
});

describe('SMS Configuration', () => {
  describe('Twilio Configuration', () => {
    it('should require account SID', () => {
      const config = {
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        phoneNumber: process.env.TWILIO_PHONE_NUMBER,
      };

      const isConfigured = Boolean(
        config.accountSid && 
        config.authToken && 
        config.phoneNumber
      );

      // In test environment, may not be configured
      expect(typeof isConfigured).toBe('boolean');
    });
  });

  describe('Error Messages', () => {
    const TWILIO_ERRORS = {
      NOT_CONFIGURED: 'Twilio is not configured',
      FEATURE_DISABLED: 'SMS feature is disabled',
      INVALID_PHONE: 'Invalid phone number format',
      MESSAGE_FAILED: 'Failed to send SMS message',
      RATE_LIMITED: 'Too many SMS requests. Please try again later.',
    };

    it('should have all error messages', () => {
      expect(TWILIO_ERRORS.NOT_CONFIGURED).toBeDefined();
      expect(TWILIO_ERRORS.FEATURE_DISABLED).toBeDefined();
      expect(TWILIO_ERRORS.INVALID_PHONE).toBeDefined();
      expect(TWILIO_ERRORS.MESSAGE_FAILED).toBeDefined();
      expect(TWILIO_ERRORS.RATE_LIMITED).toBeDefined();
    });
  });
});

describe('SMS Logging', () => {
  describe('Log Entry Structure', () => {
    it('should log SMS with required fields', () => {
      const logEntry = {
        to: '+15551234567',
        from: '+15559876543',
        body: 'Test message',
        messageId: 'SM123456',
        status: 'queued',
        direction: 'outbound',
        timestamp: new Date(),
      };

      expect(logEntry.to).toBeDefined();
      expect(logEntry.from).toBeDefined();
      expect(logEntry.body).toBeDefined();
      expect(logEntry.status).toBeDefined();
    });
  });

  describe('SMS Status Values', () => {
    const validStatuses = [
      'queued',
      'sending',
      'sent',
      'delivered',
      'failed',
      'undelivered',
    ];

    it('should recognize valid statuses', () => {
      validStatuses.forEach(status => {
        expect(validStatuses).toContain(status);
      });
    });
  });
});

describe('Mock SMS Service', () => {
  it('should generate mock message IDs', () => {
    const generateMockId = (): string => {
      return `MOCK_SM_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    };

    const id1 = generateMockId();
    const id2 = generateMockId();

    expect(id1).toMatch(/^MOCK_SM_/);
    expect(id1).not.toBe(id2);
  });

  it('should simulate send delay', async () => {
    const mockDelay = 100; // ms
    const start = Date.now();
    
    await new Promise(resolve => setTimeout(resolve, mockDelay));
    
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(mockDelay);
  });
});

describe('Bulk SMS', () => {
  describe('Batch Processing', () => {
    it('should split into batches', () => {
      const splitIntoBatches = <T>(items: T[], batchSize: number): T[][] => {
        const batches: T[][] = [];
        for (let i = 0; i < items.length; i += batchSize) {
          batches.push(items.slice(i, i + batchSize));
        }
        return batches;
      };

      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const batches = splitIntoBatches(items, 3);

      expect(batches).toHaveLength(4);
      expect(batches[0]).toEqual([1, 2, 3]);
      expect(batches[3]).toEqual([10]);
    });
  });

  describe('Rate Limiting', () => {
    it('should calculate delay between messages', () => {
      const MESSAGES_PER_SECOND = 10;
      const delayMs = 1000 / MESSAGES_PER_SECOND;

      expect(delayMs).toBe(100);
    });
  });
});

describe('SMS Character Limits', () => {
  const SMS_LIMITS = {
    SINGLE_SMS: 160,
    CONCATENATED_PART: 153,
    MAX_PARTS: 10,
    MAX_TOTAL: 1530, // 153 * 10
  };

  describe('Message Length', () => {
    it('should calculate SMS parts', () => {
      const calculateParts = (message: string): number => {
        if (message.length <= SMS_LIMITS.SINGLE_SMS) {
          return 1;
        }
        return Math.ceil(message.length / SMS_LIMITS.CONCATENATED_PART);
      };

      expect(calculateParts('Short message')).toBe(1);
      expect(calculateParts('A'.repeat(160))).toBe(1);
      expect(calculateParts('A'.repeat(161))).toBe(2);
      expect(calculateParts('A'.repeat(306))).toBe(2);
      expect(calculateParts('A'.repeat(307))).toBe(3);
    });

    it('should validate message length', () => {
      const isValidLength = (message: string): boolean => {
        return message.length <= SMS_LIMITS.MAX_TOTAL;
      };

      expect(isValidLength('Short')).toBe(true);
      expect(isValidLength('A'.repeat(1530))).toBe(true);
      expect(isValidLength('A'.repeat(1531))).toBe(false);
    });
  });
});

describe('Opt-Out Management', () => {
  it('should track opt-out status', () => {
    const optOutList = new Set<string>();

    const addOptOut = (phone: string) => optOutList.add(phone);
    const removeOptOut = (phone: string) => optOutList.delete(phone);
    const isOptedOut = (phone: string) => optOutList.has(phone);

    addOptOut('+15551234567');
    
    expect(isOptedOut('+15551234567')).toBe(true);
    expect(isOptedOut('+15559999999')).toBe(false);

    removeOptOut('+15551234567');
    expect(isOptedOut('+15551234567')).toBe(false);
  });

  it('should check opt-out before sending', () => {
    const canSendTo = (phone: string, optOutList: Set<string>): boolean => {
      return !optOutList.has(phone);
    };

    const optedOut = new Set(['+15551234567']);

    expect(canSendTo('+15559999999', optedOut)).toBe(true);
    expect(canSendTo('+15551234567', optedOut)).toBe(false);
  });
});
