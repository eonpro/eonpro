/**
 * Unmatched Orders API
 *
 * GET /api/admin/pharmacy-invoices/unmatched-orders?startDate=2026-03-04&page=1&limit=50
 *
 * Returns orders sent from the system that do NOT appear on any uploaded
 * pharmacy invoice (prescriptions the pharmacy hasn't billed for).
 *
 * @security Admin or Super Admin
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { handleApiError } from '@/domains/shared/errors';
import { getUnmatchedOrders } from '@/services/invoices/pharmacyInvoiceService';
import { requirePermission, toPermissionContext } from '@/lib/rbac/permissions';

export const GET = withAuth(
  async (req: NextRequest, user: AuthUser) => {
    try {
      requirePermission(toPermissionContext(user), 'invoice:view');

      const clinicId = user.clinicId;
      if (!clinicId) {
        return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
      }

      const { searchParams } = new URL(req.url);
      const startDateStr = searchParams.get('startDate') ?? '2026-03-04';
      const page = parseInt(searchParams.get('page') ?? '1', 10);
      const limit = parseInt(searchParams.get('limit') ?? '50', 10);

      const startDate = new Date(startDateStr);
      if (isNaN(startDate.getTime())) {
        return NextResponse.json({ error: 'Invalid startDate' }, { status: 400 });
      }

      const result = await getUnmatchedOrders(clinicId, startDate, page, limit);

      return NextResponse.json({ success: true, data: result });
    } catch (error) {
      return handleApiError(error, { context: { route: 'GET unmatched-orders' } });
    }
  },
  { roles: ['admin', 'super_admin'] }
);
