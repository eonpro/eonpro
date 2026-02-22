/**
 * Sales Rep Stats API
 *
 * GET - Returns stats for the current sales rep: assigned patient count and commissions earned.
 * Used by the home dashboard so reps see only their assigned profiles and commissions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, runWithClinicContext } from '@/lib/db';
import { withAuth, type AuthUser } from '@/lib/auth/middleware';
import { handleApiError } from '@/domains/shared/errors';

export const dynamic = 'force-dynamic';

export const GET = withAuth(
  async (_req: NextRequest, user: AuthUser) => {
    if (user.role !== 'sales_rep' || user.clinicId == null) {
      return NextResponse.json(
        { error: 'Sales rep clinic context required' },
        { status: 403 }
      );
    }

    try {
      const clinicId = user.clinicId;
      const salesRepId = user.id;

      const result = await runWithClinicContext(clinicId, async () => {
        const assignedPatientCount = await prisma.patientSalesRepAssignment.count({
          where: {
            salesRepId,
            clinicId,
            isActive: true,
          },
        });

        // Commission tracking for sales reps is Phase 4; until then return 0
        const commissionsEarnedCents = 0;

        return {
          assignedPatientCount,
          commissionsEarnedCents,
        };
      });

      return NextResponse.json(result);
    } catch (error) {
      return handleApiError(error, { context: { route: 'GET /api/sales-rep/stats' } });
    }
  },
  { roles: ['sales_rep'] }
);
