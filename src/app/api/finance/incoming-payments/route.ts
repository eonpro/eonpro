/**
 * Incoming Payments API
 * =====================
 *
 * Enterprise-grade endpoint for monitoring Stripe payment webhook stream.
 * Returns PaymentReconciliation records for the current clinic.
 *
 * GET /api/finance/incoming-payments
 *
 * Query params:
 *   - days: 1-90 (default 14)
 *   - status: MATCHED | CREATED | FAILED | PENDING | SKIPPED (optional)
 *   - limit: 1-200 (default 100)
 *
 * Security: Clinic-scoped for admin/staff; super_admin can view all when no clinic context.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { ReconciliationStatus } from '@prisma/client';
import { prisma, getClinicContext, withClinicContext } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { verifyClinicAccess } from '@/lib/auth/clinic-access';
import {
  handleApiError,
  ForbiddenError,
  BadRequestError,
} from '@/domains/shared/errors';
import { subDays } from 'date-fns';

const VALID_STATUSES = ['MATCHED', 'CREATED', 'FAILED', 'PENDING', 'SKIPPED'] as const;

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(14),
  status: z.enum(VALID_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!['admin', 'super_admin', 'staff', 'provider'].includes(user.role)) {
      throw new ForbiddenError('Finance access required');
    }

    const contextClinicId = getClinicContext();
    const clinicId = contextClinicId ?? user.clinicId ?? null;

    if (!clinicId && user.role !== 'super_admin') {
      throw new BadRequestError('Clinic context required. Select a clinic to view incoming payments.');
    }

    if (clinicId && !verifyClinicAccess(user, clinicId)) {
      throw new ForbiddenError('Access denied to this clinic');
    }

    const { searchParams } = new URL(request.url);
    const parseResult = querySchema.safeParse({
      days: searchParams.get('days') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    });

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid query parameters',
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { days, status, limit } = parseResult.data;
    const since = subDays(new Date(), days);

    const where: Prisma.PaymentReconciliationWhereInput = {
      createdAt: { gte: since },
    };

    if (clinicId) {
      where.clinicId = clinicId;
    }

    if (status) {
      where.status = status as ReconciliationStatus;
    }

    const runQuery = async () => {
      return Promise.all([
        prisma.paymentReconciliation.findMany({
          where,
          include: {
            patient: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
            invoice: {
              select: { id: true, amount: true, status: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
        }),
        prisma.paymentReconciliation.groupBy({
          by: ['status'],
          where,
          _count: true,
          _sum: { amount: true },
        }),
      ]);
    };

    const [payments, stats] = clinicId
      ? await withClinicContext(clinicId, runQuery)
      : await runQuery();

    const byStatus: Record<string, { count: number; amountCents: number }> = {};
    for (const s of stats) {
      byStatus[s.status] = {
        count: s._count,
        amountCents: s._sum.amount ?? 0,
      };
    }

    const response = {
      success: true as const,
      summary: {
        total: payments.length,
        byStatus,
        period: `Last ${days} days`,
      },
      payments: payments.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        status: r.status,
        stripeEventId: r.stripeEventId,
        stripeEventType: r.stripeEventType,
        stripePaymentIntentId: r.stripePaymentIntentId,
        stripeChargeId: r.stripeChargeId,
        amount: r.amount,
        currency: r.currency,
        customerEmail: r.customerEmail,
        customerName: r.customerName,
        customerPhone: r.customerPhone,
        matchedBy: r.matchedBy,
        matchConfidence: r.matchConfidence,
        patientCreated: r.patientCreated,
        patient: r.patient,
        invoice: r.invoice,
        errorMessage: r.errorMessage,
        clinicId: r.clinicId,
      })),
    };

    const res = NextResponse.json(response);
    res.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=30');
    return res;
  } catch (error) {
    logger.error('[Incoming Payments] GET error', { error });
    return handleApiError(error, {
      route: 'GET /api/finance/incoming-payments',
      context: { endpoint: 'incoming-payments' },
    });
  }
}
