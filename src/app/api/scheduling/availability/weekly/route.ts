/**
 * Provider Weekly Schedule API
 *
 * Returns a multi-week schedule view combining recurring availability,
 * date overrides, time-off, and appointment counts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthOptions } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { getProviderWeeklySchedule } from '@/lib/scheduling/scheduling.service';

const weeklyRoles: AuthOptions = {
  roles: ['super_admin', 'admin', 'provider', 'staff', 'sales_rep'],
};

/**
 * GET /api/scheduling/availability/weekly
 * Returns the effective schedule for each day over the requested window.
 *
 * Query params:
 *   providerId (required)
 *   startDate  (optional, ISO date string, defaults to start of current week)
 *   weeks      (optional, default 4, max 12)
 *   clinicId   (optional, super_admin only)
 */
export const GET = withAuth(async (req: NextRequest, user) => {
  try {
    const searchParams = req.nextUrl.searchParams;
    const providerId = searchParams.get('providerId');
    const startDateParam = searchParams.get('startDate');
    const weeksParam = searchParams.get('weeks');
    const clinicIdParam = searchParams.get('clinicId');

    if (!providerId) {
      return NextResponse.json({ error: 'providerId is required' }, { status: 400 });
    }

    const providerIdNum = parseInt(providerId, 10);
    if (isNaN(providerIdNum)) {
      return NextResponse.json({ error: 'providerId must be a number' }, { status: 400 });
    }

    // Default to start of current week (Sunday)
    let startDate: Date;
    if (startDateParam) {
      startDate = new Date(startDateParam);
    } else {
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    }

    const weeks = Math.min(Math.max(parseInt(weeksParam || '4', 10) || 4, 1), 12);

    const resolvedClinicId =
      user.role === 'super_admin' && clinicIdParam
        ? parseInt(clinicIdParam, 10)
        : (user.clinicId ?? undefined);

    const schedule = await getProviderWeeklySchedule(
      providerIdNum,
      startDate,
      weeks,
      resolvedClinicId
    );

    return NextResponse.json({ schedule, startDate: startDate.toISOString(), weeks });
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get weekly schedule', { error: errMessage });
    return NextResponse.json({ error: 'Failed to get weekly schedule' }, { status: 500 });
  }
}, weeklyRoles);
