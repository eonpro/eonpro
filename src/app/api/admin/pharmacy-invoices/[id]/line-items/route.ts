/**
 * Pharmacy Invoice Line Items API
 *
 * GET /api/admin/pharmacy-invoices/[id]/line-items — Paginated list of parsed line items
 *
 * @security Admin or Super Admin
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import { handleApiError } from '@/domains/shared/errors';
import { listLineItems, getUploadById } from '@/services/invoices/pharmacyInvoiceService';
import { requirePermission, toPermissionContext } from '@/lib/rbac/permissions';
import type { PharmacyInvoiceMatchStatus } from '@prisma/client';

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  matchStatus: z.enum(['PENDING', 'MATCHED', 'UNMATCHED', 'DISCREPANCY']).optional(),
  lifefileOrderId: z.string().optional(),
  search: z.string().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withAuth(
  async (req: NextRequest, user: AuthUser, context?: RouteContext) => {
    try {
      requirePermission(toPermissionContext(user), 'invoice:view');

      const { id } = await context!.params;
      const uploadId = parseInt(id, 10);
      if (isNaN(uploadId)) {
        return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
      }

      const clinicId =
        user.role === 'super_admin'
          ? parseInt(new URL(req.url).searchParams.get('clinicId') ?? '0') || user.clinicId
          : user.clinicId;

      if (!clinicId) {
        return NextResponse.json({ error: 'clinicId required' }, { status: 400 });
      }

      // Verify the upload belongs to this clinic
      const upload = await getUploadById(uploadId, clinicId);
      if (!upload) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      }

      const { searchParams } = new URL(req.url);
      const filters = querySchema.parse({
        page: searchParams.get('page') ?? 1,
        limit: searchParams.get('limit') ?? 50,
        matchStatus: searchParams.get('matchStatus') ?? undefined,
        lifefileOrderId: searchParams.get('lifefileOrderId') ?? undefined,
        search: searchParams.get('search') ?? undefined,
      });

      const result = await listLineItems({
        invoiceUploadId: uploadId,
        matchStatus: filters.matchStatus as PharmacyInvoiceMatchStatus | undefined,
        lifefileOrderId: filters.lifefileOrderId,
        search: filters.search,
        page: filters.page,
        limit: filters.limit,
      });

      return NextResponse.json({ success: true, data: result });
    } catch (error) {
      return handleApiError(error, {
        context: { route: 'GET /api/admin/pharmacy-invoices/[id]/line-items' },
      });
    }
  },
  { roles: ['admin', 'super_admin'] }
);
