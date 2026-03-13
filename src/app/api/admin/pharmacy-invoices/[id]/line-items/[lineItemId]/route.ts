/**
 * Single Line Item API
 *
 * PATCH /api/admin/pharmacy-invoices/[id]/line-items/[lineItemId]
 *   Update notes, disputed flag, adjusted amount, or match status
 *
 * @security Admin or Super Admin
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import { handleApiError } from '@/domains/shared/errors';
import { updateLineItem, getUploadById } from '@/services/invoices/pharmacyInvoiceService';
import { requirePermission, toPermissionContext } from '@/lib/rbac/permissions';

const updateSchema = z.object({
  adminNotes: z.string().nullable().optional(),
  disputed: z.boolean().optional(),
  adjustedAmountCents: z.number().int().nullable().optional(),
  matchStatus: z.enum(['MATCHED', 'UNMATCHED', 'DISCREPANCY', 'MANUALLY_MATCHED', 'DISPUTED']).optional(),
});

type RouteContext = { params: Promise<{ id: string; lineItemId: string }> };

export const PATCH = withAuth(
  async (req: NextRequest, user: AuthUser, context?: RouteContext) => {
    try {
      requirePermission(toPermissionContext(user), 'invoice:create');

      const { id, lineItemId } = await context!.params;
      const uploadId = parseInt(id, 10);
      const itemId = parseInt(lineItemId, 10);
      if (isNaN(uploadId) || isNaN(itemId)) {
        return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
      }

      const clinicId = user.clinicId;
      if (!clinicId) {
        return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
      }

      const upload = await getUploadById(uploadId, clinicId);
      if (!upload) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      }

      const body = await req.json();
      const parsed = updateSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten() }, { status: 400 });
      }

      const updated = await updateLineItem(itemId, uploadId, parsed.data);
      if (!updated) {
        return NextResponse.json({ error: 'Line item not found' }, { status: 404 });
      }

      return NextResponse.json({ success: true, data: updated });
    } catch (error) {
      return handleApiError(error, { context: { route: 'PATCH line-item' } });
    }
  },
  { roles: ['admin', 'super_admin'] }
);
