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
      select: { id: true, clinicId: true, stripeCustomerId: true },
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

    const brand = pm.card?.brand
      ? pm.card.brand.charAt(0).toUpperCase() + pm.card.brand.slice(1)
      : 'Unknown';

    // Check ALL existing records (including soft-deleted) to handle the unique constraint
    const existing = await prisma.paymentMethod.findFirst({
      where: { stripePaymentMethodId, patientId },
    });

    if (existing) {
      // If the record is still active, just return it
      if (existing.isActive) {
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

      // Reactivate a previously soft-deleted card
      if (setAsDefault) {
        await prisma.paymentMethod.updateMany({
          where: { patientId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const reactivated = await prisma.paymentMethod.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          cardLast4: pm.card?.last4 || existing.cardLast4,
          cardBrand: brand,
          expiryMonth: pm.card?.exp_month ?? existing.expiryMonth,
          expiryYear: pm.card?.exp_year ?? existing.expiryYear,
          cardholderName: pm.billing_details?.name || existing.cardholderName,
          billingZip: pm.billing_details?.address?.postal_code || existing.billingZip,
          isDefault: setAsDefault || false,
        },
      });

      logger.info('[SaveStripe] Payment method reactivated', {
        patientId,
        paymentMethodId: reactivated.id,
        stripePaymentMethodId,
      });

      return NextResponse.json({
        success: true,
        data: {
          id: reactivated.id,
          last4: reactivated.cardLast4,
          brand: reactivated.cardBrand,
          expiryMonth: reactivated.expiryMonth,
          expiryYear: reactivated.expiryYear,
          isDefault: reactivated.isDefault,
        },
      });
    }

    // If this Stripe PM is already saved on another profile in the same clinic,
    // do not attempt a duplicate insert (global unique on stripePaymentMethodId).
    // We return success so callers can continue and fetch it from shared-profile listing.
    const existingOnOtherProfile = await prisma.paymentMethod.findFirst({
      where: {
        stripePaymentMethodId,
        isActive: true,
        patientId: { not: patientId },
        ...(patient.clinicId ? { clinicId: patient.clinicId } : {}),
      },
      select: {
        id: true,
        cardLast4: true,
        cardBrand: true,
        expiryMonth: true,
        expiryYear: true,
      },
    });

    if (existingOnOtherProfile) {
      logger.info('[SaveStripe] Card already exists on another profile; using shared visibility', {
        patientId,
        sharedPaymentMethodId: existingOnOtherProfile.id,
      });

      return NextResponse.json({
        success: true,
        data: {
          id: `stripe_${stripePaymentMethodId}`,
          last4: existingOnOtherProfile.cardLast4,
          brand: existingOnOtherProfile.cardBrand,
          expiryMonth: existingOnOtherProfile.expiryMonth,
          expiryYear: existingOnOtherProfile.expiryYear,
          isDefault: false,
          sharedAcrossProfiles: true,
        },
        message: 'Card is already saved on another profile and is available for shared use.',
      });
    }

    if (setAsDefault) {
      await prisma.paymentMethod.updateMany({
        where: { patientId, isDefault: true },
        data: { isDefault: false },
      });
    }

    // DB columns are NOT NULL — provide non-null fallbacks for Stripe-sourced cards
    const saved = await prisma.paymentMethod.create({
      data: {
        patientId,
        clinicId: patient.clinicId,
        stripePaymentMethodId,
        encryptedCardNumber: '',
        cardLast4: pm.card?.last4 || '????',
        cardBrand: brand,
        expiryMonth: pm.card?.exp_month ?? 0,
        expiryYear: pm.card?.exp_year ?? 0,
        cardholderName: pm.billing_details?.name || '',
        billingZip: pm.billing_details?.address?.postal_code || '',
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
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('[SaveStripe] Error:', { message: msg, stack: error instanceof Error ? error.stack : undefined });
    return NextResponse.json({ error: `Failed to save payment method: ${msg}` }, { status: 500 });
  }
}

export const POST = withAuth(handler);
