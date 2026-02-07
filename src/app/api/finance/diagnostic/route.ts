/**
 * Finance diagnostic: compare DB vs Stripe for the current clinic
 *
 * GET /api/finance/diagnostic
 * Returns clinic Stripe config, DB totals, and Stripe totals so you can see
 * if numbers are in sync (e.g. after running sync-subscriptions).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, getClinicContext } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { verifyClinicAccess } from '@/lib/auth/clinic-access';
import { getStripeForClinic, withConnectedAccount } from '@/lib/stripe/connect';
import { subDays } from 'date-fns';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const contextClinicId = getClinicContext();
    const clinicId = contextClinicId || user.clinicId;

    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
    }

    if (!verifyClinicAccess(user, clinicId)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { id: true, name: true, subdomain: true, stripePlatformAccount: true, stripeAccountId: true },
    });

    if (!clinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    const thirtyDaysAgo = subDays(new Date(), 30);

    const [dbRevenue, dbActiveSubscriptions] = await Promise.all([
      prisma.invoice.aggregate({
        where: { clinicId, status: 'PAID', paidAt: { gte: thirtyDaysAgo } },
        _sum: { amountPaid: true },
      }),
      prisma.subscription.count({
        where: { clinicId, status: 'ACTIVE' },
      }),
    ]);

    let stripeSubscriptionCount: number | null = null;
    let stripeError: string | null = null;
    const stripeContext = await getStripeForClinic(clinicId);

    if (stripeContext.stripe) {
      try {
        const list = await stripeContext.stripe.subscriptions.list(
          withConnectedAccount(stripeContext, { status: 'active', limit: 100 })
        );
        stripeSubscriptionCount = list.data.length;
        if (list.has_more) {
          let startingAfter: string | undefined = list.data[list.data.length - 1]?.id;
          while (list.has_more && startingAfter) {
            const next = await stripeContext.stripe!.subscriptions.list(
              withConnectedAccount(stripeContext, { status: 'active', limit: 100, starting_after: startingAfter })
            );
            list.data.push(...next.data);
            list.has_more = next.has_more;
            startingAfter = next.data.length ? next.data[next.data.length - 1].id : undefined;
          }
          stripeSubscriptionCount = list.data.length;
        }
      } catch (e) {
        stripeError = e instanceof Error ? e.message : 'Unknown error';
        logger.warn('[Finance diagnostic] Stripe list failed', { clinicId, error: stripeError });
      }
    }

    const stripeAccountType = clinic.stripeAccountId
      ? 'connect'
      : (stripeContext as { isDedicatedAccount?: boolean }).isDedicatedAccount
        ? 'dedicated'
        : stripeContext.isPlatformAccount
          ? 'platform'
          : 'none';

    return NextResponse.json({
      clinicId,
      clinicName: clinic.name,
      subdomain: clinic.subdomain,
      stripeAccountType,
      db: {
        revenueLast30DaysCents: dbRevenue._sum.amountPaid ?? 0,
        activeSubscriptions: dbActiveSubscriptions,
      },
      stripe: stripeError
        ? { error: stripeError }
        : { activeSubscriptions: stripeSubscriptionCount },
      suggestion:
        stripeSubscriptionCount != null && dbActiveSubscriptions !== stripeSubscriptionCount
          ? 'Run "Sync from Stripe" to backfill subscriptions so MRR/ARR match Stripe.'
          : null,
    });
  } catch (error) {
    logger.error('[Finance diagnostic] Failed', { error });
    return NextResponse.json(
      { error: 'Diagnostic failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
