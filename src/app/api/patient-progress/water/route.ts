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
  patientId: z.union([z.string(), z.number()]).transform((val) => {
    const num = typeof val === 'string' ? parseInt(val, 10) : val;
    if (isNaN(num) || num <= 0) throw new Error('Invalid patientId');
    return num;
  }),
  amount: z.union([z.string(), z.number()]).transform((val) => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num) || num <= 0) throw new Error('Invalid amount');
    return num;
  }),
  unit: z.enum(['oz', 'ml']).default('oz'),
  notes: z.string().max(500).optional(),
  recordedAt: z.string().datetime().optional(),
});

const getWaterLogsSchema = z.object({
  patientId: z.string().transform((val) => {
    const num = parseInt(val, 10);
    if (isNaN(num) || num <= 0) throw new Error('Invalid patientId');
    return num;
  }),
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

    await logPHICreate(request, user, 'PatientWaterLog', waterLog.id, patientId);

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

    // Calculate today's total
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const todayLogs = await prisma.patientWaterLog.findMany({
      where: {
        patientId,
        recordedAt: { gte: today, lte: todayEnd },
      },
    });

    type WaterLog = (typeof todayLogs)[number];
    const todayTotal = todayLogs.reduce((sum: number, log: WaterLog) => sum + log.amount, 0);

    await logPHIAccess(request, user, 'PatientWaterLog', 'list', patientId);

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
