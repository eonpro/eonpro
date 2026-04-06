import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { PaymentMethodService } from '@/services/paymentMethodService';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import { getStripeForClinic } from '@/lib/stripe/connect';
import type Stripe from 'stripe';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

/**
 * @deprecated Raw card data should NOT be submitted via this route.
 * Use /api/payment-methods/setup-intent + /api/payment-methods/save-stripe instead (PCI DSS).
 * This schema is kept temporarily for backwards compatibility but will reject requests.
 */
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

async function handleGet(request: NextRequest, _user: AuthUser) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const patientId = searchParams.get('patientId');

    if (!patientId) {
      return NextResponse.json({ error: 'Patient ID is required' }, { status: 400 });
    }

    const pid = parseInt(patientId);

    const localCards = await PaymentMethodService.getPaymentMethods(pid);

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

    let stripeCards: any[] = [];
    if (patient?.stripeCustomerId) {
      try {
        const stripeContext = await getStripeForClinic(patient.clinicId);
        const methods = await stripeContext.stripe.paymentMethods.list({
          customer: patient.stripeCustomerId,
          type: 'card',
        });

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

    // Shared cards across profiles:
    // If multiple local profiles point to the same Stripe customer within this clinic,
    // surface those active saved cards here as Stripe-only options so staff can reuse
    // cards across duplicate/sibling profiles without storing duplicate PM rows.
    let sharedProfileCards: any[] = [];
    if (patient?.stripeCustomerId && patient?.clinicId) {
      try {
        const siblingPatientIds = await prisma.patient.findMany({
          where: {
            clinicId: patient.clinicId,
            stripeCustomerId: patient.stripeCustomerId,
            id: { not: pid },
          },
          select: { id: true },
        });

        if (siblingPatientIds.length > 0) {
          const siblingIds = siblingPatientIds.map((p) => p.id);
          const sharedRows = await prisma.paymentMethod.findMany({
            where: {
              clinicId: patient.clinicId,
              patientId: { in: siblingIds },
              isActive: true,
              stripePaymentMethodId: { not: null },
            },
            select: {
              stripePaymentMethodId: true,
              cardLast4: true,
              cardBrand: true,
              expiryMonth: true,
              expiryYear: true,
              cardholderName: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          });

          const seen = new Set<string>();
          sharedProfileCards = sharedRows
            .filter((row) => !!row.stripePaymentMethodId)
            .filter((row) => {
              const pmid = row.stripePaymentMethodId as string;
              if (seen.has(pmid)) return false;
              seen.add(pmid);
              return true;
            })
            .map((row) => ({
              id: `stripe_${row.stripePaymentMethodId}`,
              last4: row.cardLast4 || '????',
              brand: row.cardBrand || 'Unknown',
              expiryMonth: row.expiryMonth || 0,
              expiryYear: row.expiryYear || 0,
              cardholderName: row.cardholderName || '',
              isDefault: false,
              createdAt: row.createdAt,
              source: 'stripe' as const,
              stripePaymentMethodId: row.stripePaymentMethodId as string,
            }));
        }
      } catch (sharedErr) {
        logger.warn('[PAYMENT_METHODS] Failed to fetch shared profile cards (non-blocking)', {
          patientId: pid,
          error: sharedErr instanceof Error ? sharedErr.message : String(sharedErr),
        });
      }
    }

    const localWithSource = localCards.map((c) => ({ ...c, source: 'local' as const }));
    const mergedRaw = [...localWithSource, ...stripeCards, ...sharedProfileCards];
    const seenMerged = new Set<string>();
    const merged = mergedRaw.filter((card) => {
      const key = card.stripePaymentMethodId
        ? `stripe:${card.stripePaymentMethodId}`
        : `local:${String(card.id)}`;
      if (seenMerged.has(key)) return false;
      seenMerged.add(key);
      return true;
    });

    return NextResponse.json({
      success: true,
      data: merged,
    });
  } catch (error: unknown) {
    logger.error('[PAYMENT_METHODS] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch payment methods' }, { status: 500 });
  }
}

/**
 * POST /api/payment-methods
 * @deprecated — Raw card data must not be sent to our server (PCI DSS violation).
 * Use the Stripe Elements flow: POST /api/payment-methods/setup-intent → Stripe.js
 * confirmCardSetup → POST /api/payment-methods/save-stripe.
 */
async function handlePost(_request: NextRequest, _user: AuthUser) {
  logger.security('[PAYMENT_METHODS] BLOCKED: Raw card POST rejected (PCI DSS)');
  return NextResponse.json(
    {
      error: 'Direct card submission is no longer supported. Use the secure Stripe Elements flow.',
      code: 'PCI_DSS_VIOLATION',
      migration: 'Use POST /api/payment-methods/setup-intent then POST /api/payment-methods/save-stripe',
    },
    { status: 400 }
  );
}

async function handleDelete(request: NextRequest, _user: AuthUser) {
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
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[PAYMENT_METHODS] DELETE error:', error);

    if (errorMessage === 'Payment method not found') {
      return NextResponse.json({ error: 'Payment method not found' }, { status: 404 });
    }

    return NextResponse.json({ error: 'Failed to remove payment method' }, { status: 500 });
  }
}

export const GET = withAuth(handleGet);
export const POST = withAuth(handlePost);
export const DELETE = withAuth(handleDelete);
