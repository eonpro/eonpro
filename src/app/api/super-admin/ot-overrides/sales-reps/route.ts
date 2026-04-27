import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { basePrisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { OT_CLINIC_SUBDOMAIN } from '@/lib/invoices/ot-pricing';
import { COMMISSION_ELIGIBLE_ROLES } from '@/lib/constants/commission-eligible-roles';

/**
 * Roles eligible to be assigned as the OT-clinic sales rep on the manual
 * reconciliation editor. PHARMACY_REP is excluded — pharmacy reps don't earn
 * sales commission on OT clinic payouts (they're on the fulfillment side).
 */
const OT_SALES_REP_ROLES = COMMISSION_ELIGIBLE_ROLES.filter((r) => r !== 'PHARMACY_REP');

function withSuperAdminAuth(handler: (req: NextRequest, user: AuthUser) => Promise<Response>) {
  return withAuth(handler, { roles: ['super_admin'] });
}

/**
 * GET /api/super-admin/ot-overrides/sales-reps
 *
 * Lightweight list for the manual reconciliation rep dropdown.
 * Scoped to commission-eligible users assigned to the OT clinic. Returns id +
 * display name only — no PHI, no permissions, no metadata. Capped at 500.
 */
export const GET = withSuperAdminAuth(async (_req: NextRequest, user: AuthUser) => {
  try {
    const clinic = await basePrisma.clinic.findFirst({
      where: { subdomain: OT_CLINIC_SUBDOMAIN, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!clinic) {
      return NextResponse.json({ reps: [] });
    }
    const reps = await basePrisma.user.findMany({
      where: {
        role: { in: [...OT_SALES_REP_ROLES] },
        status: 'ACTIVE',
        OR: [
          { clinicId: clinic.id },
          { userClinics: { some: { clinicId: clinic.id, isActive: true } } },
        ],
      },
      select: { id: true, firstName: true, lastName: true, role: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 500,
    });
    return NextResponse.json({
      reps: reps.map((r) => ({
        id: r.id,
        name: `${r.lastName}, ${r.firstName}`,
        role: r.role,
      })),
    });
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    logger.error('[OT overrides sales-reps] load failed', {
      message: e.message,
      userId: user.id,
    });
    return NextResponse.json({ reps: [] });
  }
});
