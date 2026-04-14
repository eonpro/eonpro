/**
 * Patient Discrepancy Report API
 *
 * GET /api/admin/pharmacy-invoices/patient-discrepancy
 *   ?invoiceIds=1,2,3&startDate=2026-03-09&endDate=2026-03-13
 *
 * Compares unique patients on selected invoices vs patients with prescriptions
 * sent in the system for the given date range. Returns patients that appear
 * on only one side (the discrepancy).
 *
 * @security Admin or Super Admin
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { handleApiError } from '@/domains/shared/errors';
import { getPatientDiscrepancy } from '@/services/invoices/pharmacyInvoiceService';
import { requirePermission, toPermissionContext } from '@/lib/rbac/permissions';

export const GET = withAuth(
  async (req: NextRequest, user: AuthUser) => {
    try {
      requirePermission(toPermissionContext(user), 'invoice:view');

      const clinicId =
        user.role === 'super_admin'
          ? parseInt(new URL(req.url).searchParams.get('clinicId') ?? '0') || user.clinicId
          : user.clinicId;

      if (!clinicId) {
        return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
      }

      const { searchParams } = new URL(req.url);

      const invoiceIdsParam = searchParams.get('invoiceIds');
      if (!invoiceIdsParam) {
        return NextResponse.json(
          { error: 'invoiceIds parameter required (comma-separated)' },
          { status: 400 }
        );
      }

      const invoiceUploadIds = invoiceIdsParam
        .split(',')
        .map((id) => parseInt(id.trim(), 10))
        .filter((id) => !isNaN(id));
      if (invoiceUploadIds.length === 0) {
        return NextResponse.json(
          { error: 'At least one valid invoiceId required' },
          { status: 400 }
        );
      }

      const startDateStr = searchParams.get('startDate');
      const endDateStr = searchParams.get('endDate');

      if (!startDateStr || !endDateStr) {
        return NextResponse.json(
          { error: 'startDate and endDate parameters required' },
          { status: 400 }
        );
      }

      const startDate = new Date(startDateStr);
      const endDate = new Date(endDateStr);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
      }

      const result = await getPatientDiscrepancy(clinicId, invoiceUploadIds, startDate, endDate);

      return NextResponse.json({ success: true, data: result });
    } catch (error) {
      return handleApiError(error, { context: { route: 'GET patient-discrepancy' } });
    }
  },
  { roles: ['admin', 'super_admin'] }
);
