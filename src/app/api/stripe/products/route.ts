/**
 * STRIPE PRODUCTS & PRICES API
 *
 * GET /api/stripe/products - List all products and prices
 * POST /api/stripe/products - Create a new product with price
 *
 * Provides:
 * - Product catalog
 * - Pricing tiers
 * - Active/archived products
 * - Revenue by product
 *
 * PROTECTED: Requires admin authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStripe, formatCurrency } from '@/lib/stripe';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import Stripe from 'stripe';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

const createProductSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().min(0), // in cents
  currency: z.string().default('usd'),
  recurring: z
    .object({
      interval: z.enum(['day', 'week', 'month', 'year']),
      intervalCount: z.number().min(1).default(1),
    })
    .optional(),
  metadata: z.record(z.string()).optional(),
  active: z.boolean().default(true),
});

async function getProductsHandler(request: NextRequest, user: AuthUser) {
  try {
    // Only admins can view products
    if (!['admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized - admin access required' }, { status: 403 });
    }

    const stripe = getStripe();
    const { searchParams } = new URL(request.url);

    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 100);
    const active = searchParams.get('active');
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const startingAfter = searchParams.get('starting_after') || undefined;

    // Fetch products
    const productParams: Stripe.ProductListParams = {
      limit,
      ...(startingAfter && { starting_after: startingAfter }),
      ...(active !== null && !includeInactive && { active: active !== 'false' }),
      expand: ['data.default_price'],
    };

    const products = await stripe.products.list(productParams);

    // Fetch all prices
    const prices = await stripe.prices.list({
      limit: 100,
      active: true,
      expand: ['data.product'],
    });

    // Map prices to products
    const pricesByProduct: Record<string, Stripe.Price[]> = {};
    prices.data.forEach((price) => {
      const productId = typeof price.product === 'string' ? price.product : price.product?.id;
      if (productId) {
        if (!pricesByProduct[productId]) {
          pricesByProduct[productId] = [];
        }
        pricesByProduct[productId].push(price);
      }
    });

    // Format products
    const formattedProducts = products.data.map((product) => {
      const defaultPrice = product.default_price as Stripe.Price | null;
      const productPrices = pricesByProduct[product.id] || [];

      return {
        id: product.id,
        name: product.name,
        description: product.description,
        active: product.active,
        images: product.images,
        metadata: product.metadata,
        created: product.created,
        createdAt: new Date(product.created * 1000).toISOString(),
        updated: product.updated,
        updatedAt: new Date(product.updated * 1000).toISOString(),
        defaultPrice: defaultPrice
          ? {
              id: defaultPrice.id,
              amount: defaultPrice.unit_amount,
              amountFormatted: defaultPrice.unit_amount
                ? formatCurrency(defaultPrice.unit_amount)
                : 'N/A',
              currency: defaultPrice.currency?.toUpperCase(),
              type: defaultPrice.type,
              recurring: defaultPrice.recurring
                ? {
                    interval: defaultPrice.recurring.interval,
                    intervalCount: defaultPrice.recurring.interval_count,
                  }
                : null,
            }
          : null,
        prices: productPrices.map((price) => ({
          id: price.id,
          amount: price.unit_amount,
          amountFormatted: price.unit_amount ? formatCurrency(price.unit_amount) : 'N/A',
          currency: price.currency.toUpperCase(),
          type: price.type,
          active: price.active,
          nickname: price.nickname,
          recurring: price.recurring
            ? {
                interval: price.recurring.interval,
                intervalCount: price.recurring.interval_count,
              }
            : null,
          metadata: price.metadata,
        })),
        taxCode: product.tax_code,
        unitLabel: product.unit_label,
        url: product.url,
      };
    });

    // Summary statistics
    const summary = {
      totalProducts: formattedProducts.length,
      activeProducts: formattedProducts.filter((p) => p.active).length,
      inactiveProducts: formattedProducts.filter((p) => !p.active).length,
      oneTimeProducts: formattedProducts.filter((p) => !p.defaultPrice?.recurring).length,
      recurringProducts: formattedProducts.filter((p) => p.defaultPrice?.recurring).length,
      totalPrices: prices.data.length,
    };

    logger.info('[STRIPE PRODUCTS] Retrieved products', {
      count: formattedProducts.length,
      prices: prices.data.length,
    });

    return NextResponse.json({
      success: true,
      products: formattedProducts,
      summary,
      pagination: {
        hasMore: products.has_more,
        limit,
        ...(formattedProducts.length > 0 && {
          lastId: formattedProducts[formattedProducts.length - 1].id,
        }),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('[STRIPE PRODUCTS] Error:', error);

    return NextResponse.json(
      { error: error.message || 'Failed to fetch products' },
      { status: 500 }
    );
  }
}

async function createProductHandler(request: NextRequest, user: AuthUser) {
  try {
    // Only admins can create products
    if (!['admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized - admin access required' }, { status: 403 });
    }

    const stripe = getStripe();
    const body = await request.json();
    const validated = createProductSchema.parse(body);

    // Create product
    const product = await stripe.products.create({
      name: validated.name,
      description: validated.description,
      active: validated.active,
      metadata: validated.metadata,
    });

    // Create price
    const priceParams: Stripe.PriceCreateParams = {
      product: product.id,
      unit_amount: validated.price,
      currency: validated.currency,
    };

    if (validated.recurring) {
      priceParams.recurring = {
        interval: validated.recurring.interval,
        interval_count: validated.recurring.intervalCount,
      };
    }

    const price = await stripe.prices.create(priceParams);

    // Set as default price
    await stripe.products.update(product.id, {
      default_price: price.id,
    });

    logger.info('[STRIPE PRODUCTS] Created product', {
      productId: product.id,
      priceId: price.id,
    });

    return NextResponse.json({
      success: true,
      product: {
        id: product.id,
        name: product.name,
        description: product.description,
        active: product.active,
        price: {
          id: price.id,
          amount: price.unit_amount,
          amountFormatted: price.unit_amount ? formatCurrency(price.unit_amount) : 'N/A',
          currency: price.currency.toUpperCase(),
          recurring: price.recurring,
        },
      },
    });
  } catch (error: any) {
    logger.error('[STRIPE PRODUCTS] Error creating product:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to create product' },
      { status: 500 }
    );
  }
}

export const GET = withAuth(getProductsHandler);
export const POST = withAuth(createProductHandler);
