import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import { logger } from '@/lib/logger';

// Validation schema
const promotionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  internalNotes: z.string().optional(),
  promotionType: z.enum(['SALE', 'FLASH_SALE', 'SEASONAL', 'CLEARANCE', 'NEW_PATIENT', 'LOYALTY', 'BUNDLE', 'UPGRADE']).default('SALE'),
  discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING', 'FREE_TRIAL', 'BUY_X_GET_Y']).default('PERCENTAGE'),
  discountValue: z.number().min(0),
  applyTo: z.enum(['ALL_PRODUCTS', 'LIMITED_PRODUCTS', 'LIMITED_CATEGORIES', 'SUBSCRIPTIONS_ONLY', 'ONE_TIME_ONLY']).default('ALL_PRODUCTS'),
  productIds: z.array(z.number()).optional(),
  categoryIds: z.array(z.string()).optional(),
  startsAt: z.string(),
  endsAt: z.string().optional().nullable(),
  bannerText: z.string().optional(),
  bannerColor: z.string().optional(),
  showOnProducts: z.boolean().default(true),
  showBanner: z.boolean().default(false),
  maxRedemptions: z.number().min(1).optional().nullable(),
  autoApply: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

// GET - List promotions
async function handleGet(req: NextRequest, user: AuthUser) {
  try {
    const url = new URL(req.url);
    const activeOnly = url.searchParams.get('activeOnly') === 'true';
    const currentOnly = url.searchParams.get('currentOnly') === 'true';

    const where: any = {};

    if (user.role === 'SUPER_ADMIN') {
      const clinicId = url.searchParams.get('clinicId');
      if (clinicId) where.clinicId = parseInt(clinicId);
    } else if (user.clinicId) {
      where.clinicId = user.clinicId;
    }

    if (activeOnly) where.isActive = true;

    if (currentOnly) {
      const now = new Date();
      where.startsAt = { lte: now };
      where.OR = [
        { endsAt: null },
        { endsAt: { gte: now } },
      ];
    }

    const promotions = await prisma.promotion.findMany({
      where,
      orderBy: [
        { isActive: 'desc' },
        { startsAt: 'desc' },
      ],
    });

    return NextResponse.json({ promotions });
  } catch (error: any) {
    logger.error('[Promotions API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch promotions' }, { status: 500 });
  }
}

// POST - Create promotion
async function handlePost(req: NextRequest, user: AuthUser) {
  try {
    const body = await req.json();
    const validated = promotionSchema.parse(body);

    let clinicId = user.clinicId;
    if (user.role === 'SUPER_ADMIN' && body.clinicId) {
      clinicId = body.clinicId;
    }

    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic ID is required' }, { status: 400 });
    }

    const promotion = await prisma.promotion.create({
      data: {
        clinicId,
        name: validated.name,
        description: validated.description,
        internalNotes: validated.internalNotes,
        promotionType: validated.promotionType as any,
        discountType: validated.discountType as any,
        discountValue: validated.discountValue,
        applyTo: validated.applyTo as any,
        productIds: validated.productIds,
        categoryIds: validated.categoryIds,
        startsAt: new Date(validated.startsAt),
        endsAt: validated.endsAt ? new Date(validated.endsAt) : null,
        bannerText: validated.bannerText,
        bannerColor: validated.bannerColor,
        showOnProducts: validated.showOnProducts,
        showBanner: validated.showBanner,
        maxRedemptions: validated.maxRedemptions,
        autoApply: validated.autoApply,
        isActive: validated.isActive,
      },
    });

    logger.info('[Promotions API] Created promotion', { name: validated.name, clinicId });

    return NextResponse.json({ promotion });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    logger.error('[Promotions API] Error:', error);
    return NextResponse.json({ error: 'Failed to create promotion' }, { status: 500 });
  }
}

export const GET = withAuth(handleGet, { requiredRoles: ['SUPER_ADMIN', 'ADMIN', 'PROVIDER'] });
export const POST = withAuth(handlePost, { requiredRoles: ['SUPER_ADMIN', 'ADMIN'] });
