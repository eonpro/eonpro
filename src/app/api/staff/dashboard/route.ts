/**
 * Staff Dashboard API
 * ===================
 *
 * Returns operational stats + recent intakes for staff.
 * Reuses the admin dashboard service but strips financial data.
 *
 * @module api/staff/dashboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { handleApiError } from '@/domains/shared/errors';
import { getAdminDashboard } from '@/lib/dashboard/admin-dashboard';

async function handleGet(req: NextRequest, user: AuthUser) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();

  try {
    const userContext = {
      id: user.id,
      email: user.email,
      role: user.role as 'staff',
      clinicId: user.clinicId ?? undefined,
    };

    logger.info('[STAFF-DASHBOARD] Fetching dashboard', {
      userId: user.id,
      clinicId: user.clinicId,
      requestId,
    });

    const payload = await getAdminDashboard(userContext);

    const staffPayload = {
      stats: {
        totalIntakes: payload.stats.totalIntakes,
        totalPatients: payload.stats.totalPatients,
        totalPrescriptions: payload.stats.totalPrescriptions,
        conversionRate: payload.stats.conversionRate,
        recentIntakes: payload.stats.recentIntakes,
        recentPrescriptions: payload.stats.recentPrescriptions,
      },
      recentIntakes: payload.recentIntakes,
    };

    return NextResponse.json(staffPayload);
  } catch (error) {
    logger.error('[STAFF-DASHBOARD] Unhandled error', {
      userId: user.id,
      clinicId: user.clinicId,
      error: error instanceof Error ? error.message : String(error),
      requestId,
    });
    return handleApiError(error, {
      requestId,
      route: 'GET /api/staff/dashboard',
      context: { userId: user.id, clinicId: user.clinicId },
    });
  }
}

export const GET = withAuth(handleGet, { roles: ['staff', 'admin', 'super_admin'] });
