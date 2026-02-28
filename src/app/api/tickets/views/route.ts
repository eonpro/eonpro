/**
 * Saved Views API Route
 * =====================
 *
 * GET  /api/tickets/views - List saved views for current user/clinic
 * POST /api/tickets/views - Create a new saved view
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
      return NextResponse.json({ views: [] });
    }

    const views = await prisma.ticketSavedView.findMany({
      where: {
        ...(clinicId ? { clinicId } : {}),
        OR: [
          { isPersonal: false },
          { createdById: user.id },
        ],
      },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      take: 200,
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return NextResponse.json({ views });
  } catch (error) {
    return handleApiError(error, { route: 'GET /api/tickets/views' });
  }
});

export const POST = withAuth(async (request, user) => {
  try {
    const clinicId = user.clinicId;
    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
    }

    const body = await request.json();

    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'View name is required' }, { status: 400 });
    }

    const view = await prisma.ticketSavedView.create({
      data: {
        clinicId,
        name: body.name.trim(),
        description: body.description?.trim() || null,
        icon: body.icon || null,
        color: body.color || null,
        filters: body.filters || {},
        sortField: body.sortField || 'createdAt',
        sortOrder: body.sortOrder || 'desc',
        columns: body.columns || ['ticketNumber', 'title', 'status', 'priority', 'assignedTo', 'createdAt'],
        isPersonal: body.isPersonal ?? true,
        isDefault: false,
        position: body.position || 0,
        createdById: user.id,
      },
    });

    logger.info('[API] Saved view created', { viewId: view.id, userId: user.id });

    return NextResponse.json({ view }, { status: 201 });
  } catch (error) {
    return handleApiError(error, { route: 'POST /api/tickets/views' });
  }
});
