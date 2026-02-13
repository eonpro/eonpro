/**
 * Ticket Error Tracking
 * =====================
 *
 * Centralized error tracking for the ticket system (Zendesk-level reliability).
 * Sets Sentry context and tags so ticket errors can be filtered and triaged.
 *
 * @module domains/ticket/lib/ticket-error-tracking
 */

import { captureException } from '@/lib/observability';
import { logger } from '@/lib/logger';

export interface TicketErrorContext {
  /** API route e.g. 'GET /api/tickets', 'POST /api/tickets/[id]/comments' */
  route: string;
  /** Ticket ID when applicable */
  ticketId?: number;
  /** Clinic ID for multi-tenant filtering */
  clinicId?: number | null;
  /** User ID (no PHI) */
  userId?: number;
  /** Operation e.g. 'create', 'list', 'update', 'add_comment' */
  operation?: string;
  /** Additional safe context (no PHI) */
  extra?: Record<string, unknown>;
}

/**
 * Report a ticket-related error to Sentry with feature context.
 * Use in ticket API catch blocks so all ticket errors are tagged and filterable.
 */
export function reportTicketError(error: unknown, context: TicketErrorContext): void {
  const err = error instanceof Error ? error : new Error(String(error));
  try {
    captureException(err, {
      feature: 'tickets',
      route: context.route,
      ...(context.ticketId != null && { ticketId: context.ticketId }),
      ...(context.clinicId != null && { clinicId: context.clinicId }),
      ...(context.userId != null && { userId: context.userId }),
      ...(context.operation != null && { operation: context.operation }),
      ...(context.extra && { ...context.extra }),
    });
  } catch (reportError) {
    // Never throw from error reporting
    logger.error('[TicketErrorTracking] Failed to report error', { error: reportError instanceof Error ? reportError.message : String(reportError) });
  }
}
