/**
 * Appointments API
 * 
 * CRUD operations for appointments
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withProviderAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import {
  createAppointment,
  getAppointments,
  updateAppointment,
  cancelAppointment,
  rescheduleAppointment,
  checkInPatient,
  startAppointment,
  completeAppointment,
  markNoShow,
} from '@/lib/scheduling/scheduling.service';
import { AppointmentModeType, AppointmentStatus } from '@prisma/client';

const createAppointmentSchema = z.object({
  clinicId: z.number().optional(),
  patientId: z.number(),
  providerId: z.number(),
  appointmentTypeId: z.number().optional(),
  title: z.string().optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
  duration: z.number().min(5).max(480).optional(),
  type: z.enum(['IN_PERSON', 'VIDEO', 'PHONE']).optional(),
  reason: z.string().optional(),
  notes: z.string().optional(),
  location: z.string().optional(),
  roomNumber: z.string().optional(),
});

const updateAppointmentSchema = z.object({
  appointmentId: z.number(),
  title: z.string().optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  duration: z.number().optional(),
  type: z.enum(['IN_PERSON', 'VIDEO', 'PHONE']).optional(),
  status: z.enum(['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED']).optional(),
  reason: z.string().optional(),
  notes: z.string().optional(),
  internalNotes: z.string().optional(),
  location: z.string().optional(),
  roomNumber: z.string().optional(),
  videoLink: z.string().optional(),
});

/**
 * GET /api/scheduling/appointments
 * List appointments with filters
 */
export const GET = withAuth(
  async (req: NextRequest, user) => {
    try {
      const searchParams = req.nextUrl.searchParams;
      const clinicId = searchParams.get('clinicId');
      const providerId = searchParams.get('providerId');
      const patientId = searchParams.get('patientId');
      const startDate = searchParams.get('startDate');
      const endDate = searchParams.get('endDate');
      const status = searchParams.get('status');

      if (!startDate || !endDate) {
        return NextResponse.json(
          { error: 'startDate and endDate are required' },
          { status: 400 }
        );
      }

      const appointments = await getAppointments({
        clinicId: clinicId ? parseInt(clinicId) : undefined,
        providerId: providerId ? parseInt(providerId) : undefined,
        patientId: patientId ? parseInt(patientId) : undefined,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        status: status ? [status as AppointmentStatus] : undefined,
      });

      return NextResponse.json({ appointments });
    } catch (error) {
      logger.error('Failed to fetch appointments', { error });
      return NextResponse.json(
        { error: 'Failed to fetch appointments' },
        { status: 500 }
      );
    }
  }
);

/**
 * POST /api/scheduling/appointments
 * Create a new appointment
 */
export const POST = withProviderAuth(
  async (req: NextRequest, user) => {
    try {
      const body = await req.json();
      const parsed = createAppointmentSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid request data', details: parsed.error.issues },
          { status: 400 }
        );
      }

      const result = await createAppointment({
        clinicId: parsed.data.clinicId,
        patientId: parsed.data.patientId,
        providerId: parsed.data.providerId,
        appointmentTypeId: parsed.data.appointmentTypeId,
        title: parsed.data.title,
        startTime: new Date(parsed.data.startTime),
        endTime: parsed.data.endTime ? new Date(parsed.data.endTime) : undefined,
        duration: parsed.data.duration,
        type: parsed.data.type as AppointmentModeType | undefined,
        reason: parsed.data.reason,
        notes: parsed.data.notes,
        location: parsed.data.location,
        roomNumber: parsed.data.roomNumber,
        createdById: user.id,
      });

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: 400 }
        );
      }

      return NextResponse.json({ appointment: result.appointment }, { status: 201 });
    } catch (error) {
      logger.error('Failed to create appointment', { error });
      return NextResponse.json(
        { error: 'Failed to create appointment' },
        { status: 500 }
      );
    }
  }
);

/**
 * PATCH /api/scheduling/appointments
 * Update an appointment
 */
export const PATCH = withProviderAuth(
  async (req: NextRequest, user) => {
    try {
      const body = await req.json();
      const parsed = updateAppointmentSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid request data', details: parsed.error.issues },
          { status: 400 }
        );
      }

      const { appointmentId, ...updateData } = parsed.data;

      const result = await updateAppointment(appointmentId, {
        ...updateData,
        startTime: updateData.startTime ? new Date(updateData.startTime) : undefined,
        endTime: updateData.endTime ? new Date(updateData.endTime) : undefined,
        type: updateData.type as AppointmentModeType | undefined,
        status: updateData.status as AppointmentStatus | undefined,
      });

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: 400 }
        );
      }

      return NextResponse.json({ appointment: result.appointment });
    } catch (error) {
      logger.error('Failed to update appointment', { error });
      return NextResponse.json(
        { error: 'Failed to update appointment' },
        { status: 500 }
      );
    }
  }
);

/**
 * DELETE /api/scheduling/appointments
 * Cancel an appointment
 */
export const DELETE = withProviderAuth(
  async (req: NextRequest, user) => {
    try {
      const searchParams = req.nextUrl.searchParams;
      const appointmentId = searchParams.get('appointmentId');
      const reason = searchParams.get('reason');

      if (!appointmentId) {
        return NextResponse.json(
          { error: 'appointmentId is required' },
          { status: 400 }
        );
      }

      const result = await cancelAppointment(parseInt(appointmentId), reason || undefined);

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: 400 }
        );
      }

      return NextResponse.json({ success: true, appointment: result.appointment });
    } catch (error) {
      logger.error('Failed to cancel appointment', { error });
      return NextResponse.json(
        { error: 'Failed to cancel appointment' },
        { status: 500 }
      );
    }
  }
);
