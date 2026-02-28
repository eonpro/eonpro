/**
 * SLA Policies API Route
 * ======================
 *
 * GET  /api/tickets/sla-policies - List policies for current clinic
 * POST /api/tickets/sla-policies - Create a new SLA policy
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
      return NextResponse.json({ policies: [] });
    }

    const policies = await prisma.slaPolicyConfig.findMany({
      where: { ...(clinicId ? { clinicId } : {}) },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      include: {
        businessHours: { select: { id: true, name: true, timezone: true } },
        _count: { select: { ticketSlas: true } },
      },
    });

    return NextResponse.json({ policies });
  } catch (error) {
    return handleApiError(error, { route: 'GET /api/tickets/sla-policies' });
  }
});

export const POST = withAuth(async (request, user) => {
  try {
    const clinicId = user.clinicId;
    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
    }
    if (!['admin', 'super_admin'].includes(user.role.toLowerCase())) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    if (!body.name?.trim() || !body.firstResponseMinutes || !body.resolutionMinutes) {
      return NextResponse.json({ error: 'Name, first response time, and resolution time are required' }, { status: 400 });
    }

    const policy = await prisma.slaPolicyConfig.create({
      data: {
        clinicId,
        name: body.name.trim(),
        description: body.description?.trim() || null,
        priority: body.priority || null,
        category: body.category || null,
        isDefault: body.isDefault ?? false,
        firstResponseMinutes: parseInt(body.firstResponseMinutes, 10),
        resolutionMinutes: parseInt(body.resolutionMinutes, 10),
        nextResponseMinutes: body.nextResponseMinutes ? parseInt(body.nextResponseMinutes, 10) : null,
        businessHoursId: body.businessHoursId || null,
        respectBusinessHours: body.respectBusinessHours ?? true,
        escalateOnBreach: body.escalateOnBreach ?? true,
        warningThresholdPct: body.warningThresholdPct ?? 80,
        escalateToTeamId: body.escalateToTeamId || null,
        escalateToUserId: body.escalateToUserId || null,
      },
    });

    logger.info('[API] SLA policy created', { policyId: policy.id, userId: user.id });
    return NextResponse.json({ policy }, { status: 201 });
  } catch (error) {
    return handleApiError(error, { route: 'POST /api/tickets/sla-policies' });
  }
});
