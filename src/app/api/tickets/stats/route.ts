/**
 * Ticket Statistics API Route
 * ===========================
 *
 * GET /api/tickets/stats - Get ticket statistics for a clinic
 *
 * @module app/api/tickets/stats
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { ticketService } from '@/domains/ticket';
import { handleApiError } from '@/domains/shared/errors';

/**
 * Check if the error indicates a missing table or schema issue
 */
function isSchemaMismatchError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    (msg.includes('relation') && msg.includes('does not exist')) ||
    (msg.includes('column') && msg.includes('does not exist')) ||
    msg.includes('p2010') || // Prisma: Raw query failed
    msg.includes('p2021') || // Prisma: Table does not exist
    msg.includes('p2022') || // Prisma: Column does not exist
    msg.includes('invalid input value for enum') ||
    (msg.includes('enum') && msg.includes('does not exist'))
  );
}

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
    // If schema is out of sync, return empty stats
    if (isSchemaMismatchError(error)) {
      console.warn('[API] Tickets Stats - schema mismatch detected, returning empty stats');
      return NextResponse.json({
        stats: {
          total: 0,
          open: 0,
          inProgress: 0,
          resolved: 0,
          closed: 0,
          byPriority: {},
          byCategory: {},
          avgResolutionTime: 0,
        },
        warning: 'Ticket system is being upgraded. Please wait for migration to complete.',
      });
    }
    return handleApiError(error, { route: 'GET /api/tickets/stats' });
  }
});
