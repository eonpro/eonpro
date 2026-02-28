/**
 * Ticket Timeline API Route
 * =========================
 *
 * GET /api/tickets/[id]/timeline - Get merged chronological timeline
 *
 * @module app/api/tickets/[id]/timeline
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

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10), 500);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const userContext = {
      id: user.id,
      email: user.email ?? '',
      role: user.role.toLowerCase() as 'super_admin' | 'admin' | 'provider' | 'staff' | 'patient',
      clinicId: user.clinicId ?? null,
    };

    const timeline = await ticketService.getTimeline(ticketId, userContext, { limit, offset });

    return NextResponse.json({ timeline });
  } catch (error) {
    const { id } = await params;
    reportTicketError(error, {
      route: `GET /api/tickets/${id}/timeline`,
      ticketId: parseInt(id, 10),
      clinicId: user.clinicId ?? undefined,
      userId: user.id,
      operation: 'getTimeline',
    });
    return handleApiError(error, { route: `GET /api/tickets/${id}/timeline` });
  }
});
