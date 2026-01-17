import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuthParams, AuthUser } from '@/lib/auth';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

type RouteContext = { params: Promise<{ id: string }> };

// Update schema
const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  shortDescription: z.string().optional().nullable(),
  category: z.enum(['SERVICE', 'MEDICATION', 'SUPPLEMENT', 'LAB_TEST', 'PROCEDURE', 'PACKAGE', 'MEMBERSHIP', 'OTHER']).optional(),
  price: z.number().min(0).optional(),
  billingType: z.enum(['ONE_TIME', 'RECURRING']).optional(),
  billingInterval: z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'CUSTOM']).optional().nullable(),
  billingIntervalCount: z.number().min(1).optional(),
  trialDays: z.number().min(0).optional().nullable(),
  isActive: z.boolean().optional(),
  isVisible: z.boolean().optional(),
  displayOrder: z.number().optional(),
  trackInventory: z.boolean().optional(),
  inventoryCount: z.number().optional().nullable(),
  lowStockThreshold: z.number().optional().nullable(),
  taxable: z.boolean().optional(),
  taxRate: z.number().min(0).max(1).optional().nullable(),
  metadata: z.any().optional(),
  tags: z.array(z.string()).optional(),
});

// GET - Get single product
async function handleGet(req: NextRequest, user: AuthUser, context: RouteContext) {
  try {
    const { id } = await context.params;
    const productId = parseInt(id);

    if (isNaN(productId)) {
      return NextResponse.json({ error: 'Invalid product ID' }, { status: 400 });
    }

    const where: any = { id: productId };
    
    // Clinic access control
    if (user.role !== 'SUPER_ADMIN' && user.clinicId) {
      where.clinicId = user.clinicId;
    }

    const product = await prisma.product.findFirst({
      where,
      include: {
        clinic: {
          select: { id: true, name: true },
        },
      },
    });

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    return NextResponse.json({ product });
  } catch (error: any) {
    logger.error('[Products API] Error fetching product:', error);
    return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 });
  }
}

// PUT - Update product
async function handlePut(req: NextRequest, user: AuthUser, context: RouteContext) {
  try {
    const { id } = await context.params;
    const productId = parseInt(id);

    if (isNaN(productId)) {
      return NextResponse.json({ error: 'Invalid product ID' }, { status: 400 });
    }

    const body = await req.json();
    const validated = updateSchema.parse(body);

    // Check product exists and user has access
    const where: any = { id: productId };
    if (user.role !== 'SUPER_ADMIN' && user.clinicId) {
      where.clinicId = user.clinicId;
    }

    const existingProduct = await prisma.product.findFirst({ where });
    if (!existingProduct) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Update Stripe product if name changed
    if (validated.name && existingProduct.stripeProductId && process.env.STRIPE_SECRET_KEY) {
      try {
        await stripe.products.update(existingProduct.stripeProductId, {
          name: validated.name,
          description: validated.description || undefined,
        });
      } catch (stripeError: any) {
        logger.warn('[Products API] Failed to update Stripe product:', stripeError.message);
      }
    }

    // If price changed for recurring, need to create new price (Stripe doesn't allow price updates)
    if (validated.price !== undefined && validated.price !== existingProduct.price && existingProduct.stripeProductId && process.env.STRIPE_SECRET_KEY) {
      try {
        // Archive old price
        if (existingProduct.stripePriceId) {
          await stripe.prices.update(existingProduct.stripePriceId, { active: false });
        }

        // Create new price
        const priceData: Stripe.PriceCreateParams = {
          product: existingProduct.stripeProductId,
          unit_amount: validated.price,
          currency: existingProduct.currency,
        };

        const billingType = validated.billingType || existingProduct.billingType;
        const billingInterval = validated.billingInterval || existingProduct.billingInterval;

        if (billingType === 'RECURRING' && billingInterval) {
          const intervalMap: Record<string, Stripe.PriceCreateParams.Recurring.Interval> = {
            'WEEKLY': 'week',
            'MONTHLY': 'month',
            'QUARTERLY': 'month',
            'SEMI_ANNUAL': 'month',
            'ANNUAL': 'year',
            'CUSTOM': 'month',
          };

          const intervalCountMap: Record<string, number> = {
            'WEEKLY': 1,
            'MONTHLY': 1,
            'QUARTERLY': 3,
            'SEMI_ANNUAL': 6,
            'ANNUAL': 1,
            'CUSTOM': validated.billingIntervalCount || existingProduct.billingIntervalCount || 1,
          };

          priceData.recurring = {
            interval: intervalMap[billingInterval],
            interval_count: intervalCountMap[billingInterval],
          };
        }

        const newPrice = await stripe.prices.create(priceData);
        (validated as any).stripePriceId = newPrice.id;

        logger.info('[Products API] Created new Stripe price', { priceId: newPrice.id });
      } catch (stripeError: any) {
        logger.warn('[Products API] Failed to update Stripe price:', stripeError.message);
      }
    }

    // Update database
    const product = await prisma.product.update({
      where: { id: productId },
      data: validated as any,
    });

    logger.info('[Products API] Product updated', { productId });

    return NextResponse.json({ product });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    logger.error('[Products API] Error updating product:', error);
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
  }
}

// DELETE - Archive product (soft delete)
async function handleDelete(req: NextRequest, user: AuthUser, context: RouteContext) {
  try {
    const { id } = await context.params;
    const productId = parseInt(id);

    if (isNaN(productId)) {
      return NextResponse.json({ error: 'Invalid product ID' }, { status: 400 });
    }

    // Check product exists and user has access
    const where: any = { id: productId };
    if (user.role !== 'SUPER_ADMIN' && user.clinicId) {
      where.clinicId = user.clinicId;
    }

    const existingProduct = await prisma.product.findFirst({ where });
    if (!existingProduct) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Archive in Stripe
    if (existingProduct.stripeProductId && process.env.STRIPE_SECRET_KEY) {
      try {
        await stripe.products.update(existingProduct.stripeProductId, { active: false });
        if (existingProduct.stripePriceId) {
          await stripe.prices.update(existingProduct.stripePriceId, { active: false });
        }
      } catch (stripeError: any) {
        logger.warn('[Products API] Failed to archive Stripe product:', stripeError.message);
      }
    }

    // Soft delete - just mark as inactive
    await prisma.product.update({
      where: { id: productId },
      data: { isActive: false, isVisible: false },
    });

    logger.info('[Products API] Product archived', { productId });

    return NextResponse.json({ success: true, message: 'Product archived' });
  } catch (error: any) {
    logger.error('[Products API] Error deleting product:', error);
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 });
  }
}

export const GET = withAuthParams(handleGet, { requiredRoles: ['SUPER_ADMIN', 'ADMIN', 'PROVIDER'] });
export const PUT = withAuthParams(handlePut, { requiredRoles: ['SUPER_ADMIN', 'ADMIN'] });
export const DELETE = withAuthParams(handleDelete, { requiredRoles: ['SUPER_ADMIN', 'ADMIN'] });
