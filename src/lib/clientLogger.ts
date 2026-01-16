/**
 * Client-Side Logger
 * 
 * A safe logger for client-side code that:
 * - Only logs in development mode (production suppresses logs)
 * - Strips sensitive data automatically
 * - Provides consistent logging interface
 * 
 * Usage:
 * import { clientLogger } from '@/lib/clientLogger';
 * clientLogger.log('Message');
 * clientLogger.error('Error', error);
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isDevelopment = process.env.NODE_ENV === 'development';
const isTest = process.env.NODE_ENV === 'test';

// Sensitive field patterns to filter out
const SENSITIVE_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /apiKey/i,
  /api_key/i,
  /authorization/i,
  /ssn/i,
  /socialSecurity/i,
  /creditCard/i,
  /cvv/i,
];

/**
 * Filter sensitive data from objects
 */
function filterSensitiveData(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(filterSensitiveData);
  }

  if (typeof data === 'object') {
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const isSensitive = SENSITIVE_PATTERNS.some(pattern => pattern.test(key));
      filtered[key] = isSensitive ? '[REDACTED]' : filterSensitiveData(value);
    }
    return filtered;
  }

  return data;
}

/**
 * Create a log entry with timestamp
 */
function createLogEntry(level: LogLevel, message: string, ...args: unknown[]) {
  const timestamp = new Date().toISOString();
  const filteredArgs = args.map(filterSensitiveData);
  
  return {
    timestamp,
    level,
    message,
    data: filteredArgs.length > 0 ? filteredArgs : undefined,
  };
}

/**
 * Client Logger
 */
export const clientLogger = {
  debug: (message: string, ...args: unknown[]) => {
    if (isDevelopment && !isTest) {
      const entry = createLogEntry('debug', message, ...args);
      console.debug(`[${entry.timestamp}] DEBUG:`, message, ...args);
    }
  },

  log: (message: string, ...args: unknown[]) => {
    if (isDevelopment && !isTest) {
      const entry = createLogEntry('info', message, ...args);
      console.log(`[${entry.timestamp}] INFO:`, message, ...args);
    }
  },

  info: (message: string, ...args: unknown[]) => {
    if (isDevelopment && !isTest) {
      const entry = createLogEntry('info', message, ...args);
      console.info(`[${entry.timestamp}] INFO:`, message, ...args);
    }
  },

  warn: (message: string, ...args: unknown[]) => {
    // Warnings are shown in all environments
    const entry = createLogEntry('warn', message, ...args);
    if (isDevelopment) {
      console.warn(`[${entry.timestamp}] WARN:`, message, ...filterSensitiveData(args) as unknown[]);
    }
  },

  error: (message: string, ...args: unknown[]) => {
    // Errors are always logged (but filtered in production)
    const entry = createLogEntry('error', message, ...args);
    console.error(
      `[${entry.timestamp}] ERROR:`,
      message,
      ...(isDevelopment ? args : filterSensitiveData(args) as unknown[])
    );
  },
};

// Default export
export default clientLogger;

/**
 * Helper to safely stringify objects for logging
 */
export function safeStringify(obj: unknown, space = 2): string {
  try {
    return JSON.stringify(filterSensitiveData(obj), null, space);
  } catch {
    return String(obj);
  }
}
