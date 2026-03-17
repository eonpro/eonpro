/**
 * Sales Rep Disposition API
 *
 * POST - Submit a new disposition (sales rep qualifies a patient interaction)
 * GET  - List dispositions for the current sales rep
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, type AuthUser } from '@/lib/auth/middleware';
import { handleApiError } from '@/domains/shared/errors';
import { runWithClinicContext } from '@/lib/db';
import {
  createDisposition,
  listDispositions,
  getDispositionStats,
} from '@/services/sales-rep/dispositionService';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  patientId: z.number().positive(),
  leadSource: z.enum([
    'REF_LINK',
    'COLD_CALL',
    'WALK_IN',
    'SOCIAL_MEDIA',
    'TEXT_MESSAGE',
    'EMAIL_CAMPAIGN',
    'WORD_OF_MOUTH',
    'EXISTING_PATIENT',
    'EVENT',
    'OTHER',
  ]),
  contactMethod: z.enum([
    'PHONE',
    'TEXT',
    'EMAIL',
    'IN_PERSON',
    'VIDEO_CALL',
    'SOCIAL_DM',
    'OTHER',
  ]),
  outcome: z.enum([
    'SALE_COMPLETED',
    'INTERESTED',
    'CALLBACK_REQUESTED',
    'NOT_INTERESTED',
    'NO_ANSWER',
    'WRONG_NUMBER',
    'ALREADY_PATIENT',
    'DO_NOT_CONTACT',
    'OTHER',
  ]),
  productInterest: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
  followUpDate: z.string().datetime().optional(),
  followUpNotes: z.string().max(1000).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
});

async function handlePost(req: NextRequest, user: AuthUser) {
  if (!user.clinicId) {
    return NextResponse.json({ error: 'Clinic context required' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const result = await runWithClinicContext(user.clinicId, () =>
      createDisposition({
        clinicId: user.clinicId!,
        salesRepId: user.id,
        patientId: data.patientId,
        leadSource: data.leadSource,
        contactMethod: data.contactMethod,
        outcome: data.outcome,
        productInterest: data.productInterest,
        notes: data.notes,
        followUpDate: data.followUpDate ? new Date(data.followUpDate) : undefined,
        followUpNotes: data.followUpNotes,
        tags: data.tags,
      })
    );

    return NextResponse.json({ success: true, disposition: result }, { status: 201 });
  } catch (error) {
    return handleApiError(error, { context: { route: 'POST /api/sales-rep/dispositions' } });
  }
}

async function handleGet(req: NextRequest, user: AuthUser) {
  if (!user.clinicId) {
    return NextResponse.json({ error: 'Clinic context required' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    if (action === 'stats') {
      const fromDate = searchParams.get('from')
        ? new Date(searchParams.get('from')!)
        : undefined;
      const toDate = searchParams.get('to')
        ? new Date(searchParams.get('to')!)
        : undefined;

      const stats = await runWithClinicContext(user.clinicId, () =>
        getDispositionStats(user.clinicId!, user.id, fromDate, toDate)
      );
      return NextResponse.json(stats);
    }

    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10), 100);
    const outcome = searchParams.get('outcome') as string | null;
    const status = searchParams.get('status') as string | null;
    const patientId = searchParams.get('patientId');

    const result = await runWithClinicContext(user.clinicId, () =>
      listDispositions({
        clinicId: user.clinicId!,
        salesRepId: user.id,
        ...(patientId && { patientId: parseInt(patientId, 10) }),
        ...(outcome && { outcome: outcome as any }),
        ...(status && { status: status as any }),
        page,
        limit,
      })
    );

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, { context: { route: 'GET /api/sales-rep/dispositions' } });
  }
}

export const POST = withAuth(handlePost, { roles: ['sales_rep'] });
export const GET = withAuth(handleGet, { roles: ['sales_rep'] });
