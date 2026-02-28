/**
 * Appointment Service
 *
 * @module domains/appointment/services
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export interface AppointmentService {
  listByPatient(patientId: number, clinicId: number): Promise<Record<string, unknown>[]>;
  listByProvider(providerId: number, clinicId: number, dateRange?: { start: Date; end: Date }): Promise<Record<string, unknown>[]>;
  create(data: Record<string, unknown>): Promise<Record<string, unknown>>;
  cancel(id: number, reason?: string): Promise<Record<string, unknown>>;
}

export function createAppointmentService(): AppointmentService {
  return {
    async listByPatient(patientId: number, clinicId: number) {
      const appointments = await prisma.appointment.findMany({
        where: { patientId, clinicId },
        orderBy: { startTime: 'desc' },
        include: { provider: { select: { id: true, firstName: true, lastName: true } } },
      });
      return appointments as unknown as Record<string, unknown>[];
    },

    async listByProvider(providerId: number, clinicId: number, dateRange?) {
      const where: any = { providerId, clinicId };
      if (dateRange) {
        where.startTime = { gte: dateRange.start, lte: dateRange.end };
      }
      const appointments = await prisma.appointment.findMany({
        where,
        orderBy: { startTime: 'asc' },
        include: { patient: { select: { id: true, firstName: true, lastName: true } } },
      });
      return appointments as unknown as Record<string, unknown>[];
    },

    async create(data: Record<string, unknown>) {
      const appointment = await prisma.appointment.create({ data: data as any });
      return appointment as unknown as Record<string, unknown>;
    },

    async cancel(id: number, reason?: string) {
      const updated = await prisma.appointment.update({
        where: { id },
        data: { status: 'CANCELLED', cancellationReason: reason ?? null, cancelledAt: new Date() },
      });
      return updated as unknown as Record<string, unknown>;
    },
  };
}

export const appointmentService = createAppointmentService();
