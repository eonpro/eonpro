/**
 * Ticket Templates API Route
 * ==========================
 *
 * GET  /api/tickets/templates - List active templates for current clinic
 * POST /api/tickets/templates - Create a new template
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { handleApiError } from '@/domains/shared/errors';
import { logger } from '@/lib/logger';

export const GET = withAuth(async (request, user) => {
  try {
    const clinicId = user.clinicId;
    if (!clinicId && user.role !== 'super_admin') {
      return NextResponse.json({ templates: [] });
    }

    const templates = await prisma.ticketTemplate.findMany({
      where: {
        ...(clinicId ? { clinicId } : {}),
        isActive: true,
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    return NextResponse.json({ templates });
  } catch (error) {
    return handleApiError(error, { route: 'GET /api/tickets/templates' });
  }
});

export const POST = withAuth(async (request, user) => {
  try {
    const clinicId = user.clinicId;
    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
    }

    const body = await request.json();
    if (!body.name?.trim() || !body.titleTemplate?.trim() || !body.category) {
      return NextResponse.json({ error: 'Name, title template, and category are required' }, { status: 400 });
    }

    const template = await prisma.ticketTemplate.create({
      data: {
        clinicId,
        name: body.name.trim(),
        description: body.description?.trim() || null,
        category: body.category,
        titleTemplate: body.titleTemplate.trim(),
        descriptionTemplate: body.descriptionTemplate?.trim() || '',
        priority: body.priority || 'MEDIUM',
        source: body.source || 'INTERNAL',
        defaultTeamId: body.defaultTeamId || null,
        defaultAssigneeId: body.defaultAssigneeId || null,
        tags: body.tags || [],
        createdById: user.id,
      },
    });

    logger.info('[API] Template created', { templateId: template.id, userId: user.id });

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    return handleApiError(error, { route: 'POST /api/tickets/templates' });
  }
});
