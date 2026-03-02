import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getStripeForClinic } from '@/lib/stripe/connect';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

const schema = z.object({
  patientId: z.number(),
  setupIntentId: z.string(),
  stripePaymentMethodId: z.string(),
  setAsDefault: z.boolean().optional().default(false),
});

/**
 * POST /api/payment-methods/save-stripe
 * After Stripe.js confirms a SetupIntent, save the resulting PaymentMethod reference.
 * Only stores Stripe token + display info (last4, brand). No raw card data (PCI DSS).
 */
async function handler(req: NextRequest, user: AuthUser) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const { patientId, stripePaymentMethodId, setAsDefault } = parsed.data;

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, clinicId: true },
    });

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    const stripeContext = await getStripeForClinic(patient.clinicId);
    const stripe = stripeContext.stripe;

    const connectOpts = stripeContext.stripeAccountId
      ? { stripeAccount: stripeContext.stripeAccountId }
      : undefined;

    const pm = connectOpts
      ? await stripe.paymentMethods.retrieve(stripePaymentMethodId, connectOpts)
      : await stripe.paymentMethods.retrieve(stripePaymentMethodId);

    const existing = await prisma.paymentMethod.findFirst({
      where: { stripePaymentMethodId, patientId, isActive: true },
    });

    if (existing) {
      return NextResponse.json({
        success: true,
        data: {
          id: existing.id,
          last4: existing.cardLast4,
          brand: existing.cardBrand,
          isDefault: existing.isDefault,
        },
        message: 'Card already saved',
      });
    }

    if (setAsDefault) {
      await prisma.paymentMethod.updateMany({
        where: { patientId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const saved = await prisma.paymentMethod.create({
      data: {
        patientId,
        clinicId: patient.clinicId,
        stripePaymentMethodId,
        cardLast4: pm.card?.last4 || '????',
        cardBrand: pm.card?.brand
          ? pm.card.brand.charAt(0).toUpperCase() + pm.card.brand.slice(1)
          : 'Unknown',
        expiryMonth: pm.card?.exp_month || null,
        expiryYear: pm.card?.exp_year || null,
        cardholderName: pm.billing_details?.name || null,
        billingZip: pm.billing_details?.address?.postal_code || null,
        isDefault: setAsDefault || false,
        encryptionKeyId: 'stripe',
      },
    });

    logger.info('[SaveStripe] Payment method saved', {
      patientId,
      paymentMethodId: saved.id,
      stripePaymentMethodId,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: saved.id,
        last4: saved.cardLast4,
        brand: saved.cardBrand,
        expiryMonth: saved.expiryMonth,
        expiryYear: saved.expiryYear,
        isDefault: saved.isDefault,
      },
    });
  } catch (error) {
    logger.error('[SaveStripe] Error:', error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json({ error: 'Failed to save payment method' }, { status: 500 });
  }
}

export const POST = withAuth(handler);
