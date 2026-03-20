/**
 * Patient Portal – Stripe SetupIntent
 * Creates a SetupIntent so the patient can securely add a card via Stripe Elements.
 * No raw card data ever reaches our server (PCI DSS SAQ A).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/domains/shared/errors';
import { logger } from '@/lib/logger';
import { requireStripeClient } from '@/lib/stripe/config';

export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const stripe = requireStripeClient();

    if (!user.patientId) {
      return NextResponse.json(
        { error: 'Patient ID required', code: 'PATIENT_ID_REQUIRED' },
        { status: 400 }
      );
    }

    const patient = await prisma.patient.findUnique({
      where: { id: user.patientId },
      select: { id: true, stripeCustomerId: true, clinicId: true },
    });

    if (!patient) {
      return NextResponse.json(
        { error: 'Patient not found', code: 'PATIENT_NOT_FOUND' },
        { status: 404 }
      );
    }

    let stripeCustomerId = patient.stripeCustomerId;

    if (!stripeCustomerId) {
      const { StripeCustomerService } = await import('@/services/stripe/customerService');
      const customer = await StripeCustomerService.getOrCreateCustomer(patient.id);
      stripeCustomerId = customer.id;
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      usage: 'off_session',
    });

    logger.info('[Portal SetupIntent] Created', {
      patientId: user.patientId,
      setupIntentId: setupIntent.id,
    });

    return NextResponse.json({
      clientSecret: setupIntent.client_secret,
    });
  } catch (error) {
    return handleApiError(error, {
      route: 'POST /api/patient-portal/billing/setup-intent',
      context: { patientId: user?.patientId },
    });
  }
}, { roles: ['patient'] });
