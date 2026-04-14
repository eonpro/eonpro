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
import { getStripeForClinic } from '@/lib/stripe/connect';
import { StripeCustomerService } from '@/services/stripe/customerService';

/**
 * POST /api/patient-portal/billing/portal
 * Create a Stripe Customer Portal session
 */
export const POST = withAuth(
  async (req: NextRequest, user: AuthUser) => {
    try {
      if (!user.patientId) {
        return NextResponse.json(
          { error: 'Patient ID required', code: 'PATIENT_ID_REQUIRED' },
          { status: 400 }
        );
      }

      const patient = await prisma.patient.findUnique({
        where: { id: user.patientId },
        select: { stripeCustomerId: true, clinicId: true },
      });

      if (!patient?.stripeCustomerId) {
        return NextResponse.json(
          { error: 'No billing account found', code: 'NO_BILLING_ACCOUNT' },
          { status: 400 }
        );
      }

      const stripeContext = await getStripeForClinic(patient.clinicId);
      const stripe = stripeContext.stripe;
      const connectOpts = stripeContext.stripeAccountId
        ? { stripeAccount: stripeContext.stripeAccountId }
        : undefined;

      const resolvedCustomer = await StripeCustomerService.getOrCreateCustomerForContext(
        user.patientId,
        stripe,
        connectOpts
      );

      let session: Stripe.BillingPortal.Session;
      try {
        session = connectOpts
          ? await stripe.billingPortal.sessions.create(
              {
                customer: resolvedCustomer.id,
                return_url: `${process.env.NEXT_PUBLIC_APP_URL}/portal/billing`,
              },
              connectOpts
            )
          : await stripe.billingPortal.sessions.create({
              customer: resolvedCustomer.id,
              return_url: `${process.env.NEXT_PUBLIC_APP_URL}/portal/billing`,
            });
      } catch (stripeError) {
        const isStripeError =
          stripeError instanceof Stripe.errors.StripeError ||
          (stripeError instanceof Error && 'type' in stripeError);
        if (isStripeError && stripeError instanceof Error) {
          const stripeType = (stripeError as InstanceType<typeof Stripe.errors.StripeError>).type;
          if (stripeType === 'StripeInvalidRequestError') {
            return NextResponse.json(
              {
                error: 'Billing account is not properly configured. Please contact support.',
                code: 'STRIPE_CONFIG_ERROR',
              },
              { status: 400 }
            );
          }
        }
        throw stripeError;
      }

      await logPHIAccess(
        req,
        user,
        'BillingPortalSession',
        String(user.patientId),
        user.patientId,
        {
          stripeCustomerId: patient.stripeCustomerId,
        }
      );

      return NextResponse.json({ url: session.url });
    } catch (error) {
      return handleApiError(error, {
        context: { route: 'POST /api/patient-portal/billing/portal' },
      });
    }
  },
  { roles: ['patient'] }
);
