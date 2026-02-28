/**
 * Send CSAT Survey API Route
 * POST /api/tickets/csat/send - Manually send a CSAT survey for a ticket
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { ticketCsatService } from '@/domains/ticket/services/ticket-csat.service';
import { handleApiError } from '@/domains/shared/errors';

export const POST = withAuth(async (request, user) => {
  try {
    const body = await request.json();
    const ticketId = parseInt(body.ticketId, 10);
    if (isNaN(ticketId)) {
      return NextResponse.json({ error: 'Valid ticketId required' }, { status: 400 });
    }

    await ticketCsatService.sendSurvey(ticketId);

    return NextResponse.json({ success: true, message: 'CSAT survey sent' });
  } catch (error) {
    return handleApiError(error, { route: 'POST /api/tickets/csat/send' });
  }
});
