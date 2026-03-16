import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import { handleApiError } from '@/domains/shared/errors';

const patchSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly']).optional(),
  dayOfWeek: z.number().min(0).max(6).optional(),
  dayOfMonth: z.number().min(1).max(28).optional(),
  timeUtc: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  exportFormat: z.enum(['csv', 'pdf', 'xlsx']).optional(),
  recipients: z.array(z.string().email()).optional(),
  isActive: z.boolean().optional(),
});

function withScheduleAuth(
  handler: (req: NextRequest, user: AuthUser, params: { id: string }) => Promise<Response>
) {
  return (req: NextRequest, context: { params: Promise<{ id: string }> }) => {
    return withAuth(
      async (request: NextRequest, authUser: AuthUser) => {
        const params = await context.params;
        return handler(request, authUser, params);
      },
      { roles: ['super_admin', 'admin'] }
    )(req);
  };
}

async function handlePatch(req: NextRequest, user: AuthUser, params: { id: string }) {
  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

    const existing = await prisma.reportSchedule.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (user.role !== 'super_admin' && existing.createdById !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });

    const updated = await prisma.reportSchedule.update({
      where: { id },
      data: parsed.data,
    });

    return NextResponse.json({ success: true, schedule: updated });
  } catch (error) {
    return handleApiError(error, { context: { route: `PATCH /api/reports/schedules/${params.id}` } });
  }
}

async function handleDelete(_req: NextRequest, user: AuthUser, params: { id: string }) {
  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

    const existing = await prisma.reportSchedule.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (user.role !== 'super_admin' && existing.createdById !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    await prisma.reportSchedule.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, { context: { route: `DELETE /api/reports/schedules/${params.id}` } });
  }
}

export const PATCH = withScheduleAuth(handlePatch);
export const DELETE = withScheduleAuth(handleDelete);
