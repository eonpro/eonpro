/**
 * Ticket Activity API Route
 * =========================
 *
 * GET /api/tickets/[id]/activity - Get activity log for a ticket
 *
 * @module app/api/tickets/[id]/activity
 */

import { NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth';
import { ticketService, reportTicketError } from '@/domains/ticket';
import { handleApiError } from '@/domains/shared/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/tickets/[id]/activity
 * Get activity log for a ticket (audit trail)
 */
export const GET = withAuth(async (request, user, { params }: RouteParams) => {
  try {
    const { id } = await params;
    const ticketId = parseInt(id, 10);

    if (isNaN(ticketId)) {
      return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const userContext = {
      id: user.id,
      email: user.email,
      role: user.role.toLowerCase() as 'super_admin' | 'admin' | 'provider' | 'staff' | 'patient',
      clinicId: user.clinicId,
    };

    const activities = await ticketService.getActivities(ticketId, userContext, {
      limit,
      offset,
    });

    return NextResponse.json({
      activities,
      pagination: {
        limit,
        offset,
        hasMore: activities.length === limit,
      },
    });
  } catch (error) {
    const { id } = await params;
    reportTicketError(error, {
      route: `GET /api/tickets/${id}/activity`,
      ticketId: parseInt(id, 10),
      clinicId: user.clinicId ?? undefined,
      userId: user.id,
      operation: 'get_activity',
    });
    return handleApiError(error, { route: `GET /api/tickets/${id}/activity` });
  }
});
