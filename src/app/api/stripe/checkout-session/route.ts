import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { getStripeForClinic, stripeRequestOptions } from '@/lib/stripe/connect';
import { prisma } from '@/lib/db';
import { isFeatureEnabled } from '@/lib/features';
import { logger } from '@/lib/logger';
import { StripeCustomerService } from '@/services/stripe/customerService';
import { handleApiError } from '@/domains/shared/errors';

const checkoutSessionSchema = z.object({
  priceId: z.string().min(1, 'Price ID is required'),
  patientId: z.number().int().positive().optional(),
  successUrl: z.string().optional(),
  cancelUrl: z.string().optional(),
});

function resolveOptionalRedirectUrl(
  url: string | undefined,
  label: 'successUrl' | 'cancelUrl',
): string | undefined {
  if (!url?.trim()) return undefined;
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base) {
    logger.warn('[STRIPE_CHECKOUT_SESSION] NEXT_PUBLIC_APP_URL not set; skipping redirect validation', {
      label,
    });
    return url.trim();
  }
  try {
    const resolved = new URL(url.trim(), base);
    const allowedOrigin = new URL(base).origin;
    if (resolved.origin !== allowedOrigin) {
      throw new Error(`${label} must use the same origin as the application`);
    }
    return resolved.href;
  } catch (e) {
    throw new Error(
      e instanceof Error ? e.message : `Invalid ${label}`,
    );
  }
}

/**
 * Resolves clinic for Stripe context and the patient used for Stripe Customer creation.
 * Mirrors authorization rules from POST /api/v2/stripe/create-subscription.
 */
async function resolveClinicAndPatient(
  user: AuthUser,
  patientIdFromBody?: number,
): Promise<{ clinicId: number; effectivePatientId: number } | NextResponse> {
  if (patientIdFromBody !== undefined) {
    const patient = await prisma.patient.findUnique({
      where: { id: patientIdFromBody },
      select: { id: true, clinicId: true },
    });

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    if (user.role === 'patient') {
      if (user.patientId !== patientIdFromBody) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    } else if (user.role !== 'super_admin') {
      if (user.clinicId == null || patient.clinicId !== user.clinicId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    return { clinicId: patient.clinicId, effectivePatientId: patient.id };
  }

  if (user.role === 'patient') {
    if (user.patientId == null) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    const selfPatient = await prisma.patient.findUnique({
      where: { id: user.patientId },
      select: { id: true, clinicId: true },
    });
    if (!selfPatient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }
    return { clinicId: selfPatient.clinicId, effectivePatientId: selfPatient.id };
  }

  if (user.role === 'super_admin') {
    return NextResponse.json(
      { error: 'patientId is required to determine which Stripe account to use' },
      { status: 400 },
    );
  }

  if (user.clinicId == null) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  return NextResponse.json(
    { error: 'patientId is required to create a subscription checkout for this account' },
    { status: 400 },
  );
}

async function postCheckoutSession(req: NextRequest, user: AuthUser) {
  try {
    if (!isFeatureEnabled('STRIPE_SUBSCRIPTIONS')) {
      return NextResponse.json({ error: 'Subscriptions are not enabled' }, { status: 403 });
    }

    const body = await req.json();
    const parseResult = checkoutSessionSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parseResult.error.flatten() },
        { status: 400 },
      );
    }

    const { priceId, patientId: patientIdFromBody, successUrl: rawSuccess, cancelUrl: rawCancel } =
      parseResult.data;

    const appBase = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
    if (!rawSuccess?.trim() && !appBase) {
      return NextResponse.json(
        { error: 'NEXT_PUBLIC_APP_URL is required when successUrl is omitted' },
        { status: 503 },
      );
    }
    if (!rawCancel?.trim() && !appBase) {
      return NextResponse.json(
        { error: 'NEXT_PUBLIC_APP_URL is required when cancelUrl is omitted' },
        { status: 503 },
      );
    }

    let successUrl: string;
    let cancelUrl: string;
    try {
      successUrl =
        resolveOptionalRedirectUrl(rawSuccess, 'successUrl') ||
        `${appBase}/billing?session_id={CHECKOUT_SESSION_ID}`;
      cancelUrl =
        resolveOptionalRedirectUrl(rawCancel, 'cancelUrl') || `${appBase}/billing`;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Invalid redirect URL';
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const resolved = await resolveClinicAndPatient(user, patientIdFromBody);
    if (resolved instanceof NextResponse) {
      return resolved;
    }

    const { clinicId, effectivePatientId } = resolved;

    const stripeContext = await getStripeForClinic(clinicId);
    const stripe = stripeContext.stripe;
    const connectOpts = stripeRequestOptions(stripeContext);

    const customer = await StripeCustomerService.getOrCreateCustomerForContext(
      effectivePatientId,
      stripe,
      connectOpts,
    );
    const stripeCustomerId = customer.id;

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        customer: stripeCustomerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          patientId: effectivePatientId.toString(),
          clinicId: clinicId.toString(),
        },
      },
      connectOpts,
    );

    if (!session.url) {
      logger.error('[STRIPE_CHECKOUT_SESSION] Session created without redirect URL', {
        sessionId: session.id,
        clinicId,
      });
      return NextResponse.json(
        { error: 'Checkout session did not return a URL' },
        { status: 502 },
      );
    }

    logger.info('[STRIPE_CHECKOUT_SESSION] Created subscription checkout session', {
      sessionId: session.id,
      clinicId,
      patientId: effectivePatientId,
    });

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error: unknown) {
    return handleApiError(error, { context: { route: 'POST /api/stripe/checkout-session' } });
  }
}

export const POST = withAuth(postCheckoutSession);
