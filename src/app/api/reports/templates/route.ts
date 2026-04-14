import { NextRequest, NextResponse } from 'next/server';
import { prisma, withoutClinicFilter } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import { handleApiError } from '@/domains/shared/errors';

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  dataSource: z.string(),
  config: z.record(z.any()),
  isShared: z.boolean().optional(),
  accessRoles: z.array(z.string()).optional(),
});

async function handleGet(req: NextRequest, user: AuthUser) {
  try {
    const p = req.nextUrl.searchParams;
    const dataSource = p.get('dataSource');

    const where: Record<string, any> = {};
    if (dataSource) where.dataSource = dataSource;

    if (user.role === 'super_admin') {
      // Super admin sees all templates
    } else {
      where.OR = [
        { createdById: user.id },
        { isShared: true, clinicId: user.clinicId },
        { isSystemTemplate: true },
      ];
    }

    const fetch = async () =>
      prisma.reportTemplate.findMany({
        where,
        orderBy: [{ isSystemTemplate: 'desc' }, { updatedAt: 'desc' }],
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          schedules: {
            where: { isActive: true },
            select: { id: true, frequency: true, nextRunAt: true },
          },
        },
        take: 200,
      });

    const templates =
      user.role === 'super_admin' ? await withoutClinicFilter(fetch) : await fetch();

    return NextResponse.json({ templates });
  } catch (error) {
    return handleApiError(error, { context: { route: 'GET /api/reports/templates' } });
  }
}

async function handlePost(req: NextRequest, user: AuthUser) {
  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const template = await prisma.reportTemplate.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        dataSource: parsed.data.dataSource,
        config: parsed.data.config,
        isShared: parsed.data.isShared || false,
        accessRoles: parsed.data.accessRoles || ['super_admin', 'admin'],
        clinicId: user.role === 'super_admin' ? null : user.clinicId,
        createdById: user.id,
      },
    });

    return NextResponse.json({ success: true, template }, { status: 201 });
  } catch (error) {
    return handleApiError(error, { context: { route: 'POST /api/reports/templates' } });
  }
}

export const GET = withAuth(handleGet, { roles: ['super_admin', 'admin', 'provider'] });
export const POST = withAuth(handlePost, { roles: ['super_admin', 'admin'] });
