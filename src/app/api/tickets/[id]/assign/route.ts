/**
 * Ticket Assignment API Route
 * ===========================
 *
 * POST /api/tickets/[id]/assign - Assign or reassign a ticket
 *
 * @module app/api/tickets/[id]/assign
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { ticketService } from '@/domains/ticket';
import { handleApiError } from '@/domains/shared/errors';
import { logger } from '@/lib/logger';
import type { AssignTicketInput } from '@/domains/ticket';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/tickets/[id]/assign
 * Assign a ticket to a user or team
 */
export const POST = withAuth(async (request, { user }, { params }: RouteParams) => {
  try {
    const { id } = await params;
    const ticketId = parseInt(id, 10);

    if (isNaN(ticketId)) {
      return NextResponse.json(
        { error: 'Invalid ticket ID' },
        { status: 400 }
      );
    }

    const body = await request.json();

    const userContext = {
      id: user.id,
      email: user.email,
      role: user.role.toLowerCase() as 'super_admin' | 'admin' | 'provider' | 'staff' | 'patient',
      clinicId: user.clinicId,
    };

    const input: AssignTicketInput = {
      assignedToId: body.assignedToId,
      teamId: body.teamId,
      reason: body.reason,
      isEscalation: body.isEscalation || false,
    };

    const ticket = await ticketService.assign(ticketId, input, userContext);

    logger.info('[API] Ticket assigned', {
      ticketId,
      assignedToId: input.assignedToId,
      teamId: input.teamId,
      assignedById: user.id,
    });

    return NextResponse.json({
      ticket,
      message: input.assignedToId 
        ? 'Ticket assigned successfully'
        : 'Ticket unassigned successfully',
    });
  } catch (error) {
    return handleApiError(error, { route: `POST /api/tickets/${(await params).id}/assign` });
  }
});
