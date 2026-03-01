import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuth } from '@/lib/auth/middleware';
import { standardRateLimit } from '@/lib/rateLimit';
import { z } from 'zod';
import { logPHIAccess, logPHICreate, logPHIUpdate, logPHIDelete } from '@/lib/audit/hipaa-audit';
import { handleApiError } from '@/domains/shared/errors';
import { canAccessPatientWithClinic } from '@/lib/auth/patient-access';

// Sanitize HTML to prevent XSS
function sanitizeText(text: string): string {
  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim();
}

const createNutritionLogSchema = z.object({
  patientId: z
    .union([z.string(), z.number()])
    .transform((val) => (typeof val === 'string' ? parseInt(val, 10) : val))
    .refine((n) => !isNaN(n) && n > 0, { message: 'patientId must be a positive integer' }),
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  description: z
    .string()
    .max(500)
    .optional()
    .transform((val) => (val ? sanitizeText(val) : undefined)),
  calories: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      const num = typeof val === 'string' ? parseInt(val, 10) : val;
      return isNaN(num) ? undefined : num;
    }),
  protein: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      const num = typeof val === 'string' ? parseFloat(val) : val;
      return isNaN(num) ? undefined : num;
    }),
  carbs: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      const num = typeof val === 'string' ? parseFloat(val) : val;
      return isNaN(num) ? undefined : num;
    }),
  fat: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      const num = typeof val === 'string' ? parseFloat(val) : val;
      return isNaN(num) ? undefined : num;
    }),
  notes: z
    .string()
    .max(500)
    .optional()
    .transform((val) => (val ? sanitizeText(val) : undefined)),
  recordedAt: z.string().datetime().optional(),
});

const getNutritionLogsSchema = z.object({
  patientId: z
    .string()
    .transform((val) => parseInt(val, 10))
    .refine((n) => !isNaN(n) && n > 0, { message: 'patientId must be a positive integer' }),
});

const updateNutritionLogSchema = z.object({
  id: z
    .union([z.string(), z.number()])
    .transform((val) => (typeof val === 'string' ? parseInt(val, 10) : val))
    .refine((n) => !isNaN(n) && n > 0, { message: 'id must be a positive integer' }),
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).optional(),
  description: z
    .string()
    .max(500)
    .optional()
    .nullable()
    .transform((val) => (val ? sanitizeText(val) : val)),
  calories: z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((val) => {
      if (val == null) return undefined;
      const num = typeof val === 'string' ? parseInt(val, 10) : val;
      return isNaN(num) ? undefined : num;
    }),
  protein: z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((val) => {
      if (val == null) return undefined;
      const num = typeof val === 'string' ? parseFloat(val) : val;
      return isNaN(num) ? undefined : num;
    }),
  carbs: z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((val) => {
      if (val == null) return undefined;
      const num = typeof val === 'string' ? parseFloat(val) : val;
      return isNaN(num) ? undefined : num;
    }),
  fat: z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((val) => {
      if (val == null) return undefined;
      const num = typeof val === 'string' ? parseFloat(val) : val;
      return isNaN(num) ? undefined : num;
    }),
  notes: z
    .string()
    .max(500)
    .optional()
    .nullable()
    .transform((val) => (val ? sanitizeText(val) : val)),
  recordedAt: z.string().datetime().optional(),
});

const deleteNutritionLogSchema = z.object({
  id: z
    .string()
    .transform((val) => parseInt(val, 10))
    .refine((n) => !isNaN(n) && n > 0, { message: 'id must be a positive integer' }),
});

