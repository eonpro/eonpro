/**
 * Agent Performance API Route
 * ===========================
 *
 * GET /api/tickets/stats/agents - Per-agent performance metrics
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { ticketService } from '@/domains/ticket';
import { handleApiError } from '@/domains/shared/errors';

export const GET = withAuth(async (request, user) => {
  try {
    const { searchParams } = new URL(request.url);
    const clinicId = parseInt(searchParams.get('clinicId') || String(user.clinicId || ''), 10);

    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic ID is required' }, { status: 400 });
    }

    const userContext = {
      id: user.id,
      email: user.email ?? '',
      role: user.role.toLowerCase() as 'super_admin' | 'admin' | 'provider' | 'staff' | 'patient',
      clinicId: user.clinicId ?? null,
    };

    const agents = await ticketService.getAgentPerformance(clinicId, userContext);

    return NextResponse.json({ agents });
  } catch (error) {
    return handleApiError(error, { route: 'GET /api/tickets/stats/agents' });
  }
});
