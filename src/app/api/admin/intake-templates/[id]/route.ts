/**
 * GET    /api/admin/intake-templates/[id] — Get template details
 * PUT    /api/admin/intake-templates/[id] — Update template (creates new version)
 * DELETE /api/admin/intake-templates/[id] — Deactivate template
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { handleApiError } from '@/domains/shared/errors';
import { z } from 'zod';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth(
  async (req: NextRequest, user: AuthUser) => {
    try {
      const { id } = await (req as unknown as RouteParams).params;
      const templateId = parseInt(id, 10);
      if (isNaN(templateId)) {
        return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
      }

      const template = await prisma.intakeFormTemplate.findFirst({
        where: { id: templateId, clinicId: user.clinicId },
        include: {
          questions: { orderBy: { orderIndex: 'asc' } },
        },
      });

      if (!template) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }

      return NextResponse.json({ template });
    } catch (error) {
      return handleApiError(error, { context: { route: 'GET /api/admin/intake-templates/[id]' } });
    }
  },
  { roles: ['admin', 'super_admin'] },
);

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  formConfig: z.record(z.unknown()).optional(),
});

export const PUT = withAuth(
  async (req: NextRequest, user: AuthUser) => {
    try {
      const url = new URL(req.url);
      const segments = url.pathname.split('/');
      const id = parseInt(segments[segments.length - 1], 10);
      if (isNaN(id)) {
        return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
      }

      const body = await req.json();
      const parsed = updateSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Validation failed', details: parsed.error.flatten() },
          { status: 400 },
        );
      }

      const existing = await prisma.intakeFormTemplate.findFirst({
        where: { id, clinicId: user.clinicId },
      });
      if (!existing) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }

      const { formConfig, ...updateData } = parsed.data;
      const currentMetadata = (existing.metadata as Record<string, unknown>) ?? {};

      const template = await prisma.intakeFormTemplate.update({
        where: { id },
        data: {
          ...updateData,
          version: formConfig ? existing.version + 1 : existing.version,
          metadata: formConfig
            ? ({ ...currentMetadata, formConfig } as any)
            : existing.metadata,
        },
      });

      logger.info('Intake template updated', {
        templateId: id,
        clinicId: user.clinicId,
        newVersion: template.version,
      });

      return NextResponse.json({ template });
    } catch (error) {
      return handleApiError(error, { context: { route: 'PUT /api/admin/intake-templates/[id]' } });
    }
  },
  { roles: ['admin', 'super_admin'] },
);

export const DELETE = withAuth(
  async (req: NextRequest, user: AuthUser) => {
    try {
      const url = new URL(req.url);
      const segments = url.pathname.split('/');
      const id = parseInt(segments[segments.length - 1], 10);
      if (isNaN(id)) {
        return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
      }

      const existing = await prisma.intakeFormTemplate.findFirst({
        where: { id, clinicId: user.clinicId },
      });
      if (!existing) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }

      await prisma.intakeFormTemplate.update({
        where: { id },
        data: { isActive: false },
      });

      logger.info('Intake template deactivated', {
        templateId: id,
        clinicId: user.clinicId,
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      return handleApiError(error, { context: { route: 'DELETE /api/admin/intake-templates/[id]' } });
    }
  },
  { roles: ['admin', 'super_admin'] },
);
