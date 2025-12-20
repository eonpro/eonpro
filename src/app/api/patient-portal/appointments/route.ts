/**
 * Patient Portal - Self-Scheduling API
 * 
 * Allows patients to view, book, and manage their appointments
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import {
  getAvailableSlots,
  createAppointment,
  cancelAppointment,
  rescheduleAppointment,
  getAppointments,
} from '@/lib/scheduling/scheduling.service';
import { prisma } from '@/lib/db';
import { AppointmentModeType, AppointmentStatus } from '@prisma/client';

const bookAppointmentSchema = z.object({
  providerId: z.number(),
  appointmentTypeId: z.number().optional(),
  startTime: z.string().datetime(),
  duration: z.number().min(15).max(120).optional(),
  type: z.enum(['IN_PERSON', 'VIDEO', 'PHONE']).optional(),
  reason: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
});

const rescheduleSchema = z.object({
  appointmentId: z.number(),
  newStartTime: z.string().datetime(),
  reason: z.string().optional(),
});

/**
 * GET /api/patient-portal/appointments
 * Get patient's appointments or available slots
 */
export const GET = withAuth(
  async (req: NextRequest, user) => {
    try {
      const searchParams = req.nextUrl.searchParams;
      const action = searchParams.get('action');

      // For patients, ensure they have a patient profile
      let patientId: number | undefined;
      if (user.role === 'patient') {
        if (!user.patientId) {
          return NextResponse.json(
            { error: 'Patient profile not found' },
            { status: 404 }
          );
        }
        patientId = user.patientId;
      } else {
        patientId = searchParams.get('patientId') ? parseInt(searchParams.get('patientId')!) : undefined;
      }

      // Get available slots for booking
      if (action === 'available-slots') {
        const providerId = searchParams.get('providerId');
        const date = searchParams.get('date');
        const duration = searchParams.get('duration');
        const clinicId = searchParams.get('clinicId');

        if (!providerId || !date) {
          return NextResponse.json(
            { error: 'providerId and date are required' },
            { status: 400 }
          );
        }

        const slots = await getAvailableSlots(
          parseInt(providerId),
          new Date(date),
          duration ? parseInt(duration) : 30,
          clinicId ? parseInt(clinicId) : undefined
        );

        // Filter to only available slots
        const availableSlots = slots.filter(slot => slot.available);

        return NextResponse.json({ slots: availableSlots });
      }

      // Get available appointment types for self-scheduling
      if (action === 'appointment-types') {
        const clinicId = searchParams.get('clinicId');

        const types = await prisma.appointmentTypeConfig.findMany({
          where: {
            isActive: true,
            allowSelfScheduling: true,
            ...(clinicId && { clinicId: parseInt(clinicId) }),
          },
          select: {
            id: true,
            name: true,
            description: true,
            duration: true,
            price: true,
            requiresVideoLink: true,
          },
          orderBy: { name: 'asc' },
        });

        return NextResponse.json({ appointmentTypes: types });
      }

      // Get available providers
      if (action === 'providers') {
        const clinicId = searchParams.get('clinicId');

        const providers = await prisma.provider.findMany({
          where: {
            ...(clinicId && { clinicId: parseInt(clinicId) }),
            availability: {
              some: {
                isActive: true,
              },
            },
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            titleLine: true,
          },
          orderBy: { lastName: 'asc' },
        });

        return NextResponse.json({ providers });
      }

      // Default: Get patient's appointments
      if (!patientId) {
        return NextResponse.json(
          { error: 'patientId is required' },
          { status: 400 }
        );
      }

      const upcoming = searchParams.get('upcoming') === 'true';
      const past = searchParams.get('past') === 'true';

      const now = new Date();
      let startDate: Date;
      let endDate: Date;

      if (upcoming) {
        startDate = now;
        endDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // Next year
      } else if (past) {
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000); // Last year
        endDate = now;
      } else {
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); // Last 90 days
        endDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // Next 90 days
      }

      const appointments = await getAppointments({
        patientId,
        startDate,
        endDate,
        status: upcoming ? [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] : undefined,
      });

      return NextResponse.json({ appointments });
    } catch (error) {
      logger.error('Failed to fetch patient appointments', { error });
      return NextResponse.json(
        { error: 'Failed to fetch appointments' },
        { status: 500 }
      );
    }
  }
);

/**
 * POST /api/patient-portal/appointments
 * Book a new appointment
 */
