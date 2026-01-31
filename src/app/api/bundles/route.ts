import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2026-01-28.clover',
});

// Validation schema
const bundleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  shortDescription: z.string().optional(),
  bundlePrice: z.number().min(0), // Price in cents
  billingType: z.enum(['ONE_TIME', 'RECURRING']).default('ONE_TIME'),
  billingInterval: z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'CUSTOM']).optional().nullable(),
  items: z.array(z.object({
    productId: z.number(),
    quantity: z.number().min(1).default(1),
  })).min(1),
  isActive: z.boolean().default(true),
  isVisible: z.boolean().default(true),
  displayOrder: z.number().default(0),
  maxPurchases: z.number().min(1).optional().nullable(),
  availableFrom: z.string().optional().nullable(),
  availableUntil: z.string().optional().nullable(),
});

// GET - List bundles
async function handleGet(req: NextRequest, user: AuthUser) {
  try {
    const url = new URL(req.url);
    const activeOnly = url.searchParams.get('activeOnly') === 'true';
    const visibleOnly = url.searchParams.get('visibleOnly') === 'true';

    const where: any = {};

    if (user.role === 'super_admin') {
      const clinicId = url.searchParams.get('clinicId');
      if (clinicId) where.clinicId = parseInt(clinicId);
    } else if (user.clinicId) {
      where.clinicId = user.clinicId;
    }

    if (activeOnly) where.isActive = true;
    if (visibleOnly) where.isVisible = true;

    const bundles = await prisma.productBundle.findMany({
      where,
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                price: true,
                category: true,
              },
            },
          },
        },
      },
      orderBy: [
        { displayOrder: 'asc' },
        { name: 'asc' },
      ],
    });

    return NextResponse.json({ bundles });
  } catch (error: any) {
    logger.error('[Bundles API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch bundles' }, { status: 500 });
  }
}

// POST - Create bundle
async function handlePost(req: NextRequest, user: AuthUser) {
  try {
    const body = await req.json();
    const validated = bundleSchema.parse(body);

    let clinicId = user.clinicId;
    if (user.role === 'super_admin' && body.clinicId) {
      clinicId = body.clinicId;
    }

    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic ID is required' }, { status: 400 });
    }

    // Fetch products to calculate regular price
    const productIds = validated.items.map(i => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, clinicId },
    });

    if (products.length !== productIds.length) {
      return NextResponse.json({ error: 'Some products not found or not in your clinic' }, { status: 400 });
    }

    // Define product type from Prisma query result
    type ProductRecord = typeof products[number];

    // Calculate regular price (sum of individual products)
    let regularPrice = 0;
    for (const item of validated.items) {
      const product = products.find((p: ProductRecord) => p.id === item.productId);
      if (product) {
        regularPrice += product.price * item.quantity;
      }
    }

    const savingsAmount = regularPrice - validated.bundlePrice;
    const savingsPercent = regularPrice > 0 ? (savingsAmount / regularPrice) * 100 : 0;

    // Create Stripe product/price if configured
    let stripeProductId: string | null = null;
    let stripePriceId: string | null = null;

    if (process.env.STRIPE_SECRET_KEY) {
      try {
        const stripeProduct = await stripe.products.create({
          name: validated.name,
          description: validated.description || `Bundle: ${validated.name}`,
          metadata: { clinicId: clinicId.toString(), type: 'bundle' },
        });
        stripeProductId = stripeProduct.id;

        const priceData: Stripe.PriceCreateParams = {
          product: stripeProductId,
          unit_amount: validated.bundlePrice,
          currency: 'usd',
        };

        if (validated.billingType === 'RECURRING' && validated.billingInterval) {
          const intervalMap: Record<string, Stripe.PriceCreateParams.Recurring.Interval> = {
            'WEEKLY': 'week',
            'MONTHLY': 'month',
            'QUARTERLY': 'month',
            'SEMI_ANNUAL': 'month',
            'ANNUAL': 'year',
            'CUSTOM': 'month',
          };
          const countMap: Record<string, number> = {
            'WEEKLY': 1, 'MONTHLY': 1, 'QUARTERLY': 3, 'SEMI_ANNUAL': 6, 'ANNUAL': 1, 'CUSTOM': 1,
          };
          priceData.recurring = {
            interval: intervalMap[validated.billingInterval],
            interval_count: countMap[validated.billingInterval],
          };
        }

        const stripePrice = await stripe.prices.create(priceData);
        stripePriceId = stripePrice.id;
      } catch (stripeError: any) {
        logger.warn('[Bundles API] Stripe creation failed:', stripeError.message);
      }
    }

    // Create bundle with items
    const bundle = await prisma.productBundle.create({
      data: {
        clinicId,
        name: validated.name,
        description: validated.description,
        shortDescription: validated.shortDescription,
        regularPrice,
        bundlePrice: validated.bundlePrice,
        savingsAmount,
        savingsPercent,
        billingType: validated.billingType as any,
        billingInterval: validated.billingInterval as any,
        isActive: validated.isActive,
        isVisible: validated.isVisible,
        displayOrder: validated.displayOrder,
        maxPurchases: validated.maxPurchases,
        availableFrom: validated.availableFrom ? new Date(validated.availableFrom) : null,
        availableUntil: validated.availableUntil ? new Date(validated.availableUntil) : null,
        stripeProductId,
        stripePriceId,
        items: {
          create: validated.items.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        },
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    logger.info('[Bundles API] Created bundle', { name: validated.name, clinicId });

    return NextResponse.json({ bundle });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    logger.error('[Bundles API] Error:', error);
    return NextResponse.json({ error: 'Failed to create bundle' }, { status: 500 });
  }
}

export const GET = withAuth(handleGet, { roles: ['super_admin', 'admin', 'provider'] });
export const POST = withAuth(handlePost, { roles: ['super_admin', 'admin'] });
