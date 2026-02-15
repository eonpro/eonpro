import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuth } from '@/lib/auth/middleware';
import { z } from 'zod';
import { handleApiError } from '@/domains/shared/errors';
import { logPHIAccess, logPHICreate, logPHIDelete } from '@/lib/audit/hipaa-audit';
import { withRateLimit, RATE_LIMIT_CONFIGS } from '@/lib/security/rate-limiter';
import { canAccessPatientWithClinic } from '@/lib/auth/patient-access';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createReminderSchema = z.object({
  patientId: z.union([z.string(), z.number()]).transform((val) => {
    const num = typeof val === 'string' ? parseInt(val, 10) : val;
    if (isNaN(num) || num <= 0) throw new Error('Invalid patientId');
    return num;
  }),
  medicationName: z.string().min(1).max(200),
  dayOfWeek: z.union([z.string(), z.number()]).transform((val) => {
    const num = typeof val === 'string' ? parseInt(val, 10) : val;
    if (isNaN(num) || num < 0 || num > 6) throw new Error('dayOfWeek must be 0-6');
    return num;
  }),
  timeOfDay: z
    .string()
    .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)')
    .default('08:00'),
  isActive: z.boolean().default(true),
});

const getRemindersSchema = z.object({
  patientId: z.string().transform((val) => {
    const num = parseInt(val, 10);
    if (isNaN(num) || num <= 0) throw new Error('Invalid patientId');
    return num;
  }),
});

const deleteReminderSchema = z.object({
  id: z.string().transform((val) => {
    const num = parseInt(val, 10);
    if (isNaN(num) || num <= 0) throw new Error('Invalid id');
    return num;
  }),
});

// ============================================================================
// POST /api/patient-progress/medication-reminders - Create or update a reminder
// ============================================================================

const postHandler = withAuth(async (request: NextRequest, user) => {
  try {
    const rawData = await request.json();
    const parseResult = createReminderSchema.safeParse(rawData);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parseResult.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }

    const { patientId, medicationName, dayOfWeek, timeOfDay, isActive } = parseResult.data;

    // AUTHORIZATION CHECK FIRST (with clinic isolation)
    if (!(await canAccessPatientWithClinic(user, patientId))) {
      logger.warn('Unauthorized medication reminder access', { userId: user.id, patientId });
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Check if reminder already exists
    const existing = await prisma.patientMedicationReminder.findFirst({
      where: {
        patientId,
        medicationName,
        dayOfWeek,
      },
    });

    let reminder;
    if (existing) {
      // Update existing reminder
      reminder = await prisma.patientMedicationReminder.update({
        where: { id: existing.id },
        data: {
          timeOfDay,
          isActive,
          updatedAt: new Date(),
        },
      });
    } else {
      // Create new reminder
      reminder = await prisma.patientMedicationReminder.create({
        data: {
          patientId,
          medicationName,
          dayOfWeek,
          timeOfDay,
          isActive,
        },
      });
    }

    logger.info('Medication reminder saved', {
      patientId,
      medicationName,
      dayOfWeek,
      id: reminder.id,
      userId: user.id,
    });

    await logPHICreate(request, user, 'PatientMedicationReminder', reminder.id, patientId);

    return NextResponse.json(reminder, { status: existing ? 200 : 201 });
  } catch (error) {
    return handleApiError(error, {
      route: 'POST /api/patient-progress/medication-reminders',
      context: { userId: user.id },
    });
  }
});

export const POST = withRateLimit(postHandler, RATE_LIMIT_CONFIGS.phiAccess);

// ============================================================================
// GET /api/patient-progress/medication-reminders?patientId=X
// ============================================================================

const getHandler = withAuth(async (request: NextRequest, user) => {
  try {
    const urlParams = new URL(request.url).searchParams;
    const nextParams = request.nextUrl.searchParams;
    let patientIdParam = nextParams.get('patientId') ?? urlParams.get('patientId');
    if (patientIdParam == null && user.role === 'patient' && user.patientId != null)
      patientIdParam = String(user.patientId);
    const parseResult = getRemindersSchema.safeParse({
      patientId: patientIdParam,
    });

    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const { patientId } = parseResult.data;

    // AUTHORIZATION CHECK FIRST (with clinic isolation)
    if (!(await canAccessPatientWithClinic(user, patientId))) {
      logger.warn('Unauthorized medication reminder access', { userId: user.id, patientId });
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const reminders = await prisma.patientMedicationReminder.findMany({
      where: {
        patientId,
        isActive: true,
      },
      orderBy: [{ medicationName: 'asc' }, { dayOfWeek: 'asc' }],
      take: 100, // Pagination limit
    });

    await logPHIAccess(request, user, 'PatientMedicationReminder', 'list', patientId);

    return NextResponse.json({
      data: reminders,
      meta: { count: reminders.length, patientId },
    });
  } catch (error) {
    return handleApiError(error, {
      route: 'GET /api/patient-progress/medication-reminders',
      context: { userId: user.id },
    });
  }
});

export const GET = withRateLimit(getHandler, RATE_LIMIT_CONFIGS.phiAccess);

// ============================================================================
// DELETE /api/patient-progress/medication-reminders?id=X
// ============================================================================

const deleteHandler = withAuth(async (request: NextRequest, user) => {
  try {
    const urlParams = new URL(request.url).searchParams;
    const nextParams = request.nextUrl.searchParams;
    const parseResult = deleteReminderSchema.safeParse({
      id: nextParams.get('id') ?? urlParams.get('id'),
    });

    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const { id } = parseResult.data;

    // Fetch reminder to check ownership
    const reminder = await prisma.patientMedicationReminder.findUnique({
      where: { id },
      select: { id: true, patientId: true },
    });

    if (!reminder) {
      return NextResponse.json({ error: 'Reminder not found' }, { status: 404 });
    }

    // AUTHORIZATION CHECK (with clinic isolation)
    if (!(await canAccessPatientWithClinic(user, reminder.patientId))) {
      logger.warn('Unauthorized medication reminder deletion', { userId: user.id, reminderId: id });
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    await prisma.patientMedicationReminder.delete({
      where: { id },
    });

    logger.info('Medication reminder deleted', {
      id,
      userId: user.id,
      patientId: reminder.patientId,
    });

    await logPHIDelete(request, user, 'PatientMedicationReminder', id, reminder.patientId, 'user_request');

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error) {
    return handleApiError(error, {
      route: 'DELETE /api/patient-progress/medication-reminders',
      context: { userId: user.id },
    });
  }
});

export const DELETE = withRateLimit(deleteHandler, RATE_LIMIT_CONFIGS.phiAccess);
