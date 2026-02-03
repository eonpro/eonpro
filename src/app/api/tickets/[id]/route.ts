/**
 * Single Ticket API Route
 * =======================
 *
 * GET    /api/tickets/[id] - Get ticket details
 * PATCH  /api/tickets/[id] - Update ticket
 * DELETE /api/tickets/[id] - Delete ticket (soft)
 *
 * @module app/api/tickets/[id]
 */

import { NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth';
import { ticketService } from '@/domains/ticket';
import { handleApiError, NotFoundError } from '@/domains/shared/errors';
import { logger } from '@/lib/logger';
import type { UpdateTicketInput } from '@/domains/ticket';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/tickets/[id]
 * Get ticket details by ID or ticket number
 */
export const GET = withAuth(async (request, user, { params }: RouteParams) => {
  try {
    const { id } = await params;

    const userContext = {
      id: user.id,
      email: user.email,
      role: user.role.toLowerCase() as 'super_admin' | 'admin' | 'provider' | 'staff' | 'patient',
      clinicId: user.clinicId,
    };

    let ticket;

    // Check if id is a ticket number (contains letters) or numeric ID
    if (/^[A-Z]{3}-\d+$/i.test(id)) {
      ticket = await ticketService.getByTicketNumber(id.toUpperCase(), userContext);
    } else {
      const ticketId = parseInt(id, 10);
      if (isNaN(ticketId)) {
        return NextResponse.json(
          { error: 'Invalid ticket ID' },
          { status: 400 }
        );
      }
      ticket = await ticketService.getById(ticketId, userContext);
    }

    return NextResponse.json({ ticket });
  } catch (error) {
    return handleApiError(error, { route: `GET /api/tickets/${(await params).id}` });
  }
});

/**
 * PATCH /api/tickets/[id]
 * Update a ticket
 */
export const PATCH = withAuth(async (request, user, { params }: RouteParams) => {
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

    const input: UpdateTicketInput = {};

    // Only include fields that are present in the request
    if (body.title !== undefined) input.title = body.title;
    if (body.description !== undefined) input.description = body.description;
    if (body.category !== undefined) input.category = body.category;
    if (body.priority !== undefined) input.priority = body.priority;
    if (body.status !== undefined) input.status = body.status;
    if (body.assignedToId !== undefined) input.assignedToId = body.assignedToId;
    if (body.teamId !== undefined) input.teamId = body.teamId;
    if (body.patientId !== undefined) input.patientId = body.patientId;
    if (body.orderId !== undefined) input.orderId = body.orderId;
    if (body.dueDate !== undefined) {
      input.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    }
    if (body.tags !== undefined) input.tags = body.tags;
    if (body.customFields !== undefined) input.customFields = body.customFields;
    if (body.internalNote !== undefined) input.internalNote = body.internalNote;

    const ticket = await ticketService.update(ticketId, input, userContext);

    logger.info('[API] Ticket updated', {
      ticketId,
      updatedFields: Object.keys(input),
      updatedById: user.id,
    });

    return NextResponse.json({
      ticket,
      message: 'Ticket updated successfully',
    });
  } catch (error) {
    return handleApiError(error, { route: `PATCH /api/tickets/${(await params).id}` });
  }
});

/**
 * DELETE /api/tickets/[id]
 * Soft delete a ticket (changes status to CANCELLED)
 */
export const DELETE = withAuth(async (request, user, { params }: RouteParams) => {
  try {
    const { id } = await params;
    const ticketId = parseInt(id, 10);

    if (isNaN(ticketId)) {
      return NextResponse.json(
        { error: 'Invalid ticket ID' },
        { status: 400 }
      );
    }

    const userContext = {
      id: user.id,
      email: user.email,
      role: user.role.toLowerCase() as 'super_admin' | 'admin' | 'provider' | 'staff' | 'patient',
      clinicId: user.clinicId,
    };

    // Soft delete by changing status to CANCELLED
    const ticket = await ticketService.changeStatus(
      ticketId,
      'CANCELLED',
      'Ticket deleted',
      userContext
    );

    logger.info('[API] Ticket deleted (cancelled)', {
      ticketId,
      deletedById: user.id,
    });

    return NextResponse.json({
      ticket,
      message: 'Ticket deleted successfully',
    });
  } catch (error) {
    return handleApiError(error, { route: `DELETE /api/tickets/${(await params).id}` });
  }
});
