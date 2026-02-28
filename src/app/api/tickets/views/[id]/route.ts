/**
 * Saved View Detail API Route
 * ============================
 *
 * PATCH  /api/tickets/views/[id] - Update a saved view
 * DELETE /api/tickets/views/[id] - Delete a saved view
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
    const viewId = parseInt(id, 10);
    if (isNaN(viewId)) {
      return NextResponse.json({ error: 'Invalid view ID' }, { status: 400 });
    }

    const existing = await prisma.ticketSavedView.findUnique({ where: { id: viewId } });
    if (!existing) {
      return NextResponse.json({ error: 'View not found' }, { status: 404 });
    }
    if (existing.createdById !== user.id && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Cannot edit this view' }, { status: 403 });
    }

    const body = await request.json();
    const view = await prisma.ticketSavedView.update({
      where: { id: viewId },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.filters !== undefined ? { filters: body.filters } : {}),
        ...(body.sortField !== undefined ? { sortField: body.sortField } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        ...(body.columns !== undefined ? { columns: body.columns } : {}),
        ...(body.icon !== undefined ? { icon: body.icon } : {}),
        ...(body.color !== undefined ? { color: body.color } : {}),
        ...(body.position !== undefined ? { position: body.position } : {}),
      },
    });

    return NextResponse.json({ view });
  } catch (error) {
    return handleApiError(error, { route: `PATCH /api/tickets/views/${(await params).id}` });
  }
});

export const DELETE = withAuth<RouteParams>(async (request, user, { params } = {} as RouteParams) => {
  try {
    const { id } = await params;
    const viewId = parseInt(id, 10);
    if (isNaN(viewId)) {
      return NextResponse.json({ error: 'Invalid view ID' }, { status: 400 });
    }

    const existing = await prisma.ticketSavedView.findUnique({ where: { id: viewId } });
    if (!existing) {
      return NextResponse.json({ error: 'View not found' }, { status: 404 });
    }
    if (existing.createdById !== user.id && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Cannot delete this view' }, { status: 403 });
    }

    await prisma.ticketSavedView.delete({ where: { id: viewId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, { route: `DELETE /api/tickets/views/${(await params).id}` });
  }
});
