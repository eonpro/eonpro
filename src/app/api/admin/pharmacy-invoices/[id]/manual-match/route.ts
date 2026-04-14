/**
 * Manual Match API
 *
 * POST /api/admin/pharmacy-invoices/[id]/manual-match
 *   Manually match invoice line items to an order by orderId or lifefileOrderId
 *
 * @security Admin or Super Admin
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import { handleApiError } from '@/domains/shared/errors';
import {
  manualMatchLineItems,
  manualMatchByLifefileOrderId,
  getUploadById,
} from '@/services/invoices/pharmacyInvoiceService';
import { requirePermission, toPermissionContext } from '@/lib/rbac/permissions';

const matchSchema = z
  .object({
    lineItemIds: z.array(z.number().int().positive()).min(1),
    orderId: z.number().int().positive().optional(),
    lifefileOrderId: z.string().min(1).optional(),
  })
  .refine((data) => data.orderId || data.lifefileOrderId, {
    message: 'Either orderId or lifefileOrderId is required',
  });

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withAuth(
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

      const upload = await getUploadById(uploadId, clinicId);
      if (!upload) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      }

      const body = await req.json();
      const parsed = matchSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid data', details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      let result;
      if (parsed.data.orderId) {
        result = await manualMatchLineItems(
          uploadId,
          parsed.data.lineItemIds,
          parsed.data.orderId,
          user.id
        );
      } else {
        result = await manualMatchByLifefileOrderId(
          uploadId,
          parsed.data.lineItemIds,
          parsed.data.lifefileOrderId!,
          clinicId,
          user.id
        );
      }

      return NextResponse.json({ success: true, data: result });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Match failed';
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  },
  { roles: ['admin', 'super_admin'] }
);
