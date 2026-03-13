/**
 * Statement CSV Export
 *
 * GET /api/admin/pharmacy-invoices/statements/[id]/export -- Download CSV
 *
 * @security Admin or Super Admin
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { handleApiError, NotFoundError } from '@/domains/shared/errors';
import { exportStatementCsv } from '@/services/invoices/pharmacyInvoiceService';
import { requirePermission, toPermissionContext } from '@/lib/rbac/permissions';

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withAuth(
  async (_req: NextRequest, user: AuthUser, context?: RouteContext) => {
    try {
      requirePermission(toPermissionContext(user), 'invoice:export');

      const { id } = await context!.params;
      const stmtId = parseInt(id, 10);
      if (isNaN(stmtId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

      const clinicId = user.clinicId;
      if (!clinicId) return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });

      const csv = await exportStatementCsv(stmtId, clinicId);
      if (!csv) throw new NotFoundError('Statement not found');

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="statement-${stmtId}.csv"`,
        },
      });
    } catch (error) {
      return handleApiError(error, { context: { route: 'GET statement export' } });
    }
  },
  { roles: ['admin', 'super_admin'] }
);
