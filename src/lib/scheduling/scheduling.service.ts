/**
 * Scheduling Service
 *
 * Comprehensive appointment and scheduling management
 * Handles availability, booking, rescheduling, and cancellations
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { AppointmentStatus, AppointmentModeType } from '@prisma/client';
import {
  createAppointmentReminders,
  cancelAppointmentReminders,
  sendAppointmentConfirmation,
} from './appointment-reminder.service';
import {
  ensureZoomMeetingForAppointment,
  cancelZoomMeetingForAppointment,
} from '@/lib/integrations/zoom/telehealthService';
import { isZoomEnabled } from '@/lib/integrations/zoom/config';

// Types
export interface TimeSlot {
  startTime: Date;
  endTime: Date;
  available: boolean;
  providerId: number;
}

export interface CreateAppointmentInput {
  clinicId?: number;
  patientId: number;
  providerId: number;
  appointmentTypeId?: number;
  title?: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  type?: AppointmentModeType;
  reason?: string;
  notes?: string;
  location?: string;
  roomNumber?: string;
  createdById?: number;
}

export interface UpdateAppointmentInput {
  title?: string;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  type?: AppointmentModeType;
  status?: AppointmentStatus;
  reason?: string;
  notes?: string;
  internalNotes?: string;
  location?: string;
  roomNumber?: string;
  videoLink?: string;
}

export interface AvailabilityInput {
  providerId: number;
  clinicId?: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  appointmentTypes?: number[];
}

/**
 * Get available time slots for a provider on a specific date
 */
export async function getAvailableSlots(
  providerId: number,
  date: Date,
  duration: number = 30,
  clinicId?: number
): Promise<TimeSlot[]> {
  const dayOfWeek = date.getDay();
  const dateStr = date.toISOString().split('T')[0];

  // Get provider's availability for this day of week
  const availability = await prisma.providerAvailability.findMany({
    where: {
      providerId,
      dayOfWeek,
      isActive: true,
      ...(clinicId && { clinicId }),
    },
  });

  if (availability.length === 0) {
    return [];
  }

  // Check for time off
  const startOfDay = new Date(dateStr);
  const endOfDay = new Date(dateStr);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const timeOff = await prisma.providerTimeOff.findFirst({
    where: {
      providerId,
      startDate: { lte: endOfDay },
      endDate: { gte: startOfDay },
      isApproved: true,
    },
  });

  if (timeOff) {
    logger.info('Provider has time off', { providerId, date: dateStr });
    return [];
  }

  // Get existing appointments for the day
  const existingAppointments = await prisma.appointment.findMany({
    where: {
      providerId,
      startTime: { gte: startOfDay, lt: endOfDay },
      status: {
        notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.RESCHEDULED],
      },
    },
    orderBy: { startTime: 'asc' },
  });

  const slots: TimeSlot[] = [];

  // Generate time slots based on availability
  for (const avail of availability) {
    const [startHour, startMin] = avail.startTime.split(':').map(Number);
    const [endHour, endMin] = avail.endTime.split(':').map(Number);

    let slotStart = new Date(dateStr);
    slotStart.setHours(startHour, startMin, 0, 0);

    const availEnd = new Date(dateStr);
    availEnd.setHours(endHour, endMin, 0, 0);

    while (slotStart.getTime() + duration * 60 * 1000 <= availEnd.getTime()) {
      const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);

      // Check if slot conflicts with existing appointments
      const isAvailable = !existingAppointments.some((apt: { startTime: Date; endTime: Date }) => {
        const aptStart = new Date(apt.startTime);
        const aptEnd = new Date(apt.endTime);
        return (
          (slotStart >= aptStart && slotStart < aptEnd) ||
          (slotEnd > aptStart && slotEnd <= aptEnd) ||
          (slotStart <= aptStart && slotEnd >= aptEnd)
        );
      });

      // Don't show past slots
      const now = new Date();
      if (slotStart > now) {
        slots.push({
          startTime: new Date(slotStart),
          endTime: slotEnd,
          available: isAvailable,
          providerId,
        });
      }

      slotStart = slotEnd;
    }
  }

  return slots;
}

/**
 * Create a new appointment
 */
