/**
 * POST /api/intake-forms/checkout
 *
 * Creates a Stripe Checkout Session for intake forms that include payment
 * (e.g. weight loss program with initial consultation fee).
 *
 * The intake form responses are submitted first, then the patient is
 * redirected to Stripe for payment. On successful payment, the webhook
 * handler completes the intake flow.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { handleApiError } from '@/domains/shared/errors';
import { z } from 'zod';
import { getStripeClient } from '@/lib/stripe';

const checkoutSchema = z.object({
  sessionId: z.string().min(1),
  clinicSlug: z.string().min(1),
  templateId: z.string().min(1),
  email: z.string().email(),
  priceId: z.string().optional(),
  amount: z.number().positive().optional(),
  productName: z.string().optional(),
  successPath: z.string().optional(),
  cancelPath: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const stripe = getStripeClient();
    if (!stripe) {
      return NextResponse.json({ error: 'Payment service not configured' }, { status: 503 });
    }

    const body = await req.json();
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const {
      sessionId,
      clinicSlug,
      templateId,
      email,
      priceId,
      amount,
      productName,
      successPath,
      cancelPath,
    } = parsed.data;

    const clinic = await prisma.clinic.findFirst({
      where: {
        OR: [{ subdomain: clinicSlug }, { customDomain: clinicSlug }],
      },
      select: { id: true, name: true, customDomain: true },
    });

    if (!clinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    const baseUrl = process.env.NEXTAUTH_URL || `https://${clinicSlug}.eonpro.io`;
    const defaultSuccessPath = `/intake/${clinicSlug}/${templateId}/qualified?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const defaultCancelPath = `/intake/${clinicSlug}/${templateId}/review?checkout=cancelled`;

    const lineItems: { price?: string; price_data?: Record<string, unknown>; quantity: number }[] = [];

    if (priceId) {
      lineItems.push({ price: priceId, quantity: 1 });
    } else if (amount) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(amount * 100),
          product_data: {
            name: productName || `${clinic.name} - Treatment Program`,
            description: 'Initial consultation and treatment setup',
          },
        },
        quantity: 1,
      });
    } else {
      return NextResponse.json(
        { error: 'Either priceId or amount is required' },
        { status: 400 },
      );
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      line_items: lineItems as any,
      success_url: `${baseUrl}${successPath || defaultSuccessPath}`,
      cancel_url: `${baseUrl}${cancelPath || defaultCancelPath}`,
      metadata: {
        intakeSessionId: sessionId,
        clinicId: String(clinic.id),
        templateId,
        source: 'native-intake-engine',
      },
    });

    logger.info('Intake checkout session created', {
      checkoutSessionId: checkoutSession.id,
      intakeSessionId: sessionId,
      clinicId: clinic.id,
    });

    return NextResponse.json({
      checkoutUrl: checkoutSession.url,
      checkoutSessionId: checkoutSession.id,
    });
  } catch (error) {
    return handleApiError(error, { route: 'POST /api/intake-forms/checkout' });
  }
}
