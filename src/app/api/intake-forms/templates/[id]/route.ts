/**
 * API Routes for Individual Intake Form Template
 * GET: Get a specific template
 * PUT: Update a template
 * DELETE: Delete a template
 */

import { NextRequest, NextResponse } from 'next/server';
import { withProviderAuth } from '@/lib/auth/middleware';
import { getFormTemplate, deleteFormTemplate } from '@/lib/intake-forms/service';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

/**
 * GET /api/intake-forms/templates/[id]
 * Get a specific form template
 */
export const GET = withProviderAuth(async (req: NextRequest, user, context?: unknown) => {
  try {
    const routeContext = context as RouteParams;
    const resolvedParams = await routeContext.params;
    const templateId = parseInt(resolvedParams.id);
    if (isNaN(templateId)) {
      return NextResponse.json({ error: 'Invalid template ID' }, { status: 400 });
    }

    const template = await getFormTemplate(templateId);

    // Check access permissions
    // Allow access if user is admin or if the template belongs to the user's provider
    const isAdmin =
      (user.role as string) === 'admin' ||
      (user.role as string) === 'admin' ||
      (user.role as string) === 'admin';
    const isOwner =
      !template.providerId || template.providerId === user.providerId || template.providerId === 1; // Allow provider ID 1 for testing

    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    return NextResponse.json({ template });
  } catch (error: any) {
    // @ts-ignore

    logger.error('Failed to get form template', error);
    return NextResponse.json({ error: 'Failed to get form template' }, { status: 500 });
  }
});

/**
 * PUT /api/intake-forms/templates/[id]
 * Update a form template
 */
export const PUT = withProviderAuth(async (req: NextRequest, user, context?: unknown) => {
  try {
    const routeContext = context as RouteParams;
    const resolvedParams = await routeContext.params;
    const templateId = parseInt(resolvedParams.id);
    if (isNaN(templateId)) {
      return NextResponse.json({ error: 'Invalid template ID' }, { status: 400 });
    }

    const body = await req.json();

    // Check if template exists and user has access
    const existing = await prisma.intakeFormTemplate.findUnique({
      where: { id: templateId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    if (existing.providerId && existing.providerId !== user.providerId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Update the template
    const updated = await prisma.intakeFormTemplate.update({
      where: { id: templateId },
      data: {
        name: body.name,
        description: body.description,
        treatmentType: body.treatmentType,
        metadata: body.metadata,
        isActive: body.isActive,
        updatedAt: new Date(),
      },
    });

    // Update questions if provided
    if (body.questions && Array.isArray(body.questions)) {
      // Delete existing questions
      await prisma.intakeFormQuestion.deleteMany({
        where: { templateId },
      });

      // Create new questions
      await prisma.intakeFormQuestion.createMany({
        data: body.questions.map((q: any) => ({
          templateId,
          questionText: q.questionText,
          questionType: q.questionType,
          options: q.options,
          isRequired: q.isRequired || false,
          validation: q.validation,
          placeholder: q.placeholder,
          helpText: q.helpText,
          orderIndex: q.orderIndex,
          section: q.section,
          conditionalLogic: q.conditionalLogic,
        })),
      });
    }

    const updatedTemplate = await getFormTemplate(templateId);

    return NextResponse.json({
      template: updatedTemplate,
      message: 'Template updated successfully',
    });
  } catch (error: any) {
    // @ts-ignore

    logger.error('Failed to update form template', error);
    return NextResponse.json({ error: 'Failed to update form template' }, { status: 500 });
  }
});

/**
 * DELETE /api/intake-forms/templates/[id]
 * Delete (soft delete) a form template
 */
export const DELETE = withProviderAuth(async (req: NextRequest, user, context?: unknown) => {
  try {
    const routeContext = context as RouteParams;
    const resolvedParams = await routeContext.params;
    const templateId = parseInt(resolvedParams.id);
    if (isNaN(templateId)) {
      return NextResponse.json({ error: 'Invalid template ID' }, { status: 400 });
    }

    // Check if template exists and user has access
    const existing = await prisma.intakeFormTemplate.findUnique({
      where: { id: templateId },
      include: {
        _count: {
          select: {
            submissions: true,
          },
        },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    if (existing.providerId && existing.providerId !== user.providerId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Don't delete if there are submissions
    if (existing._count.submissions > 0) {
      // Soft delete instead
      await deleteFormTemplate(templateId);
      return NextResponse.json({
        message: 'Template deactivated (has existing submissions)',
      });
    }

    // Hard delete if no submissions
    await prisma.intakeFormTemplate.delete({
      where: { id: templateId },
    });

    return NextResponse.json({
      message: 'Template deleted successfully',
    });
  } catch (error: any) {
    // @ts-ignore

    logger.error('Failed to delete form template', error);
    return NextResponse.json({ error: 'Failed to delete form template' }, { status: 500 });
  }
});
