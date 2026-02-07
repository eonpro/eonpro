/**
 * Finance: Sync subscriptions from Stripe
 *
 * POST /api/finance/sync-subscriptions
 * Lists subscriptions from the clinic's Stripe account and upserts them into
 * our DB so MRR/ARR/Active Subscriptions on the Finance Hub match Stripe.
 * Use after enabling subscription webhooks or to backfill existing subscriptions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getClinicContext } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { verifyClinicAccess } from '@/lib/auth/clinic-access';
import { getStripeForClinic, withConnectedAccount } from '@/lib/stripe/connect';
import { syncSubscriptionFromStripe, cancelSubscriptionFromStripe } from '@/services/stripe/subscriptionSyncService';
import type Stripe from 'stripe';

export async function POST(request: NextRequest) {
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

    let stripeContext: Awaited<ReturnType<typeof getStripeForClinic>>;
    try {
      stripeContext = await getStripeForClinic(clinicId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      logger.error('[SyncSubscriptions] getStripeForClinic failed', { clinicId, error: msg });
      return NextResponse.json(
        {
          error: 'Stripe is not configured for this clinic',
          details: msg.includes('not configured') || msg.includes('not found')
            ? msg
            : 'Set EONMEDS_STRIPE_SECRET_KEY for Eonmeds, or connect Stripe in clinic settings.',
        },
        { status: 400 }
      );
    }

    const { stripe } = stripeContext;
    if (!stripe) {
      return NextResponse.json(
        { error: 'This clinic does not have a Stripe account configured' },
        { status: 400 }
      );
    }

    const results = { synced: 0, skipped: 0, canceled: 0, errors: 0 };
    let startingAfter: string | undefined;

    do {
      const listParams = withConnectedAccount(stripeContext, {
        limit: 100,
        status: 'all',
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      } as Stripe.SubscriptionListParams);

      let subs: Stripe.ApiList<Stripe.Subscription>;
      try {
        subs = await stripe.subscriptions.list(listParams);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        const code = e && typeof e === 'object' && 'code' in e ? (e as { code: string }).code : undefined;
        logger.error('[SyncSubscriptions] Stripe subscriptions.list failed', { clinicId, error: msg, code });
        return NextResponse.json(
          {
            error: 'Failed to list subscriptions from Stripe',
            details: code === 'StripeAuthenticationError' ? 'Invalid or missing Stripe API key for this clinic.' : msg,
          },
          { status: 502 }
        );
      }

      for (const sub of subs.data) {
        try {
          if (sub.status === 'canceled' || sub.status === 'unpaid' || sub.status === 'incomplete_expired') {
            const r = await cancelSubscriptionFromStripe(sub.id, sub.canceled_at ? new Date(sub.canceled_at * 1000) : undefined);
            if (r.success && !r.skipped) results.canceled++;
            else if (r.skipped) results.skipped++;
          } else {
            const r = await syncSubscriptionFromStripe(sub);
            if (r.success && !r.skipped) results.synced++;
            else if (r.skipped) results.skipped++;
            else results.errors++;
          }
        } catch (e) {
          results.errors++;
          logger.warn('[SyncSubscriptions] Failed to sync one subscription', {
            stripeSubscriptionId: sub.id,
            error: e instanceof Error ? e.message : 'Unknown',
          });
        }
      }

      if (subs.data.length > 0) {
        startingAfter = subs.data[subs.data.length - 1].id;
      }
      if (!subs.has_more) break;
    } while (true);

    logger.info('[SyncSubscriptions] Completed', { clinicId, ...results });

    return NextResponse.json({
      success: true,
      message: `Synced ${results.synced} subscriptions, marked ${results.canceled} canceled, ${results.skipped} skipped (no patient link), ${results.errors} errors`,
      ...results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[SyncSubscriptions] Failed', { error: message });
    return NextResponse.json(
      { error: 'Failed to sync subscriptions', details: message },
      { status: 500 }
    );
  }
}
