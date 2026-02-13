/**
 * STRIPE PAYMENT LINKS API
 *
 * GET /api/stripe/payment-links - List all payment links
 * POST /api/stripe/payment-links - Create a new payment link
 *
 * Provides:
 * - Shareable payment links
 * - Link performance tracking
 * - Conversion analytics
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStripe, formatCurrency } from '@/lib/stripe';
import { logger } from '@/lib/logger';
import { withAdminAuth, type AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import Stripe from 'stripe';

const createPaymentLinkSchema = z.object({
  priceId: z.string().optional(),
  productName: z.string().optional(),
  amount: z.number().min(1).optional(), // in cents
  currency: z.string().default('usd'),
  quantity: z.number().min(1).default(1),
  adjustableQuantity: z.boolean().default(false),
  allowPromotionCodes: z.boolean().default(true),
  metadata: z.record(z.string()).optional(),
  afterCompletion: z
    .object({
      type: z.enum(['redirect', 'hosted_confirmation']),
      redirectUrl: z.string().url().optional(),
    })
    .optional(),
});

async function handleGet(request: NextRequest, _user: AuthUser) {
  try {
    const stripe = getStripe();
    const { searchParams } = new URL(request.url);

    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const active = searchParams.get('active');
    const startingAfter = searchParams.get('starting_after') || undefined;

    // Fetch payment links
    const paymentLinkParams: Stripe.PaymentLinkListParams = {
      limit,
      ...(startingAfter && { starting_after: startingAfter }),
      ...(active !== null && { active: active === 'true' }),
    };

    const paymentLinks = await stripe.paymentLinks.list(paymentLinkParams);

    // Get line items for each link
    const formattedLinks = await Promise.all(
      paymentLinks.data.map(async (link) => {
        let lineItems: any[] = [];
        try {
          const items = await stripe.paymentLinks.listLineItems(link.id, { limit: 10 });
          lineItems = items.data.map((item) => {
            const product = item.price?.product;
            const productName =
              typeof product === 'object' && product && 'name' in product ? product.name : null;
            return {
              priceId: item.price?.id,
              productName,
              quantity: item.quantity,
              amount: item.amount_total,
              amountFormatted: formatCurrency(item.amount_total),
            };
          });
        } catch (error: unknown) {
          // Line items might not be accessible
          logger.warn('[STRIPE PAYMENT LINKS] Failed to fetch line items', {
            linkId: link.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }

        return {
          id: link.id,
          url: link.url,
          active: link.active,
          allowPromotionCodes: link.allow_promotion_codes,
          billingAddressCollection: link.billing_address_collection,
          currency: link.currency?.toUpperCase(),
          metadata: link.metadata,
          onBehalfOf: link.on_behalf_of,
          paymentIntentData: link.payment_intent_data,
          paymentMethodTypes: link.payment_method_types,
          shippingAddressCollection: link.shipping_address_collection,
          submitType: link.submit_type,
          subscriptionData: link.subscription_data,
          taxIdCollection: link.tax_id_collection,
          transferData: link.transfer_data,
          lineItems,
          totalAmount: lineItems.reduce((sum, item) => sum + item.amount, 0),
          totalAmountFormatted: formatCurrency(
            lineItems.reduce((sum, item) => sum + item.amount, 0)
          ),
        };
      })
    );

    // Summary
    const summary = {
      totalLinks: formattedLinks.length,
      activeLinks: formattedLinks.filter((l) => l.active).length,
      inactiveLinks: formattedLinks.filter((l) => !l.active).length,
    };

    logger.info('[STRIPE PAYMENT LINKS] Retrieved payment links', {
      count: formattedLinks.length,
    });

    return NextResponse.json({
      success: true,
      paymentLinks: formattedLinks,
      summary,
      pagination: {
        hasMore: paymentLinks.has_more,
        limit,
        ...(formattedLinks.length > 0 && { lastId: formattedLinks[formattedLinks.length - 1].id }),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('[STRIPE PAYMENT LINKS] Error:', error);

    return NextResponse.json(
      { error: error.message || 'Failed to fetch payment links' },
      { status: 500 }
    );
  }
}

async function handlePost(request: NextRequest, _user: AuthUser) {
  try {
    const stripe = getStripe();
    const body = await request.json();
    const validated = createPaymentLinkSchema.parse(body);

    let priceId = validated.priceId;

    // If no priceId, create an ad-hoc price
    if (!priceId) {
      if (!validated.amount || !validated.productName) {
        return NextResponse.json(
          { error: 'Either priceId or (amount and productName) is required' },
          { status: 400 }
        );
      }

      // Create product and price
      const product = await stripe.products.create({
        name: validated.productName,
      });

      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: validated.amount,
        currency: validated.currency,
      });

      priceId = price.id;
    }

    // Create payment link
    const linkParams: Stripe.PaymentLinkCreateParams = {
      line_items: [
        {
          price: priceId,
          quantity: validated.quantity,
          ...(validated.adjustableQuantity && {
            adjustable_quantity: {
              enabled: true,
              minimum: 1,
              maximum: 10,
            },
          }),
        },
      ],
      allow_promotion_codes: validated.allowPromotionCodes,
      ...(validated.metadata && { metadata: validated.metadata }),
    };

    if (validated.afterCompletion) {
      if (validated.afterCompletion.type === 'redirect' && validated.afterCompletion.redirectUrl) {
        linkParams.after_completion = {
          type: 'redirect',
          redirect: { url: validated.afterCompletion.redirectUrl },
        };
      } else {
        linkParams.after_completion = {
          type: 'hosted_confirmation',
        };
      }
    }

    const paymentLink = await stripe.paymentLinks.create(linkParams);

    logger.info('[STRIPE PAYMENT LINKS] Created payment link', {
      linkId: paymentLink.id,
    });

    return NextResponse.json({
      success: true,
      paymentLink: {
        id: paymentLink.id,
        url: paymentLink.url,
        active: paymentLink.active,
      },
    });
  } catch (error: any) {
    logger.error('[STRIPE PAYMENT LINKS] Error creating payment link:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to create payment link' },
      { status: 500 }
    );
  }
}

export const GET = withAdminAuth(handleGet);
export const POST = withAdminAuth(handlePost);
