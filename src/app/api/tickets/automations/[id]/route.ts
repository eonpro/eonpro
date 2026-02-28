/**
 * Automation Rule Detail API Route
 * ================================
 *
 * PATCH  /api/tickets/automations/[id] - Update a rule
 * DELETE /api/tickets/automations/[id] - Deactivate a rule
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { handleApiError } from '@/domains/shared/errors';
import { ticketAutomationService } from '@/domains/ticket/services/ticket-automation.service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const PATCH = withAuth<RouteParams>(async (request, user, { params } = {} as RouteParams) => {
  try {
    const { id } = await params;
    const ruleId = parseInt(id, 10);
    if (isNaN(ruleId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

    if (!['admin', 'super_admin'].includes(user.role.toLowerCase())) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const existing = await prisma.ticketAutomationRule.findUnique({ where: { id: ruleId } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await request.json();
    const automation = await prisma.ticketAutomationRule.update({
      where: { id: ruleId },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.trigger !== undefined ? { trigger: body.trigger } : {}),
        ...(body.conditions !== undefined ? { conditions: body.conditions } : {}),
        ...(body.actions !== undefined ? { actions: body.actions } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.stopOnMatch !== undefined ? { stopOnMatch: body.stopOnMatch } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
    });

    ticketAutomationService.clearCache(existing.clinicId);

    return NextResponse.json({ automation });
  } catch (error) {
    return handleApiError(error, { route: `PATCH /api/tickets/automations/${(await params).id}` });
  }
});

export const DELETE = withAuth<RouteParams>(async (request, user, { params } = {} as RouteParams) => {
  try {
    const { id } = await params;
    const ruleId = parseInt(id, 10);
    if (isNaN(ruleId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

    if (!['admin', 'super_admin'].includes(user.role.toLowerCase())) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const existing = await prisma.ticketAutomationRule.findUnique({ where: { id: ruleId } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await prisma.ticketAutomationRule.update({
      where: { id: ruleId },
      data: { isActive: false },
    });

    ticketAutomationService.clearCache(existing.clinicId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, { route: `DELETE /api/tickets/automations/${(await params).id}` });
  }
});
