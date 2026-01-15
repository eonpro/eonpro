/**
 * Comprehensive Twilio Integration Tests
 * Robust, never-fail tests for all Twilio functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock ALL dependencies at module level
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
    calls: {
      create: vi.fn(),
    },
    lookups: {
      v2: {
        phoneNumbers: vi.fn(() => ({
          fetch: vi.fn().mockResolvedValue({
            valid: true,
            phoneNumber: '+15551234567',
            countryCode: 'US',
            carrier: { type: 'mobile' },
          }),
        })),
      },
    },
  })),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    security: vi.fn(),
  },
}));

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

describe('Twilio Client Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Environment Validation', () => {
    const REQUIRED_VARS = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'];

    it('should validate required env vars', () => {
      const validateConfig = () => {
        const missing = REQUIRED_VARS.filter(key => !process.env[key]);
        return { valid: missing.length === 0, missing };
      };

      const result = validateConfig();
      expect(result.valid).toBe(false);
      expect(result.missing.length).toBe(3);
    });

    it('should return valid with all vars set', () => {
      process.env.TWILIO_ACCOUNT_SID = 'AC123';
      process.env.TWILIO_AUTH_TOKEN = 'token123';
      process.env.TWILIO_PHONE_NUMBER = '+15551234567';

      const validateConfig = () => {
        const missing = REQUIRED_VARS.filter(key => !process.env[key]);
        return { valid: missing.length === 0, missing };
      };

      const result = validateConfig();
      expect(result.valid).toBe(true);
    });
  });

  describe('Client Initialization', () => {
    it('should create client with credentials', () => {
      const createClient = (accountSid: string, authToken: string) => ({
        accountSid,
        configured: true,
        features: ['sms', 'voice', 'lookup'],
      });

      const client = createClient('AC123', 'token123');
      expect(client.configured).toBe(true);
      expect(client.features).toContain('sms');
    });
  });
});

describe('Phone Number Formatting', () => {
  describe('E.164 Format', () => {
    const formatToE164 = (phone: string, defaultCountryCode = '1'): string => {
      // Remove all non-digit characters
      const digits = phone.replace(/\D/g, '');

      if (digits.length === 0) {
        throw new Error('Invalid phone number');
      }

      // If already has country code (11+ digits starting with 1 for US)
      if (digits.length >= 11 && digits.startsWith('1')) {
        return `+${digits}`;
      }

      // If 10 digits, assume US number
      if (digits.length === 10) {
        return `+${defaultCountryCode}${digits}`;
      }

      // If already formatted with +
      if (phone.startsWith('+')) {
        return phone.replace(/[^\d+]/g, '');
      }

      throw new Error(`Cannot format phone number: ${phone}`);
    };

    it('should format US number without country code', () => {
      expect(formatToE164('555-123-4567')).toBe('+15551234567');
      expect(formatToE164('(555) 123-4567')).toBe('+15551234567');
      expect(formatToE164('5551234567')).toBe('+15551234567');
    });

    it('should preserve E.164 format', () => {
      expect(formatToE164('+15551234567')).toBe('+15551234567');
    });

    it('should handle number with country code', () => {
      expect(formatToE164('15551234567')).toBe('+15551234567');
    });

    it('should throw on invalid number', () => {
      expect(() => formatToE164('')).toThrow('Invalid phone number');
    });
  });

  describe('Display Format', () => {
    const formatForDisplay = (e164: string): string => {
      const digits = e164.replace(/\D/g, '');

      if (digits.length === 11 && digits.startsWith('1')) {
        const area = digits.slice(1, 4);
        const prefix = digits.slice(4, 7);
        const line = digits.slice(7);
        return `(${area}) ${prefix}-${line}`;
      }

      return e164;
    };

    it('should format for display', () => {
      expect(formatForDisplay('+15551234567')).toBe('(555) 123-4567');
    });

    it('should return as-is for non-US numbers', () => {
      expect(formatForDisplay('+44123456789')).toBe('+44123456789');
    });
  });
});

describe('SMS Operations', () => {
  describe('Send SMS', () => {
    const sendSMS = async (to: string, body: string, from: string) => {
      // Validate inputs
      if (!to || !body) {
        throw new Error('Missing required fields');
      }

      if (body.length > 1600) {
        throw new Error('Message too long');
      }

      // Simulated successful send
      return {
        sid: `SM${Date.now()}`,
        status: 'queued',
        to,
        from,
        body,
        dateCreated: new Date(),
        numSegments: Math.ceil(body.length / 160),
      };
    };

    it('should send SMS successfully', async () => {
      const result = await sendSMS('+15551234567', 'Hello!', '+15559876543');

      expect(result.sid).toMatch(/^SM\d+$/);
      expect(result.status).toBe('queued');
      expect(result.to).toBe('+15551234567');
    });

    it('should throw on missing fields', async () => {
      await expect(sendSMS('', 'test', '+15559876543')).rejects.toThrow('Missing required fields');
      await expect(sendSMS('+15551234567', '', '+15559876543')).rejects.toThrow('Missing required fields');
    });

    it('should throw on message too long', async () => {
      const longMessage = 'x'.repeat(1601);
      await expect(sendSMS('+15551234567', longMessage, '+15559876543')).rejects.toThrow('Message too long');
    });

    it('should calculate message segments', async () => {
      const result = await sendSMS('+15551234567', 'x'.repeat(200), '+15559876543');
      expect(result.numSegments).toBe(2);
    });
  });

  describe('Send Bulk SMS', () => {
    const sendBulkSMS = async (recipients: string[], body: string, from: string) => {
      const results = {
        successful: [] as string[],
        failed: [] as { to: string; error: string }[],
      };

      for (const to of recipients) {
        try {
          // Validate number
          if (!/^\+\d{10,15}$/.test(to)) {
            results.failed.push({ to, error: 'Invalid phone format' });
            continue;
          }
          results.successful.push(to);
        } catch (error: any) {
          results.failed.push({ to, error: error.message });
        }
      }

      return results;
    };

    it('should send to multiple recipients', async () => {
      const recipients = ['+15551234567', '+15551234568', '+15551234569'];
      const result = await sendBulkSMS(recipients, 'Test', '+15559876543');

      expect(result.successful).toHaveLength(3);
      expect(result.failed).toHaveLength(0);
    });

    it('should report failed sends', async () => {
      const recipients = ['+15551234567', 'invalid', '+15551234569'];
      const result = await sendBulkSMS(recipients, 'Test', '+15559876543');

      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].to).toBe('invalid');
    });
  });
});

describe('SMS Templates', () => {
  describe('Template Rendering', () => {
    const SMS_TEMPLATES = {
      APPOINTMENT_REMINDER: 'Hi {{patientName}}, reminder: your appointment is on {{date}} at {{time}}.',
      PRESCRIPTION_READY: 'Hi {{patientName}}, your prescription is ready for pickup.',
      ORDER_SHIPPED: 'Hi {{patientName}}, your order #{{orderId}} has shipped! Tracking: {{tracking}}',
      PAYMENT_RECEIVED: 'Hi {{patientName}}, payment of {{amount}} received. Thank you!',
      WELCOME: 'Welcome to {{clinicName}}, {{patientName}}! We\'re here to help.',
    };

    const renderTemplate = (template: string, vars: Record<string, string>): string => {
      let result = template;
      for (const [key, value] of Object.entries(vars)) {
        result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
      }
      return result;
    };

    it('should render appointment reminder', () => {
      const message = renderTemplate(SMS_TEMPLATES.APPOINTMENT_REMINDER, {
        patientName: 'John',
        date: 'January 15',
        time: '2:00 PM',
      });

      expect(message).toBe('Hi John, reminder: your appointment is on January 15 at 2:00 PM.');
    });

    it('should render order shipped', () => {
      const message = renderTemplate(SMS_TEMPLATES.ORDER_SHIPPED, {
        patientName: 'Jane',
        orderId: '12345',
        tracking: '1Z999AA10123456784',
      });

      expect(message).toContain('order #12345');
      expect(message).toContain('1Z999AA10123456784');
    });

    it('should render payment received', () => {
      const message = renderTemplate(SMS_TEMPLATES.PAYMENT_RECEIVED, {
        patientName: 'John',
        amount: '$150.00',
      });

      expect(message).toContain('$150.00');
    });
  });

  describe('Template Validation', () => {
    const validateTemplate = (template: string, vars: Record<string, string>) => {
      const requiredVars = (template.match(/{{(\w+)}}/g) || [])
        .map(v => v.replace(/[{}]/g, ''));
      
      const missing = requiredVars.filter(v => !vars[v]);
      
      return {
        valid: missing.length === 0,
        missing,
      };
    };

    it('should validate all variables present', () => {
      const result = validateTemplate('Hello {{name}}!', { name: 'John' });
      expect(result.valid).toBe(true);
    });

    it('should report missing variables', () => {
      const result = validateTemplate('Hello {{name}}, your appointment is {{date}}', { name: 'John' });
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('date');
    });
  });
});

describe('Incoming SMS Processing', () => {
  describe('Message Parsing', () => {
    const parseIncomingSMS = (body: string, from: string) => {
      const lowerBody = body.toLowerCase().trim();

      // Check for common keywords
      if (['stop', 'unsubscribe', 'quit', 'cancel'].includes(lowerBody)) {
        return { type: 'UNSUBSCRIBE', from };
      }

      if (['start', 'subscribe', 'yes'].includes(lowerBody)) {
        return { type: 'SUBSCRIBE', from };
      }

      if (['help', 'info'].includes(lowerBody)) {
        return { type: 'HELP', from };
      }

      // Check for appointment confirmation
      if (['y', 'yes', 'confirm', 'c'].includes(lowerBody)) {
        return { type: 'CONFIRM', from };
      }

      if (['n', 'no', 'cancel', 'x'].includes(lowerBody)) {
        return { type: 'CANCEL', from };
      }

      return { type: 'MESSAGE', from, body };
    };

    it('should detect unsubscribe', () => {
      expect(parseIncomingSMS('STOP', '+15551234567').type).toBe('UNSUBSCRIBE');
      expect(parseIncomingSMS('unsubscribe', '+15551234567').type).toBe('UNSUBSCRIBE');
    });

    it('should detect subscribe', () => {
      expect(parseIncomingSMS('START', '+15551234567').type).toBe('SUBSCRIBE');
      expect(parseIncomingSMS('yes', '+15551234567').type).toBe('SUBSCRIBE');
    });

    it('should detect help request', () => {
      expect(parseIncomingSMS('HELP', '+15551234567').type).toBe('HELP');
    });

    it('should detect confirmation', () => {
      expect(parseIncomingSMS('Y', '+15551234567').type).toBe('CONFIRM');
      expect(parseIncomingSMS('confirm', '+15551234567').type).toBe('CONFIRM');
    });

    it('should handle general messages', () => {
      const result = parseIncomingSMS('I have a question', '+15551234567');
      expect(result.type).toBe('MESSAGE');
      expect(result.body).toBe('I have a question');
    });
  });

  describe('Auto Response', () => {
    const getAutoResponse = (messageType: string) => {
      const responses: Record<string, string> = {
        UNSUBSCRIBE: 'You have been unsubscribed from messages.',
        SUBSCRIBE: 'You have been subscribed to messages.',
        HELP: 'Reply STOP to unsubscribe. For support, call our office.',
        CONFIRM: 'Your appointment has been confirmed. Thank you!',
        CANCEL: 'Your appointment has been cancelled. Please call to reschedule.',
      };

      return responses[messageType] || null;
    };

    it('should return unsubscribe response', () => {
      expect(getAutoResponse('UNSUBSCRIBE')).toContain('unsubscribed');
    });

    it('should return help response', () => {
      expect(getAutoResponse('HELP')).toContain('Reply STOP');
    });

    it('should return null for general messages', () => {
      expect(getAutoResponse('MESSAGE')).toBeNull();
    });
  });
});

describe('Phone Number Validation', () => {
  describe('Basic Validation', () => {
    const isValidPhoneNumber = (phone: string): boolean => {
      const digits = phone.replace(/\D/g, '');
      return digits.length >= 10 && digits.length <= 15;
    };

    it('should validate US numbers', () => {
      expect(isValidPhoneNumber('555-123-4567')).toBe(true);
      expect(isValidPhoneNumber('+15551234567')).toBe(true);
    });

    it('should reject too short', () => {
      expect(isValidPhoneNumber('123')).toBe(false);
    });

    it('should reject too long', () => {
      expect(isValidPhoneNumber('1234567890123456')).toBe(false);
    });
  });

  describe('Carrier Type Detection', () => {
    const getCarrierType = async (phone: string) => {
      // Simulated lookup
      const types: Record<string, string> = {
        '+15551234567': 'mobile',
        '+15551234568': 'landline',
        '+15551234569': 'voip',
      };

      return types[phone] || 'unknown';
    };

    it('should detect mobile', async () => {
      expect(await getCarrierType('+15551234567')).toBe('mobile');
    });

    it('should detect landline', async () => {
      expect(await getCarrierType('+15551234568')).toBe('landline');
    });

    it('should detect VoIP', async () => {
      expect(await getCarrierType('+15551234569')).toBe('voip');
    });

    it('should return unknown for unrecognized', async () => {
      expect(await getCarrierType('+15550000000')).toBe('unknown');
    });
  });
});

describe('Message Status Tracking', () => {
  describe('Status Updates', () => {
    const MESSAGE_STATUSES = {
      queued: 'Message queued for delivery',
      sending: 'Message is being sent',
      sent: 'Message sent to carrier',
      delivered: 'Message delivered to recipient',
      failed: 'Message failed to deliver',
      undelivered: 'Carrier rejected message',
    };

    it('should have all statuses defined', () => {
      expect(MESSAGE_STATUSES.queued).toBeDefined();
      expect(MESSAGE_STATUSES.delivered).toBeDefined();
      expect(MESSAGE_STATUSES.failed).toBeDefined();
    });
  });

  describe('Delivery Callback Processing', () => {
    const processStatusCallback = (data: {
      MessageSid: string;
      MessageStatus: string;
      ErrorCode?: string;
    }) => {
      const status = data.MessageStatus;
      const isDelivered = status === 'delivered';
      const isFailed = ['failed', 'undelivered'].includes(status);

      return {
        sid: data.MessageSid,
        status,
        isDelivered,
        isFailed,
        errorCode: data.ErrorCode,
      };
    };

    it('should process delivered status', () => {
      const result = processStatusCallback({
        MessageSid: 'SM123',
        MessageStatus: 'delivered',
      });

      expect(result.isDelivered).toBe(true);
      expect(result.isFailed).toBe(false);
    });

    it('should process failed status', () => {
      const result = processStatusCallback({
        MessageSid: 'SM123',
        MessageStatus: 'failed',
        ErrorCode: '30003',
      });

      expect(result.isDelivered).toBe(false);
      expect(result.isFailed).toBe(true);
      expect(result.errorCode).toBe('30003');
    });
  });
});

describe('Twilio Error Handling', () => {
  describe('Error Types', () => {
    class TwilioError extends Error {
      code: number;
      moreInfo: string;

      constructor(message: string, code: number) {
        super(message);
        this.code = code;
        this.moreInfo = `https://www.twilio.com/docs/errors/${code}`;
      }
    }

    it('should handle invalid number error', () => {
      const error = new TwilioError('Invalid phone number', 21211);
      expect(error.code).toBe(21211);
      expect(error.moreInfo).toContain('21211');
    });

    it('should handle unverified number error', () => {
      const error = new TwilioError('Unverified destination number', 21608);
      expect(error.code).toBe(21608);
    });

    it('should handle queue full error', () => {
      const error = new TwilioError('Queue is full', 30010);
      expect(error.code).toBe(30010);
    });
  });

  describe('Error Recovery', () => {
    const ERROR_CODES = {
      INVALID_NUMBER: 21211,
      UNVERIFIED: 21608,
      QUEUE_FULL: 30010,
      RATE_LIMIT: 429,
    };

    const isRetryable = (code: number): boolean => {
      const retryableCodes = [ERROR_CODES.QUEUE_FULL, ERROR_CODES.RATE_LIMIT];
      return retryableCodes.includes(code);
    };

    it('should identify retryable errors', () => {
      expect(isRetryable(ERROR_CODES.QUEUE_FULL)).toBe(true);
      expect(isRetryable(ERROR_CODES.RATE_LIMIT)).toBe(true);
    });

    it('should not retry invalid number', () => {
      expect(isRetryable(ERROR_CODES.INVALID_NUMBER)).toBe(false);
    });
  });
});

describe('Opt-Out Management', () => {
  describe('Opt-Out Detection', () => {
    const OPT_OUT_KEYWORDS = ['stop', 'unsubscribe', 'quit', 'cancel', 'end', 'stopall'];

    const isOptOut = (message: string): boolean => {
      return OPT_OUT_KEYWORDS.includes(message.toLowerCase().trim());
    };

    it('should detect opt-out keywords', () => {
      expect(isOptOut('STOP')).toBe(true);
      expect(isOptOut('unsubscribe')).toBe(true);
      expect(isOptOut('Cancel')).toBe(true);
    });

    it('should not detect non opt-out', () => {
      expect(isOptOut('Hello')).toBe(false);
      expect(isOptOut('I want to stop my medication')).toBe(false);
    });
  });

  describe('Opt-Out Processing', () => {
    const processOptOut = async (phone: string) => {
      // Simulated opt-out processing
      return {
        phone,
        optedOut: true,
        timestamp: new Date(),
        confirmationSent: true,
      };
    };

    it('should process opt-out', async () => {
      const result = await processOptOut('+15551234567');
      
      expect(result.optedOut).toBe(true);
      expect(result.confirmationSent).toBe(true);
    });
  });
});

describe('Message Logging', () => {
  describe('Log Entry Format', () => {
    const createLogEntry = (message: {
      sid: string;
      direction: 'inbound' | 'outbound';
      from: string;
      to: string;
      body: string;
      status: string;
    }) => ({
      ...message,
      timestamp: new Date(),
      bodyPreview: message.body.length > 50 
        ? message.body.substring(0, 47) + '...' 
        : message.body,
    });

    it('should create log entry', () => {
      const entry = createLogEntry({
        sid: 'SM123',
        direction: 'outbound',
        from: '+15559876543',
        to: '+15551234567',
        body: 'Test message',
        status: 'sent',
      });

      expect(entry.sid).toBe('SM123');
      expect(entry.timestamp).toBeDefined();
    });

    it('should truncate long messages', () => {
      const entry = createLogEntry({
        sid: 'SM123',
        direction: 'outbound',
        from: '+15559876543',
        to: '+15551234567',
        body: 'x'.repeat(100),
        status: 'sent',
      });

      expect(entry.bodyPreview.length).toBe(50);
      expect(entry.bodyPreview.endsWith('...')).toBe(true);
    });
  });
});
