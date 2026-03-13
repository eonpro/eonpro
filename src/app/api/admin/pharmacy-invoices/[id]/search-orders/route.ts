/**
 * Order Search API (for manual matching)
 *
 * GET /api/admin/pharmacy-invoices/[id]/search-orders?q=...&lifefileOrderId=...
 *
 * @security Admin or Super Admin
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { handleApiError } from '@/domains/shared/errors';
import { searchOrdersForMatch } from '@/services/invoices/pharmacyInvoiceService';
import { requirePermission, toPermissionContext } from '@/lib/rbac/permissions';

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withAuth(
  async (req: NextRequest, user: AuthUser, _context?: RouteContext) => {
    try {
      requirePermission(toPermissionContext(user), 'invoice:view');

      const clinicId = user.clinicId;
      if (!clinicId) {
        return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
      }

      const { searchParams } = new URL(req.url);
      const q = searchParams.get('q') ?? undefined;
      const lifefileOrderId = searchParams.get('lifefileOrderId') ?? undefined;

      if (!q && !lifefileOrderId) {
        return NextResponse.json({ success: true, data: [] });
      }

      const results = await searchOrdersForMatch(clinicId, { q, lifefileOrderId });

      return NextResponse.json({ success: true, data: results });
    } catch (error) {
      return handleApiError(error, { context: { route: 'GET search-orders' } });
    }
  },
  { roles: ['admin', 'super_admin'] }
);
