/**
 * User Workload API Route
 * =======================
 *
 * GET /api/users/workload - Get open ticket counts per staff user for the current clinic
 *
 * @module app/api/users/workload
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';

export const GET = withAuth(async (request, user) => {
  try {
    const clinicId = user.clinicId;

    if (!clinicId && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
    }

    const staffUsers = await prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        role: { in: ['ADMIN', 'STAFF', 'PROVIDER', 'SUPPORT'] },
        ...(clinicId
          ? {
              OR: [
                { clinicId },
                { userClinics: { some: { clinicId, isActive: true } } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        _count: {
          select: {
            ticketsAssigned: {
              where: {
                status: { notIn: ['CLOSED', 'CANCELLED', 'RESOLVED'] },
                ...(clinicId ? { clinicId } : {}),
              },
            },
          },
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 100,
    });

    const workload = staffUsers.map((u) => ({
      userId: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      openTicketCount: u._count.ticketsAssigned,
    }));

    return NextResponse.json({ workload });
  } catch (error) {
    logger.error('[API] Users workload GET - error', {
      error: error instanceof Error ? error.message : String(error),
      userId: user.id,
    });
    return NextResponse.json({ error: 'Failed to fetch workload' }, { status: 500 });
  }
});