export async function createAppointment(input: CreateAppointmentInput): Promise<{
  success: boolean;
  appointment?: any;
  error?: string;
}> {
  try {
    const duration = input.duration || 30;
    const endTime = input.endTime || new Date(input.startTime.getTime() + duration * 60 * 1000);

    // Validate slot is available
    const conflictingAppointment = await prisma.appointment.findFirst({
      where: {
        providerId: input.providerId,
        status: {
          notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.RESCHEDULED],
        },
        OR: [
          {
            startTime: { lte: input.startTime },
            endTime: { gt: input.startTime },
          },
          {
            startTime: { lt: endTime },
            endTime: { gte: endTime },
          },
          {
            startTime: { gte: input.startTime },
            endTime: { lte: endTime },
          },
        ],
      },
    });

    if (conflictingAppointment) {
      return {
        success: false,
        error: 'This time slot is no longer available',
      };
    }

    // Create the appointment
    const appointment = await prisma.appointment.create({
      data: {
        clinicId: input.clinicId,
        patientId: input.patientId,
        providerId: input.providerId,
        appointmentTypeId: input.appointmentTypeId,
        title: input.title,
        startTime: input.startTime,
        endTime,
        duration,
        type: input.type || AppointmentModeType.IN_PERSON,
        status: AppointmentStatus.SCHEDULED,
        reason: input.reason,
        notes: input.notes,
        location: input.location,
        roomNumber: input.roomNumber,
        createdById: input.createdById,
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        provider: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Create reminders
    await createAppointmentReminders(appointment.id);

    // Auto-create Zoom meeting for VIDEO appointments
    let finalAppointment = appointment;
    if (input.type === AppointmentModeType.VIDEO && isZoomEnabled()) {
      try {
        const zoomResult = await ensureZoomMeetingForAppointment(appointment.id);
        if (zoomResult.success && zoomResult.session) {
          // Refresh appointment with Zoom details
          const updatedAppointment = await prisma.appointment.findUnique({
            where: { id: appointment.id },
            include: {
              patient: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  phone: true,
                },
              },
              provider: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          });
          if (updatedAppointment) {
            finalAppointment = updatedAppointment;
          }
          logger.info('Zoom meeting created for appointment', {
            appointmentId: appointment.id,
            meetingId: zoomResult.session.meetingId,
          });
        }
      } catch (zoomError) {
        // Log but don't fail appointment creation
        logger.error('Failed to create Zoom meeting for appointment', {
          appointmentId: appointment.id,
          error: zoomError instanceof Error ? zoomError.message : 'Unknown error',
        });
      }
    }

    logger.info('Appointment created', {
      appointmentId: finalAppointment.id,
      patientId: input.patientId,
      providerId: input.providerId,
      startTime: input.startTime,
      type: input.type,
    });

    return { success: true, appointment: finalAppointment };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to create appointment', { error: errorMessage, input });
    return { success: false, error: errorMessage };
  }
}

/**
 * Update an existing appointment
 */
export async function updateAppointment(
  appointmentId: number,
  input: UpdateAppointmentInput
): Promise<{
  success: boolean;
  appointment?: any;
  error?: string;
}> {
  try {
    const existing = await prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!existing) {
      return { success: false, error: 'Appointment not found' };
    }

    // If time is changing, validate new slot
    if (input.startTime) {
      const endTime =
        input.endTime ||
        new Date(input.startTime.getTime() + (input.duration || existing.duration) * 60 * 1000);

      const conflictingAppointment = await prisma.appointment.findFirst({
        where: {
          id: { not: appointmentId },
          providerId: existing.providerId,
          status: {
            notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.RESCHEDULED],
          },
          OR: [
            {
              startTime: { lte: input.startTime },
              endTime: { gt: input.startTime },
            },
            {
              startTime: { lt: endTime },
              endTime: { gte: endTime },
            },
          ],
        },
      });

      if (conflictingAppointment) {
        return {
          success: false,
          error: 'This time slot is no longer available',
        };
      }
    }

    const appointment = await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        ...input,
        updatedAt: new Date(),
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        provider: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // If status changed to CONFIRMED, send confirmation
    if (
      input.status === AppointmentStatus.CONFIRMED &&
      existing.status !== AppointmentStatus.CONFIRMED
    ) {
      await prisma.appointment.update({
        where: { id: appointmentId },
        data: { confirmedAt: new Date() },
      });
      await sendAppointmentConfirmation(appointmentId);
    }

    // If time changed, recreate reminders
    if (input.startTime && input.startTime.getTime() !== existing.startTime.getTime()) {
      await cancelAppointmentReminders(appointmentId);
      await createAppointmentReminders(appointmentId);
    }

    logger.info('Appointment updated', { appointmentId, changes: Object.keys(input) });

    return { success: true, appointment };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update appointment', { appointmentId, error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Cancel an appointment
 */
export async function cancelAppointment(
  appointmentId: number,
  reason?: string
): Promise<{
  success: boolean;
  appointment?: any;
  error?: string;
}> {
  try {
    // Get appointment to check type
    const existingAppointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { type: true, zoomMeetingId: true },
    });

    const appointment = await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: AppointmentStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: reason,
      },
    });

    // Cancel all pending reminders
    await cancelAppointmentReminders(appointmentId);

    // Cancel Zoom meeting if this was a VIDEO appointment
    if (existingAppointment?.type === AppointmentModeType.VIDEO && isZoomEnabled()) {
      try {
        await cancelZoomMeetingForAppointment(appointmentId, reason);
        logger.info('Zoom meeting cancelled for appointment', { appointmentId });
      } catch (zoomError) {
        // Log but don't fail cancellation
        logger.error('Failed to cancel Zoom meeting for appointment', {
          appointmentId,
          error: zoomError instanceof Error ? zoomError.message : 'Unknown error',
        });
      }
    }

    logger.info('Appointment cancelled', { appointmentId, reason });

    return { success: true, appointment };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to cancel appointment', { appointmentId, error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Reschedule an appointment
 */
