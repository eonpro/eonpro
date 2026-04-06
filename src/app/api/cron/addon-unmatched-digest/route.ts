/**
 * Addon Unmatched Sales Digest (Daily)
 * ====================================
 *
 * Daily operational digest for paid addon sales that could NOT be queued
 * into provider Rx review due to patient matching issues.
 *
 * This route is read-only: it does not create invoices. It inspects recent
 * paid sales on the WellMedR Stripe Connect account and reports unresolved
 * items grouped by addon type and failure reason.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { verifyCronAuth } from '@/lib/cron/tenant-isolation';
import { handleApiError } from '@/domains/shared/errors';
import { alertInfo, alertWarning } from '@/lib/observability/slack-alerts';
import { buildAddonUnmatchedSalesReport } from '@/lib/addons/unmatched-sales-report';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const LOOKBACK_DAYS = 7;
const ALERT_SAMPLE_LIMIT = 20;

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const clinic = await prisma.clinic.findFirst({
      where: {
        OR: [
          { subdomain: { contains: 'wellmedr', mode: 'insensitive' } },
          { name: { contains: 'Wellmedr', mode: 'insensitive' } },
        ],
      },
      select: { id: true, stripeAccountId: true },
    });

    if (!clinic?.stripeAccountId) {
      return NextResponse.json({ skipped: true, reason: 'No WellMedR clinic or no stripeAccountId' });
    }

    const { getStripeForClinic } = await import('@/lib/stripe/connect');
    const stripeContext = await getStripeForClinic(clinic.id);
    if (!stripeContext.stripeAccountId) {
      return NextResponse.json({ skipped: true, reason: 'No Connect account' });
    }

    const report = await buildAddonUnmatchedSalesReport({
      clinicId: clinic.id,
      stripe: stripeContext.stripe,
      connectOpts: { stripeAccount: stripeContext.stripeAccountId },
      lookbackDays: LOOKBACK_DAYS,
      sampleLimit: ALERT_SAMPLE_LIMIT,
    });

    if (report.unmatchedTotal > 0) {
      await alertWarning(
        '[CRON] Daily addon unmatched sales digest',
        'Paid addon sales still cannot be queued into provider Rx review.',
        {
          lookbackDays: report.lookbackDays,
          paidSalesChecked: report.paidSalesChecked,
          unmatchedTotal: report.unmatchedTotal,
          grouped: JSON.stringify(report.grouped),
          sampledUnmatchedSales: JSON.stringify(report.samples),
        }
      );
    } else {
      await alertInfo(
        '[CRON] Daily addon unmatched sales digest',
        'No unresolved paid addon sales in the last 7 days.',
        {
          lookbackDays: report.lookbackDays,
          paidSalesChecked: report.paidSalesChecked,
        }
      );
    }

    logger.info('[CRON] Addon unmatched digest complete', {
      paidSalesChecked: report.paidSalesChecked,
      unmatchedTotal: report.unmatchedTotal,
    });

    return NextResponse.json({
      success: true,
      lookbackDays: report.lookbackDays,
      paidSalesChecked: report.paidSalesChecked,
      unmatchedTotal: report.unmatchedTotal,
      grouped: report.grouped,
      sampleCount: report.samples.length,
    });
  } catch (error) {
    return handleApiError(error, { context: { route: 'GET /api/cron/addon-unmatched-digest' } });
  }
}

