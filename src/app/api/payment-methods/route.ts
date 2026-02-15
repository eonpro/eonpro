import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { PaymentMethodService } from '@/services/paymentMethodService';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import { getStripeForClinic } from '@/lib/stripe';
import type Stripe from 'stripe';
import { Patient, Provider, Order } from '@/types/models';

// Schema for adding a new card
const AddCardSchema = z.object({
  patientId: z.number(),
  cardNumber: z.string().min(13).max(19),
  expiryMonth: z.number().min(1).max(12),
  expiryYear: z.number().min(new Date().getFullYear()),
  cvv: z.string().min(3).max(4).optional(),
  cardholderName: z.string().min(1),
  billingZip: z.string().min(5),
  setAsDefault: z.boolean().optional().default(false),
});

// GET /api/payment-methods?patientId=123
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const patientId = searchParams.get('patientId');

    if (!patientId) {
      return NextResponse.json({ error: 'Patient ID is required' }, { status: 400 });
    }

    const pid = parseInt(patientId);

    // Fetch local cards from DB
    const localCards = await PaymentMethodService.getPaymentMethods(pid);

    // Look up patient's Stripe customer ID and clinic for Stripe card fetch
    const patient = await prisma.patient.findUnique({
      where: { id: pid },
      select: {
        stripeCustomerId: true,
        clinicId: true,
        paymentMethods: {
          where: { isActive: true },
          select: { stripePaymentMethodId: true },
        },
      },
    });

    // Fetch Stripe cards if patient has a stripeCustomerId
    let stripeCards: any[] = [];
    if (patient?.stripeCustomerId) {
      try {
        const stripeContext = await getStripeForClinic(patient.clinicId);
        const methods = await stripeContext.stripe.paymentMethods.list({
          customer: patient.stripeCustomerId,
          type: 'card',
        });

        // Build set of Stripe PM IDs already linked locally (for dedup)
        const localStripeIds = new Set(
          (patient.paymentMethods || [])
            .map((pm) => pm.stripePaymentMethodId)
            .filter(Boolean)
        );

        stripeCards = methods.data
          .filter((m: Stripe.PaymentMethod) => !localStripeIds.has(m.id))
          .map((m: Stripe.PaymentMethod) => ({
            id: `stripe_${m.id}`,
            last4: m.card?.last4 || '????',
            brand: m.card?.brand
              ? m.card.brand.charAt(0).toUpperCase() + m.card.brand.slice(1)
              : 'Unknown',
            expiryMonth: m.card?.exp_month || 0,
            expiryYear: m.card?.exp_year || 0,
            cardholderName: m.billing_details?.name || '',
            isDefault: false,
            createdAt: new Date(m.created * 1000),
            source: 'stripe' as const,
            stripePaymentMethodId: m.id,
          }));
      } catch (stripeErr) {
        logger.warn('[PAYMENT_METHODS] Failed to fetch Stripe cards (falling back to local only)', {
          patientId: pid,
          error: stripeErr instanceof Error ? stripeErr.message : String(stripeErr),
        });
      }
    }

    // Add source field to local cards
    const localWithSource = localCards.map((c) => ({ ...c, source: 'local' as const }));

    // Merge: local cards first, then Stripe-only cards
    const merged = [...localWithSource, ...stripeCards];

    return NextResponse.json({
      success: true,
      data: merged,
    });
  } catch (error: any) {
    // @ts-ignore

    logger.error('[PAYMENT_METHODS] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch payment methods' }, { status: 500 });
  }
}

// POST /api/payment-methods
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const validationResult = AddCardSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid input',
          details: validationResult.error.errors,
        },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Add the payment method
    const paymentMethod = await PaymentMethodService.addPaymentMethod(
      data.patientId,
      {
        cardNumber: data.cardNumber.replace(/\s/g, ''), // Remove spaces
        expiryMonth: data.expiryMonth,
        expiryYear: data.expiryYear,
        cvv: data.cvv,
        cardholderName: data.cardholderName,
        billingZip: data.billingZip,
      },
      data.setAsDefault
    );

    // Return safe data only
    return NextResponse.json({
      success: true,
      data: {
        id: paymentMethod.id,
        last4: paymentMethod.cardLast4,
        brand: paymentMethod.cardBrand,
        expiryMonth: paymentMethod.expiryMonth,
        expiryYear: paymentMethod.expiryYear,
        cardholderName: paymentMethod.cardholderName,
        isDefault: paymentMethod.isDefault,
      },
    });
  } catch (error: any) {
    // @ts-ignore

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[PAYMENT_METHODS] POST error:', error);

    // Handle specific errors
    if (errorMessage === 'Invalid card number') {
      return NextResponse.json({ error: 'Invalid card number' }, { status: 400 });
    }

    if (error.message === 'Card has expired') {
      return NextResponse.json({ error: 'Card has expired' }, { status: 400 });
    }

    if (error.message === 'This card is already saved') {
      return NextResponse.json({ error: 'This card is already saved' }, { status: 409 });
    }

    return NextResponse.json({ error: 'Failed to add payment method' }, { status: 500 });
  }
}

// DELETE /api/payment-methods?id=123&patientId=456
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    const patientId = searchParams.get('patientId');

    if (!id || !patientId) {
      return NextResponse.json({ error: 'ID and Patient ID are required' }, { status: 400 });
    }

    await PaymentMethodService.removePaymentMethod(parseInt(id), parseInt(patientId));

    return NextResponse.json({
      success: true,
      message: 'Payment method removed successfully',
    });
  } catch (error: any) {
    // @ts-ignore

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[PAYMENT_METHODS] DELETE error:', error);

    if (errorMessage === 'Payment method not found') {
      return NextResponse.json({ error: 'Payment method not found' }, { status: 404 });
    }

    return NextResponse.json({ error: 'Failed to remove payment method' }, { status: 500 });
  }
}
