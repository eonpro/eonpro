/**
 * Ticket Status API Route
 * =======================
 *
 * PATCH /api/tickets/[id]/status - Change ticket status
 *
 * @module app/api/tickets/[id]/status
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { ticketService } from '@/domains/ticket';
import { handleApiError, ValidationError } from '@/domains/shared/errors';
import { logger } from '@/lib/logger';
import type { TicketStatus } from '@prisma/client';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const VALID_STATUSES: TicketStatus[] = [
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'PENDING',
  'PENDING_CUSTOMER',
  'PENDING_INTERNAL',
  'ON_HOLD',
  'ESCALATED',
  'RESOLVED',
  'CLOSED',
  'CANCELLED',
  'REOPENED',
];

/**
 * PATCH /api/tickets/[id]/status
 * Change ticket status
 */
export const PATCH = withAuth(async (request, { user }, { params }: RouteParams) => {
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

    if (!body.status) {
      return NextResponse.json(
        { error: 'Status is required' },
        { status: 400 }
      );
    }

    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    const userContext = {
      id: user.id,
      email: user.email,
      role: user.role.toLowerCase() as 'super_admin' | 'admin' | 'provider' | 'staff' | 'patient',
      clinicId: user.clinicId,
    };

    const ticket = await ticketService.changeStatus(
      ticketId,
      body.status as TicketStatus,
      body.reason,
      userContext
    );

    logger.info('[API] Ticket status changed', {
      ticketId,
      newStatus: body.status,
      changedById: user.id,
    });

    return NextResponse.json({
      ticket,
      message: `Ticket status changed to ${body.status}`,
    });
  } catch (error) {
    return handleApiError(error, { route: `PATCH /api/tickets/${(await params).id}/status` });
  }
});
