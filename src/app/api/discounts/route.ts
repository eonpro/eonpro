import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

// Validation schema for creating discount codes
const discountCodeSchema = z.object({
  code: z.string().min(3).max(50).transform(s => s.toUpperCase().replace(/\s/g, '')),
  name: z.string().min(1),
  description: z.string().optional(),
  discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING', 'FREE_TRIAL', 'BUY_X_GET_Y']).default('PERCENTAGE'),
  discountValue: z.number().min(0),
  applyTo: z.enum(['ALL_PRODUCTS', 'LIMITED_PRODUCTS', 'LIMITED_CATEGORIES', 'SUBSCRIPTIONS_ONLY', 'ONE_TIME_ONLY']).default('ALL_PRODUCTS'),
  productIds: z.array(z.number()).optional(),
  categoryIds: z.array(z.string()).optional(),
  excludeProductIds: z.array(z.number()).optional(),
  maxUses: z.number().min(1).optional().nullable(),
  maxUsesPerPatient: z.number().min(1).optional().nullable(),
  startsAt: z.string().optional(),
  expiresAt: z.string().optional().nullable(),
  minOrderAmount: z.number().min(0).optional().nullable(),
  minQuantity: z.number().min(1).optional().nullable(),
  firstTimeOnly: z.boolean().default(false),
  applyToFirstPayment: z.boolean().default(true),
  applyToRecurring: z.boolean().default(false),
  recurringDuration: z.number().min(1).optional().nullable(),
  affiliateId: z.number().optional().nullable(),
  isActive: z.boolean().default(true),
});

// GET - List discount codes
async function handleGet(req: NextRequest, user: AuthUser) {
  try {
    const url = new URL(req.url);
    const activeOnly = url.searchParams.get('activeOnly') === 'true';
    const affiliateId = url.searchParams.get('affiliateId');
    const code = url.searchParams.get('code');

    const where: any = {};

    // Clinic filter
    if (user.role === 'SUPER_ADMIN') {
      const clinicId = url.searchParams.get('clinicId');
      if (clinicId) where.clinicId = parseInt(clinicId);
    } else if (user.clinicId) {
      where.clinicId = user.clinicId;
    }

    if (activeOnly) {
      where.isActive = true;
      where.OR = [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ];
    }

    if (affiliateId) where.affiliateId = parseInt(affiliateId);
    if (code) where.code = code.toUpperCase();

    const discountCodes = await prisma.discountCode.findMany({
      where,
      include: {
        affiliate: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: { usages: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ discountCodes });
  } catch (error: any) {
    logger.error('[Discounts API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch discount codes' }, { status: 500 });
  }
}

// POST - Create discount code
async function handlePost(req: NextRequest, user: AuthUser) {
  try {
    const body = await req.json();
    const validated = discountCodeSchema.parse(body);

    let clinicId = user.clinicId;
    if (user.role === 'SUPER_ADMIN' && body.clinicId) {
      clinicId = body.clinicId;
    }

    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic ID is required' }, { status: 400 });
    }

    // Check if code already exists
    const existing = await prisma.discountCode.findFirst({
      where: { clinicId, code: validated.code },
    });

    if (existing) {
      return NextResponse.json({ error: 'Discount code already exists' }, { status: 400 });
    }

    // Create Stripe coupon if configured
    let stripeCouponId: string | null = null;
    if (process.env.STRIPE_SECRET_KEY) {
      try {
        const couponParams: Stripe.CouponCreateParams = {
          id: `${clinicId}_${validated.code}`,
          name: validated.name,
          metadata: { clinicId: clinicId.toString(), code: validated.code },
        };

        if (validated.discountType === 'PERCENTAGE') {
          couponParams.percent_off = validated.discountValue;
        } else if (validated.discountType === 'FIXED_AMOUNT') {
          couponParams.amount_off = validated.discountValue;
          couponParams.currency = 'usd';
        }

        if (validated.maxUses) {
          couponParams.max_redemptions = validated.maxUses;
        }

        if (validated.expiresAt) {
          couponParams.redeem_by = Math.floor(new Date(validated.expiresAt).getTime() / 1000);
        }

        if (validated.applyToRecurring && validated.recurringDuration) {
          couponParams.duration = 'repeating';
          couponParams.duration_in_months = validated.recurringDuration;
        } else if (validated.applyToRecurring) {
          couponParams.duration = 'forever';
        } else {
          couponParams.duration = 'once';
        }

        const stripeCoupon = await stripe.coupons.create(couponParams);
        stripeCouponId = stripeCoupon.id;
      } catch (stripeError: any) {
        logger.warn('[Discounts API] Stripe coupon creation failed:', stripeError.message);
      }
    }

    const discountCode = await prisma.discountCode.create({
      data: {
        clinicId,
        code: validated.code,
        name: validated.name,
        description: validated.description,
        discountType: validated.discountType as any,
        discountValue: validated.discountValue,
        applyTo: validated.applyTo as any,
        productIds: validated.productIds,
        categoryIds: validated.categoryIds,
        excludeProductIds: validated.excludeProductIds,
        maxUses: validated.maxUses,
        maxUsesPerPatient: validated.maxUsesPerPatient,
        startsAt: validated.startsAt ? new Date(validated.startsAt) : new Date(),
        expiresAt: validated.expiresAt ? new Date(validated.expiresAt) : null,
        minOrderAmount: validated.minOrderAmount,
        minQuantity: validated.minQuantity,
        firstTimeOnly: validated.firstTimeOnly,
        applyToFirstPayment: validated.applyToFirstPayment,
        applyToRecurring: validated.applyToRecurring,
        recurringDuration: validated.recurringDuration,
        affiliateId: validated.affiliateId,
        stripeCouponId,
        isActive: validated.isActive,
      },
    });

    logger.info('[Discounts API] Created discount code', { code: validated.code, clinicId });

    return NextResponse.json({ discountCode });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    logger.error('[Discounts API] Error:', error);
    return NextResponse.json({ error: 'Failed to create discount code' }, { status: 500 });
  }
}

export const GET = withAuth(handleGet, { requiredRoles: ['SUPER_ADMIN', 'ADMIN', 'PROVIDER'] });
export const POST = withAuth(handlePost, { requiredRoles: ['SUPER_ADMIN', 'ADMIN'] });
