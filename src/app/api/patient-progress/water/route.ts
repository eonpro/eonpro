import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuth } from '@/lib/auth/middleware';
import { standardRateLimit } from '@/lib/rateLimit';
import { z } from 'zod';
import { logPHIAccess, logPHICreate } from '@/lib/audit/hipaa-audit';
import { handleApiError } from '@/domains/shared/errors';
import { canAccessPatientWithClinic } from '@/lib/auth/patient-access';

// Validation schemas
const createWaterLogSchema = z.object({
  patientId: z
    .union([z.string(), z.number()])
    .transform((val) => (typeof val === 'string' ? parseInt(val, 10) : val))
    .refine((n) => !isNaN(n) && n > 0, { message: 'patientId must be a positive integer' }),
  amount: z
    .union([z.string(), z.number()])
    .transform((val) => (typeof val === 'string' ? parseFloat(val) : val))
    .refine((n) => !isNaN(n) && n > 0, { message: 'Amount must be a positive number' })
    .refine((n) => n <= 200, { message: 'Amount must be 200 oz or less' }),
  unit: z.enum(['oz', 'ml']).default('oz'),
  notes: z.string().max(500).optional(),
  recordedAt: z.string().datetime().optional(),
});

const getWaterLogsSchema = z.object({
  patientId: z
    .string()
    .transform((val) => parseInt(val, 10))
    .refine((n) => !isNaN(n) && n > 0, { message: 'patientId must be a positive integer' }),
  date: z.string().nullish(),
});

// POST - Create water log
const postHandler = withAuth(async (request: NextRequest, user) => {
  try {
    const rawData = await request.json();
    const parseResult = createWaterLogSchema.safeParse(rawData);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parseResult.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }

    const { patientId, amount, unit, notes, recordedAt } = parseResult.data;

    if (!(await canAccessPatientWithClinic(user, patientId))) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const waterLog = await prisma.patientWaterLog.create({
      data: {
        patientId,
        clinicId: user.clinicId || null,
        amount,
        unit,
        notes: notes || null,
        recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
        source: user.role === 'patient' ? 'patient' : 'provider',
      },
    });

    logPHICreate(request, user, 'PatientWaterLog', waterLog.id, patientId).catch(() => {});

    return NextResponse.json(waterLog, { status: 201 });
  } catch (error) {
    return handleApiError(error, {
      route: 'POST /api/patient-progress/water',
      context: { userId: user.id },
    });
  }
});

export const POST = standardRateLimit(postHandler);

// GET - Get water logs
const getHandler = withAuth(async (request: NextRequest, user) => {
  try {
    const urlParams = new URL(request.url).searchParams;
    const nextParams = request.nextUrl.searchParams;
    let patientIdParam = nextParams.get('patientId') ?? urlParams.get('patientId');
    if (patientIdParam == null && user.role === 'patient' && user.patientId != null)
      patientIdParam = String(user.patientId);
    const parseResult = getWaterLogsSchema.safeParse({
      patientId: patientIdParam,
      date: nextParams.get('date') ?? urlParams.get('date'),
    });

    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const { patientId, date } = parseResult.data;

    if (!(await canAccessPatientWithClinic(user, patientId))) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Build date filter
    let dateFilter = {};
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      dateFilter = {
        recordedAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      };
    }

    const waterLogs = await prisma.patientWaterLog.findMany({
      where: { patientId, ...dateFilter },
      orderBy: { recordedAt: 'desc' },
      take: 100,
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    type WaterLog = (typeof waterLogs)[number];
    const todayTotal = waterLogs
      .filter((log: WaterLog) => {
        const d = new Date(log.recordedAt);
        return d >= today && d <= todayEnd;
      })
      .reduce((sum: number, log: WaterLog) => sum + log.amount, 0);

    logPHIAccess(request, user, 'PatientWaterLog', 'list', patientId).catch(() => {});

    return NextResponse.json({
      data: waterLogs,
      meta: { count: waterLogs.length, todayTotal, patientId },
    });
  } catch (error) {
    return handleApiError(error, {
      route: 'GET /api/patient-progress/water',
      context: { userId: user.id },
    });
  }
});

export const GET = standardRateLimit(getHandler);
