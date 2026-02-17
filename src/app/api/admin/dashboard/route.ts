/**
 * Admin Dashboard API (Unified)
 * ============================
 *
 * Single API call for full dashboard: stats + recent intakes.
 * Uses unified dashboard service with parallelized Prisma queries.
 *
 * @module api/admin/dashboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { handleApiError } from '@/domains/shared/errors';
import { getAdminDashboard } from '@/lib/dashboard/admin-dashboard';

/**
 * GET /api/admin/dashboard
 * Returns stats + recentIntakes in a single response.
 */
async function handleGet(req: NextRequest, user: AuthUser) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();

  try {
    const userContext = {
      id: user.id,
      email: user.email,
      role: user.role as 'super_admin' | 'admin' | 'provider' | 'staff',
      clinicId: user.clinicId ?? undefined,
    };

    logger.info('[ADMIN-DASHBOARD] Fetching dashboard', {
      userId: user.id,
      clinicId: user.clinicId,
      clinicIdType: typeof user.clinicId,
      requestId,
    });

    const payload = await getAdminDashboard(userContext);

    logger.info('[ADMIN-DASHBOARD] Fetched', {
      userId: user.id,
      clinicId: user.clinicId,
      totalIntakes: payload.stats.totalIntakes,
      totalPatients: payload.stats.totalPatients,
      totalPrescriptions: payload.stats.totalPrescriptions,
      requestId,
    });

    return NextResponse.json(payload);
  } catch (error) {
    logger.error('[ADMIN-DASHBOARD] Unhandled error in dashboard endpoint', {
      userId: user.id,
      clinicId: user.clinicId,
      clinicIdType: typeof user.clinicId,
      error: error instanceof Error ? error.message : String(error),
      requestId,
    });
    return handleApiError(error, {
      requestId,
      route: 'GET /api/admin/dashboard',
      context: { userId: user.id, clinicId: user.clinicId },
    });
  }
}

export const GET = withAdminAuth(handleGet);
