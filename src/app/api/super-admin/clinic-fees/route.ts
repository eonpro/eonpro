import { NextRequest, NextResponse } from 'next/server';
import { basePrisma, withoutClinicFilter } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { platformFeeService } from '@/services/billing';
import { logger } from '@/lib/logger';

/**
 * Middleware to check for Super Admin role
 */
function withSuperAdminAuth(handler: (req: NextRequest, user: AuthUser) => Promise<Response>) {
  return withAuth(handler, { roles: ['super_admin'] });
}

/**
 * GET /api/super-admin/clinic-fees
 * List all clinic fee configurations
 */
export const GET = withSuperAdminAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    return await withoutClinicFilter(async () => {
      // Get all fee configs with clinic info (no clinic filter)
      const configs = await platformFeeService.getAllFeeConfigs();

      // Get all clinics (including those without configs)
      const clinics = await basePrisma.clinic.findMany({
        select: {
          id: true,
          name: true,
          status: true,
          adminEmail: true,
        },
        orderBy: { name: 'asc' },
      });

      // Map configs to clinics
      const configMap = new Map(configs.map((c) => [c.clinicId, c]));

      // Per-clinic pending fees (for "Create invoice" actions)
      const pendingByClinic = await basePrisma.platformFeeEvent.groupBy({
        by: ['clinicId'],
        where: { status: 'PENDING' },
        _sum: { amountCents: true },
        _count: true,
      });
      const pendingMap = new Map(
        pendingByClinic.map((a) => [a.clinicId, { amountCents: a._sum.amountCents ?? 0, count: a._count }])
      );

      const clinicsWithConfigs = clinics.map((clinic) => {
        const pending = pendingMap.get(clinic.id);
        return {
          clinic,
          config: configMap.get(clinic.id) || null,
          hasConfig: configMap.has(clinic.id),
          pendingAmountCents: pending?.amountCents ?? 0,
          pendingCount: pending?.count ?? 0,
        };
      });

      // Get summary across all clinics (use basePrisma to avoid any middleware)
      const totalSummary = await basePrisma.platformFeeEvent.groupBy({
        by: ['status'],
        _sum: { amountCents: true },
        _count: true,
      });

      let pendingTotal = 0;
      let invoicedTotal = 0;
      let paidTotal = 0;

      for (const agg of totalSummary) {
        const amount = agg._sum.amountCents ?? 0;
        switch (agg.status) {
          case 'PENDING':
            pendingTotal = amount;
            break;
          case 'INVOICED':
            invoicedTotal = amount;
            break;
          case 'PAID':
            paidTotal = amount;
            break;
        }
      }

      return NextResponse.json({
        clinics: clinicsWithConfigs,
        summary: {
          totalClinics: clinics.length,
          configuredClinics: configs.length,
          pendingFees: pendingTotal,
          invoicedFees: invoicedTotal,
          paidFees: paidTotal,
        },
      });
    });
  } catch (error) {
    logger.error('[SuperAdmin] Error listing clinic fee configs', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ...(process.env.NODE_ENV === 'development' && { stack: error instanceof Error ? error.stack : undefined }),
    });
    return NextResponse.json(
      {
        error: 'Failed to list fee configurations',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
});
