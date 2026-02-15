/**
 * Stripe Customer Portal API
 * Creates a portal session for patients to manage their billing
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { handleApiError } from '@/domains/shared/errors';
import { prisma } from '@/lib/db';
import { logPHIAccess } from '@/lib/audit/hipaa-audit';
import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY environment variable is not configured');
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
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

    await logPHIAccess(req, user, 'BillingPortalSession', String(user.patientId), user.patientId, {
      stripeCustomerId: patient.stripeCustomerId,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return handleApiError(error, { context: { route: 'POST /api/patient-portal/billing/portal' } });
  }
}, { roles: ['patient'] });
