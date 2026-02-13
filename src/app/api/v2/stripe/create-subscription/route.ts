import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getStripe } from '@/lib/stripe';
import { prisma } from '@/lib/db';
import { isFeatureEnabled } from '@/lib/features';
import { logger } from '@/lib/logger';
import { verifyAuth } from '@/lib/auth/middleware';

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

    let stripeCustomerId = customerId;

    // If no Stripe customer ID, create a new customer from patient (requires patientId and authz)
    if (!stripeCustomerId && patientId !== undefined) {
      const patient = await prisma.patient.findUnique({
        where: { id: patientId },
        select: { id: true, clinicId: true, email: true, firstName: true, lastName: true },
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

      const stripe = getStripe();
      const customer = await stripe.customers.create({
        email: patient.email ?? undefined,
        name: [patient.firstName, patient.lastName].filter(Boolean).join(' ') || undefined,
        metadata: {
          patientId: patient.id.toString(),
        },
      });

      stripeCustomerId = customer.id;
    } else if (!stripeCustomerId) {
      return NextResponse.json(
        { error: 'Either customerId or patientId is required' },
        { status: 400 }
      );
    }

    const stripe = getStripe();

    // Create the subscription
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent', 'pending_setup_intent'],
    });

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
  } catch (error: any) {
    // @ts-ignore

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[STRIPE_CREATE_SUBSCRIPTION]', error);
    return NextResponse.json(
      { error: errorMessage || 'Failed to create subscription' },
      { status: 500 }
    );
  }
}
