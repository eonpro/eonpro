/**
 * STRIPE CONNECT OAUTH
 *
 * OAuth-based Stripe Connect flow that lets users log into their existing Stripe account.
 * Much simpler than creating a new account - just "Connect with Stripe".
 *
 * Flow:
 * 1. GET /api/stripe/connect/oauth - Get OAuth authorize URL
 * 2. User logs into Stripe and authorizes
 * 3. Stripe redirects to callback with authorization code
 * 4. POST /api/stripe/connect/oauth - Exchange code for account
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

// Stripe Connect Platform Account (SEPARATE from EonMeds)
// This is the EONpro platform's Stripe account used for Connect functionality
const stripe = new Stripe(process.env.STRIPE_CONNECT_PLATFORM_SECRET_KEY || '', {
  apiVersion: '2026-01-28.clover',
});

// Stripe Connect Client ID (from EONpro Platform's Stripe Dashboard → Connect → Settings)
const STRIPE_CONNECT_CLIENT_ID = process.env.STRIPE_CONNECT_CLIENT_ID;

/**
 * GET /api/stripe/connect/oauth
 * Generate OAuth authorization URL for connecting existing Stripe account
 */
async function getOAuthHandler(request: NextRequest, user: AuthUser) {
  try {
    // Only admins can connect Stripe
    if (!['admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    if (!STRIPE_CONNECT_CLIENT_ID) {
      return NextResponse.json(
        { error: 'Stripe Connect OAuth not configured. Set STRIPE_CONNECT_CLIENT_ID.' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinicId');

    if (!clinicId) {
      return NextResponse.json({ error: 'clinicId is required' }, { status: 400 });
    }

    const clinicIdNum = parseInt(clinicId);

    // Verify user has access to this clinic
    if (user.role === 'admin' && user.clinicId !== clinicIdNum) {
      return NextResponse.json(
        { error: 'Cannot connect Stripe for another clinic' },
        { status: 403 }
      );
    }

    // Check if clinic already has a Stripe account
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicIdNum },
      select: { id: true, name: true, stripeAccountId: true, adminEmail: true },
    });

    if (!clinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    if (clinic.stripeAccountId) {
      return NextResponse.json(
        { error: 'Clinic already has a connected Stripe account' },
        { status: 409 }
      );
    }

    // Build OAuth URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    const redirectUri = `${baseUrl}/api/stripe/connect/oauth/callback`;

    // State parameter for security (includes clinic ID and user ID)
    const state = Buffer.from(
      JSON.stringify({
        clinicId: clinicIdNum,
        userId: user.id,
        timestamp: Date.now(),
      })
    ).toString('base64');

    // Stripe OAuth authorize URL
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: STRIPE_CONNECT_CLIENT_ID,
      scope: 'read_write',
      redirect_uri: redirectUri,
      state: state,
    });
    
    // Add stripe_user with bracket notation (Stripe expects stripe_user[email], not JSON)
    if (clinic.adminEmail) {
      params.append('stripe_user[email]', clinic.adminEmail);
    }

    const authorizeUrl = `https://connect.stripe.com/oauth/authorize?${params.toString()}`;

    logger.info('[STRIPE OAUTH] Generated authorize URL', {
      clinicId: clinicIdNum,
      userId: user.id,
    });

    return NextResponse.json({
      authorizeUrl,
      message: 'Redirect user to authorizeUrl to connect their Stripe account',
    });
  } catch (error: any) {
    logger.error('[STRIPE OAUTH] GET Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate OAuth URL' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/stripe/connect/oauth
 * Exchange OAuth authorization code for connected account
 */
async function postOAuthHandler(request: NextRequest, user: AuthUser) {
  try {
    if (!['admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { code, state } = body;

    if (!code) {
      return NextResponse.json({ error: 'Authorization code is required' }, { status: 400 });
    }

    if (!state) {
      return NextResponse.json({ error: 'State parameter is required' }, { status: 400 });
    }

    // Decode and verify state
    let stateData: { clinicId: number; userId: number; timestamp: number };
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch {
      return NextResponse.json({ error: 'Invalid state parameter' }, { status: 400 });
    }

    // Verify state is not too old (15 minutes max)
    if (Date.now() - stateData.timestamp > 15 * 60 * 1000) {
      return NextResponse.json({ error: 'Authorization expired. Please try again.' }, { status: 400 });
    }

    // Verify user matches
    if (stateData.userId !== user.id) {
      return NextResponse.json({ error: 'User mismatch' }, { status: 403 });
    }

    // Verify user has access to clinic
    if (user.role === 'admin' && user.clinicId !== stateData.clinicId) {
      return NextResponse.json({ error: 'Cannot connect Stripe for another clinic' }, { status: 403 });
    }

    // Exchange code for access token and account ID
    const response = await stripe.oauth.token({
      grant_type: 'authorization_code',
      code: code,
    });

    if (!response.stripe_user_id) {
      throw new Error('No Stripe account ID returned');
    }

    // Get account details
    const account = await stripe.accounts.retrieve(response.stripe_user_id);

    // Update clinic with connected account
    await prisma.clinic.update({
      where: { id: stateData.clinicId },
      data: {
        stripeAccountId: response.stripe_user_id,
        stripeAccountStatus: account.charges_enabled ? 'active' : 'pending',
        stripeChargesEnabled: account.charges_enabled,
        stripePayoutsEnabled: account.payouts_enabled,
        stripeDetailsSubmitted: account.details_submitted,
        stripeOnboardingComplete: account.charges_enabled && account.details_submitted,
        stripeConnectedAt: new Date(),
      },
    });

    logger.info('[STRIPE OAUTH] Connected account via OAuth', {
      clinicId: stateData.clinicId,
      accountId: response.stripe_user_id,
      chargesEnabled: account.charges_enabled,
    });

    return NextResponse.json({
      success: true,
      accountId: response.stripe_user_id,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      message: 'Stripe account connected successfully!',
    });
  } catch (error: any) {
    logger.error('[STRIPE OAUTH] POST Error:', error);

    // Handle specific Stripe OAuth errors
    if (error.type === 'StripeInvalidGrantError') {
      return NextResponse.json(
        { error: 'Invalid or expired authorization code. Please try again.' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to connect Stripe account' },
      { status: 500 }
    );
  }
}

export const GET = withAuth(getOAuthHandler);
export const POST = withAuth(postOAuthHandler);
