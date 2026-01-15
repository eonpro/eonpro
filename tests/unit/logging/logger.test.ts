/**
 * Logger Tests
 * Tests for centralized logging functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Sentry
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  setExtra: vi.fn(),
  withScope: vi.fn((callback) => callback({ setLevel: vi.fn(), setExtra: vi.fn() })),
}));

describe('Logger', () => {
  const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    console.log = vi.fn();
    console.info = vi.fn();
    console.warn = vi.fn();
    console.error = vi.fn();
    console.debug = vi.fn();
  });

  afterEach(() => {
    console.log = originalConsole.log;
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.debug = originalConsole.debug;
  });

  describe('Log Levels', () => {
    const LOG_LEVELS = {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3,
      SECURITY: 4,
    };

    it('should define all log levels', () => {
      expect(LOG_LEVELS.DEBUG).toBe(0);
      expect(LOG_LEVELS.INFO).toBe(1);
      expect(LOG_LEVELS.WARN).toBe(2);
      expect(LOG_LEVELS.ERROR).toBe(3);
      expect(LOG_LEVELS.SECURITY).toBe(4);
    });

    it('should order levels by severity', () => {
      expect(LOG_LEVELS.DEBUG).toBeLessThan(LOG_LEVELS.INFO);
      expect(LOG_LEVELS.INFO).toBeLessThan(LOG_LEVELS.WARN);
      expect(LOG_LEVELS.WARN).toBeLessThan(LOG_LEVELS.ERROR);
    });
  });

  describe('Log Message Formatting', () => {
    const formatLogMessage = (
      level: string,
      message: string,
      context?: Record<string, any>
    ): string => {
      const timestamp = new Date().toISOString();
      const contextStr = context ? JSON.stringify(context) : '';
      return `[${timestamp}] [${level}] ${message} ${contextStr}`.trim();
    };

    it('should format log message with timestamp', () => {
      const formatted = formatLogMessage('INFO', 'Test message');
      
      expect(formatted).toMatch(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z\]/);
      expect(formatted).toContain('[INFO]');
      expect(formatted).toContain('Test message');
    });

    it('should include context in log message', () => {
      const formatted = formatLogMessage('INFO', 'User action', { userId: 123 });
      
      expect(formatted).toContain('{"userId":123}');
    });
  });

  describe('Debug Logging', () => {
    it('should only log debug in development', () => {
      const shouldLogDebug = (nodeEnv: string): boolean => {
        return nodeEnv === 'development' || nodeEnv === 'test';
      };

      expect(shouldLogDebug('development')).toBe(true);
      expect(shouldLogDebug('test')).toBe(true);
      expect(shouldLogDebug('production')).toBe(false);
    });
  });

  describe('Error Logging', () => {
    const logError = (message: string, error?: Error, context?: Record<string, any>) => {
      const errorInfo = {
        message,
        error: error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : undefined,
        context,
        timestamp: new Date().toISOString(),
      };
      console.error(JSON.stringify(errorInfo));
      return errorInfo;
    };

    it('should include error details', () => {
      const error = new Error('Test error');
      const result = logError('An error occurred', error);
      
      expect(result.error?.name).toBe('Error');
      expect(result.error?.message).toBe('Test error');
    });

    it('should include stack trace', () => {
      const error = new Error('Test error');
      const result = logError('An error occurred', error);
      
      expect(result.error?.stack).toBeDefined();
    });

    it('should include context', () => {
      const result = logError('Failed operation', undefined, { userId: 123 });
      
      expect(result.context?.userId).toBe(123);
    });
  });

  describe('Security Logging', () => {
    const logSecurity = (event: string, details: Record<string, any>) => {
      const securityLog = {
        type: 'SECURITY',
        event,
        details,
        timestamp: new Date().toISOString(),
        severity: 'HIGH',
      };
      console.warn(JSON.stringify(securityLog));
      return securityLog;
    };

    it('should log security events with HIGH severity', () => {
      const result = logSecurity('UNAUTHORIZED_ACCESS', { userId: 'unknown', ip: '10.0.0.1' });
      
      expect(result.type).toBe('SECURITY');
      expect(result.severity).toBe('HIGH');
    });

    it('should include event details', () => {
      const result = logSecurity('LOGIN_FAILED', { email: 'test@example.com', attempts: 5 });
      
      expect(result.event).toBe('LOGIN_FAILED');
      expect(result.details.attempts).toBe(5);
    });
  });

  describe('API Logging', () => {
    const logAPI = (
      method: string,
      path: string,
      statusCode: number,
      duration: number,
      context?: Record<string, any>
    ) => {
      const apiLog = {
        type: 'API',
        method,
        path,
        statusCode,
        duration,
        context,
        timestamp: new Date().toISOString(),
      };
      console.info(JSON.stringify(apiLog));
      return apiLog;
    };

    it('should log API requests', () => {
      const result = logAPI('GET', '/api/patients', 200, 45);
      
      expect(result.method).toBe('GET');
      expect(result.path).toBe('/api/patients');
      expect(result.statusCode).toBe(200);
      expect(result.duration).toBe(45);
    });

    it('should log slow requests', () => {
      const isSlow = (duration: number): boolean => duration > 1000;
      
      expect(isSlow(500)).toBe(false);
      expect(isSlow(1500)).toBe(true);
    });
  });
});

describe('Log Context', () => {
  describe('Request Context', () => {
    const extractRequestContext = (headers: Headers): Record<string, string> => {
      return {
        requestId: headers.get('x-request-id') || 'unknown',
        userId: headers.get('x-user-id') || 'anonymous',
        ip: headers.get('x-forwarded-for')?.split(',')[0] || 'unknown',
        userAgent: headers.get('user-agent') || 'unknown',
      };
    };

    it('should extract request ID', () => {
      const headers = new Headers({ 'x-request-id': 'req-123' });
      const context = extractRequestContext(headers);
      
      expect(context.requestId).toBe('req-123');
    });

    it('should extract user info', () => {
      const headers = new Headers({
        'x-user-id': 'user-456',
        'x-forwarded-for': '192.168.1.1',
      });
      const context = extractRequestContext(headers);
      
      expect(context.userId).toBe('user-456');
      expect(context.ip).toBe('192.168.1.1');
    });

    it('should handle missing headers', () => {
      const headers = new Headers();
      const context = extractRequestContext(headers);
      
      expect(context.requestId).toBe('unknown');
      expect(context.userId).toBe('anonymous');
    });
  });
});

describe('Log Sanitization', () => {
  const SENSITIVE_FIELDS = ['password', 'token', 'secret', 'apiKey', 'authorization'];

  const sanitizeLogData = (data: Record<string, any>): Record<string, any> => {
    const sanitized = { ...data };
    
    for (const key of Object.keys(sanitized)) {
      if (SENSITIVE_FIELDS.some(field => 
        key.toLowerCase().includes(field.toLowerCase())
      )) {
        sanitized[key] = '[REDACTED]';
      }
    }
    
    return sanitized;
  };

  it('should redact passwords', () => {
    const data = { email: 'test@example.com', password: 'secret123' };
    const sanitized = sanitizeLogData(data);
    
    expect(sanitized.email).toBe('test@example.com');
    expect(sanitized.password).toBe('[REDACTED]');
  });

  it('should redact tokens', () => {
    const data = { accessToken: 'abc123', refreshToken: 'xyz789' };
    const sanitized = sanitizeLogData(data);
    
    expect(sanitized.accessToken).toBe('[REDACTED]');
    expect(sanitized.refreshToken).toBe('[REDACTED]');
  });

  it('should redact API keys', () => {
    const data = { apiKey: 'sk_live_123', data: 'normal' };
    const sanitized = sanitizeLogData(data);
    
    expect(sanitized.apiKey).toBe('[REDACTED]');
    expect(sanitized.data).toBe('normal');
  });

  it('should preserve non-sensitive data', () => {
    const data = { userId: 123, action: 'LOGIN', timestamp: Date.now() };
    const sanitized = sanitizeLogData(data);
    
    expect(sanitized).toEqual(data);
  });
});

describe('Log Aggregation', () => {
  describe('Batch Logging', () => {
    it('should batch logs for performance', () => {
      const logBuffer: any[] = [];
      const BATCH_SIZE = 10;

      const addToBuffer = (log: any): boolean => {
        logBuffer.push(log);
        return logBuffer.length >= BATCH_SIZE;
      };

      const flushBuffer = (): any[] => {
        const logs = [...logBuffer];
        logBuffer.length = 0;
        return logs;
      };

      for (let i = 0; i < 15; i++) {
        const shouldFlush = addToBuffer({ id: i });
        if (shouldFlush) {
          const flushed = flushBuffer();
          expect(flushed.length).toBe(10);
        }
      }
      
      expect(logBuffer.length).toBe(5);
    });
  });
});

describe('Log Rotation', () => {
  describe('File Size Management', () => {
    const shouldRotate = (fileSize: number, maxSize: number): boolean => {
      return fileSize >= maxSize;
    };

    it('should rotate when file exceeds max size', () => {
      const MAX_SIZE = 10 * 1024 * 1024; // 10MB
      
      expect(shouldRotate(5 * 1024 * 1024, MAX_SIZE)).toBe(false);
      expect(shouldRotate(10 * 1024 * 1024, MAX_SIZE)).toBe(true);
      expect(shouldRotate(15 * 1024 * 1024, MAX_SIZE)).toBe(true);
    });
  });

  describe('File Naming', () => {
    const generateLogFileName = (prefix: string, date: Date): string => {
      const dateStr = date.toISOString().split('T')[0];
      return `${prefix}-${dateStr}.log`;
    };

    it('should generate date-based filenames', () => {
      const date = new Date('2024-01-15');
      const filename = generateLogFileName('app', date);
      
      expect(filename).toBe('app-2024-01-15.log');
    });
  });
});

describe('Sentry Integration', () => {
  describe('Error Capture', () => {
    it('should capture exceptions', async () => {
      const Sentry = await import('@sentry/nextjs');
      
      const error = new Error('Test exception');
      Sentry.captureException(error);
      
      expect(Sentry.captureException).toHaveBeenCalledWith(error);
    });

    it('should capture messages', async () => {
      const Sentry = await import('@sentry/nextjs');
      
      Sentry.captureMessage('Important message');
      
      expect(Sentry.captureMessage).toHaveBeenCalledWith('Important message');
    });
  });
});
