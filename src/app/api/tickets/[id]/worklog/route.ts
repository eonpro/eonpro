/**
 * Ticket Work Log API Route
 * =========================
 *
 * GET  /api/tickets/[id]/worklog - Get work logs and summary
 * POST /api/tickets/[id]/worklog - Add a work log entry
 *
 * @module app/api/tickets/[id]/worklog
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { ticketService, reportTicketError } from '@/domains/ticket';
import { handleApiError } from '@/domains/shared/errors';
import { logger } from '@/lib/logger';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth<RouteParams>(async (request, user, { params } = {} as RouteParams) => {
  try {
    const { id } = await params;
    const ticketId = parseInt(id, 10);

    if (isNaN(ticketId)) {
      return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 });
    }

    const userContext = {
      id: user.id,
      email: user.email ?? '',
      role: user.role.toLowerCase() as 'super_admin' | 'admin' | 'provider' | 'staff' | 'patient',
      clinicId: user.clinicId ?? null,
    };

    const summary = await ticketService.getWorkLogSummary(ticketId, userContext);

    return NextResponse.json({ summary });
  } catch (error) {
    const { id } = await params;
    reportTicketError(error, {
      route: `GET /api/tickets/${id}/worklog`,
      ticketId: parseInt(id, 10),
      clinicId: user.clinicId ?? undefined,
      userId: user.id,
      operation: 'getWorkLogSummary',
    });
    return handleApiError(error, { route: `GET /api/tickets/${id}/worklog` });
  }
});

export const POST = withAuth<RouteParams>(async (request, user, { params } = {} as RouteParams) => {
  try {
    const { id } = await params;
    const ticketId = parseInt(id, 10);

    if (isNaN(ticketId)) {
      return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 });
    }

    const body = await request.json();

    if (!body.action) {
      return NextResponse.json({ error: 'Action is required' }, { status: 400 });
    }

    if (!body.description?.trim()) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 });
    }

    const userContext = {
      id: user.id,
      email: user.email ?? '',
      role: user.role.toLowerCase() as 'super_admin' | 'admin' | 'provider' | 'staff' | 'patient',
      clinicId: user.clinicId ?? null,
    };

    const workLog = await ticketService.addWorkLog(
      {
        ticketId,
        action: body.action,
        duration: body.duration ? parseInt(body.duration, 10) : undefined,
        description: body.description.trim(),
        isInternal: body.isInternal ?? true,
        metadata: body.metadata,
      },
      userContext
    );

    logger.info('[API] Work log added', {
      ticketId,
      workLogId: workLog.id,
      userId: user.id,
    });

    return NextResponse.json({ workLog }, { status: 201 });
  } catch (error) {
    const { id } = await params;
    reportTicketError(error, {
      route: `POST /api/tickets/${id}/worklog`,
      ticketId: parseInt(id, 10),
      clinicId: user.clinicId ?? undefined,
      userId: user.id,
      operation: 'addWorkLog',
    });
    return handleApiError(error, { route: `POST /api/tickets/${id}/worklog` });
  }
});
