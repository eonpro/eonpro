/**
 * Stripe Status API
 *
 * GET /api/stripe/status
 * Returns the Stripe connection status for the current clinic
 *
 * Supports:
 * - Dedicated accounts (like OT, EonMeds)
 * - Stripe Connect accounts
 * - Platform account fallback
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { getStripeForClinic, hasDedicatedAccount } from '@/lib/stripe/connect';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

async function getStripeStatusHandler(request: NextRequest, user: AuthUser) {
  try {
    // Get clinic ID from user
    const clinicId = user.clinicId;

    if (!clinicId) {
      // Super admin without clinic context - return platform info
      return NextResponse.json({
        connected: true,
        accountType: 'platform',
        accountId: 'platform',
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
        message: 'Using platform Stripe account',
      });
    }

    // Get clinic info
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: {
        id: true,
        name: true,
        subdomain: true,
        stripeAccountId: true,
        stripeAccountStatus: true,
      },
    });

    if (!clinic) {
      return NextResponse.json({
        connected: false,
        accountId: null,
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        error: 'Clinic not found',
      });
    }

    // Check for dedicated account (OT, EonMeds, etc.)
    if (clinic.subdomain && hasDedicatedAccount(clinic.subdomain)) {
      // Get the Stripe context to verify the account is configured
      try {
        const stripeContext = await getStripeForClinic(clinicId);

        if (stripeContext.isDedicatedAccount) {
          // Verify the Stripe account is working by fetching account info
          const stripe = stripeContext.stripe;
          const account = await stripe.accounts.retrieve();

          return NextResponse.json({
            connected: true,
            accountType: 'dedicated',
            accountId: account.id,
            chargesEnabled: account.charges_enabled ?? true,
            payoutsEnabled: account.payouts_enabled ?? true,
            detailsSubmitted: account.details_submitted ?? true,
            businessName: account.business_profile?.name || clinic.name,
            subdomain: clinic.subdomain,
            message: `Using dedicated Stripe account for ${clinic.subdomain}`,
          });
        }
      } catch (stripeError) {
        logger.warn('[STRIPE STATUS] Dedicated account error', {
          clinicId,
          subdomain: clinic.subdomain,
          error: stripeError instanceof Error ? stripeError.message : 'Unknown error',
        });

        // Dedicated account is configured but may have issues
        return NextResponse.json({
          connected: true,
          accountType: 'dedicated',
          accountId: `dedicated_${clinic.subdomain}`,
          chargesEnabled: true,
          payoutsEnabled: true,
          detailsSubmitted: true,
          subdomain: clinic.subdomain,
          message: `Dedicated Stripe account configured for ${clinic.subdomain}`,
          warning: 'Could not verify account details',
        });
      }
    }

    // Check for Stripe Connect account
    if (clinic.stripeAccountId) {
      try {
        const stripeContext = await getStripeForClinic(clinicId);
        const stripe = stripeContext.stripe;

        // Retrieve Connect account details
        const account = await stripe.accounts.retrieve(clinic.stripeAccountId);

        return NextResponse.json({
          connected: true,
          accountType: 'connect',
          accountId: clinic.stripeAccountId,
          chargesEnabled: account.charges_enabled ?? false,
          payoutsEnabled: account.payouts_enabled ?? false,
          detailsSubmitted: account.details_submitted ?? false,
          businessName: account.business_profile?.name || clinic.name,
          requirements: account.requirements?.currently_due || [],
        });
      } catch (connectError) {
        logger.warn('[STRIPE STATUS] Connect account error', {
          clinicId,
          stripeAccountId: clinic.stripeAccountId,
          error: connectError instanceof Error ? connectError.message : 'Unknown error',
        });

        // Connect account exists but may be incomplete
        return NextResponse.json({
          connected: false,
          accountType: 'connect',
          accountId: clinic.stripeAccountId,
          chargesEnabled: false,
          payoutsEnabled: false,
          detailsSubmitted: false,
          error: 'Stripe Connect account requires setup',
        });
      }
    }

    // No Stripe account configured
    return NextResponse.json({
      connected: false,
      accountType: null,
      accountId: null,
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      message:
        'No Stripe account connected. Connect via Stripe Connect or contact support for dedicated account setup.',
    });
  } catch (error) {
    logger.error('[STRIPE STATUS] Error:', error);

    return NextResponse.json(
      {
        connected: false,
        accountId: null,
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        error: error instanceof Error ? error.message : 'Failed to check Stripe status',
      },
      { status: 500 }
    );
  }
}

export const GET = withAuth(getStripeStatusHandler, { roles: ['admin', 'super_admin'] });
