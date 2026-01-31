import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import Stripe from 'stripe';
import { getClinicIdFromRequest } from '@/lib/clinic/utils';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-11-17.clover',
});

// Validation schema for creating/updating products
const productSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  shortDescription: z.string().optional(),
  category: z.enum(['SERVICE', 'MEDICATION', 'SUPPLEMENT', 'LAB_TEST', 'PROCEDURE', 'PACKAGE', 'MEMBERSHIP', 'OTHER']).default('SERVICE'),
  price: z.number().min(0, 'Price must be positive'),
  currency: z.string().default('usd'),
  billingType: z.enum(['ONE_TIME', 'RECURRING']).default('ONE_TIME'),
  billingInterval: z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'CUSTOM']).optional().nullable(),
  billingIntervalCount: z.number().min(1).default(1),
  trialDays: z.number().min(0).optional().nullable(),
  isActive: z.boolean().default(true),
  isVisible: z.boolean().default(true),
  displayOrder: z.number().default(0),
  trackInventory: z.boolean().default(false),
  inventoryCount: z.number().optional().nullable(),
  lowStockThreshold: z.number().optional().nullable(),
  taxable: z.boolean().default(false),
  taxRate: z.number().min(0).max(1).optional().nullable(),
  metadata: z.any().optional(),
  tags: z.array(z.string()).optional(),
});

// GET - List products for a clinic
async function handleGet(req: NextRequest, user: AuthUser) {
  try {
    const url = new URL(req.url);
    const category = url.searchParams.get('category');
    const billingType = url.searchParams.get('billingType');
    const activeOnly = url.searchParams.get('activeOnly') === 'true';
    const visibleOnly = url.searchParams.get('visibleOnly') === 'true';

    const where: any = {};

    // Clinic filter - use current clinic context from headers/cookies (set by middleware)
    // Priority: 1. Query param (super_admin only) 2. Header/Cookie 3. User's clinicId from token
    if (user.role === 'super_admin') {
      const clinicIdParam = url.searchParams.get('clinicId');
      if (clinicIdParam) {
        where.clinicId = parseInt(clinicIdParam);
      }
      // For super_admin without explicit clinicId, return all products (no filter)
    } else {
      // For non-super_admin users, get clinic context from header/cookie first
      const contextClinicId = await getClinicIdFromRequest(req);
      if (contextClinicId) {
        where.clinicId = contextClinicId;
      } else if (user.clinicId) {
        // Fall back to JWT token clinicId
        where.clinicId = user.clinicId;
      }
    }

    if (category) where.category = category;
    if (billingType) where.billingType = billingType;
    if (activeOnly) where.isActive = true;
    if (visibleOnly) where.isVisible = true;

    const products = await prisma.product.findMany({
      where,
      orderBy: [
        { displayOrder: 'asc' },
        { name: 'asc' },
      ],
      include: {
        clinic: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json({ products });
  } catch (error: any) {
    logger.error('[Products API] Error fetching products:', error);
    return NextResponse.json(
      { error: 'Failed to fetch products' },
      { status: 500 }
    );
  }
}

// POST - Create a new product
async function handlePost(req: NextRequest, user: AuthUser) {
  try {
    const body = await req.json();
    const validated = productSchema.parse(body);

    // Determine clinic ID - priority: body.clinicId (super_admin), header/cookie, user.clinicId
    let clinicId: number | null = null;

    if (user.role === 'super_admin' && body.clinicId) {
      clinicId = body.clinicId;
    } else {
      // Get from header/cookie first (current clinic context)
      const contextClinicId = await getClinicIdFromRequest(req);
      clinicId = contextClinicId ?? user.clinicId ?? null;
    }

    if (!clinicId) {
      return NextResponse.json(
        { error: 'Clinic ID is required' },
        { status: 400 }
      );
    }

    // Create Stripe Product and Price if Stripe is configured
    let stripeProductId: string | null = null;
    let stripePriceId: string | null = null;

    if (process.env.STRIPE_SECRET_KEY) {
      try {
        // Create Stripe Product
        const stripeProduct = await stripe.products.create({
          name: validated.name,
          description: validated.description || undefined,
          metadata: {
            clinicId: clinicId.toString(),
            category: validated.category,
          },
        });
        stripeProductId = stripeProduct.id;

        // Create Stripe Price
        const priceData: Stripe.PriceCreateParams = {
          product: stripeProductId,
          unit_amount: validated.price,
          currency: validated.currency,
        };

        // Add recurring info for subscription products
        if (validated.billingType === 'RECURRING' && validated.billingInterval) {
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
            'CUSTOM': validated.billingIntervalCount || 1,
          };

          priceData.recurring = {
            interval: intervalMap[validated.billingInterval],
            interval_count: intervalCountMap[validated.billingInterval],
          };
        }

        const stripePrice = await stripe.prices.create(priceData);
        stripePriceId = stripePrice.id;

        logger.info('[Products API] Created Stripe product and price', {
          productId: stripeProductId,
          priceId: stripePriceId,
        });
      } catch (stripeError: any) {
        logger.warn('[Products API] Failed to create Stripe product (continuing without)', stripeError.message);
      }
    }

    // Create product in database
    const product = await prisma.product.create({
      data: {
        clinicId,
        name: validated.name,
        description: validated.description,
        shortDescription: validated.shortDescription,
        category: validated.category as any,
        price: validated.price,
        currency: validated.currency,
        billingType: validated.billingType as any,
        billingInterval: validated.billingInterval as any,
        billingIntervalCount: validated.billingIntervalCount,
        trialDays: validated.trialDays,
        stripeProductId,
        stripePriceId,
        isActive: validated.isActive,
        isVisible: validated.isVisible,
        displayOrder: validated.displayOrder,
        trackInventory: validated.trackInventory,
        inventoryCount: validated.inventoryCount,
        lowStockThreshold: validated.lowStockThreshold,
        taxable: validated.taxable,
        taxRate: validated.taxRate,
        metadata: validated.metadata,
        tags: validated.tags,
      },
    });

    logger.info('[Products API] Product created', { productId: product.id, clinicId });

    return NextResponse.json({ product });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    logger.error('[Products API] Error creating product:', error);
    return NextResponse.json(
      { error: 'Failed to create product' },
      { status: 500 }
    );
  }
}

export const GET = withAuth(handleGet, { roles: ['super_admin', 'admin', 'provider'] });
export const POST = withAuth(handlePost, { roles: ['super_admin', 'admin'] });
