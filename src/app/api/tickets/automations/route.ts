/**
 * Automation Rules API Route
 * ==========================
 *
 * GET  /api/tickets/automations - List automation rules
 * POST /api/tickets/automations - Create a new automation rule
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { handleApiError } from '@/domains/shared/errors';
import { logger } from '@/lib/logger';
import { ticketAutomationService } from '@/domains/ticket/services/ticket-automation.service';

export const GET = withAuth(async (request, user) => {
  try {
    const clinicId = user.clinicId;
    if (!clinicId && user.role !== 'super_admin') {
      return NextResponse.json({ automations: [] });
    }

    const automations = await prisma.ticketAutomationRule.findMany({
      where: { ...(clinicId ? { clinicId } : {}), isActive: true },
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
      include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
    });

    return NextResponse.json({ automations });
  } catch (error) {
    return handleApiError(error, { route: 'GET /api/tickets/automations' });
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

    if (!body.name?.trim() || !body.trigger) {
      return NextResponse.json({ error: 'Name and trigger are required' }, { status: 400 });
    }

    const automation = await prisma.ticketAutomationRule.create({
      data: {
        clinicId,
        name: body.name.trim(),
        description: body.description?.trim() || null,
        trigger: body.trigger,
        conditions: body.conditions || [],
        actions: body.actions || [],
        priority: body.priority || 100,
        stopOnMatch: body.stopOnMatch || false,
        isActive: body.isActive ?? true,
        createdById: user.id,
      },
    });

    ticketAutomationService.clearCache(clinicId);

    logger.info('[API] Automation rule created', { automationId: automation.id, userId: user.id });

    return NextResponse.json({ automation }, { status: 201 });
  } catch (error) {
    return handleApiError(error, { route: 'POST /api/tickets/automations' });
  }
});
