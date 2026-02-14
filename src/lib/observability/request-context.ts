/**
 * Request Context via AsyncLocalStorage
 *
 * Provides request-scoped correlation IDs for distributed tracing.
 * The middleware sets the context at the start of each request,
 * and service functions read it for structured logging.
 *
 * @module observability/request-context
 */

import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestContext {
  requestId: string;
  clinicId?: number;
  userId?: number;
  route?: string;
}

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Run a function within a request context.
 * Called by auth middleware at the start of each request.
 */
export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return requestContextStorage.run(ctx, fn);
}

/**
 * Get the current request ID from the AsyncLocalStorage context.
 * Returns 'no-request-id' if called outside of a request scope
 * (e.g., cron jobs, scripts).
 */
export function getRequestId(): string {
  return requestContextStorage.getStore()?.requestId ?? 'no-request-id';
}

/**
 * Get the full request context if available.
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}
