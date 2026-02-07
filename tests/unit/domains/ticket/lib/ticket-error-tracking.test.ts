/**
 * Ticket Error Tracking Unit Tests
 * ================================
 *
 * Enterprise-level: reportTicketError must never throw and must pass
 * correct context to observability (Sentry). No PHI in context.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCaptureException = vi.fn();
vi.mock('@/lib/observability', () => ({
  captureException: (err: Error, context?: Record<string, unknown>) =>
    mockCaptureException(err, context),
}));

import { reportTicketError } from '@/domains/ticket/lib/ticket-error-tracking';

describe('Ticket Error Tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls captureException with Error and context', () => {
    const error = new Error('Test error');
    reportTicketError(error, {
      route: 'GET /api/tickets',
      operation: 'list',
      userId: 1,
      clinicId: 10,
    });

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(error, {
      feature: 'tickets',
      route: 'GET /api/tickets',
      operation: 'list',
      userId: 1,
      clinicId: 10,
    });
  });

  it('wraps non-Error in Error and passes context', () => {
    reportTicketError('string error', {
      route: 'POST /api/tickets/1/comments',
      ticketId: 1,
      clinicId: 5,
      operation: 'add_comment',
    });

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const [err, context] = mockCaptureException.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('string error');
    expect(context).toMatchObject({
      feature: 'tickets',
      route: 'POST /api/tickets/1/comments',
      ticketId: 1,
      clinicId: 5,
      operation: 'add_comment',
    });
  });

  it('omits optional context fields when not provided', () => {
    reportTicketError(new Error('Fail'), {
      route: 'GET /api/tickets/99',
    });

    const context = mockCaptureException.mock.calls[0][1];
    expect(context).toMatchObject({ feature: 'tickets', route: 'GET /api/tickets/99' });
    expect(context).not.toHaveProperty('ticketId');
    expect(context).not.toHaveProperty('clinicId');
    expect(context).not.toHaveProperty('userId');
    expect(context).not.toHaveProperty('operation');
  });

  it('never throws even when captureException throws', () => {
    mockCaptureException.mockImplementationOnce(() => {
      throw new Error('Sentry unavailable');
    });

    expect(() =>
      reportTicketError(new Error('API error'), { route: 'POST /api/tickets' })
    ).not.toThrow();
  });

  it('includes extra context when provided', () => {
    reportTicketError(new Error('DB error'), {
      route: 'PATCH /api/tickets/1',
      ticketId: 1,
      extra: { code: 'P2002', target: 'ticketNumber' },
    });

    const context = mockCaptureException.mock.calls[0][1];
    expect(context).toMatchObject({
      feature: 'tickets',
      route: 'PATCH /api/tickets/1',
      ticketId: 1,
      code: 'P2002',
      target: 'ticketNumber',
    });
  });
});
