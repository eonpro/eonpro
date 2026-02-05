import { NextRequest, NextResponse } from 'next/server';
import { basePrisma as prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { platformFeeService } from '@/services/billing';
import { logger } from '@/lib/logger';

/**
 * Middleware to check for Super Admin role
 */
function withSuperAdminAuth(
  handler: (req: NextRequest, user: AuthUser) => Promise<Response>
) {
  return withAuth(handler, { roles: ['super_admin'] });
}

/**
 * GET /api/super-admin/clinic-fees
 * List all clinic fee configurations
 */
export const GET = withSuperAdminAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    // Get all fee configs with clinic info
    const configs = await platformFeeService.getAllFeeConfigs();

    // Get all clinics (including those without configs)
    const clinics = await prisma.clinic.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        adminEmail: true,
      },
      orderBy: { name: 'asc' },
    });

    // Map configs to clinics
    const configMap = new Map(configs.map(c => [c.clinicId, c]));
    
    const clinicsWithConfigs = clinics.map(clinic => ({
      clinic,
      config: configMap.get(clinic.id) || null,
      hasConfig: configMap.has(clinic.id),
    }));

    // Get summary across all clinics
    const totalSummary = await prisma.platformFeeEvent.groupBy({
      by: ['status'],
      _sum: { amountCents: true },
      _count: true,
    });

    let pendingTotal = 0;
    let invoicedTotal = 0;
    let paidTotal = 0;

    for (const agg of totalSummary) {
      switch (agg.status) {
        case 'PENDING':
          pendingTotal = agg._sum.amountCents || 0;
          break;
        case 'INVOICED':
          invoicedTotal = agg._sum.amountCents || 0;
          break;
        case 'PAID':
          paidTotal = agg._sum.amountCents || 0;
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
  } catch (error) {
    logger.error('[SuperAdmin] Error listing clinic fee configs', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Failed to list fee configurations' },
      { status: 500 }
    );
  }
});
