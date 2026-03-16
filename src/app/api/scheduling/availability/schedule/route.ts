/**
 * Provider Availability Schedule API
 *
 * Returns the full weekly availability configuration and upcoming time-off
 * for a provider, used by the ProviderAvailabilityManager component.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';

const scheduleRoles = { roles: ['super_admin', 'admin', 'provider', 'staff'] as const };

/**
 * GET /api/scheduling/availability/schedule?providerId=X
 * Returns all ProviderAvailability entries and upcoming ProviderTimeOff for a provider.
 */
export const GET = withAuth(async (req: NextRequest, user) => {
  try {
    const searchParams = req.nextUrl.searchParams;
    const providerId = searchParams.get('providerId');

    if (!providerId) {
      return NextResponse.json({ error: 'providerId is required' }, { status: 400 });
    }

    const providerIdNum = parseInt(providerId, 10);
    if (isNaN(providerIdNum)) {
      return NextResponse.json({ error: 'providerId must be a number' }, { status: 400 });
    }

    const resolvedClinicId = user.role === 'super_admin'
      ? undefined
      : (user.clinicId ?? undefined);

    const [availability, timeOff] = await Promise.all([
      prisma.providerAvailability.findMany({
        where: {
          providerId: providerIdNum,
          isActive: true,
          ...(resolvedClinicId ? { OR: [{ clinicId: resolvedClinicId }, { clinicId: null }] } : {}),
        },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      }),
      prisma.providerTimeOff.findMany({
        where: {
          providerId: providerIdNum,
          endDate: { gte: new Date() },
          ...(resolvedClinicId ? { OR: [{ clinicId: resolvedClinicId }, { clinicId: null }] } : {}),
        },
        orderBy: { startDate: 'asc' },
      }),
    ]);

    return NextResponse.json({ availability, timeOff });
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get provider schedule', { error: errMessage });
    return NextResponse.json({ error: 'Failed to get provider schedule' }, { status: 500 });
  }
}, scheduleRoles);
