/**
 * Macro Detail API Route
 * ======================
 *
 * PATCH  /api/tickets/macros/[id] - Update a macro
 * DELETE /api/tickets/macros/[id] - Deactivate a macro
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { handleApiError } from '@/domains/shared/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const PATCH = withAuth<RouteParams>(async (request, user, { params } = {} as RouteParams) => {
  try {
    const { id } = await params;
    const macroId = parseInt(id, 10);
    if (isNaN(macroId)) {
      return NextResponse.json({ error: 'Invalid macro ID' }, { status: 400 });
    }

    const existing = await prisma.ticketMacro.findUnique({ where: { id: macroId } });
    if (!existing) {
      return NextResponse.json({ error: 'Macro not found' }, { status: 404 });
    }
    if (existing.createdById !== user.id && user.role !== 'super_admin' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Cannot edit this macro' }, { status: 403 });
    }

    const body = await request.json();
    const macro = await prisma.ticketMacro.update({
      where: { id: macroId },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.responseContent !== undefined ? { responseContent: body.responseContent } : {}),
        ...(body.setStatus !== undefined ? { setStatus: body.setStatus } : {}),
        ...(body.setPriority !== undefined ? { setPriority: body.setPriority } : {}),
        ...(body.setCategory !== undefined ? { setCategory: body.setCategory } : {}),
        ...(body.addTags !== undefined ? { addTags: body.addTags } : {}),
        ...(body.removeTags !== undefined ? { removeTags: body.removeTags } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
    });

    return NextResponse.json({ macro });
  } catch (error) {
    return handleApiError(error, { route: `PATCH /api/tickets/macros/${(await params).id}` });
  }
});

export const DELETE = withAuth<RouteParams>(async (request, user, { params } = {} as RouteParams) => {
  try {
    const { id } = await params;
    const macroId = parseInt(id, 10);
    if (isNaN(macroId)) {
      return NextResponse.json({ error: 'Invalid macro ID' }, { status: 400 });
    }

    const existing = await prisma.ticketMacro.findUnique({ where: { id: macroId } });
    if (!existing) {
      return NextResponse.json({ error: 'Macro not found' }, { status: 404 });
    }
    if (existing.createdById !== user.id && user.role !== 'super_admin' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Cannot delete this macro' }, { status: 403 });
    }

    await prisma.ticketMacro.update({
      where: { id: macroId },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, { route: `DELETE /api/tickets/macros/${(await params).id}` });
  }
});
