/**
 * Super Admin Employees API
 *
 * GET — List all STAFF and SALES_REP users across all clinics.
 *       Resolves clinic association from User.clinicId, UserClinic,
 *       and SalesRepPlanAssignment (sales reps may only be linked
 *       to a clinic through commission plan assignments).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, withoutClinicFilter } from '@/lib/db';
import { withSuperAdminAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { superAdminRateLimit } from '@/lib/rateLimit';

async function handleGet(req: NextRequest): Promise<Response> {
  const clinicIdParam = req.nextUrl.searchParams.get('clinicId');

  try {
    return await withoutClinicFilter(async () => {
      const where: Record<string, any> = {
        role: { in: ['STAFF', 'SALES_REP'] },
        status: 'ACTIVE',
      };

      const users = await prisma.user.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          status: true,
          clinicId: true,
          clinic: { select: { id: true, name: true } },
          salesRepPlanAssignments: {
            where: { effectiveTo: null },
            select: {
              clinicId: true,
              clinic: { select: { id: true, name: true } },
            },
            take: 1,
          },
        },
        orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
      });

      const clinicIdFilter = clinicIdParam ? parseInt(clinicIdParam, 10) : null;

      const employees = users.map((u) => {
        const planClinic = u.salesRepPlanAssignments?.[0]?.clinic;
        const effectiveClinicId = u.clinicId || planClinic?.id || null;
        const effectiveClinicName = u.clinic?.name || planClinic?.name || 'Unassigned';

        return {
          id: u.id,
          firstName: u.firstName,
          lastName: u.lastName,
          email: u.email,
          role: u.role,
          status: u.status,
          clinicId: effectiveClinicId,
          clinicName: effectiveClinicName,
        };
      }).filter((u) => {
        if (clinicIdFilter && u.clinicId !== clinicIdFilter) return false;
        return true;
      });

      return NextResponse.json({ employees });
    });
  } catch (error) {
    logger.error('[Employees GET]', { error: error instanceof Error ? error.message : 'Unknown' });
    return NextResponse.json({ error: 'Failed to fetch employees' }, { status: 500 });
  }
}

export const GET = superAdminRateLimit(withSuperAdminAuth(handleGet));
