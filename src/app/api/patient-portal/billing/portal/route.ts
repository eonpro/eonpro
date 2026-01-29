/**
 * Stripe Customer Portal API
 * Creates a portal session for patients to manage their billing
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-11-17.clover',
});

/**
 * POST /api/patient-portal/billing/portal
 * Create a Stripe Customer Portal session
 */
export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    if (!user.patientId) {
      return NextResponse.json({ error: 'Patient ID required' }, { status: 400 });
    }

    // Get patient's Stripe customer ID
    const patient = await prisma.patient.findUnique({
      where: { id: user.patientId },
      select: { stripeCustomerId: true },
    });

    if (!patient?.stripeCustomerId) {
      return NextResponse.json({ error: 'No billing account found' }, { status: 400 });
    }

    // Create portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: patient.stripeCustomerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/patient-portal/billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    logger.error('Failed to create portal session:', error);
    return NextResponse.json({ error: 'Failed to create portal session' }, { status: 500 });
  }
});
