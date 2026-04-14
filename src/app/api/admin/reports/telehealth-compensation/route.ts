/**
 * Telehealth Compensation Report API
 *
 * GET - Fetch telehealth (VIDEO) appointments with provider compensation at $35/completed appt.
 *       Supports custom date ranges and provider filtering.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const RATE_PER_APPOINTMENT_CENTS = 3500; // $35.00

const querySchema = z.object({
  startDate: z.string().min(1, 'startDate is required'),
  endDate: z.string().min(1, 'endDate is required'),
  providerId: z.coerce.number().positive().optional(),
  status: z.enum(['ALL', 'SCHEDULED', 'COMPLETED']).optional().default('ALL'),
});

async function handleGet(req: NextRequest, user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      startDate: searchParams.get('startDate'),
      endDate: searchParams.get('endDate'),
      providerId: searchParams.get('providerId') || undefined,
      status: searchParams.get('status') || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { startDate, endDate, providerId, status } = parsed.data;

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
    }

    if (start > end) {
      return NextResponse.json({ error: 'startDate must be before endDate' }, { status: 400 });
    }

    let clinicId: number | undefined;
    if (user.role !== 'super_admin') {
      clinicId = user.clinicId;
    }

    logger.info('[REPORTS] Telehealth compensation report requested', {
      userId: user.id,
      clinicId,
      startDate,
      endDate,
      providerId,
      status,
    });

    const statusFilter =
      status === 'ALL'
        ? { in: ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED'] as any }
        : status;

    const appointments = await prisma.appointment.findMany({
      where: {
        type: 'VIDEO',
        startTime: { gte: start, lte: end },
        status: statusFilter,
        ...(clinicId ? { clinicId } : {}),
        ...(providerId ? { providerId } : {}),
      },
      include: {
        provider: { select: { id: true, firstName: true, lastName: true, npi: true } },
        patient: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { startTime: 'asc' },
    });

    const completedCount = appointments.filter((a) => a.status === 'COMPLETED').length;
    const scheduledCount = appointments.filter(
      (a) => a.status === 'SCHEDULED' || a.status === 'CONFIRMED'
    ).length;
    const totalPayoutCents = completedCount * RATE_PER_APPOINTMENT_CENTS;

    const providerMap = new Map<
      number,
      {
        id: number;
        name: string;
        npi: string | null;
        completed: number;
        scheduled: number;
        totalCents: number;
      }
    >();
    for (const appt of appointments) {
      const pid = appt.providerId;
      if (!providerMap.has(pid)) {
        providerMap.set(pid, {
          id: pid,
          name: `${appt.provider.firstName} ${appt.provider.lastName}`,
          npi: appt.provider.npi,
          completed: 0,
          scheduled: 0,
          totalCents: 0,
        });
      }
      const entry = providerMap.get(pid)!;
      if (appt.status === 'COMPLETED') {
        entry.completed++;
        entry.totalCents += RATE_PER_APPOINTMENT_CENTS;
      } else if (appt.status === 'SCHEDULED' || appt.status === 'CONFIRMED') {
        entry.scheduled++;
      }
    }

    return NextResponse.json({
      ratePerAppointmentCents: RATE_PER_APPOINTMENT_CENTS,
      dateRange: { startDate: start.toISOString(), endDate: end.toISOString() },
      summary: {
        totalAppointments: appointments.length,
        completedCount,
        scheduledCount,
        totalPayoutCents,
        totalPayoutFormatted: `$${(totalPayoutCents / 100).toFixed(2)}`,
      },
      providerBreakdown: Array.from(providerMap.values()).map((p) => ({
        ...p,
        totalFormatted: `$${(p.totalCents / 100).toFixed(2)}`,
      })),
      appointments: appointments.map((a) => ({
        id: a.id,
        startTime: a.startTime.toISOString(),
        endTime: a.endTime.toISOString(),
        duration: a.duration,
        status: a.status,
        completedAt: a.completedAt?.toISOString() || null,
        provider: {
          id: a.provider.id,
          name: `${a.provider.firstName} ${a.provider.lastName}`,
        },
        patient: {
          id: a.patient.id,
          name: `${a.patient.firstName} ${a.patient.lastName}`,
        },
        reason: a.reason,
        payoutCents: a.status === 'COMPLETED' ? RATE_PER_APPOINTMENT_CENTS : 0,
        payoutFormatted: a.status === 'COMPLETED' ? '$35.00' : '$0.00',
      })),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[REPORTS] Telehealth compensation report failed', {
      error: msg,
      userId: user.id,
    });
    return NextResponse.json(
      { error: 'Failed to generate telehealth compensation report', details: msg },
      { status: 500 }
    );
  }
}

export const GET = withAdminAuth(handleGet);
