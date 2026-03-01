import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuth } from '@/lib/auth/middleware';
import { standardRateLimit } from '@/lib/rateLimit';
import { z } from 'zod';
import { logPHIAccess, logPHICreate, logPHIUpdate, logPHIDelete } from '@/lib/audit/hipaa-audit';
import { handleApiError } from '@/domains/shared/errors';
import { canAccessPatientWithClinic } from '@/lib/auth/patient-access';

const createSleepLogSchema = z.object({
  patientId: z
    .union([z.string(), z.number()])
    .transform((val) => (typeof val === 'string' ? parseInt(val, 10) : val))
    .refine((n) => !isNaN(n) && n > 0, { message: 'patientId must be a positive integer' }),
  sleepStart: z.string().datetime(),
  sleepEnd: z.string().datetime(),
  quality: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      const num = typeof val === 'string' ? parseInt(val, 10) : val;
      if (isNaN(num) || num < 1 || num > 10) return undefined;
      return num;
    }),
  notes: z.string().max(500).optional(),
});

const getSleepLogsSchema = z.object({
  patientId: z
    .string()
    .transform((val) => parseInt(val, 10))
    .refine((n) => !isNaN(n) && n > 0, { message: 'patientId must be a positive integer' }),
});

const updateSleepLogSchema = z.object({
  id: z
    .union([z.string(), z.number()])
    .transform((val) => (typeof val === 'string' ? parseInt(val, 10) : val))
    .refine((n) => !isNaN(n) && n > 0, { message: 'id must be a positive integer' }),
  sleepStart: z.string().datetime().optional(),
  sleepEnd: z.string().datetime().optional(),
  quality: z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((val) => {
      if (val == null) return undefined;
      const num = typeof val === 'string' ? parseInt(val, 10) : val;
      if (isNaN(num) || num < 1 || num > 10) return undefined;
      return num;
    }),
  notes: z.string().max(500).optional().nullable(),
});

const deleteSleepLogSchema = z.object({
  id: z
    .string()
    .transform((val) => parseInt(val, 10))
    .refine((n) => !isNaN(n) && n > 0, { message: 'id must be a positive integer' }),
});

const postHandler = withAuth(async (request: NextRequest, user) => {
  try {
    const rawData = await request.json();
    const parseResult = createSleepLogSchema.safeParse(rawData);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parseResult.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }

    const { patientId, sleepStart, sleepEnd, quality, notes } = parseResult.data;

    if (!(await canAccessPatientWithClinic(user, patientId))) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Calculate duration in minutes
    const start = new Date(sleepStart);
    const end = new Date(sleepEnd);
    const duration = Math.round((end.getTime() - start.getTime()) / (1000 * 60));

    const sleepLog = await prisma.patientSleepLog.create({
      data: {
        patientId,
        clinicId: user.clinicId || null,
        sleepStart: start,
        sleepEnd: end,
        duration,
        quality: quality || null,
        notes: notes || null,
        recordedAt: new Date(),
        source: user.role === 'patient' ? 'patient' : 'provider',
      },
    });

    logPHICreate(request, user, 'PatientSleepLog', sleepLog.id, patientId).catch(() => {});

    return NextResponse.json(sleepLog, { status: 201 });
  } catch (error) {
    return handleApiError(error, {
      route: 'POST /api/patient-progress/sleep',
      context: { userId: user.id },
    });
  }
});

export const POST = standardRateLimit(postHandler);

const getHandler = withAuth(async (request: NextRequest, user) => {
  try {
    const urlParams = new URL(request.url).searchParams;
    const nextParams = request.nextUrl.searchParams;
    let patientIdParam = nextParams.get('patientId') ?? urlParams.get('patientId');
    if (patientIdParam == null && user.role === 'patient' && user.patientId != null)
      patientIdParam = String(user.patientId);
    const parseResult = getSleepLogsSchema.safeParse({
      patientId: patientIdParam,
    });

    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const { patientId } = parseResult.data;

    if (!(await canAccessPatientWithClinic(user, patientId))) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const sleepLogs = await prisma.patientSleepLog.findMany({
      where: { patientId },
      orderBy: { recordedAt: 'desc' },
      take: 100,
    });

    // Calculate weekly average
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    type SleepLog = (typeof sleepLogs)[number];
    const weeklyLogs = sleepLogs.filter((log: SleepLog) => new Date(log.recordedAt) >= weekAgo);
    const avgSleepMinutes =
      weeklyLogs.length > 0
        ? Math.round(
            weeklyLogs.reduce((sum: number, log: SleepLog) => sum + log.duration, 0) /
              weeklyLogs.length
          )
        : 0;
    const logsWithQuality = weeklyLogs.filter((l: SleepLog) => l.quality !== null);
    const avgQuality =
      logsWithQuality.length > 0
        ? logsWithQuality.reduce((sum: number, log: SleepLog) => sum + (log.quality || 0), 0) /
          logsWithQuality.length
        : null;

    logPHIAccess(request, user, 'PatientSleepLog', 'list', patientId).catch(() => {});

    return NextResponse.json({
      data: sleepLogs,
      meta: {
        count: sleepLogs.length,
        avgSleepMinutes,
        avgSleepHours: Math.round((avgSleepMinutes / 60) * 10) / 10,
        avgQuality: avgQuality ? Math.round(avgQuality * 10) / 10 : null,
        patientId,
      },
    });
  } catch (error) {
    return handleApiError(error, {
      route: 'GET /api/patient-progress/sleep',
      context: { userId: user.id },
    });
  }
});

