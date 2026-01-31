/**
 * STRIPE CONNECT WEBHOOK HANDLER
 * 
 * Handles Stripe Connect webhook events for automatic account status sync.
 * Events handled:
 * - account.updated - When a connected account's status changes
 * - account.application.deauthorized - When a user disconnects their account
 * 
 * Webhook URL: https://yourdomain.com/api/webhooks/stripe-connect
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';

// Initialize Stripe with Platform Secret Key (EonMeds account)
const stripe = new Stripe(process.env.STRIPE_PLATFORM_SECRET_KEY || process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2026-01-28.clover',
});

// Webhook secret for Connect events (separate from regular platform webhook secret)
const CONNECT_WEBHOOK_SECRET = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

/**
 * POST /api/webhooks/stripe-connect
 * Handle Stripe Connect webhook events
 */
export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature');
  
  if (!signature) {
    logger.warn('[STRIPE CONNECT WEBHOOK] Missing signature');
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }
  
  if (!CONNECT_WEBHOOK_SECRET) {
    logger.error('[STRIPE CONNECT WEBHOOK] Webhook secret not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }
  
  let event: Stripe.Event;
  
  try {
    const body = await request.text();
    event = stripe.webhooks.constructEvent(body, signature, CONNECT_WEBHOOK_SECRET);
  } catch (err: any) {
    logger.error('[STRIPE CONNECT WEBHOOK] Signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }
  
  logger.info('[STRIPE CONNECT WEBHOOK] Received event', {
    type: event.type,
    id: event.id,
  });
  
  try {
    switch (event.type) {
      case 'account.updated':
        await handleAccountUpdated(event.data.object as Stripe.Account);
        break;

      case 'account.application.deauthorized':
        // For deauthorized events, the account ID is in event.account
        if (event.account) {
          await handleAccountDeauthorized(event.account);
        }
        break;

      case 'capability.updated':
        // Capability changes (e.g., card_payments enabled)
        await handleCapabilityUpdated(event);
        break;

      default:
        logger.info(`[STRIPE CONNECT WEBHOOK] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    logger.error('[STRIPE CONNECT WEBHOOK] Error processing event:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

/**
 * Handle account.updated event
 * Syncs account status to our database
 */
async function handleAccountUpdated(account: Stripe.Account) {
  logger.info('[STRIPE CONNECT WEBHOOK] Account updated', {
    accountId: account.id,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
  });
  
  // Find clinic with this account
  const clinic = await prisma.clinic.findFirst({
    where: { stripeAccountId: account.id },
    select: { id: true, name: true },
  });
  
  if (!clinic) {
    logger.warn('[STRIPE CONNECT WEBHOOK] No clinic found for account', {
      accountId: account.id,
    });
    return;
  }
  
  // Determine status
  const onboardingComplete = account.charges_enabled && account.details_submitted;
  let status = 'pending';
  if (onboardingComplete) {
    status = 'active';
  } else if (account.requirements?.disabled_reason) {
    status = 'restricted';
  }
  
  // Update clinic
  await prisma.clinic.update({
    where: { id: clinic.id },
    data: {
      stripeChargesEnabled: account.charges_enabled,
      stripePayoutsEnabled: account.payouts_enabled,
      stripeDetailsSubmitted: account.details_submitted,
      stripeOnboardingComplete: onboardingComplete,
      stripeAccountStatus: status,
    },
  });
  
  logger.info('[STRIPE CONNECT WEBHOOK] Updated clinic Stripe status', {
    clinicId: clinic.id,
    clinicName: clinic.name,
    status,
    onboardingComplete,
  });
}

/**
 * Handle account.application.deauthorized event
 * When user disconnects their Stripe account from our platform
 */
async function handleAccountDeauthorized(accountId: string) {
  logger.info('[STRIPE CONNECT WEBHOOK] Account deauthorized', {
    accountId,
  });

  // Find clinic with this account
  const clinic = await prisma.clinic.findFirst({
    where: { stripeAccountId: accountId },
    select: { id: true, name: true },
  });

  if (!clinic) {
    logger.warn('[STRIPE CONNECT WEBHOOK] No clinic found for deauthorized account', {
      accountId,
    });
    return;
  }
  
  // Clear Stripe connection
  await prisma.clinic.update({
    where: { id: clinic.id },
    data: {
      stripeAccountId: null,
      stripeAccountStatus: null,
      stripeChargesEnabled: false,
      stripePayoutsEnabled: false,
      stripeDetailsSubmitted: false,
      stripeOnboardingComplete: false,
      stripeConnectedAt: null,
    },
  });
  
  logger.info('[STRIPE CONNECT WEBHOOK] Cleared clinic Stripe connection', {
    clinicId: clinic.id,
    clinicName: clinic.name,
  });
}

/**
 * Handle capability.updated event
 * When a capability (like card_payments) status changes
 */
async function handleCapabilityUpdated(event: Stripe.Event) {
  const capability = event.data.object as Stripe.Capability;
  
  logger.info('[STRIPE CONNECT WEBHOOK] Capability updated', {
    accountId: capability.account,
    capability: capability.id,
    status: capability.status,
  });
  
  // Get the account to sync full status
  if (typeof capability.account === 'string') {
    try {
      const account = await stripe.accounts.retrieve(capability.account);
      await handleAccountUpdated(account);
    } catch (err) {
      logger.error('[STRIPE CONNECT WEBHOOK] Failed to retrieve account for capability update', {
        accountId: capability.account,
      });
    }
  }
}

/**
 * GET /api/webhooks/stripe-connect
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    webhook: 'stripe-connect',
    configured: !!CONNECT_WEBHOOK_SECRET,
  });
}
