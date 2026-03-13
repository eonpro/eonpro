/**
 * Consolidated Statements API
 *
 * GET  /api/admin/pharmacy-invoices/statements -- List statements
 * POST /api/admin/pharmacy-invoices/statements -- Create statement
 *
 * @security Admin or Super Admin
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import { handleApiError } from '@/domains/shared/errors';
import { listStatements, createConsolidatedStatement } from '@/services/invoices/pharmacyInvoiceService';
import { requirePermission, toPermissionContext } from '@/lib/rbac/permissions';

export const GET = withAuth(
  async (_req: NextRequest, user: AuthUser) => {
    try {
      requirePermission(toPermissionContext(user), 'invoice:view');
      const clinicId = user.clinicId;
      if (!clinicId) return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });

      const statements = await listStatements(clinicId);
      return NextResponse.json({ success: true, data: statements });
    } catch (error) {
      return handleApiError(error, { context: { route: 'GET statements' } });
    }
  },
  { roles: ['admin', 'super_admin'] }
);

const createSchema = z.object({
  title: z.string().min(1).max(200),
  invoiceUploadIds: z.array(z.number().int().positive()).min(1),
  notes: z.string().optional(),
});

export const POST = withAuth(
  async (req: NextRequest, user: AuthUser) => {
    try {
      requirePermission(toPermissionContext(user), 'invoice:create');
      const clinicId = user.clinicId;
      if (!clinicId) return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });

      const body = await req.json();
      const parsed = createSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten() }, { status: 400 });
      }

      const statement = await createConsolidatedStatement(
        clinicId,
        parsed.data.invoiceUploadIds,
        parsed.data.title,
        user.id,
        parsed.data.notes
      );

      return NextResponse.json({ success: true, data: statement }, { status: 201 });
    } catch (error) {
      return handleApiError(error, { context: { route: 'POST statements' } });
    }
  },
  { roles: ['admin', 'super_admin'] }
);
