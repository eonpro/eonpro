/**
 * Single Pharmacy Invoice API
 *
 * GET   /api/admin/pharmacy-invoices/[id]  — Get invoice detail + summary
 * PATCH /api/admin/pharmacy-invoices/[id]  — Re-run reconciliation
 * DELETE /api/admin/pharmacy-invoices/[id] — Delete an upload and its line items
 *
 * @security Admin or Super Admin
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { handleApiError, NotFoundError } from '@/domains/shared/errors';
import { logger } from '@/lib/logger';
import {
  getUploadSummary,
  runReconciliation,
  deleteUpload,
  getLineItemsGroupedByOrder,
  getSignedPdfUrl,
} from '@/services/invoices/pharmacyInvoiceService';
import { requirePermission, toPermissionContext } from '@/lib/rbac/permissions';

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

      const clinicId = user.role === 'super_admin'
        ? parseInt(new URL(req.url).searchParams.get('clinicId') ?? '0') || user.clinicId
        : user.clinicId;

      if (!clinicId) {
        return NextResponse.json({ error: 'clinicId required' }, { status: 400 });
      }

      const summary = await getUploadSummary(uploadId, clinicId);
      if (!summary) throw new NotFoundError('Invoice upload not found');

      const orderGroups = await getLineItemsGroupedByOrder(uploadId);

      let pdfUrl: string | null = null;
      try {
        pdfUrl = await getSignedPdfUrl(summary.upload.s3Key);
      } catch {
        // S3 may not be configured in dev
      }

      return NextResponse.json({
        success: true,
        data: {
          summary,
          orderGroups,
          pdfUrl,
        },
      });
    } catch (error) {
      return handleApiError(error, { context: { route: 'GET /api/admin/pharmacy-invoices/[id]' } });
    }
  },
  { roles: ['admin', 'super_admin'] }
);

export const PATCH = withAuth(
  async (_req: NextRequest, user: AuthUser, context?: RouteContext) => {
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

      const summary = await runReconciliation(uploadId, clinicId);

      return NextResponse.json({ success: true, data: { summary } });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack?.slice(0, 500) : undefined;
      logger.error('Pharmacy invoice reconciliation PATCH failed', {
        uploadId: context ? 'present' : 'missing',
        error: msg,
        stack,
      });
      return NextResponse.json({ error: msg, stack }, { status: 500 });
    }
  },
  { roles: ['admin', 'super_admin'] }
);

export const DELETE = withAuth(
  async (_req: NextRequest, user: AuthUser, context?: RouteContext) => {
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

      const deleted = await deleteUpload(uploadId, clinicId);
      if (!deleted) throw new NotFoundError('Invoice upload not found');

      return NextResponse.json({ success: true });
    } catch (error) {
      return handleApiError(error, { context: { route: 'DELETE /api/admin/pharmacy-invoices/[id]' } });
    }
  },
  { roles: ['admin', 'super_admin'] }
);
