/**
 * Single Statement API
 *
 * GET /api/admin/pharmacy-invoices/statements/[id] -- Get statement detail
 *
 * @security Admin or Super Admin
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { handleApiError, NotFoundError } from '@/domains/shared/errors';
import { getStatement } from '@/services/invoices/pharmacyInvoiceService';
import { requirePermission, toPermissionContext } from '@/lib/rbac/permissions';

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withAuth(
  async (_req: NextRequest, user: AuthUser, context?: RouteContext) => {
    try {
      requirePermission(toPermissionContext(user), 'invoice:view');

      const { id } = await context!.params;
      const stmtId = parseInt(id, 10);
      if (isNaN(stmtId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

      const clinicId = user.clinicId;
      if (!clinicId)
        return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });

      const data = await getStatement(stmtId, clinicId);
      if (!data) throw new NotFoundError('Statement not found');

      return NextResponse.json({ success: true, data });
    } catch (error) {
      return handleApiError(error, { context: { route: 'GET statement detail' } });
    }
  },
  { roles: ['admin', 'super_admin'] }
);
