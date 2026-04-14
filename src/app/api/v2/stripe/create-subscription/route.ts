import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getStripeForClinic } from '@/lib/stripe/connect';
import { prisma } from '@/lib/db';
import { isFeatureEnabled } from '@/lib/features';
import { logger } from '@/lib/logger';
import { verifyAuth } from '@/lib/auth/middleware';
import { StripeCustomerService } from '@/services/stripe/customerService';

const createSubscriptionSchema = z.object({
  priceId: z.string().min(1, 'Price ID is required'),
  customerId: z.string().optional(),
  patientId: z.number().int().positive().optional(),
});

export async function POST(req: NextRequest) {
  try {
    // Require authentication
    const authResult = await verifyAuth(req);
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const user = authResult.user;

    if (!isFeatureEnabled('STRIPE_SUBSCRIPTIONS')) {
      return NextResponse.json({ error: 'Subscriptions are not enabled' }, { status: 403 });
    }

    const body = await req.json();
    const parseResult = createSubscriptionSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }
    const { priceId, customerId, patientId } = parseResult.data;

    let clinicId: number;

    if (patientId !== undefined) {
      const patient = await prisma.patient.findUnique({
        where: { id: patientId },
        select: { id: true, clinicId: true },
      });

      if (!patient) {
        return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
      }

      // Authorization: patient can only create subscription for self; admin/provider for same clinic
      if (user.role === 'patient') {
        if (user.patientId !== patientId) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }
      } else if (user.role !== 'super_admin') {
        if (user.clinicId == null || patient.clinicId !== user.clinicId) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }
      }

      clinicId = patient.clinicId;
    } else if (user.role === 'patient') {
      if (user.patientId == null) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
      const selfPatient = await prisma.patient.findUnique({
        where: { id: user.patientId },
        select: { clinicId: true },
      });
      if (!selfPatient) {
        return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
      }
      clinicId = selfPatient.clinicId;
    } else if (user.role === 'super_admin') {
      return NextResponse.json(
        { error: 'patientId is required to determine which Stripe account to use' },
        { status: 400 }
      );
    } else {
      if (user.clinicId == null) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
      clinicId = user.clinicId;
    }

    const stripeContext = await getStripeForClinic(clinicId);
    const stripe = stripeContext.stripe;
    const connectOpts = stripeContext.stripeAccountId
      ? { stripeAccount: stripeContext.stripeAccountId }
      : undefined;

    let stripeCustomerId = customerId;

    // If no Stripe customer ID, create a new customer from patient (requires patientId and authz)
    if (!stripeCustomerId) {
      if (patientId === undefined) {
        return NextResponse.json(
          { error: 'Either customerId or patientId is required' },
          { status: 400 }
        );
      }

      const customer = await StripeCustomerService.getOrCreateCustomerForContext(
        patientId,
        stripe,
        connectOpts
      );
      stripeCustomerId = customer.id;
    }

    const subscriptionCreateParams = {
      customer: stripeCustomerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete' as const,
      expand: ['latest_invoice.payment_intent', 'pending_setup_intent'],
    };

    const subscription = connectOpts
      ? await stripe.subscriptions.create(subscriptionCreateParams, connectOpts)
      : await stripe.subscriptions.create(subscriptionCreateParams);

    // Get the client secret for payment
    let clientSecret = '';

    if (subscription.pending_setup_intent) {
      // For trials or free plans
      const setupIntent = subscription.pending_setup_intent as any;
      clientSecret = setupIntent.client_secret;
    } else if (subscription.latest_invoice) {
      // For paid subscriptions
      const invoice = subscription.latest_invoice as any;
      if (invoice.payment_intent) {
        clientSecret = invoice.payment_intent.client_secret;
      }
    }

    // Store subscription info in database (optional)
    // await prisma.subscription.create({
    //   data: {
    //     stripeSubscriptionId: subscription.id,
    //     stripeCustomerId: stripeCustomerId,
    //     patientId: patientId,
    //     status: subscription.status,
    //     priceId: priceId,
    //     currentPeriodStart: new Date(subscription.current_period_start * 1000),
    //     currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    //   },
    // });

    return NextResponse.json({
      subscriptionId: subscription.id,
      clientSecret: clientSecret,
      status: subscription.status,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[STRIPE_CREATE_SUBSCRIPTION]', error);
    return NextResponse.json(
      { error: errorMessage || 'Failed to create subscription' },
      { status: 500 }
    );
  }
}
