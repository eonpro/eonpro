import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/domains/shared/errors';
import { buildAddonUnmatchedSalesReport } from '@/lib/addons/unmatched-sales-report';
import { logger } from '@/lib/logger';
import type Stripe from 'stripe';

const DEFAULT_LOOKBACK_DAYS = 7;
const MAX_LOOKBACK_DAYS = 30;
const DEFAULT_SAMPLE_LIMIT = 50;
const MAX_SAMPLE_LIMIT = 200;

async function handleGet(req: NextRequest, user: AuthUser) {
  try {
    const clinic = await prisma.clinic.findFirst({
      where: {
        OR: [
          { subdomain: { contains: 'wellmedr', mode: 'insensitive' } },
          { name: { contains: 'Wellmedr', mode: 'insensitive' } },
        ],
      },
      select: { id: true, stripeAccountId: true, name: true, subdomain: true },
    });

    if (!clinic?.stripeAccountId) {
      return NextResponse.json(
        { error: 'WellMedR clinic Stripe Connect account not configured' },
        { status: 503 }
      );
    }

    // Tenant guard: non-super admins can only view their own clinic data.
    if (user.role !== 'super_admin' && user.clinicId !== clinic.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const lookbackInput = Number.parseInt(
      searchParams.get('lookbackDays') || `${DEFAULT_LOOKBACK_DAYS}`,
      10
    );
    const sampleInput = Number.parseInt(
      searchParams.get('sampleLimit') || `${DEFAULT_SAMPLE_LIMIT}`,
      10
    );
    const lookbackDays = Number.isFinite(lookbackInput)
      ? Math.min(Math.max(lookbackInput, 1), MAX_LOOKBACK_DAYS)
      : DEFAULT_LOOKBACK_DAYS;
    const sampleLimit = Number.isFinite(sampleInput)
      ? Math.min(Math.max(sampleInput, 1), MAX_SAMPLE_LIMIT)
      : DEFAULT_SAMPLE_LIMIT;

    const { getStripeForClinic } = await import('@/lib/stripe/connect');
    const stripeContext = await getStripeForClinic(clinic.id);
    if (!stripeContext.stripeAccountId) {
      return NextResponse.json({ error: 'Stripe Connect account unavailable' }, { status: 503 });
    }

    const report = await buildAddonUnmatchedSalesReport({
      clinicId: clinic.id,
      stripe: stripeContext.stripe,
      connectOpts: { stripeAccount: stripeContext.stripeAccountId } as Stripe.RequestOptions,
      lookbackDays,
      sampleLimit,
    });

    logger.info('[ADMIN] Addon unmatched sales report generated', {
      userId: user.id,
      role: user.role,
      lookbackDays,
      sampleLimit,
      unmatchedTotal: report.unmatchedTotal,
      paidSalesChecked: report.paidSalesChecked,
    });

    return NextResponse.json({
      success: true,
      generatedAt: new Date().toISOString(),
      clinic: { id: clinic.id, name: clinic.name, subdomain: clinic.subdomain },
      report,
    });
  } catch (error) {
    return handleApiError(error, { route: 'GET /api/admin/addon-unmatched-sales' });
  }
}

export const GET = withAdminAuth(handleGet);
