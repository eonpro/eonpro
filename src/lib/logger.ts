/**
 * Centralized logging service
 * Replaces console.log statements for production safety.
 *
 * HIPAA: Do not log PHI (names, emails, DOB, addresses). Use IDs only (e.g. patientId, clinicId).
 * LogContext is typed to encourage safe values; avoid passing full entity objects.
 */

import * as Sentry from '@sentry/nextjs';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Safe context for structured logging. Use IDs and codes only—never PHI (no names, emails, DOB).
 * Prefer: { patientId, clinicId, route, statusCode, error: err?.message }.
 */
export type LogContext = Record<string, unknown>;

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';
  private isTest = process.env.NODE_ENV === 'test';

  /**
   * Log debug information (only in development)
   */
  debug(message: string, context?: LogContext): void {
    if (this.isDevelopment && !this.isTest) {
      console.debug(`[DEBUG] ${message}`, context || '');
    }
  }

  /**
   * Log general information
   */
  info(message: string, context?: LogContext): void {
    if (this.isDevelopment && !this.isTest) {
      console.info(`[INFO] ${message}`, context || '');
    }

    // Send to monitoring in production
    if (!this.isDevelopment) {
      Sentry.addBreadcrumb({
        message,
        level: 'info',
        data: context,
      });
    }
  }

  /**
   * Log warnings
   */
  warn(message: string, context?: LogContext): void {
    if (this.isDevelopment && !this.isTest) {
      console.warn(`[WARN] ${message}`, context || '');
    }

    // Send to Sentry as warning
    Sentry.captureMessage(message, 'warning');
  }

  /**
   * Log errors
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    if (this.isDevelopment && !this.isTest) {
      console.error(`[ERROR] ${message}`, error || '', context || '');
    }

    // Send to Sentry
    if (error instanceof Error) {
      Sentry.captureException(error, {
        extra: { message, ...context },
      });
    } else {
      Sentry.captureMessage(message, 'error');
    }
  }

  /**
   * Log API requests
   */
  api(method: string, path: string, context?: LogContext): void {
    const message = `${method} ${path}`;

    if (this.isDevelopment && !this.isTest) {
      console.log(`[API] ${message}`, context || '');
    }

    // Track API usage
    if (!this.isDevelopment) {
      Sentry.addBreadcrumb({
        type: 'http',
        category: 'api',
        message,
        data: context,
      });
    }
  }

  /**
   * Log database queries
   */
  db(operation: string, table: string, context?: LogContext): void {
    const message = `${operation} ${table}`;

    if (this.isDevelopment && !this.isTest) {
      console.log(`[DB] ${message}`, context || '');
    }

    // Track database operations
    if (!this.isDevelopment) {
      Sentry.addBreadcrumb({
        type: 'query',
        category: 'database',
        message,
        data: context,
      });
    }
  }

  /**
   * Log webhook events
   */
  webhook(event: string, source: string, context?: LogContext): void {
    const message = `Webhook ${event} from ${source}`;

    if (this.isDevelopment && !this.isTest) {
      console.log(`[WEBHOOK] ${message}`, context || '');
    }

    // Track webhook events
    Sentry.addBreadcrumb({
      type: 'http',
      category: 'webhook',
      message,
      data: context,
    });
  }

  /**
   * Structured request summary for SOC2/incident response (no PHI).
   * Call once per request after response is known.
   */
  requestSummary(payload: {
    requestId: string;
    clinicId?: number | null;
    userId?: number | null;
    route: string;
    method: string;
    status: number;
    durationMs: number;
  }): void {
    if (this.isTest) return;
    const msg = `REQUEST ${payload.method} ${payload.route} ${payload.status} ${payload.durationMs}ms`;
    if (this.isDevelopment) {
      console.log(`[REQUEST] ${msg}`, payload);
    }
    if (!this.isDevelopment) {
      Sentry.addBreadcrumb({
        type: 'http',
        category: 'request',
        message: msg,
        data: payload,
      });
    }
  }

  /**
   * Log security events
   */
  security(event: string, context?: LogContext): void {
    const message = `Security: ${event}`;

    // Always log security events
    if (!this.isTest) {
      console.warn(`[SECURITY] ${message}`, context || '');
    }

    // Always send to Sentry
    Sentry.captureMessage(message, 'warning');
  }
}

// Export singleton instance
export const logger = new Logger();

// Export for testing
export { Logger };