export async function rescheduleAppointment(
  appointmentId: number,
  newStartTime: Date,
  newEndTime?: Date,
  reason?: string
): Promise<{
  success: boolean;
  oldAppointment?: any;
  newAppointment?: any;
  error?: string;
}> {
  try {
    const oldAppointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: true,
        provider: true,
      },
    });

    if (!oldAppointment) {
      return { success: false, error: 'Appointment not found' };
    }

    const duration = oldAppointment.duration;
    const endTime = newEndTime || new Date(newStartTime.getTime() + duration * 60 * 1000);

    // Create new appointment
    const createResult = await createAppointment({
      clinicId: oldAppointment.clinicId || undefined,
      patientId: oldAppointment.patientId,
      providerId: oldAppointment.providerId,
      appointmentTypeId: oldAppointment.appointmentTypeId || undefined,
      title: oldAppointment.title || undefined,
      startTime: newStartTime,
      endTime,
      duration,
      type: oldAppointment.type,
      reason: oldAppointment.reason || undefined,
      notes: oldAppointment.notes || undefined,
      location: oldAppointment.location || undefined,
      roomNumber: oldAppointment.roomNumber || undefined,
    });

    if (!createResult.success) {
      return createResult;
    }

    // Update old appointment
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: AppointmentStatus.RESCHEDULED,
        rescheduledToId: createResult.appointment.id,
        cancellationReason: reason || 'Rescheduled',
      },
    });

    // Update new appointment with reference to old
    await prisma.appointment.update({
      where: { id: createResult.appointment.id },
      data: {
        rescheduledFromId: appointmentId,
      },
    });

    // Cancel old reminders
    await cancelAppointmentReminders(appointmentId);

    logger.info('Appointment rescheduled', {
      oldAppointmentId: appointmentId,
      newAppointmentId: createResult.appointment.id,
      newStartTime,
    });

    return {
      success: true,
      oldAppointment,
      newAppointment: createResult.appointment,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to reschedule appointment', { appointmentId, error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Check in a patient for their appointment
 */
export async function checkInPatient(appointmentId: number): Promise<{
  success: boolean;
  appointment?: any;
  error?: string;
}> {
  try {
    const appointment = await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: AppointmentStatus.CHECKED_IN,
        checkedInAt: new Date(),
      },
    });

    logger.info('Patient checked in', { appointmentId });

    return { success: true, appointment };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to check in patient', { appointmentId, error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Start an appointment (provider begins seeing patient)
 */
export async function startAppointment(appointmentId: number): Promise<{
  success: boolean;
  appointment?: any;
  error?: string;
}> {
  try {
    const appointment = await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: AppointmentStatus.IN_PROGRESS,
        startedAt: new Date(),
      },
    });

    logger.info('Appointment started', { appointmentId });

    return { success: true, appointment };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to start appointment', { appointmentId, error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Complete an appointment
 */
export async function completeAppointment(
  appointmentId: number,
  notes?: string
): Promise<{
  success: boolean;
  appointment?: any;
  error?: string;
}> {
  try {
    const appointment = await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: AppointmentStatus.COMPLETED,
        completedAt: new Date(),
        ...(notes && { internalNotes: notes }),
      },
    });

    logger.info('Appointment completed', { appointmentId });

    return { success: true, appointment };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to complete appointment', { appointmentId, error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Mark appointment as no-show
 */
