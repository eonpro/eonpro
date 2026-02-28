/**
 * Business Hours API Route
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
      return NextResponse.json({ businessHours: [] });
    }

    const businessHours = await prisma.ticketBusinessHours.findMany({
      where: { ...(clinicId ? { clinicId } : {}), isActive: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });

    return NextResponse.json({ businessHours });
  } catch (error) {
    return handleApiError(error, { route: 'GET /api/tickets/business-hours' });
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
    if (!body.name?.trim() || !body.schedule) {
      return NextResponse.json({ error: 'Name and schedule are required' }, { status: 400 });
    }

    const bh = await prisma.ticketBusinessHours.create({
      data: {
        clinicId,
        name: body.name.trim(),
        timezone: body.timezone || 'America/New_York',
        schedule: body.schedule,
        holidays: body.holidays || [],
        isDefault: body.isDefault ?? false,
      },
    });

    logger.info('[API] Business hours created', { id: bh.id, userId: user.id });
    return NextResponse.json({ businessHours: bh }, { status: 201 });
  } catch (error) {
    return handleApiError(error, { route: 'POST /api/tickets/business-hours' });
  }
});
