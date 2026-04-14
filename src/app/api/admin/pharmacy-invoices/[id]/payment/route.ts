/**
 * Invoice Payment API
 *
 * PATCH /api/admin/pharmacy-invoices/[id]/payment -- Mark invoice as paid/unpaid
 *
 * @security Admin or Super Admin
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import { handleApiError } from '@/domains/shared/errors';
import { markInvoicePaid } from '@/services/invoices/pharmacyInvoiceService';
import { requirePermission, toPermissionContext } from '@/lib/rbac/permissions';

const paymentSchema = z.object({
  paymentStatus: z.enum(['UNPAID', 'PARTIAL', 'PAID']),
  paidAmountCents: z.number().int().min(0).optional(),
  paymentReference: z.string().optional(),
  paymentNotes: z.string().optional(),
  paidAt: z.string().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export const PATCH = withAuth(
  async (req: NextRequest, user: AuthUser, context?: RouteContext) => {
    try {
      requirePermission(toPermissionContext(user), 'invoice:create');

      const { id } = await context!.params;
      const uploadId = parseInt(id, 10);
      if (isNaN(uploadId)) {
        return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
      }

      const clinicId = user.clinicId;
      if (!clinicId) {
        return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
      }

      const body = await req.json();
      const parsed = paymentSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid data', details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const updated = await markInvoicePaid(uploadId, clinicId, parsed.data, user.id);
      if (!updated) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      }

      return NextResponse.json({ success: true, data: updated });
    } catch (error) {
      return handleApiError(error, { context: { route: 'PATCH payment' } });
    }
  },
  { roles: ['admin', 'super_admin'] }
);