const postHandler = withAuth(async (request: NextRequest, user) => {
  try {
    const rawData = await request.json();
    const parseResult = createNutritionLogSchema.safeParse(rawData);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parseResult.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }

    const { patientId, mealType, description, calories, protein, carbs, fat, notes, recordedAt } =
      parseResult.data;

    if (!(await canAccessPatientWithClinic(user, patientId))) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const nutritionLog = await prisma.patientNutritionLog.create({
      data: {
        patientId,
        clinicId: user.clinicId || null,
        mealType,
        description: description || null,
        calories: calories || null,
        protein: protein || null,
        carbs: carbs || null,
        fat: fat || null,
        notes: notes || null,
        recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
        source: user.role === 'patient' ? 'patient' : 'provider',
      },
    });

    logPHICreate(request, user, 'PatientNutritionLog', nutritionLog.id, patientId).catch(() => {});

    return NextResponse.json(nutritionLog, { status: 201 });
  } catch (error) {
    return handleApiError(error, {
      route: 'POST /api/patient-progress/nutrition',
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
    const parseResult = getNutritionLogsSchema.safeParse({
      patientId: patientIdParam,
    });

    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const { patientId } = parseResult.data;

    if (!(await canAccessPatientWithClinic(user, patientId))) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const nutritionLogs = await prisma.patientNutritionLog.findMany({
      where: { patientId },
      orderBy: { recordedAt: 'desc' },
      take: 100,
    });

    // Calculate today's totals
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    type NutritionLog = (typeof nutritionLogs)[number];
    const todayLogs = nutritionLogs.filter((log: NutritionLog) => {
      const logDate = new Date(log.recordedAt);
      return logDate >= today && logDate <= todayEnd;
    });

    const todayCalories = todayLogs.reduce(
      (sum: number, log: NutritionLog) => sum + (log.calories || 0),
      0
    );
    const todayProtein = todayLogs.reduce(
      (sum: number, log: NutritionLog) => sum + (log.protein || 0),
      0
    );
    const todayCarbs = todayLogs.reduce(
      (sum: number, log: NutritionLog) => sum + (log.carbs || 0),
      0
    );
    const todayFat = todayLogs.reduce((sum: number, log: NutritionLog) => sum + (log.fat || 0), 0);

    logPHIAccess(request, user, 'PatientNutritionLog', 'list', patientId).catch(() => {});

    return NextResponse.json({
      data: nutritionLogs,
      meta: {
        count: nutritionLogs.length,
        todayCalories,
        todayProtein: Math.round(todayProtein),
        todayCarbs: Math.round(todayCarbs),
        todayFat: Math.round(todayFat),
        patientId,
      },
    });
  } catch (error) {
    return handleApiError(error, {
      route: 'GET /api/patient-progress/nutrition',
      context: { userId: user.id },
    });
  }
});

export const GET = standardRateLimit(getHandler);

const patchHandler = withAuth(async (request: NextRequest, user) => {
  try {
    const rawData = await request.json();
    const parseResult = updateNutritionLogSchema.safeParse(rawData);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parseResult.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }

    const {
      id,
      mealType,
      description,
      calories,
      protein,
      carbs,
      fat,
      notes,
      recordedAt,
    } = parseResult.data;

    const hasUpdate =
      mealType !== undefined ||
      description !== undefined ||
      calories !== undefined ||
      protein !== undefined ||
      carbs !== undefined ||
      fat !== undefined ||
      notes !== undefined ||
      recordedAt !== undefined;
    if (!hasUpdate) {
      return NextResponse.json(
        {
          error:
            'At least one of mealType, description, calories, protein, carbs, fat, notes, or recordedAt must be provided',
        },
        { status: 400 }
      );
    }

    const log = await prisma.patientNutritionLog.findUnique({
      where: { id },
      select: { id: true, patientId: true, source: true },
    });

    if (!log) {
      return NextResponse.json({ error: 'Nutrition log not found' }, { status: 404 });
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
      mealType?: string;
      description?: string | null;
      calories?: number | null;
      protein?: number | null;
      carbs?: number | null;
      fat?: number | null;
      notes?: string | null;
      recordedAt?: Date;
    } = {};
    if (mealType !== undefined) updateData.mealType = mealType;
    if (description !== undefined) updateData.description = description;
    if (calories !== undefined) updateData.calories = calories;
    if (protein !== undefined) updateData.protein = protein;
    if (carbs !== undefined) updateData.carbs = carbs;
    if (fat !== undefined) updateData.fat = fat;
    if (notes !== undefined) updateData.notes = notes;
    if (recordedAt !== undefined) updateData.recordedAt = new Date(recordedAt);

    const updated = await prisma.patientNutritionLog.update({
      where: { id },
      data: updateData,
    });

    logPHIUpdate(
      request,
      user,
      'PatientNutritionLog',
      id,
      log.patientId,
      Object.keys(updateData)
    ).catch(() => {});

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, {
      route: 'PATCH /api/patient-progress/nutrition',
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

    const parseResult = deleteNutritionLogSchema.safeParse({ id: idParam });

    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const { id } = parseResult.data;

    const log = await prisma.patientNutritionLog.findUnique({
      where: { id },
      select: { id: true, patientId: true },
    });

    if (!log) {
      return NextResponse.json({ error: 'Nutrition log not found' }, { status: 404 });
    }

    if (!(await canAccessPatientWithClinic(user, log.patientId))) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    await prisma.patientNutritionLog.delete({
      where: { id },
    });

    logPHIDelete(
      request,
      user,
      'PatientNutritionLog',
      id,
      log.patientId,
      'user_request'
    ).catch(() => {});

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error) {
    return handleApiError(error, {
      route: 'DELETE /api/patient-progress/nutrition',
      context: { userId: user.id },
    });
  }
});

export const DELETE = standardRateLimit(deleteHandler);
