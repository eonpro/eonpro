/**
 * Ticket Resolution API Route
 * ===========================
 *
 * POST /api/tickets/[id]/resolve - Resolve a ticket with disposition
 * POST /api/tickets/[id]/resolve/reopen - Reopen a resolved ticket
 *
 * @module app/api/tickets/[id]/resolve
 */

import { NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth';
import { ticketService, reportTicketError } from '@/domains/ticket';
import { handleApiError } from '@/domains/shared/errors';
import { logger } from '@/lib/logger';
import type { ResolveTicketInput } from '@/domains/ticket';
import type { TicketDisposition } from '@prisma/client';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const VALID_DISPOSITIONS: TicketDisposition[] = [
  'RESOLVED_SUCCESSFULLY',
  'RESOLVED_WITH_WORKAROUND',
  'NOT_RESOLVED',
  'DUPLICATE',
  'NOT_REPRODUCIBLE',
  'BY_DESIGN',
  'CUSTOMER_ERROR',
  'TRAINING_ISSUE',
  'REFERRED_TO_SPECIALIST',
  'PENDING_CUSTOMER',
  'CANCELLED_BY_CUSTOMER',
];

/**
 * POST /api/tickets/[id]/resolve
 * Resolve a ticket with disposition and resolution notes
 */
export const POST = withAuth<RouteParams>(async (request, user, { params } = {} as RouteParams) => {
  try {
    const { id } = await params;
    const ticketId = parseInt(id, 10);

    if (isNaN(ticketId)) {
      return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 });
    }

    const body = await request.json();

    // Check if this is a reopen request
    if (body.action === 'reopen') {
      const userContext = {
        id: user.id,
        email: user.email,
        role: user.role.toLowerCase() as 'super_admin' | 'admin' | 'provider' | 'staff' | 'patient',
        clinicId: user.clinicId,
      };

      const ticket = await ticketService.reopen(
        ticketId,
        body.reason || 'Ticket reopened',
        userContext
      );

      logger.info('[API] Ticket reopened', {
        ticketId,
        reopenedById: user.id,
      });

      return NextResponse.json({
        ticket,
        message: 'Ticket reopened successfully',
      });
    }

    // Regular resolve flow
    if (!body.disposition) {
      return NextResponse.json({ error: 'Disposition is required' }, { status: 400 });
    }

    if (!VALID_DISPOSITIONS.includes(body.disposition)) {
      return NextResponse.json(
        { error: `Invalid disposition. Must be one of: ${VALID_DISPOSITIONS.join(', ')}` },
        { status: 400 }
      );
    }

    if (!body.resolutionNotes?.trim()) {
      return NextResponse.json({ error: 'Resolution notes are required' }, { status: 400 });
    }

    const userContext = {
      id: user.id,
      email: user.email,
      role: user.role.toLowerCase() as 'super_admin' | 'admin' | 'provider' | 'staff' | 'patient',
      clinicId: user.clinicId,
    };

    const input: ResolveTicketInput = {
      disposition: body.disposition as TicketDisposition,
      resolutionNotes: body.resolutionNotes,
      rootCause: body.rootCause,
    };

    const ticket = await ticketService.resolve(ticketId, input, userContext);

    logger.info('[API] Ticket resolved', {
      ticketId,
      disposition: input.disposition,
      resolvedById: user.id,
    });

    return NextResponse.json({
      ticket,
      message: 'Ticket resolved successfully',
    });
  } catch (error) {
    const { id } = await params;
    reportTicketError(error, {
      route: `POST /api/tickets/${id}/resolve`,
      ticketId: parseInt(id, 10),
      clinicId: user.clinicId ?? undefined,
      userId: user.id,
      operation: 'resolve',
    });
    return handleApiError(error, { route: `POST /api/tickets/${id}/resolve` });
  }
});