export const GET = standardRateLimit(getHandler);

const patchHandler = withAuth(async (request: NextRequest, user) => {
  try {
    const rawData = await request.json();
    const parseResult = updateSleepLogSchema.safeParse(rawData);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parseResult.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }

    const { id, sleepStart, sleepEnd, quality, notes } = parseResult.data;

    const hasUpdate =
      sleepStart !== undefined ||
      sleepEnd !== undefined ||
      quality !== undefined ||
      notes !== undefined;
    if (!hasUpdate) {
      return NextResponse.json(
        { error: 'At least one of sleepStart, sleepEnd, quality, or notes must be provided' },
        { status: 400 }
      );
    }

    const log = await prisma.patientSleepLog.findUnique({
      where: { id },
      select: { id: true, patientId: true, source: true, sleepStart: true, sleepEnd: true },
    });

    if (!log) {
      return NextResponse.json({ error: 'Sleep log not found' }, { status: 404 });
    }

    if (!(await canAccessPatientWithClinic(user, log.patientId))) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (user.role === 'patient' && log.source !== 'patient') {
      return NextResponse.json(
        { error: 'Patients can only edit entries they created' },
        { status: 403 }
      );
    }

    const updateData: {
      sleepStart?: Date;
      sleepEnd?: Date;
      duration?: number;
      quality?: number | null;
      notes?: string | null;
    } = {};

    const start = sleepStart !== undefined ? new Date(sleepStart) : new Date(log.sleepStart);
    const end = sleepEnd !== undefined ? new Date(sleepEnd) : new Date(log.sleepEnd);

    if (sleepStart !== undefined) updateData.sleepStart = start;
    if (sleepEnd !== undefined) updateData.sleepEnd = end;
    if (sleepStart !== undefined || sleepEnd !== undefined) {
      updateData.duration = Math.round((end.getTime() - start.getTime()) / (1000 * 60));
    }
    if (quality !== undefined) updateData.quality = quality;
    if (notes !== undefined) updateData.notes = notes;

    const updated = await prisma.patientSleepLog.update({
      where: { id },
      data: updateData,
    });

    logPHIUpdate(request, user, 'PatientSleepLog', id, log.patientId, Object.keys(updateData)).catch(
      () => {}
    );

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, {
      route: 'PATCH /api/patient-progress/sleep',
      context: { userId: user.id },
    });
  }
});

export const PATCH = standardRateLimit(patchHandler);

const deleteHandler = withAuth(async (request: NextRequest, user) => {
  try {
    const urlParams = new URL(request.url).searchParams;
    const nextParams = request.nextUrl.searchParams;
    const idParam = nextParams.get('id') ?? urlParams.get('id');

    const parseResult = deleteSleepLogSchema.safeParse({ id: idParam });

    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const { id } = parseResult.data;

    const log = await prisma.patientSleepLog.findUnique({
      where: { id },
      select: { id: true, patientId: true },
    });

    if (!log) {
      return NextResponse.json({ error: 'Sleep log not found' }, { status: 404 });
    }

    if (!(await canAccessPatientWithClinic(user, log.patientId))) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    await prisma.patientSleepLog.delete({
      where: { id },
    });

    logPHIDelete(request, user, 'PatientSleepLog', id, log.patientId, 'user_request').catch(
      () => {}
    );

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error) {
    return handleApiError(error, {
      route: 'DELETE /api/patient-progress/sleep',
      context: { userId: user.id },
    });
  }
});

export const DELETE = standardRateLimit(deleteHandler);
