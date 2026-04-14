/**
 * Admin Sales Rep Disposition API
 *
 * GET   - List all dispositions with filters (admin view across all reps)
 * PATCH - Approve or reject a disposition (triggers auto-assignment if SALE_COMPLETED)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, type AuthUser } from '@/lib/auth/middleware';
import { handleApiError } from '@/domains/shared/errors';
import { runWithClinicContext, withoutClinicFilter } from '@/lib/db';
import {
  listDispositions,
  reviewDisposition,
  getDispositionStats,
} from '@/services/sales-rep/dispositionService';

export const dynamic = 'force-dynamic';

const reviewSchema = z.object({
  dispositionId: z.number().positive(),
  status: z.enum(['APPROVED', 'REJECTED']),
  reviewNote: z.string().max(500).optional(),
});

async function handleGet(req: NextRequest, user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    const clinicId =
      user.role === 'super_admin'
        ? parseInt(searchParams.get('clinicId') || '0', 10) || undefined
        : user.clinicId;

    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
    }

    const runInContext =
      user.role === 'super_admin'
        ? (fn: () => Promise<any>) => withoutClinicFilter(fn)
        : (fn: () => Promise<any>) => runWithClinicContext(clinicId, fn);

    if (action === 'stats') {
      const salesRepId = searchParams.get('salesRepId')
        ? parseInt(searchParams.get('salesRepId')!, 10)
        : undefined;
      const fromDate = searchParams.get('from') ? new Date(searchParams.get('from')!) : undefined;
      const toDate = searchParams.get('to') ? new Date(searchParams.get('to')!) : undefined;

      const stats = await runInContext(() =>
        getDispositionStats(clinicId, salesRepId, fromDate, toDate)
      );
      return NextResponse.json(stats);
    }

    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10), 100);
    const outcome = searchParams.get('outcome') as string | null;
    const status = searchParams.get('status') as string | null;
    const salesRepId = searchParams.get('salesRepId');
    const patientId = searchParams.get('patientId');

    const result = await runInContext(() =>
      listDispositions({
        clinicId,
        ...(salesRepId && { salesRepId: parseInt(salesRepId, 10) }),
        ...(patientId && { patientId: parseInt(patientId, 10) }),
        ...(outcome && { outcome: outcome as any }),
        ...(status && { status: status as any }),
        page,
        limit,
      })
    );

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, {
      context: { route: 'GET /api/admin/sales-rep/dispositions' },
    });
  }
}

async function handlePatch(req: NextRequest, user: AuthUser) {
  try {
    const body = await req.json();
    const parsed = reviewSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { dispositionId, status, reviewNote } = parsed.data;

    const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

    if (!clinicId && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Clinic context required' }, { status: 403 });
    }

    const runInContext =
      user.role === 'super_admin'
        ? (fn: () => Promise<any>) => withoutClinicFilter(fn)
        : (fn: () => Promise<any>) => runWithClinicContext(clinicId!, fn);

    const result = await runInContext(() =>
      reviewDisposition({
        dispositionId,
        reviewerId: user.id,
        clinicId: clinicId || 0,
        status,
        reviewNote,
      })
    );

    return NextResponse.json({ success: true, disposition: result });
  } catch (error) {
    return handleApiError(error, {
      context: { route: 'PATCH /api/admin/sales-rep/dispositions' },
    });
  }
}

export const GET = withAuth(handleGet, { roles: ['super_admin', 'admin'] });
export const PATCH = withAuth(handlePatch, { roles: ['super_admin', 'admin'] });
