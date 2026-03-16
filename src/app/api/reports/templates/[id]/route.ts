import { NextRequest, NextResponse } from 'next/server';
import { prisma, withoutClinicFilter } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import { handleApiError } from '@/domains/shared/errors';

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  config: z.record(z.any()).optional(),
  isShared: z.boolean().optional(),
  accessRoles: z.array(z.string()).optional(),
});

function withTemplateAuth(
  handler: (req: NextRequest, user: AuthUser, params: { id: string }) => Promise<Response>
) {
  return (req: NextRequest, context: { params: Promise<{ id: string }> }) => {
    return withAuth(
      async (request: NextRequest, authUser: AuthUser) => {
        const params = await context.params;
        return handler(request, authUser, params);
      },
      { roles: ['super_admin', 'admin', 'provider'] }
    )(req);
  };
}

async function handleGet(_req: NextRequest, user: AuthUser, params: { id: string }) {
  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

    const fetch = async () => prisma.reportTemplate.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        schedules: { select: { id: true, frequency: true, exportFormat: true, recipients: true, isActive: true, nextRunAt: true, lastRunAt: true } },
      },
    });

    const template = user.role === 'super_admin' ? await withoutClinicFilter(fetch) : await fetch();
    if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    if (user.role !== 'super_admin' && !template.isSystemTemplate && !template.isShared && template.createdById !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    return NextResponse.json({ template });
  } catch (error) {
    return handleApiError(error, { context: { route: `GET /api/reports/templates/${params.id}` } });
  }
}

async function handlePatch(req: NextRequest, user: AuthUser, params: { id: string }) {
  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });

    const existing = await prisma.reportTemplate.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (existing.isSystemTemplate && user.role !== 'super_admin') return NextResponse.json({ error: 'Cannot modify system templates' }, { status: 403 });
    if (user.role !== 'super_admin' && existing.createdById !== user.id) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    const updated = await prisma.reportTemplate.update({
      where: { id },
      data: parsed.data,
    });

    return NextResponse.json({ success: true, template: updated });
  } catch (error) {
    return handleApiError(error, { context: { route: `PATCH /api/reports/templates/${params.id}` } });
  }
}

async function handleDelete(_req: NextRequest, user: AuthUser, params: { id: string }) {
  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

    const existing = await prisma.reportTemplate.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (existing.isSystemTemplate) return NextResponse.json({ error: 'Cannot delete system templates' }, { status: 403 });
    if (user.role !== 'super_admin' && existing.createdById !== user.id) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    await prisma.reportTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, { context: { route: `DELETE /api/reports/templates/${params.id}` } });
  }
}

export const GET = withTemplateAuth(handleGet);
export const PATCH = withTemplateAuth(handlePatch);
export const DELETE = withTemplateAuth(handleDelete);
