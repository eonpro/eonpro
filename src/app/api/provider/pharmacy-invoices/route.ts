/**
 * Provider Pharmacy Invoice API (Read-only)
 *
 * GET /api/provider/pharmacy-invoices — List reconciled invoices for the provider's clinic
 *
 * @security Provider role
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { handleApiError } from '@/domains/shared/errors';
import { listUploads } from '@/services/invoices/pharmacyInvoiceService';

export const GET = withAuth(
  async (req: NextRequest, user: AuthUser) => {
    try {
      const clinicId = user.clinicId;
      if (!clinicId) {
        return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
      }

      const { searchParams } = new URL(req.url);
      const page = parseInt(searchParams.get('page') ?? '1', 10);
      const limit = parseInt(searchParams.get('limit') ?? '20', 10);

      const result = await listUploads({
        clinicId,
        status: 'RECONCILED',
        page,
        limit,
      });

      return NextResponse.json({ success: true, data: result });
    } catch (error) {
      return handleApiError(error, { context: { route: 'GET /api/provider/pharmacy-invoices' } });
    }
  },
  { roles: ['provider', 'admin', 'super_admin'] }
);
