/**
 * Teams API Route
 * ===============
 *
 * GET  /api/tickets/teams - List teams for current clinic
 * POST /api/tickets/teams - Create a team
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
      return NextResponse.json({ teams: [] });
    }

    const teams = await prisma.ticketTeam.findMany({
      where: { ...(clinicId ? { clinicId } : {}), isActive: true },
      orderBy: { name: 'asc' },
      take: 200,
      include: {
        members: {
          include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } },
        },
        defaultSlaPolicy: { select: { id: true, name: true } },
        _count: { select: { tickets: true, members: true } },
      },
    });

    return NextResponse.json({ teams });
  } catch (error) {
    return handleApiError(error, { route: 'GET /api/tickets/teams' });
  }
});

export const POST = withAuth(async (request, user) => {
  try {
    const clinicId = user.clinicId;
    if (!clinicId) return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
    if (!['admin', 'super_admin'].includes(user.role.toLowerCase())) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    if (!body.name?.trim()) return NextResponse.json({ error: 'Team name is required' }, { status: 400 });

    const team = await prisma.ticketTeam.create({
      data: {
        clinicId,
        name: body.name.trim(),
        description: body.description?.trim() || null,
        color: body.color || null,
        icon: body.icon || null,
        defaultPriority: body.defaultPriority || null,
        defaultSlaPolicyId: body.defaultSlaPolicyId || null,
        autoAssignEnabled: body.autoAssignEnabled ?? false,
        roundRobinEnabled: body.roundRobinEnabled ?? false,
        maxTicketsPerMember: body.maxTicketsPerMember || null,
      },
    });

    logger.info('[API] Team created', { teamId: team.id, userId: user.id });
    return NextResponse.json({ team }, { status: 201 });
  } catch (error) {
    return handleApiError(error, { route: 'POST /api/tickets/teams' });
  }
});
