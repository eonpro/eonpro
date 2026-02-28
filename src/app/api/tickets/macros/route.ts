/**
 * Macros API Route
 * ================
 *
 * GET  /api/tickets/macros - List macros for current clinic
 * POST /api/tickets/macros - Create a new macro
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
      return NextResponse.json({ macros: [] });
    }

    const macros = await prisma.ticketMacro.findMany({
      where: {
        ...(clinicId ? { clinicId } : {}),
        isActive: true,
        OR: [
          { isPersonal: false },
          { createdById: user.id },
        ],
      },
      orderBy: [{ usageCount: 'desc' }, { name: 'asc' }],
      take: 200,
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return NextResponse.json({ macros });
  } catch (error) {
    return handleApiError(error, { route: 'GET /api/tickets/macros' });
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
      return NextResponse.json({ error: 'Macro name is required' }, { status: 400 });
    }
    if (!body.responseContent?.trim()) {
      return NextResponse.json({ error: 'Response content is required' }, { status: 400 });
    }

    const macro = await prisma.ticketMacro.create({
      data: {
        clinicId,
        name: body.name.trim(),
        description: body.description?.trim() || null,
        category: body.category || null,
        responseContent: body.responseContent.trim(),
        setStatus: body.setStatus || null,
        setPriority: body.setPriority || null,
        setCategory: body.setCategory || null,
        addTags: body.addTags || [],
        removeTags: body.removeTags || [],
        isPersonal: body.isPersonal ?? false,
        createdById: user.id,
      },
    });

    logger.info('[API] Macro created', { macroId: macro.id, userId: user.id });

    return NextResponse.json({ macro }, { status: 201 });
  } catch (error) {
    return handleApiError(error, { route: 'POST /api/tickets/macros' });
  }
});
