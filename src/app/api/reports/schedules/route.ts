import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import { handleApiError } from '@/domains/shared/errors';

function computeNextRun(frequency: string, dayOfWeek?: number | null, dayOfMonth?: number | null, timeUtc?: string): Date {
  const now = new Date();
  const [h, m] = (timeUtc || '06:00').split(':').map(Number);
  const next = new Date(now);
  next.setUTCHours(h, m, 0, 0);

  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);

  if (frequency === 'weekly' && dayOfWeek != null) {
    while (next.getUTCDay() !== dayOfWeek) next.setUTCDate(next.getUTCDate() + 1);
  } else if (frequency === 'biweekly' && dayOfWeek != null) {
    while (next.getUTCDay() !== dayOfWeek) next.setUTCDate(next.getUTCDate() + 1);
  } else if (frequency === 'monthly' && dayOfMonth != null) {
    next.setUTCDate(dayOfMonth);
    if (next <= now) next.setUTCMonth(next.getUTCMonth() + 1);
  }

  return next;
}

const createSchema = z.object({
  templateId: z.number().positive(),
  frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly']),
  dayOfWeek: z.number().min(0).max(6).optional(),
  dayOfMonth: z.number().min(1).max(28).optional(),
  timeUtc: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  exportFormat: z.enum(['csv', 'pdf', 'xlsx']).optional(),
  recipients: z.array(z.string().email()).min(1),
});

async function handleGet(req: NextRequest, user: AuthUser) {
  try {
    const where: Record<string, any> = {};
    if (user.role !== 'super_admin') where.createdById = user.id;

    const schedules = await prisma.reportSchedule.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        template: { select: { id: true, name: true, dataSource: true } },
      },
      take: 100,
    });

    return NextResponse.json({ schedules });
  } catch (error) {
    return handleApiError(error, { context: { route: 'GET /api/reports/schedules' } });
  }
}

async function handlePost(req: NextRequest, user: AuthUser) {
  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }

    const template = await prisma.reportTemplate.findUnique({ where: { id: parsed.data.templateId } });
    if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

    const nextRunAt = computeNextRun(parsed.data.frequency, parsed.data.dayOfWeek, parsed.data.dayOfMonth, parsed.data.timeUtc);

    const schedule = await prisma.reportSchedule.create({
      data: {
        templateId: parsed.data.templateId,
        createdById: user.id,
        clinicId: user.role === 'super_admin' ? template.clinicId : user.clinicId,
        frequency: parsed.data.frequency,
        dayOfWeek: parsed.data.dayOfWeek,
        dayOfMonth: parsed.data.dayOfMonth,
        timeUtc: parsed.data.timeUtc || '06:00',
        exportFormat: parsed.data.exportFormat || 'csv',
        recipients: parsed.data.recipients,
        nextRunAt,
      },
      include: { template: { select: { id: true, name: true, dataSource: true } } },
    });

    return NextResponse.json({ success: true, schedule }, { status: 201 });
  } catch (error) {
    return handleApiError(error, { context: { route: 'POST /api/reports/schedules' } });
  }
}

export const GET = withAuth(handleGet, { roles: ['super_admin', 'admin'] });
export const POST = withAuth(handlePost, { roles: ['super_admin', 'admin'] });
