/**
 * Business Hours Detail API Route
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { handleApiError } from '@/domains/shared/errors';

interface RouteParams { params: Promise<{ id: string }>; }

export const PATCH = withAuth<RouteParams>(async (request, user, { params } = {} as RouteParams) => {
  try {
    const { id } = await params;
    const bhId = parseInt(id, 10);
    if (isNaN(bhId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    if (!['admin', 'super_admin'].includes(user.role.toLowerCase())) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const bh = await prisma.ticketBusinessHours.update({
      where: { id: bhId },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
        ...(body.schedule !== undefined ? { schedule: body.schedule } : {}),
        ...(body.holidays !== undefined ? { holidays: body.holidays } : {}),
        ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
    });

    return NextResponse.json({ businessHours: bh });
  } catch (error) {
    return handleApiError(error, { route: `PATCH /api/tickets/business-hours/${(await params).id}` });
  }
});

export const DELETE = withAuth<RouteParams>(async (request, user, { params } = {} as RouteParams) => {
  try {
    const { id } = await params;
    const bhId = parseInt(id, 10);
    if (isNaN(bhId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    if (!['admin', 'super_admin'].includes(user.role.toLowerCase())) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    await prisma.ticketBusinessHours.update({ where: { id: bhId }, data: { isActive: false } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, { route: `DELETE /api/tickets/business-hours/${(await params).id}` });
  }
});
