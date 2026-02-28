/**
 * Ticket Trends API Route
 * =======================
 *
 * GET /api/tickets/stats/trends - Daily ticket volume for charting
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { ticketService } from '@/domains/ticket';
import { handleApiError } from '@/domains/shared/errors';

export const GET = withAuth(async (request, user) => {
  try {
    const { searchParams } = new URL(request.url);
    const clinicId = parseInt(searchParams.get('clinicId') || String(user.clinicId || ''), 10);
    const days = Math.min(parseInt(searchParams.get('days') || '30', 10), 90);

    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic ID is required' }, { status: 400 });
    }

    const userContext = {
      id: user.id,
      email: user.email ?? '',
      role: user.role.toLowerCase() as 'super_admin' | 'admin' | 'provider' | 'staff' | 'patient',
      clinicId: user.clinicId ?? null,
    };

    const trends = await ticketService.getTrends(clinicId, days, userContext);

    return NextResponse.json({ trends });
  } catch (error) {
    return handleApiError(error, { route: 'GET /api/tickets/stats/trends' });
  }
});
