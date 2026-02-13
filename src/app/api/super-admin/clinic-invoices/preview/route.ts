import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { clinicInvoiceService } from '@/services/billing';
import { logger } from '@/lib/logger';
import { z } from 'zod';

function withSuperAdminAuth(handler: (req: NextRequest, user: AuthUser) => Promise<Response>) {
  return withAuth(handler, { roles: ['super_admin'] });
}

const querySchema = z.object({
  clinicId: z.string().transform((v) => parseInt(v, 10)),
  periodStart: z.string().transform((v) => new Date(v)),
  periodEnd: z.string().transform((v) => new Date(v)),
});

/**
 * GET /api/super-admin/clinic-invoices/preview
 * Preview pending fees for a clinic/period (no invoice created)
 */
export const GET = withSuperAdminAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const { searchParams } = new URL(req.url);
    const result = querySchema.safeParse({
      clinicId: searchParams.get('clinicId'),
      periodStart: searchParams.get('periodStart'),
      periodEnd: searchParams.get('periodEnd'),
    });

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid query', details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { clinicId, periodStart, periodEnd } = result.data;
    if (periodStart >= periodEnd) {
      return NextResponse.json(
        { error: 'periodStart must be before periodEnd' },
        { status: 400 }
      );
    }

    const preview = await clinicInvoiceService.previewPendingFees(
      clinicId,
      periodStart,
      periodEnd
    );

    return NextResponse.json({ preview });
  } catch (error) {
    logger.error('[SuperAdmin] Error previewing clinic invoice', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Preview failed' },
      { status: 500 }
    );
  }
});
