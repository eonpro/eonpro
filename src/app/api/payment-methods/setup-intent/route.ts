import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getStripeForClinic, getPublishableKeyForContext } from '@/lib/stripe/connect';
import { StripeCustomerService } from '@/services/stripe/customerService';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

const schema = z.object({
  patientId: z.number(),
});

/**
 * POST /api/payment-methods/setup-intent
 * Creates a Stripe SetupIntent so the client can securely collect card details
 * via Stripe Elements. No raw card data ever reaches our server (PCI DSS SAQ A).
 */
async function handler(req: NextRequest, user: AuthUser) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const { patientId } = parsed.data;

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, stripeCustomerId: true, clinicId: true },
    });

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    const stripeContext = await getStripeForClinic(patient.clinicId);
    const stripe = stripeContext.stripe;
    const connectOpts = stripeContext.stripeAccountId
      ? { stripeAccount: stripeContext.stripeAccountId }
      : undefined;

    const customer = await StripeCustomerService.getOrCreateCustomerForContext(
      patient.id,
      stripe,
      connectOpts,
    );
    const stripeCustomerId = customer.id;

    const setupIntent = connectOpts
      ? await stripe.setupIntents.create(
          { customer: stripeCustomerId, usage: 'off_session' },
          connectOpts
        )
      : await stripe.setupIntents.create({
          customer: stripeCustomerId,
          usage: 'off_session',
        });

    const clinic = await prisma.clinic.findUnique({
      where: { id: patient.clinicId },
      select: { subdomain: true },
    });

    logger.info('[SetupIntent] Created for patient', { patientId, setupIntentId: setupIntent.id });

    return NextResponse.json({
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
      stripePublishableKey: getPublishableKeyForContext(stripeContext, clinic?.subdomain),
      stripeConnectedAccountId: stripeContext.stripeAccountId || null,
    });
  } catch (error) {
    logger.error('[SetupIntent] Error:', error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json({ error: 'Failed to create setup intent' }, { status: 500 });
  }
}

export const POST = withAuth(handler);
