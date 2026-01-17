import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/logger';
import { AppError, ApiResponse } from '@/types/common';

/**
 * Custom monitoring utilities for tracking application health and performance
 */

// Performance tracking
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private transactions: Map<string, any> = new Map();

  private constructor() {}

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  // Start a performance transaction
  startTransaction(name: string, op: string = 'http.server') {
    const transaction = Sentry.startSpan({
      name,
      op,
    }, (span: any) => {
      // Store span for later use
      return span;
    });
    
    this.transactions.set(name, transaction);
    
    return transaction;
  }

  // End a transaction
  endTransaction(name: string, status: 'ok' | 'error' | 'cancelled' = 'ok') {
    const transaction = this.transactions.get(name);
    if (transaction) {
      transaction.setStatus(status);
      transaction.finish();
      this.transactions.delete(name);
    }
  }

  // Track API call performance
  async trackAPICall<T>(
    endpoint: string,
    operation: () => Promise<T>
  ): Promise<T> {
    return await Sentry.startSpan(
      {
        op: 'http.client',
        name: endpoint,
      },
      async (span: any) => {
        try {
          const startTime = Date.now();
          const result = await operation();
          const duration = Date.now() - startTime;

          // Send custom metric
          Sentry.metrics.distribution('api.response_time', duration, {
            unit: 'millisecond',
          });

          if (span) {
            span.setStatus({ code: 1 }); // OK status
          }
          return result;
        } catch (error: any) {
    // @ts-ignore
   
          if (span) {
            span.setStatus({ code: 2 }); // ERROR status
          }
          throw error;
        }
      }
    );
  }

  // Track database query performance
  async trackDatabaseQuery<T>(
    query: string,
    operation: () => Promise<T>
  ): Promise<T> {
    return await Sentry.startSpan(
      {
        op: 'db.query',
        name: query,
      },
      async (span: any) => {
        try {
          const startTime = Date.now();
          const result = await operation();
          const duration = Date.now() - startTime;

          // Send custom metric
          Sentry.metrics.distribution('db.query_time', duration, {
            unit: 'millisecond',
          });

          // Log slow queries
          if (duration > 1000) {
            Sentry.captureMessage(`Slow query detected: ${query}`, 'warning');
          }

          if (span) {
            span.setStatus({ code: 1 }); // OK status
          }
          return result;
        } catch (error: any) {
    // @ts-ignore
   
          if (span) {
            span.setStatus({ code: 2 }); // ERROR status
          }
          throw error;
        }
      }
    );
  }
}

// Error tracking utilities
export class ErrorTracker {
  // Track and categorize errors
  static trackError(
    error: Error,
    category: 'api' | 'database' | 'validation' | 'business' | 'unknown',
    context?: Record<string, unknown>
  ) {
    Sentry.withScope((scope: any) => {
      scope.setTag('error.category', category);
      scope.setLevel('error');
      
      if (context) {
        scope.setContext('error_details', context);
      }

      // Add breadcrumb
      Sentry.addBreadcrumb({
        category: 'error',
        message: error.message,
        level: 'error',
        data: context,
      });

      Sentry.captureException(error);
    });
  }

  // Track validation errors (lower severity)
  static trackValidationError(
    field: string,
    value: any,
    message: string
  ) {
    Sentry.withScope((scope: any) => {
      scope.setTag('error.category', 'validation');
      scope.setLevel('warning');
      scope.setContext('validation', {
        field,
        value: typeof value === 'object' ? '[object]' : value,
        message,
      });

      Sentry.captureMessage(`Validation error: ${field} - ${message}`, 'warning');
    });
  }

  // Track business logic errors
  static trackBusinessError(
    operation: string,
    reason: string,
    context?: Record<string, unknown>
  ) {
    Sentry.withScope((scope: any) => {
      scope.setTag('error.category', 'business');
      scope.setLevel('warning');
      scope.setContext('business_error', {
        operation,
        reason,
        ...context,
      });

      Sentry.captureMessage(`Business error in ${operation}: ${reason}`, 'warning');
    });
  }
}

// User activity tracking
export class UserActivityTracker {
  // Track user actions
  static trackAction(
    action: string,
    category: string,
    metadata?: Record<string, unknown>
  ) {
    Sentry.addBreadcrumb({
      category: 'user',
      message: action,
      level: 'info',
      data: {
        category,
        ...metadata,
      },
    });

    // Send custom event (metrics.increment may not be available in all environments)
    try {
      const metrics = Sentry.metrics as any;
      if (metrics && typeof metrics.increment === 'function') {
        metrics.increment('user.action', 1);
      }
    } catch (e: any) {
    // @ts-ignore
   
      // Metrics API may not be available
    }
  }

