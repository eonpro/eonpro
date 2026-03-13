/**
 * Pharmacy Invoice Reconciliation API
 *
 * GET  /api/admin/pharmacy-invoices  — List uploaded invoices for the clinic
 * POST /api/admin/pharmacy-invoices  — Upload a new invoice PDF, parse, and reconcile
 *
 * @security Admin or Super Admin
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import { handleApiError } from '@/domains/shared/errors';
import {
  uploadAndParseInvoice,
  runReconciliation,
  listUploads,
} from '@/services/invoices/pharmacyInvoiceService';
import { requirePermission, toPermissionContext } from '@/lib/rbac/permissions';
import { logger } from '@/lib/logger';

const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
});

export const GET = withAuth(
  async (req: NextRequest, user: AuthUser) => {
    try {
      requirePermission(toPermissionContext(user), 'invoice:view');

      const clinicId = user.role === 'super_admin'
        ? parseInt(new URL(req.url).searchParams.get('clinicId') ?? '0')
        : user.clinicId;

      if (!clinicId) {
        return NextResponse.json({ error: 'clinicId required' }, { status: 400 });
      }

      const { searchParams } = new URL(req.url);
      const filters = listSchema.parse({
        page: searchParams.get('page') ?? 1,
        limit: searchParams.get('limit') ?? 20,
        status: searchParams.get('status') ?? undefined,
      });

      const result = await listUploads({ clinicId, ...filters });

      return NextResponse.json({ success: true, data: result });
    } catch (error) {
      return handleApiError(error, { context: { route: 'GET /api/admin/pharmacy-invoices' } });
    }
  },
  { roles: ['admin', 'super_admin'] }
);

export const POST = withAuth(
  async (req: NextRequest, user: AuthUser) => {
    try {
      requirePermission(toPermissionContext(user), 'invoice:create');

      const clinicId = user.clinicId;
      if (!clinicId) {
        return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
      }

      const formData = await req.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }

      const allowedTypes = ['application/pdf', 'text/csv', 'application/vnd.ms-excel'];
      const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv' || file.type === 'application/vnd.ms-excel';
      if (!isCsv && file.type !== 'application/pdf') {
        return NextResponse.json({ error: 'Only PDF and CSV files are accepted' }, { status: 400 });
      }

      const maxSize = 50 * 1024 * 1024; // 50 MB
      if (file.size > maxSize) {
        return NextResponse.json({ error: 'File exceeds 50 MB limit' }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());

      logger.info('Pharmacy invoice upload started', {
        clinicId,
        userId: user.id,
        fileName: file.name,
        fileSize: file.size,
      });

      // Upload + parse ONLY (reconciliation is triggered separately via PATCH
      // to avoid Vercel function timeouts on large invoices)
      let uploadResult;
      try {
        uploadResult = await uploadAndParseInvoice({
          clinicId,
          uploadedBy: user.id,
          pdfBuffer: buffer,
          fileName: file.name,
          fileType: isCsv ? 'csv' : 'pdf',
        });
      } catch (parseErr) {
        const msg = parseErr instanceof Error ? parseErr.message : 'Upload/parse failed';
        const statusCode = (parseErr as { statusCode?: number }).statusCode ?? 500;
        logger.error('Pharmacy invoice upload/parse failed', {
          clinicId,
          userId: user.id,
          error: msg,
        });
        return NextResponse.json({ error: msg }, { status: statusCode });
      }

      const { upload, parsed } = uploadResult;

      return NextResponse.json(
        {
          success: true,
          data: {
            upload,
            summary: {
              totalLineItems: parsed.lineItems.length,
              orderCount: parsed.orderCount,
              totalCents: parsed.totalCents,
              status: 'PARSED',
            },
          },
        },
        { status: 201 }
      );
    } catch (error) {
      return handleApiError(error, { context: { route: 'POST /api/admin/pharmacy-invoices' } });
    }
  },
  { roles: ['admin', 'super_admin'] }
);
