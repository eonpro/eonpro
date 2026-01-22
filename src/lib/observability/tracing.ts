/**
 * Distributed Tracing Module
 * ==========================
 * 
 * Provides request correlation and distributed tracing across services.
 * Uses Sentry for APM with custom trace propagation.
 * 
 * @module observability/tracing
 * @version 1.0.0
 */

import * as Sentry from '@sentry/nextjs';
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { logger } from '@/lib/logger';

// ============================================================================
// Types
// ============================================================================

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  sampled: boolean;
  requestId: string;
}

export interface SpanOptions {
  name: string;
  op: string;
  description?: string;
  data?: Record<string, unknown>;
  tags?: Record<string, string>;
}

// ============================================================================
// Request ID Management
// ============================================================================

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return `req-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Extract request ID from headers or generate new one
 */
export function getRequestId(req: NextRequest): string {
  return (
    req.headers.get('x-request-id') ||
    req.headers.get('x-correlation-id') ||
    req.headers.get('x-trace-id') ||
    generateRequestId()
  );
}

/**
 * Extract trace context from incoming request
 */
export function extractTraceContext(req: NextRequest): TraceContext {
  const requestId = getRequestId(req);
  
  // Try to extract Sentry trace header
  const sentryTrace = req.headers.get('sentry-trace');
  const baggage = req.headers.get('baggage');
  
  let traceId = crypto.randomBytes(16).toString('hex');
  let spanId = crypto.randomBytes(8).toString('hex');
  let parentSpanId: string | undefined;
  let sampled = true;
  
  if (sentryTrace) {
    // Parse sentry-trace header: {trace_id}-{span_id}-{sampled}
    const parts = sentryTrace.split('-');
    if (parts.length >= 2) {
      traceId = parts[0];
      parentSpanId = parts[1];
      spanId = crypto.randomBytes(8).toString('hex');
      if (parts.length > 2) {
        sampled = parts[2] === '1';
      }
    }
  }
  
  return {
    traceId,
    spanId,
    parentSpanId,
    sampled,
    requestId,
  };
}

// ============================================================================
// Span Management
// ============================================================================

/**
 * Create a new span for tracing
 */
export function startSpan<T>(
  options: SpanOptions,
  callback: (span: any) => Promise<T> | T
): Promise<T> {
  return Sentry.startSpan(
    {
      name: options.name,
      op: options.op,
      attributes: {
        ...options.data,
        ...options.tags,
      },
    },
    callback
  );
}

/**
 * Wrap an async operation with tracing
 */
export async function trace<T>(
  name: string,
  operation: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
  const startTime = Date.now();
  
  return Sentry.startSpan(
    {
      name,
      op: operation,
      attributes: metadata,
    },
    async (span) => {
      try {
        const result = await fn();
        
        const duration = Date.now() - startTime;
        Sentry.metrics.distribution(`${operation}.duration`, duration, {
          unit: 'millisecond',
          tags: { name },
        });
        
        return result;
      } catch (error) {
        if (span) {
          span.setStatus({ code: 2, message: String(error) });
        }
        throw error;
      }
    }
  );
}

// ============================================================================
// HTTP Tracing
// ============================================================================

/**
 * Trace an outgoing HTTP request
 */
export async function traceHttpRequest<T>(
  url: string,
  method: string,
  fn: () => Promise<T>
): Promise<T> {
  return trace(
    `HTTP ${method} ${new URL(url).pathname}`,
    'http.client',
    fn,
    {
      'http.url': url,
      'http.method': method,
    }
  );
}

/**
 * Trace an incoming HTTP request (API route)
 */
export async function traceApiRoute<T>(
  req: NextRequest,
  handler: (context: TraceContext) => Promise<T>
): Promise<T> {
  const context = extractTraceContext(req);
  const url = new URL(req.url);
  
  return Sentry.startSpan(
    {
      name: `${req.method} ${url.pathname}`,
      op: 'http.server',
      attributes: {
        'http.method': req.method,
        'http.url': url.pathname,
        'http.request_id': context.requestId,
        'trace.id': context.traceId,
      },
    },
    async (span) => {
      // Set request context on Sentry scope
      Sentry.setContext('request', {
        request_id: context.requestId,
        trace_id: context.traceId,
        method: req.method,
        path: url.pathname,
      });
      
      try {
        const result = await handler(context);
        return result;
      } catch (error) {
        if (span) {
          span.setStatus({ code: 2, message: String(error) });
        }
        
        // Capture error with trace context
        Sentry.withScope((scope) => {
          scope.setTag('request_id', context.requestId);
          scope.setTag('trace_id', context.traceId);
          Sentry.captureException(error);
        });
        
        throw error;
      }
    }
  );
}

// ============================================================================
// Database Tracing
// ============================================================================

/**
 * Trace a database query
 */
export async function traceDbQuery<T>(
  operation: string,
  table: string,
  fn: () => Promise<T>
): Promise<T> {
  return trace(
    `${operation} ${table}`,
    'db.query',
    fn,
    {
      'db.operation': operation,
      'db.table': table,
      'db.system': 'postgresql',
    }
  );
}

/**
 * Trace a database transaction
 */
export async function traceDbTransaction<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  return trace(name, 'db.transaction', fn, {
    'db.system': 'postgresql',
  });
}

// ============================================================================
// External Service Tracing
// ============================================================================

/**
 * Trace a call to an external service
 */
export async function traceExternalService<T>(
  service: string,
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  return trace(
    `${service}.${operation}`,
    'external.request',
    fn,
    {
      'external.service': service,
      'external.operation': operation,
    }
  );
}

// Specific service tracers
export const traceLifefile = <T>(operation: string, fn: () => Promise<T>) =>
  traceExternalService('lifefile', operation, fn);

export const traceStripe = <T>(operation: string, fn: () => Promise<T>) =>
  traceExternalService('stripe', operation, fn);

export const traceTwilio = <T>(operation: string, fn: () => Promise<T>) =>
  traceExternalService('twilio', operation, fn);

export const traceOpenAI = <T>(operation: string, fn: () => Promise<T>) =>
  traceExternalService('openai', operation, fn);

// ============================================================================
// Middleware Helper
// ============================================================================

/**
 * Add trace headers to response
 */
export function addTraceHeaders(
  headers: Headers,
  context: TraceContext
): void {
  headers.set('x-request-id', context.requestId);
  headers.set('x-trace-id', context.traceId);
}

/**
 * Create trace headers for outgoing requests
 */
export function createOutgoingTraceHeaders(
  context: TraceContext
): Record<string, string> {
  return {
    'x-request-id': context.requestId,
    'sentry-trace': `${context.traceId}-${context.spanId}-${context.sampled ? '1' : '0'}`,
  };
}

// ============================================================================
// Logging Integration
// ============================================================================

/**
 * Create a logger with trace context
 */
export function createTracedLogger(context: TraceContext) {
  return {
    info: (message: string, data?: Record<string, unknown>) => {
      logger.info(message, { ...data, requestId: context.requestId, traceId: context.traceId });
    },
    warn: (message: string, data?: Record<string, unknown>) => {
      logger.warn(message, { ...data, requestId: context.requestId, traceId: context.traceId });
    },
    error: (message: string, error?: Error, data?: Record<string, unknown>) => {
      logger.error(message, error, { ...data, requestId: context.requestId, traceId: context.traceId });
    },
    debug: (message: string, data?: Record<string, unknown>) => {
      logger.debug(message, { ...data, requestId: context.requestId, traceId: context.traceId });
    },
  };
}