export const POST = withAuth(
  async (req: NextRequest, user) => {
    try {
      // Verify patient role
      if (user.role === 'patient' && !user.patientId) {
        return NextResponse.json(
          { error: 'Patient profile not found' },
          { status: 404 }
        );
      }

      const body = await req.json();
      const parsed = bookAppointmentSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid request data', details: parsed.error.issues },
          { status: 400 }
        );
      }

      // Get patient ID
      const patientId = user.role === 'patient' ? user.patientId! : body.patientId;
      if (!patientId) {
        return NextResponse.json(
          { error: 'patientId is required' },
          { status: 400 }
        );
      }

      // Verify provider exists and accepts self-scheduling
      const provider = await prisma.provider.findUnique({
        where: { id: parsed.data.providerId },
        select: { id: true, clinicId: true, firstName: true, lastName: true },
      });

      if (!provider) {
        return NextResponse.json(
          { error: 'Provider not found' },
          { status: 404 }
        );
      }

      // If appointment type specified, verify it allows self-scheduling
      if (parsed.data.appointmentTypeId) {
        const appointmentType = await prisma.appointmentTypeConfig.findUnique({
          where: { id: parsed.data.appointmentTypeId },
        });

        if (!appointmentType || !appointmentType.allowSelfScheduling) {
          return NextResponse.json(
            { error: 'This appointment type is not available for self-scheduling' },
            { status: 400 }
          );
        }
      }

      // Create the appointment
      const result = await createAppointment({
        clinicId: provider.clinicId || undefined,
        patientId,
        providerId: parsed.data.providerId,
        appointmentTypeId: parsed.data.appointmentTypeId,
        startTime: new Date(parsed.data.startTime),
        duration: parsed.data.duration || 30,
        type: (parsed.data.type as AppointmentModeType) || AppointmentModeType.IN_PERSON,
        reason: parsed.data.reason,
        notes: parsed.data.notes,
        createdById: user.id,
      });

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: 400 }
        );
      }

      logger.info('Patient self-booked appointment', {
        appointmentId: result.appointment.id,
        patientId,
        providerId: parsed.data.providerId,
        bookedBy: user.id,
      });

      return NextResponse.json({ appointment: result.appointment }, { status: 201 });
    } catch (error) {
      logger.error('Failed to book appointment', { error });
      return NextResponse.json(
        { error: 'Failed to book appointment' },
        { status: 500 }
      );
    }
  }
);

/**
 * PATCH /api/patient-portal/appointments
 * Reschedule an appointment
 */
export const PATCH = withAuth(
  async (req: NextRequest, user) => {
    try {
      const body = await req.json();
      const parsed = rescheduleSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid request data', details: parsed.error.issues },
          { status: 400 }
        );
      }

      // Verify patient owns this appointment
      const appointment = await prisma.appointment.findUnique({
        where: { id: parsed.data.appointmentId },
        select: { patientId: true, status: true },
      });

      if (!appointment) {
        return NextResponse.json(
          { error: 'Appointment not found' },
          { status: 404 }
        );
      }

      if (user.role === 'patient' && appointment.patientId !== user.patientId) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 403 }
        );
      }

      // Check if appointment can be rescheduled
      if (!['SCHEDULED', 'CONFIRMED'].includes(appointment.status)) {
        return NextResponse.json(
          { error: 'This appointment cannot be rescheduled' },
          { status: 400 }
        );
      }

      const result = await rescheduleAppointment(
        parsed.data.appointmentId,
        new Date(parsed.data.newStartTime),
        undefined,
        parsed.data.reason || 'Patient rescheduled'
      );

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: 400 }
        );
      }

      logger.info('Patient rescheduled appointment', {
        oldAppointmentId: parsed.data.appointmentId,
        newAppointmentId: result.newAppointment.id,
        rescheduledBy: user.id,
      });

      return NextResponse.json({
        success: true,
        oldAppointment: result.oldAppointment,
        newAppointment: result.newAppointment,
      });
    } catch (error) {
      logger.error('Failed to reschedule appointment', { error });
      return NextResponse.json(
        { error: 'Failed to reschedule appointment' },
        { status: 500 }
      );
    }
  }
);

/**
 * DELETE /api/patient-portal/appointments
 * Cancel an appointment
 */
export const DELETE = withAuth(
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

      // Verify patient owns this appointment
      const appointment = await prisma.appointment.findUnique({
        where: { id: parseInt(appointmentId) },
        select: { patientId: true, status: true, startTime: true },
      });

      if (!appointment) {
        return NextResponse.json(
          { error: 'Appointment not found' },
          { status: 404 }
        );
      }

      if (user.role === 'patient' && appointment.patientId !== user.patientId) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 403 }
        );
      }

      // Check if appointment can be cancelled
      if (!['SCHEDULED', 'CONFIRMED'].includes(appointment.status)) {
        return NextResponse.json(
          { error: 'This appointment cannot be cancelled' },
          { status: 400 }
        );
      }

      // Check cancellation policy (e.g., 24 hours before)
      const hoursUntilAppointment = (new Date(appointment.startTime).getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursUntilAppointment < 24 && user.role === 'patient') {
        return NextResponse.json(
          { error: 'Appointments must be cancelled at least 24 hours in advance' },
          { status: 400 }
        );
      }

      const result = await cancelAppointment(
        parseInt(appointmentId),
        reason || 'Cancelled by patient'
      );

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: 400 }
        );
      }

      logger.info('Patient cancelled appointment', {
        appointmentId,
        cancelledBy: user.id,
        reason,
      });

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