  // Track feature usage
  static trackFeatureUsage(feature: string, variant?: string) {
    try {
      const metrics = Sentry.metrics as any;
      if (metrics && typeof metrics.increment === 'function') {
        metrics.increment('feature.usage', 1);
      }
    } catch (e: any) {
    // @ts-ignore
   
      // Metrics API may not be available
    }
  }

  // Track conversion events
  static trackConversion(
    event: string,
    value?: number,
    metadata?: Record<string, unknown>
  ) {
    Sentry.addBreadcrumb({
      category: 'conversion',
      message: event,
      level: 'info',
      data: {
        value,
        ...metadata,
      },
    });

    if (value) {
      Sentry.metrics.gauge('conversion.value', value, {
        unit: 'dollar',
      });
    }
  }
}

// Health check monitoring
export class HealthMonitor {
  // Check system health
  static async checkHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: Record<string, boolean>;
  }> {
    const checks: Record<string, boolean> = {};
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // Check database
    try {
      // Add actual database check here
      checks.database = true;
    } catch {
      checks.database = false;
      overallStatus = 'unhealthy';
    }

    // Check external APIs
    try {
      // Add API health checks here
      checks.lifefile_api = true;
      checks.stripe_api = true;
    } catch {
      checks.lifefile_api = false;
      overallStatus = 'degraded';
    }

    // Check Redis cache (if available)
    try {
      // Add Redis check here
      checks.redis = true;
    } catch {
      checks.redis = false;
      // Redis is optional, so just degrade
      if ((overallStatus as any) === "healthy") {
        overallStatus = 'degraded';
      }
    }

    // Send health metrics
    Sentry.metrics.gauge('system.health', (overallStatus as any) === "healthy" ? 1 : 0);

    return {
      status: overallStatus,
      checks,
    };
  }

  // Monitor resource usage
  static trackResourceUsage() {
    if (typeof window === 'undefined') {
      // Server-side monitoring
      const usage = process.memoryUsage();
      
      Sentry.metrics.gauge('server.memory.heap', usage.heapUsed, {
        unit: 'byte',
      });
      
      Sentry.metrics.gauge('server.memory.external', usage.external, {
        unit: 'byte',
      });
      
      Sentry.metrics.gauge('server.uptime', process.uptime(), {
        unit: 'second',
      });
    } else {
      // Client-side monitoring
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        
        Sentry.metrics.gauge('client.memory.used', memory.usedJSHeapSize, {
          unit: 'byte',
        });
        
        Sentry.metrics.gauge('client.memory.limit', memory.jsHeapSizeLimit, {
          unit: 'byte',
        });
      }
    }
  }
}

// Custom hook for monitoring in React components
export function useMonitoring() {
  const trackError = (error: Error, context?: Record<string, unknown>) => {
    ErrorTracker.trackError(error, 'unknown', context);
  };

  const trackAction = (action: string, category: string, metadata?: Record<string, unknown>) => {
    UserActivityTracker.trackAction(action, category, metadata);
  };

  const trackPerformance = async <T>(
    name: string,
    operation: () => Promise<T>
  ): Promise<T> => {
    const monitor = PerformanceMonitor.getInstance();
    const transaction = monitor.startTransaction(name);
    
    try {
      const result = await operation();
      monitor.endTransaction(name, 'ok');
      return result;
    } catch (error: any) {
    // @ts-ignore
   
      monitor.endTransaction(name, 'error');
      throw error;
    }
  };

  return {
    trackError,
    trackAction,
    trackPerformance,
  };
}

// Initialize monitoring on app start
export function initializeMonitoring() {
  // Set up periodic health checks
  if (typeof window === 'undefined') {
    // Server-side only
    setInterval(() => {
      HealthMonitor.checkHealth();
      HealthMonitor.trackResourceUsage();
    }, 60000); // Every minute
  }

  // Set up client-side monitoring - wrapped in setTimeout to avoid hydration issues
  if (typeof window !== 'undefined') {
    setTimeout(() => {
      // Browser tracing is already initialized in the client config
      // Just track web vitals
      Sentry.metrics.gauge('web.vitals.cls', 0);
      Sentry.metrics.gauge('web.vitals.fid', 0);
      Sentry.metrics.gauge('web.vitals.lcp', 0);
      
      logger.debug('[MONITORING] Initialized successfully');
    }, 0);
  }
}
