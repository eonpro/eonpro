/**
 * GET  /api/admin/intake-templates — List templates for the clinic
 * POST /api/admin/intake-templates — Create a new template (optionally from library)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { handleApiError } from '@/domains/shared/errors';
import { z } from 'zod';
import { weightLossIntakeConfig } from '@/domains/intake/templates/weight-loss-intake';

const TEMPLATE_LIBRARY: Record<string, unknown> = {
  'weight-loss': weightLossIntakeConfig,
};

const createSchema = z.object({
  name: z.string().min(1),
  treatmentType: z.string().min(1),
  description: z.string().optional(),
  fromLibrary: z.string().optional(),
});

export const GET = withAuth(
  async (_req: NextRequest, user: AuthUser) => {
    try {
      const rows = await prisma.intakeFormTemplate.findMany({
        where: { clinicId: user.clinicId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          description: true,
          treatmentType: true,
          isActive: true,
          version: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { submissions: true, drafts: true } },
        },
      });

      const templates = rows.map((t) => ({
        ...t,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        _count: { submissions: t._count?.submissions ?? 0, drafts: t._count?.drafts ?? 0 },
      }));

      return NextResponse.json({ templates });
    } catch (error) {
      return handleApiError(error, { context: { route: 'GET /api/admin/intake-templates' } });
    }
  },
  { roles: ['admin', 'super_admin'] },
);

export const POST = withAuth(
  async (req: NextRequest, user: AuthUser) => {
    try {
      const body = await req.json();
      const parsed = createSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Validation failed', details: parsed.error.flatten() },
          { status: 400 },
        );
      }

      const { name, treatmentType, description, fromLibrary } = parsed.data;
      const formConfig = fromLibrary ? TEMPLATE_LIBRARY[fromLibrary] : undefined;

      const template = await prisma.intakeFormTemplate.create({
        data: {
          name,
          treatmentType,
          description,
          clinicId: user.clinicId,
          createdById: user.id,
          isActive: true,
          version: 1,
          metadata: formConfig ? { formConfig } : undefined,
        },
      });

      logger.info('Intake template created', {
        templateId: template.id,
        clinicId: user.clinicId,
        fromLibrary: fromLibrary ?? 'blank',
      });

      const templateWithCount = {
        ...template,
        _count: { submissions: 0, drafts: 0 },
      };
      return NextResponse.json({ template: templateWithCount }, { status: 201 });
    } catch (error) {
      return handleApiError(error, { context: { route: 'POST /api/admin/intake-templates' } });
    }
  },
  { roles: ['admin', 'super_admin'] },
);
