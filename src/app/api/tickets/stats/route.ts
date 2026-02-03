/**
 * Ticket Statistics API Route
 * ===========================
 *
 * GET /api/tickets/stats - Get ticket statistics for a clinic
 *
 * @module app/api/tickets/stats
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { ticketService } from '@/domains/ticket';
import { handleApiError } from '@/domains/shared/errors';

/**
 * GET /api/tickets/stats
 * Get ticket statistics for dashboard
 */
export const GET = withAuth(async (request, { user }) => {
  try {
    const { searchParams } = new URL(request.url);
    
    // Clinic ID (super admin can view any clinic)
    const clinicIdParam = searchParams.get('clinicId');
    const clinicId = clinicIdParam 
      ? parseInt(clinicIdParam, 10) 
      : user.clinicId;

    if (!clinicId) {
      return NextResponse.json(
        { error: 'Clinic ID is required' },
        { status: 400 }
      );
    }

    const userContext = {
      id: user.id,
      email: user.email,
      role: user.role.toLowerCase() as 'super_admin' | 'admin' | 'provider' | 'staff' | 'patient',
      clinicId: user.clinicId,
    };

    const stats = await ticketService.getStats(clinicId, userContext);

    return NextResponse.json({ stats });
  } catch (error) {
    return handleApiError(error, { route: 'GET /api/tickets/stats' });
  }
});
