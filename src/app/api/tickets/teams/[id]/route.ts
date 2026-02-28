/**
 * Team Detail API Route
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { handleApiError } from '@/domains/shared/errors';

interface RouteParams { params: Promise<{ id: string }>; }

export const GET = withAuth<RouteParams>(async (request, user, { params } = {} as RouteParams) => {
  try {
    const { id } = await params;
    const teamId = parseInt(id, 10);
    if (isNaN(teamId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

    const team = await prisma.ticketTeam.findUnique({
      where: { id: teamId },
      include: {
        members: {
          include: { user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } } },
          orderBy: [{ isLead: 'desc' }, { createdAt: 'asc' }],
        },
        defaultSlaPolicy: { select: { id: true, name: true } },
        _count: { select: { tickets: true } },
      },
    });

    if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    return NextResponse.json({ team });
  } catch (error) {
    return handleApiError(error, { route: `GET /api/tickets/teams/${(await params).id}` });
  }
});

export const PATCH = withAuth<RouteParams>(async (request, user, { params } = {} as RouteParams) => {
  try {
    const { id } = await params;
    const teamId = parseInt(id, 10);
    if (isNaN(teamId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    if (!['admin', 'super_admin'].includes(user.role.toLowerCase())) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const team = await prisma.ticketTeam.update({
      where: { id: teamId },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.color !== undefined ? { color: body.color } : {}),
        ...(body.defaultSlaPolicyId !== undefined ? { defaultSlaPolicyId: body.defaultSlaPolicyId || null } : {}),
        ...(body.autoAssignEnabled !== undefined ? { autoAssignEnabled: body.autoAssignEnabled } : {}),
        ...(body.roundRobinEnabled !== undefined ? { roundRobinEnabled: body.roundRobinEnabled } : {}),
        ...(body.maxTicketsPerMember !== undefined ? { maxTicketsPerMember: body.maxTicketsPerMember || null } : {}),
      },
    });

    return NextResponse.json({ team });
  } catch (error) {
    return handleApiError(error, { route: `PATCH /api/tickets/teams/${(await params).id}` });
  }
});

export const DELETE = withAuth<RouteParams>(async (request, user, { params } = {} as RouteParams) => {
  try {
    const { id } = await params;
    const teamId = parseInt(id, 10);
    if (isNaN(teamId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    if (!['admin', 'super_admin'].includes(user.role.toLowerCase())) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    await prisma.ticketTeam.update({ where: { id: teamId }, data: { isActive: false } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, { route: `DELETE /api/tickets/teams/${(await params).id}` });
  }
});
