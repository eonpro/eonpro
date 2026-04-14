/**
 * Provider Pharmacy Invoice Detail API (Read-only)
 *
 * GET /api/provider/pharmacy-invoices/[id] — Get reconciled invoice detail,
 *     filtered to the provider's own prescriptions.
 *
 * @security Provider role
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { handleApiError, NotFoundError } from '@/domains/shared/errors';
import {
  getUploadSummary,
  getLineItemsGroupedByOrder,
} from '@/services/invoices/pharmacyInvoiceService';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withAuth(
  async (_req: NextRequest, user: AuthUser, context?: RouteContext) => {
    try {
      const { id } = await context!.params;
      const uploadId = parseInt(id, 10);
      if (isNaN(uploadId)) {
        return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
      }

      const clinicId = user.clinicId;
      if (!clinicId) {
        return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
      }

      const summary = await getUploadSummary(uploadId, clinicId);
      if (!summary) throw new NotFoundError('Invoice not found');

      const { searchParams } = new URL(_req.url);
      const groupResult = await getLineItemsGroupedByOrder(uploadId, {
        search: searchParams.get('search') ?? undefined,
        page: parseInt(searchParams.get('page') ?? '1', 10),
        limit: parseInt(searchParams.get('limit') ?? '50', 10),
      });

      // Filter to only this provider's orders
      const providerId = user.providerId;
      let orderGroups = groupResult.orderGroups;

      if (providerId && user.role === 'provider') {
        const providerOrderIds = await prisma.order
          .findMany({
            where: { providerId, clinicId },
            select: { lifefileOrderId: true },
          })
          .then((orders) => new Set(orders.map((o) => o.lifefileOrderId).filter(Boolean)));

        orderGroups = orderGroups.filter(
          (g) => g.lifefileOrderId && providerOrderIds.has(g.lifefileOrderId)
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          summary,
          orderGroups,
          totalGroups: groupResult.totalGroups,
          totalPages: groupResult.totalPages,
          page: groupResult.page,
        },
      });
    } catch (error) {
      return handleApiError(error, {
        context: { route: 'GET /api/provider/pharmacy-invoices/[id]' },
      });
    }
  },
  { roles: ['provider', 'admin', 'super_admin'] }
);
