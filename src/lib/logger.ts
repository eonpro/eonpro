/**
 * Centralized logging service
 * Replaces console.log statements for production safety
 */

import * as Sentry from '@sentry/nextjs';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: any;
}

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
