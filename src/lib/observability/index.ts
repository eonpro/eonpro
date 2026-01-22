/**
 * Observability Module
 * ====================
 * 
 * Centralized observability for the EONPRO platform including:
 * - Distributed tracing
 * - Metrics collection
 * - Error tracking
 * - Performance monitoring
 * 
 * @module observability
 */

// Re-export tracing utilities
export * from './tracing';

// Re-export monitoring utilities
export {
  PerformanceMonitor,
  ErrorTracker,
  UserActivityTracker,
  HealthMonitor,
  useMonitoring,
  initializeMonitoring,
} from '@/lib/monitoring';

// Re-export logger
export { logger } from '@/lib/logger';

// Quick access functions
import * as Sentry from '@sentry/nextjs';
import { trace, traceDbQuery, traceExternalService } from './tracing';

/**
 * Record a custom metric
 * Note: Tags removed - Sentry metrics API doesn't support tags in this version
 */
export function recordMetric(
  name: string,
  value: number,
  unit?: string,
  _tags?: Record<string, string>
): void {
  Sentry.metrics.gauge(name, value, { unit });
}

/**
 * Record a counter increment
 * Note: Using gauge instead of increment due to API limitations
 */
export function incrementCounter(
  name: string,
  _tags?: Record<string, string>
): void {
  Sentry.metrics.gauge(`${name}_count`, 1, {});
}

/**
 * Record a distribution (histogram)
 */
export function recordDistribution(
  name: string,
  value: number,
  unit?: string,
  _tags?: Record<string, string>
): void {
  Sentry.metrics.distribution(name, value, { unit });
}

/**
 * Set user context for tracing
 */
export function setUserContext(user: {
  id: string | number;
  email?: string;
  role?: string;
  clinicId?: number;
}): void {
  Sentry.setUser({
    id: String(user.id),
    email: user.email,
  });
  
  Sentry.setTag('user.role', user.role || 'unknown');
  if (user.clinicId) {
    Sentry.setTag('clinic.id', String(user.clinicId));
  }
}

/**
 * Clear user context (on logout)
 */
export function clearUserContext(): void {
  Sentry.setUser(null);
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(
  message: string,
  category: string,
  level: 'debug' | 'info' | 'warning' | 'error' = 'info',
  data?: Record<string, unknown>
): void {
  Sentry.addBreadcrumb({
    message,
    category,
    level,
    data,
  });
}

/**
 * Capture a message (non-error)
 */
export function captureMessage(
  message: string,
  level: 'debug' | 'info' | 'warning' | 'error' | 'fatal' = 'info',
  context?: Record<string, unknown>
): void {
  Sentry.withScope((scope) => {
    if (context) {
      scope.setContext('additional', context);
    }
    Sentry.captureMessage(message, level);
  });
}

/**
 * Capture an exception
 */
export function captureException(
  error: Error,
  context?: Record<string, unknown>
): void {
  Sentry.withScope((scope) => {
    if (context) {
      scope.setContext('error_context', context);
    }
    Sentry.captureException(error);
  });
}
