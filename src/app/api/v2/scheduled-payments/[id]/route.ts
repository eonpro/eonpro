import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withAuthParams } from '@/lib/auth/middleware-with-params';
import { handleApiError } from '@/domains/shared/errors';
import { logger } from '@/lib/logger';

const updateSchema = z.object({
  action: z.enum(['reschedule', 'cancel', 'process']),
  scheduledDate: z
    .string()
    .refine((d) => !isNaN(Date.parse(d)), 'Invalid date')
    .optional(),
  notes: z.string().optional(),
});

async function handlePatch(
  request: NextRequest,
  user: any,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await context.params;
    const id = parseInt(resolvedParams.id);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const body = await request.json();
    const result = updateSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: result.error.flatten() },
        { status: 400 }
      );
    }

    const validated = result.data;

    const scheduled = await prisma.scheduledPayment.findUnique({ where: { id } });
    if (!scheduled) {
      return NextResponse.json({ error: 'Scheduled payment not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.clinicId !== scheduled.clinicId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (scheduled.status !== 'PENDING') {
      return NextResponse.json(
        { error: `Cannot modify a ${scheduled.status.toLowerCase()} scheduled payment` },
        { status: 400 }
      );
    }

    switch (validated.action) {
      case 'reschedule': {
        if (!validated.scheduledDate) {
          return NextResponse.json(
            { error: 'scheduledDate is required for reschedule' },
            { status: 400 }
          );
        }
        const newDate = new Date(validated.scheduledDate);
        if (newDate <= new Date()) {
          return NextResponse.json(
            { error: 'Scheduled date must be in the future' },
            { status: 400 }
          );
        }

        const updated = await prisma.scheduledPayment.update({
          where: { id },
          data: {
            scheduledDate: newDate,
            ...(validated.notes ? { notes: validated.notes } : {}),
          },
        });

        logger.info('[ScheduledPayment] Rescheduled', { id, newDate: newDate.toISOString() });
        return NextResponse.json({ success: true, scheduledPayment: updated });
      }

      case 'cancel': {
        const updated = await prisma.scheduledPayment.update({
          where: { id },
          data: {
            status: 'CANCELED',
            canceledAt: new Date(),
            canceledBy: user.id,
            ...(validated.notes ? { notes: validated.notes } : {}),
          },
        });

        logger.info('[ScheduledPayment] Cancelled', { id, canceledBy: user.id });
        return NextResponse.json({ success: true, scheduledPayment: updated });
      }

      case 'process': {
        const updated = await prisma.scheduledPayment.update({
          where: { id },
          data: {
            status: 'PROCESSED',
            processedAt: new Date(),
            metadata: {
              ...((scheduled.metadata as object) || {}),
              manuallyProcessedBy: user.id,
              manuallyProcessedAt: new Date().toISOString(),
            },
          },
        });

        logger.info('[ScheduledPayment] Manually marked as processed', {
          id,
          processedBy: user.id,
        });
        return NextResponse.json({ success: true, scheduledPayment: updated });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    return handleApiError(error, { route: 'PATCH /api/v2/scheduled-payments/[id]' });
  }
}

export const PATCH = withAuthParams(handlePatch);
