/**
 * Availability API
 *
 * Manage provider availability and get available time slots
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthOptions } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import {
  getAvailableSlots,
  setProviderAvailability,
  addProviderTimeOff,
} from '@/lib/scheduling/scheduling.service';
import { prisma } from '@/lib/db';

const setAvailabilitySchema = z.object({
  providerId: z.number(),
  clinicId: z.number().optional(),
  dayOfWeek: z.number().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  appointmentTypes: z.array(z.number()).optional(),
});

const timeOffSchema = z.object({
  providerId: z.number(),
  clinicId: z.number().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  reason: z.string().optional(),
});

/**
 * GET /api/scheduling/availability
 * Get available time slots for a provider on a specific date
 */
export const GET = withAuth(async (req: NextRequest, user) => {
  try {
    const searchParams = req.nextUrl.searchParams;
    const providerId = searchParams.get('providerId');
    const date = searchParams.get('date');
    const duration = searchParams.get('duration');
    const clinicId = searchParams.get('clinicId');

    if (!providerId || !date) {
      return NextResponse.json({ error: 'providerId and date are required' }, { status: 400 });
    }

    const resolvedClinicId = (clinicId && user.role === 'super_admin')
      ? parseInt(clinicId)
      : (user.clinicId ?? undefined);

    const slots = await getAvailableSlots(
      parseInt(providerId),
      new Date(date),
      duration ? parseInt(duration) : 30,
      resolvedClinicId
    );

    return NextResponse.json({ slots });
  } catch (error) {
    logger.error('Failed to get available slots', { error });
    return NextResponse.json({ error: 'Failed to get available slots' }, { status: 500 });
  }
});

/**
 * POST /api/scheduling/availability
 * Set provider availability
 */
const availabilityRoles: AuthOptions = { roles: ['super_admin', 'admin', 'provider', 'staff'] };

export const POST = withAuth(async (req: NextRequest, user) => {
  try {
    const body = await req.json();
    const parsed = setAvailabilitySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const availClinicId = user.role === 'super_admin'
      ? parsed.data.clinicId
      : user.clinicId ?? undefined;

    const result = await setProviderAvailability({
      providerId: parsed.data.providerId,
      clinicId: availClinicId,
      dayOfWeek: parsed.data.dayOfWeek,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      appointmentTypes: parsed.data.appointmentTypes,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ availability: result.availability }, { status: 201 });
  } catch (error) {
    logger.error('Failed to set availability', { error });
    return NextResponse.json({ error: 'Failed to set availability' }, { status: 500 });
  }
}, availabilityRoles);

/**
 * PUT /api/scheduling/availability/time-off
 * Add provider time off
 */
export const PUT = withAuth(async (req: NextRequest, user) => {
  try {
    const body = await req.json();
    const parsed = timeOffSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const timeOffClinicId = user.role === 'super_admin'
      ? parsed.data.clinicId
      : user.clinicId ?? undefined;

    const result = await addProviderTimeOff(
      parsed.data.providerId,
      new Date(parsed.data.startDate),
      new Date(parsed.data.endDate),
      parsed.data.reason,
      timeOffClinicId
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ timeOff: result.timeOff }, { status: 201 });
  } catch (error) {
    logger.error('Failed to add time off', { error });
    return NextResponse.json({ error: 'Failed to add time off' }, { status: 500 });
  }
}, availabilityRoles);

/**
 * DELETE /api/scheduling/availability
 * Remove provider availability
 */
export const DELETE = withAuth(async (req: NextRequest, user) => {
  try {
    const searchParams = req.nextUrl.searchParams;
    const availabilityId = searchParams.get('availabilityId');

    if (!availabilityId) {
      return NextResponse.json({ error: 'availabilityId is required' }, { status: 400 });
    }

    await prisma.providerAvailability.update({
      where: { id: parseInt(availabilityId) },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to remove availability', { error });
    return NextResponse.json({ error: 'Failed to remove availability' }, { status: 500 });
  }
}, availabilityRoles);