export async function markNoShow(appointmentId: number): Promise<{
  success: boolean;
  appointment?: any;
  error?: string;
}> {
  try {
    const appointment = await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: AppointmentStatus.NO_SHOW,
        noShowAt: new Date(),
      },
    });

    logger.info('Appointment marked as no-show', { appointmentId });

    return { success: true, appointment };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to mark no-show', { appointmentId, error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Set provider availability
 */
export async function setProviderAvailability(input: AvailabilityInput): Promise<{
  success: boolean;
  availability?: any;
  error?: string;
}> {
  try {
    // Check for existing availability on this day
    const existing = await prisma.providerAvailability.findFirst({
      where: {
        providerId: input.providerId,
        dayOfWeek: input.dayOfWeek,
        clinicId: input.clinicId,
      },
    });

    let availability;
    if (existing) {
      availability = await prisma.providerAvailability.update({
        where: { id: existing.id },
        data: {
          startTime: input.startTime,
          endTime: input.endTime,
          appointmentTypes: input.appointmentTypes,
          isActive: true,
        },
      });
    } else {
      availability = await prisma.providerAvailability.create({
        data: {
          providerId: input.providerId,
          clinicId: input.clinicId,
          dayOfWeek: input.dayOfWeek,
          startTime: input.startTime,
          endTime: input.endTime,
          appointmentTypes: input.appointmentTypes,
        },
      });
    }

    logger.info('Provider availability set', {
      providerId: input.providerId,
      dayOfWeek: input.dayOfWeek,
    });

    return { success: true, availability };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to set provider availability', { error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Add provider time off
 */
export async function addProviderTimeOff(
  providerId: number,
  startDate: Date,
  endDate: Date,
  reason?: string,
  clinicId?: number
): Promise<{
  success: boolean;
  timeOff?: any;
  error?: string;
}> {
  try {
    const timeOff = await prisma.providerTimeOff.create({
      data: {
        providerId,
        clinicId,
        startDate,
        endDate,
        reason,
        isApproved: true,
      },
    });

    logger.info('Provider time off added', {
      providerId,
      startDate,
      endDate,
    });

    return { success: true, timeOff };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to add provider time off', { error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Get appointments for a date range
 */
export async function getAppointments(options: {
  clinicId?: number;
  providerId?: number;
  patientId?: number;
  startDate: Date;
  endDate: Date;
  status?: AppointmentStatus[];
}): Promise<any[]> {
  const where: any = {
    startTime: {
      gte: options.startDate,
      lt: options.endDate,
    },
  };

  if (options.clinicId) where.clinicId = options.clinicId;
  if (options.providerId) where.providerId = options.providerId;
  if (options.patientId) where.patientId = options.patientId;
  if (options.status && options.status.length > 0) {
    where.status = { in: options.status };
  }

  return prisma.appointment.findMany({
    where,
    include: {
      patient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      },
      provider: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      appointmentType: true,
    },
    orderBy: { startTime: 'asc' },
  });
}

/**
 * Get appointment statistics
 */
export async function getAppointmentStats(
  clinicId?: number,
  startDate?: Date,
  endDate?: Date
): Promise<{
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  noShowRate: number;
  cancellationRate: number;
}> {
  const where: any = {};
  if (clinicId) where.clinicId = clinicId;
  if (startDate || endDate) {
    where.startTime = {};
    if (startDate) where.startTime.gte = startDate;
    if (endDate) where.startTime.lt = endDate;
  }

  const [total, byStatus, byType] = await Promise.all([
    prisma.appointment.count({ where }),
    prisma.appointment.groupBy({
      by: ['status'],
      where,
      _count: true,
    }),
    prisma.appointment.groupBy({
      by: ['type'],
      where,
      _count: true,
    }),
  ]);

  const statusCounts = byStatus.reduce(
    (acc: Record<string, number>, item: { status: string; _count: number }) => {
      acc[item.status] = item._count;
      return acc;
    },
    {} as Record<string, number>
  );

  const typeCounts = byType.reduce(
    (acc: Record<string, number>, item: { type: string; _count: number }) => {
      acc[item.type] = item._count;
      return acc;
    },
    {} as Record<string, number>
  );

  const noShowCount = statusCounts[AppointmentStatus.NO_SHOW] || 0;
  const cancelledCount = statusCounts[AppointmentStatus.CANCELLED] || 0;

  return {
    total,
    byStatus: statusCounts,
    byType: typeCounts,
    noShowRate: total > 0 ? (noShowCount / total) * 100 : 0,
    cancellationRate: total > 0 ? (cancelledCount / total) * 100 : 0,
  };
}
