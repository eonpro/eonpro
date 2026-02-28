/**
 * SLA Policy Detail API Route
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { handleApiError } from '@/domains/shared/errors';

interface RouteParams { params: Promise<{ id: string }>; }

export const PATCH = withAuth<RouteParams>(async (request, user, { params } = {} as RouteParams) => {
  try {
    const { id } = await params;
    const policyId = parseInt(id, 10);
    if (isNaN(policyId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    if (!['admin', 'super_admin'].includes(user.role.toLowerCase())) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const policy = await prisma.slaPolicyConfig.update({
      where: { id: policyId },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.priority !== undefined ? { priority: body.priority || null } : {}),
        ...(body.category !== undefined ? { category: body.category || null } : {}),
        ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
        ...(body.firstResponseMinutes !== undefined ? { firstResponseMinutes: parseInt(body.firstResponseMinutes, 10) } : {}),
        ...(body.resolutionMinutes !== undefined ? { resolutionMinutes: parseInt(body.resolutionMinutes, 10) } : {}),
        ...(body.nextResponseMinutes !== undefined ? { nextResponseMinutes: body.nextResponseMinutes ? parseInt(body.nextResponseMinutes, 10) : null } : {}),
        ...(body.businessHoursId !== undefined ? { businessHoursId: body.businessHoursId || null } : {}),
        ...(body.respectBusinessHours !== undefined ? { respectBusinessHours: body.respectBusinessHours } : {}),
        ...(body.escalateOnBreach !== undefined ? { escalateOnBreach: body.escalateOnBreach } : {}),
        ...(body.warningThresholdPct !== undefined ? { warningThresholdPct: body.warningThresholdPct } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
    });

    return NextResponse.json({ policy });
  } catch (error) {
    return handleApiError(error, { route: `PATCH /api/tickets/sla-policies/${(await params).id}` });
  }
});

export const DELETE = withAuth<RouteParams>(async (request, user, { params } = {} as RouteParams) => {
  try {
    const { id } = await params;
    const policyId = parseInt(id, 10);
    if (isNaN(policyId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    if (!['admin', 'super_admin'].includes(user.role.toLowerCase())) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    await prisma.slaPolicyConfig.update({
      where: { id: policyId },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, { route: `DELETE /api/tickets/sla-policies/${(await params).id}` });
  }
});
