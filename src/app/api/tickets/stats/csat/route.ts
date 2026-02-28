/**
 * CSAT Stats API Route
 * GET /api/tickets/stats/csat - Average CSAT score for the clinic
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { ticketCsatService } from '@/domains/ticket/services/ticket-csat.service';
import { handleApiError } from '@/domains/shared/errors';

export const GET = withAuth(async (request, user) => {
  try {
    const clinicId = user.clinicId;
    if (!clinicId) return NextResponse.json({ avgScore: 0, totalResponses: 0 });

    const result = await ticketCsatService.getAverageCsat(clinicId);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, { route: 'GET /api/tickets/stats/csat' });
  }
});
