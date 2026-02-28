/**
 * Team Members API Route
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { handleApiError } from '@/domains/shared/errors';

interface RouteParams { params: Promise<{ id: string }>; }

export const POST = withAuth<RouteParams>(async (request, user, { params } = {} as RouteParams) => {
  try {
    const { id } = await params;
    const teamId = parseInt(id, 10);
    if (isNaN(teamId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    if (!['admin', 'super_admin'].includes(user.role.toLowerCase())) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    if (!body.userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

    const member = await prisma.ticketTeamMember.upsert({
      where: { teamId_userId: { teamId, userId: parseInt(body.userId, 10) } },
      create: {
        teamId,
        userId: parseInt(body.userId, 10),
        isLead: body.isLead ?? false,
        skills: body.skills || [],
        capacity: body.capacity || 10,
      },
      update: {
        isLead: body.isLead ?? undefined,
        skills: body.skills ?? undefined,
        capacity: body.capacity ?? undefined,
      },
      include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } },
    });

    return NextResponse.json({ member }, { status: 201 });
  } catch (error) {
    return handleApiError(error, { route: `POST /api/tickets/teams/${(await params).id}/members` });
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

    const { searchParams } = new URL(request.url);
    const userId = parseInt(searchParams.get('userId') || '', 10);
    if (isNaN(userId)) return NextResponse.json({ error: 'userId query param required' }, { status: 400 });

    await prisma.ticketTeamMember.deleteMany({ where: { teamId, userId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, { route: `DELETE /api/tickets/teams/${(await params).id}/members` });
  }
});
