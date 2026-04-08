import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { handleApiError } from '@/domains/shared/errors';
import { logger } from '@/lib/logger';

const createSchema = z.object({
  patientId: z.number().positive(),
  planId: z.string().optional(),
  planName: z.string().optional(),
  amount: z.number().positive(),
  description: z.string().optional(),
  scheduledDate: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid date'),
  type: z.enum(['AUTO_CHARGE', 'REMINDER']).default('AUTO_CHARGE'),
  notes: z.string().optional(),
});

async function handleGet(request: NextRequest, user: AuthUser) {
  try {
    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get('patientId');

    if (!patientId) {
      return NextResponse.json({ error: 'patientId is required' }, { status: 400 });
    }

    const patient = await prisma.patient.findUnique({
      where: { id: parseInt(patientId) },
      select: { clinicId: true },
    });

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.clinicId !== patient.clinicId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const scheduled = await prisma.scheduledPayment.findMany({
      where: { patientId: parseInt(patientId) },
      orderBy: { scheduledDate: 'asc' },
    });

    return NextResponse.json({ scheduledPayments: scheduled });
  } catch (error) {
    return handleApiError(error, { route: 'GET /api/v2/scheduled-payments' });
  }
}

async function handlePost(request: NextRequest, user: AuthUser) {
  try {
    const body = await request.json();
    const result = createSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: result.error.flatten() },
        { status: 400 }
      );
    }

    const validated = result.data;

    const patient = await prisma.patient.findUnique({
      where: { id: validated.patientId },
      select: { id: true, clinicId: true },
    });

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.clinicId !== patient.clinicId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const scheduledDate = new Date(validated.scheduledDate);
    if (scheduledDate <= new Date()) {
      return NextResponse.json({ error: 'Scheduled date must be in the future' }, { status: 400 });
    }

    const scheduled = await prisma.scheduledPayment.create({
      data: {
        clinicId: patient.clinicId,
        patientId: patient.id,
        planId: validated.planId,
        planName: validated.planName,
        amount: validated.amount,
        description: validated.description,
        scheduledDate,
        type: validated.type,
        createdBy: user.id,
        notes: validated.notes,
      },
    });

    logger.info('[ScheduledPayment] Created', {
      id: scheduled.id,
      patientId: patient.id,
      type: validated.type,
      scheduledDate: scheduledDate.toISOString(),
    });

    return NextResponse.json({ success: true, scheduledPayment: scheduled }, { status: 201 });
  } catch (error) {
    return handleApiError(error, { route: 'POST /api/v2/scheduled-payments' });
  }
}

export const GET = withAuth(handleGet);
export const POST = withAuth(handlePost);
