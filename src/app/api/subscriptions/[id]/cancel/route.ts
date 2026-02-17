/**
 * Subscription Cancellation Route
 *
 * POST /api/subscriptions/[id]/cancel
 *
 * SECURITY: Requires authentication
 * ENTERPRISE: Syncs cancellation with Stripe before updating DB
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { SubscriptionStatus, Prisma } from '@prisma/client';
import { logger } from '@/lib/logger';
import { withAuthParams } from '@/lib/auth/middleware-with-params';
import { verifyClinicAccess } from '@/lib/auth/clinic-access';
import { getStripeClient } from '@/lib/stripe/config';

type TransactionClient = Prisma.TransactionClient;

async function cancelSubscriptionHandler(
  request: NextRequest,
  user: any,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await context.params;
    const subscriptionId = parseInt(resolvedParams.id);

    if (isNaN(subscriptionId)) {
      return NextResponse.json({ error: 'Invalid subscription ID' }, { status: 400 });
    }

    // Fetch subscription with patient info
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { patient: true },
    });

    if (!subscription) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    // SECURITY: Verify clinic access
    if (subscription.clinicId && !verifyClinicAccess(user, subscription.clinicId)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (subscription.status === SubscriptionStatus.CANCELED) {
      return NextResponse.json({ error: 'Subscription is already canceled' }, { status: 400 });
    }

    // ENTERPRISE: Cancel in Stripe FIRST if subscription has Stripe ID
    if (subscription.stripeSubscriptionId) {
      try {
        const stripe = getStripeClient();
        if (stripe) {
          logger.info('[SUBSCRIPTIONS] Canceling Stripe subscription', {
            subscriptionId,
            stripeSubscriptionId: subscription.stripeSubscriptionId,
          });

          await stripe.subscriptions.cancel(subscription.stripeSubscriptionId, {
            prorate: true,
          });

          logger.info('[SUBSCRIPTIONS] Stripe subscription canceled successfully', {
            subscriptionId,
            stripeSubscriptionId: subscription.stripeSubscriptionId,
          });
        } else {
          logger.warn(
            '[SUBSCRIPTIONS] No Stripe client available, proceeding with DB-only cancellation',
            {
              subscriptionId,
              clinicId: subscription.clinicId,
            }
          );
        }
      } catch (stripeError: unknown) {
        const errorMessage =
          stripeError instanceof Error ? stripeError.message : 'Unknown Stripe error';
        logger.error('[SUBSCRIPTIONS] Failed to cancel Stripe subscription', {
          subscriptionId,
          stripeSubscriptionId: subscription.stripeSubscriptionId,
          error: errorMessage,
        });

        // Check if it's a "subscription already canceled" error
        if (
          errorMessage.includes('already canceled') ||
          errorMessage.includes('No such subscription')
        ) {
          logger.info(
            '[SUBSCRIPTIONS] Stripe subscription already canceled, proceeding with DB update',
            {
              subscriptionId,
            }
          );
        } else {
          // Return error for other Stripe failures
          return NextResponse.json(
            {
              error: 'Failed to cancel subscription in payment provider',
              detail: errorMessage,
            },
            { status: 502 }
          );
        }
      }
    }

    // ENTERPRISE: Update DB in transaction AFTER Stripe confirms
    const updatedSubscription = await prisma.$transaction(async (tx: TransactionClient) => {
      // Update subscription
      const updated = await tx.subscription.update({
        where: { id: subscriptionId },
        data: {
          status: SubscriptionStatus.CANCELED,
          canceledAt: new Date(),
          endedAt: new Date(),
          nextBillingDate: null,
        },
      });

      // Update patient tags
      if (subscription.patient) {
        const currentTags = (subscription.patient.tags as string[]) || [];
        const updatedTags = currentTags
          .filter((tag: string) => tag !== 'active-subscription' && tag !== 'paused-subscription')
          .concat('canceled-subscription');

        await tx.patient.update({
          where: { id: subscription.patientId },
          data: { tags: updatedTags },
        });
      }

      // Create subscription action for audit trail
      await tx.subscriptionAction.create({
        data: {
          subscriptionId,
          actionType: 'CANCELLED',
          reason: `Cancelled via API by user ${user.id}`,
        },
      });

      return updated;
    }, { timeout: 15000 });

    logger.info('[SUBSCRIPTIONS] Subscription canceled successfully', {
      subscriptionId,
      userId: user.id,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
    });

    return NextResponse.json({
      success: true,
      subscription: updatedSubscription,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[SUBSCRIPTIONS] Error canceling subscription:', {
      error: errorMessage,
      ...(process.env.NODE_ENV === 'development' && { stack: error instanceof Error ? error.stack : undefined }),
    });
    return NextResponse.json(
      { error: 'Failed to cancel subscription', detail: errorMessage },
      { status: 500 }
    );
  }
}

// Export with authentication - requires authenticated user
export const POST = withAuthParams(cancelSubscriptionHandler, {
  roles: ['super_admin', 'admin', 'provider', 'patient'],
});
