import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuth } from '@/lib/auth/middleware';
import { standardRateLimit } from '@/lib/rateLimit';
import { z } from 'zod';
import { logPHIAccess, logPHICreate } from '@/lib/audit/hipaa-audit';
import { handleApiError } from '@/domains/shared/errors';
import { canAccessPatientWithClinic } from '@/lib/auth/patient-access';

const createExerciseLogSchema = z.object({
  patientId: z
    .union([z.string(), z.number()])
    .transform((val) => (typeof val === 'string' ? parseInt(val, 10) : val))
    .refine((n) => !isNaN(n) && n > 0, { message: 'patientId must be a positive integer' }),
  activityType: z.string().min(1).max(100),
  duration: z
    .union([z.string(), z.number()])
    .transform((val) => (typeof val === 'string' ? parseInt(val, 10) : val))
    .refine((n) => !isNaN(n) && n > 0, { message: 'Duration must be a positive number' })
    .refine((n) => n <= 1440, { message: 'Duration must be 1440 minutes or less' }),
  intensity: z.enum(['light', 'moderate', 'vigorous']).default('moderate'),
  calories: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      const num = typeof val === 'string' ? parseInt(val, 10) : val;
      return isNaN(num) ? undefined : num;
    }),
  steps: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      const num = typeof val === 'string' ? parseInt(val, 10) : val;
      return isNaN(num) ? undefined : num;
    }),
  distance: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      const num = typeof val === 'string' ? parseFloat(val) : val;
      return isNaN(num) ? undefined : num;
    }),
  notes: z.string().max(500).optional(),
  recordedAt: z.string().datetime().optional(),
});

const getExerciseLogsSchema = z.object({
  patientId: z
    .string()
    .transform((val) => parseInt(val, 10))
    .refine((n) => !isNaN(n) && n > 0, { message: 'patientId must be a positive integer' }),
});

const postHandler = withAuth(async (request: NextRequest, user) => {
  try {
    const rawData = await request.json();
    const parseResult = createExerciseLogSchema.safeParse(rawData);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parseResult.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }

    const {
      patientId,
      activityType,
      duration,
      intensity,
      calories,
      steps,
      distance,
      notes,
      recordedAt,
    } = parseResult.data;

    if (!(await canAccessPatientWithClinic(user, patientId))) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const exerciseLog = await prisma.patientExerciseLog.create({
      data: {
        patientId,
        clinicId: user.clinicId || null,
        activityType,
        duration,
        intensity,
        calories: calories || null,
        steps: steps || null,
        distance: distance || null,
        notes: notes || null,
        recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
        source: user.role === 'patient' ? 'patient' : 'provider',
      },
    });

    logPHICreate(request, user, 'PatientExerciseLog', exerciseLog.id, patientId).catch(() => {});

    return NextResponse.json(exerciseLog, { status: 201 });
  } catch (error) {
    return handleApiError(error, {
      route: 'POST /api/patient-progress/exercise',
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
    const parseResult = getExerciseLogsSchema.safeParse({
      patientId: patientIdParam,
    });

    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const { patientId } = parseResult.data;

    if (!(await canAccessPatientWithClinic(user, patientId))) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const exerciseLogs = await prisma.patientExerciseLog.findMany({
      where: { patientId },
      orderBy: { recordedAt: 'desc' },
      take: 100,
    });

    // Calculate weekly stats
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const weeklyLogs = exerciseLogs.filter(
      (log: (typeof exerciseLogs)[number]) => new Date(log.recordedAt) >= weekAgo
    );
    const weeklyMinutes = weeklyLogs.reduce(
      (sum: number, log: (typeof exerciseLogs)[number]) => sum + log.duration,
      0
    );
    const weeklyCalories = weeklyLogs.reduce(
      (sum: number, log: (typeof exerciseLogs)[number]) => sum + (log.calories || 0),
      0
    );

    logPHIAccess(request, user, 'PatientExerciseLog', 'list', patientId).catch(() => {});

    return NextResponse.json({
      data: exerciseLogs,
      meta: {
        count: exerciseLogs.length,
        weeklyMinutes,
        weeklyCalories,
        patientId,
      },
    });
  } catch (error) {
    return handleApiError(error, {
      route: 'GET /api/patient-progress/exercise',
      context: { userId: user.id },
    });
  }
});

export const GET = standardRateLimit(getHandler);
