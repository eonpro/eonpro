/**
 * Stripe Customer Portal API
 * Creates a portal session for patients to manage their billing
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2026-01-28.clover',
});

/**
 * POST /api/patient-portal/billing/portal
 * Create a Stripe Customer Portal session
 */
export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    if (!user.patientId) {
      return NextResponse.json(
        { error: 'Patient ID required', code: 'PATIENT_ID_REQUIRED' },
        { status: 400 }
      );
    }

    // Get patient's Stripe customer ID
    const patient = await prisma.patient.findUnique({
      where: { id: user.patientId },
      select: { stripeCustomerId: true },
    });

    if (!patient?.stripeCustomerId) {
      return NextResponse.json(
        { error: 'No billing account found', code: 'NO_BILLING_ACCOUNT' },
        { status: 400 }
      );
    }

    // Create portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: patient.stripeCustomerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/portal/billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    const errorId = crypto.randomUUID().slice(0, 8);
    logger.error(`[BILLING_PORTAL_POST] Error ${errorId}:`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      ...(process.env.NODE_ENV === 'development' && { stack: error instanceof Error ? error.stack : undefined }),
      patientId: user.patientId,
    });
    return NextResponse.json(
      { error: 'Failed to create portal session', errorId, code: 'PORTAL_SESSION_ERROR' },
      { status: 500 }
    );
  }
});
