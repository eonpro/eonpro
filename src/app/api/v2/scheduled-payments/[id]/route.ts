import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withAuthParams } from '@/lib/auth/middleware-with-params';
import { handleApiError } from '@/domains/shared/errors';
import { logger } from '@/lib/logger';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { processScheduledPayment } from '@/services/billing/scheduledPaymentsService';

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

    const auditCommon = {
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      clinicId: scheduled.clinicId,
      eventType: AuditEventType.SYSTEM_ACCESS,
      resourceType: 'ScheduledPayment',
      resourceId: scheduled.id,
      patientId: scheduled.patientId,
    };

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

        await auditLog(request, {
          ...auditCommon,
          action: 'scheduled_payment.rescheduled',
          outcome: 'SUCCESS',
          metadata: {
            previousScheduledDate: scheduled.scheduledDate.toISOString(),
            newScheduledDate: newDate.toISOString(),
          },
        }).catch(() => {});

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

        await auditLog(request, {
          ...auditCommon,
          action: 'scheduled_payment.canceled',
          outcome: 'SUCCESS',
          reason: validated.notes,
        }).catch(() => {});

        logger.info('[ScheduledPayment] Cancelled', { id, canceledBy: user.id });
        return NextResponse.json({ success: true, scheduledPayment: updated });
      }

      case 'process': {
        // Route through the shared service so manual "Process Now" gets the
        // same in-process Stripe charge (with stable idempotency, retry
        // bookkeeping, audit, and notifications) as the cron path.
        const outcome = await processScheduledPayment(id, { manualUserId: user.id });

        const updated = await prisma.scheduledPayment.findUnique({ where: { id } });

        if (outcome.kind === 'PROCESSED' || outcome.kind === 'REMINDER_FIRED') {
          return NextResponse.json({
            success: true,
            outcome: outcome.kind,
            scheduledPayment: updated,
            ...(outcome.kind === 'PROCESSED'
              ? { paymentId: outcome.paymentId, invoiceId: outcome.invoiceId }
              : {}),
          });
        }

        if (outcome.kind === 'TERMINAL_FAILURE') {
          return NextResponse.json(
            {
              success: false,
              outcome: outcome.kind,
              error: outcome.reason,
              scheduledPayment: updated,
            },
            { status: 402 }
          );
        }

        if (outcome.kind === 'RETRY_SCHEDULED') {
          return NextResponse.json(
            {
              success: false,
              outcome: outcome.kind,
              error: `Charge failed (will retry automatically): ${outcome.reason}`,
              attemptCount: outcome.attemptCount,
              scheduledPayment: updated,
            },
            { status: 402 }
          );
        }

        // SKIPPED
        return NextResponse.json(
          {
            success: false,
            outcome: outcome.kind,
            error: outcome.reason,
            scheduledPayment: updated,
          },
          { status: 400 }
        );
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    return handleApiError(error, { route: 'PATCH /api/v2/scheduled-payments/[id]' });
  }
}

export const PATCH = withAuthParams(handlePatch);
