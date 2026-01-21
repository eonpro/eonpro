/**
 * STRIPE COUPONS & PROMOTIONS API
 * 
 * GET /api/stripe/coupons - List all coupons and promotion codes
 * POST /api/stripe/coupons - Create a new coupon
 * 
 * Provides:
 * - Active coupons
 * - Promotion codes
 * - Redemption statistics
 * - Discount analytics
 * 
 * PROTECTED: Requires admin authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStripe, formatCurrency } from '@/lib/stripe';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import Stripe from 'stripe';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

const createCouponSchema = z.object({
  name: z.string().optional(),
  percentOff: z.number().min(1).max(100).optional(),
  amountOff: z.number().min(1).optional(), // in cents
  currency: z.string().default('usd'),
  duration: z.enum(['forever', 'once', 'repeating']),
  durationInMonths: z.number().min(1).optional(), // required if duration is 'repeating'
  maxRedemptions: z.number().min(1).optional(),
  redeemBy: z.string().datetime().optional(),
  metadata: z.record(z.string()).optional(),
  // Promotion code settings
  createPromoCode: z.boolean().default(false),
  promoCode: z.string().optional(), // custom code, or auto-generated
});

async function getCouponsHandler(request: NextRequest, user: AuthUser) {
  try {
    // Only admins can view coupons
    if (!['admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized - admin access required' }, { status: 403 });
    }
    
    const stripe = getStripe();
    const { searchParams } = new URL(request.url);
    
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const startingAfter = searchParams.get('starting_after') || undefined;
    const includeExpired = searchParams.get('includeExpired') === 'true';
    
    // Fetch coupons
    const coupons = await stripe.coupons.list({
      limit,
      ...(startingAfter && { starting_after: startingAfter }),
    });
    
    // Fetch promotion codes
    const promoCodes = await stripe.promotionCodes.list({
      limit: 100,
      active: true,
      expand: ['data.coupon'],
    });
    
    // Map promo codes to coupons
    const promoCodesByCoupon: Record<string, Stripe.PromotionCode[]> = {};
    promoCodes.data.forEach(promo => {
      if (!promo.coupon) return;
      const couponId = typeof promo.coupon === 'string' ? promo.coupon : promo.coupon?.id;
      if (!couponId) return;
      if (!promoCodesByCoupon[couponId]) {
        promoCodesByCoupon[couponId] = [];
      }
      promoCodesByCoupon[couponId].push(promo);
    });
    
    // Format coupons
    const now = Math.floor(Date.now() / 1000);
    const formattedCoupons = coupons.data
      .filter(coupon => includeExpired || !coupon.redeem_by || coupon.redeem_by > now)
      .map(coupon => {
        const isExpired = coupon.redeem_by && coupon.redeem_by < now;
        const isFullyRedeemed = coupon.max_redemptions && coupon.times_redeemed >= coupon.max_redemptions;
        
        return {
          id: coupon.id,
          name: coupon.name,
          valid: coupon.valid,
          percentOff: coupon.percent_off,
          amountOff: coupon.amount_off,
          amountOffFormatted: coupon.amount_off ? formatCurrency(coupon.amount_off) : null,
          currency: coupon.currency?.toUpperCase() || 'USD',
          duration: coupon.duration,
          durationInMonths: coupon.duration_in_months,
          maxRedemptions: coupon.max_redemptions,
          timesRedeemed: coupon.times_redeemed,
          redeemBy: coupon.redeem_by,
          redeemByDate: coupon.redeem_by ? new Date(coupon.redeem_by * 1000).toISOString() : null,
          created: coupon.created,
          createdAt: new Date(coupon.created * 1000).toISOString(),
          metadata: coupon.metadata,
          isExpired,
          isFullyRedeemed,
          status: isExpired ? 'expired' : isFullyRedeemed ? 'fully_redeemed' : coupon.valid ? 'active' : 'inactive',
          discountDescription: formatDiscount(coupon),
          promoCodes: (promoCodesByCoupon[coupon.id] || []).map(promo => ({
            id: promo.id,
            code: promo.code,
            active: promo.active,
            timesRedeemed: promo.times_redeemed,
            maxRedemptions: promo.max_redemptions,
            expiresAt: promo.expires_at ? new Date(promo.expires_at * 1000).toISOString() : null,
            restrictions: {
              firstTimeTransaction: promo.restrictions?.first_time_transaction,
              minimumAmount: promo.restrictions?.minimum_amount,
              minimumAmountFormatted: promo.restrictions?.minimum_amount 
                ? formatCurrency(promo.restrictions.minimum_amount) 
                : null,
            },
          })),
        };
      });
    
    // Calculate statistics
    const activeCoupons = formattedCoupons.filter(c => c.status === 'active');
    const totalRedemptions = formattedCoupons.reduce((sum, c) => sum + c.timesRedeemed, 0);
    
    const summary = {
      totalCoupons: formattedCoupons.length,
      activeCoupons: activeCoupons.length,
      expiredCoupons: formattedCoupons.filter(c => c.status === 'expired').length,
      fullyRedeemedCoupons: formattedCoupons.filter(c => c.status === 'fully_redeemed').length,
      totalRedemptions,
      totalPromoCodes: promoCodes.data.length,
      byDuration: {
        forever: formattedCoupons.filter(c => c.duration === 'forever').length,
        once: formattedCoupons.filter(c => c.duration === 'once').length,
        repeating: formattedCoupons.filter(c => c.duration === 'repeating').length,
      },
    };
    
    logger.info('[STRIPE COUPONS] Retrieved coupons', {
      count: formattedCoupons.length,
      active: activeCoupons.length,
    });
    
    return NextResponse.json({
      success: true,
      coupons: formattedCoupons,
      summary,
      pagination: {
        hasMore: coupons.has_more,
        limit,
        ...(formattedCoupons.length > 0 && { lastId: formattedCoupons[formattedCoupons.length - 1].id }),
      },
      timestamp: new Date().toISOString(),
    });
    
  } catch (error: any) {
    logger.error('[STRIPE COUPONS] Error:', error);
    
    return NextResponse.json(
      { error: error.message || 'Failed to fetch coupons' },
      { status: 500 }
    );
  }
}

async function createCouponHandler(request: NextRequest, user: AuthUser) {
  try {
    // Only admins can create coupons
    if (!['admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized - admin access required' }, { status: 403 });
    }
    
    const stripe = getStripe();
    const body = await request.json();
    const validated = createCouponSchema.parse(body);
    
    // Validate percent_off or amount_off
    if (!validated.percentOff && !validated.amountOff) {
      return NextResponse.json(
        { error: 'Either percentOff or amountOff is required' },
        { status: 400 }
      );
    }
    
    if (validated.percentOff && validated.amountOff) {
      return NextResponse.json(
        { error: 'Cannot specify both percentOff and amountOff' },
        { status: 400 }
      );
    }
    
    if (validated.duration === 'repeating' && !validated.durationInMonths) {
      return NextResponse.json(
        { error: 'durationInMonths is required when duration is repeating' },
        { status: 400 }
      );
    }
    
    // Create coupon
    const couponParams: Stripe.CouponCreateParams = {
      name: validated.name,
      duration: validated.duration,
      ...(validated.percentOff && { percent_off: validated.percentOff }),
      ...(validated.amountOff && { amount_off: validated.amountOff, currency: validated.currency }),
      ...(validated.durationInMonths && { duration_in_months: validated.durationInMonths }),
      ...(validated.maxRedemptions && { max_redemptions: validated.maxRedemptions }),
      ...(validated.redeemBy && { redeem_by: Math.floor(new Date(validated.redeemBy).getTime() / 1000) }),
      ...(validated.metadata && { metadata: validated.metadata }),
    };
    
    const coupon = await stripe.coupons.create(couponParams);
    
    let promoCode = null;
    
    // Create promotion code if requested
    if (validated.createPromoCode) {
      promoCode = await stripe.promotionCodes.create({
        coupon: coupon.id,
        ...(validated.promoCode && { code: validated.promoCode }),
      });
    }
    
    logger.info('[STRIPE COUPONS] Created coupon', {
      couponId: coupon.id,
      promoCodeId: promoCode?.id,
    });
    
    return NextResponse.json({
      success: true,
      coupon: {
        id: coupon.id,
        name: coupon.name,
        percentOff: coupon.percent_off,
        amountOff: coupon.amount_off,
        amountOffFormatted: coupon.amount_off ? formatCurrency(coupon.amount_off) : null,
        duration: coupon.duration,
        discountDescription: formatDiscount(coupon),
      },
      promoCode: promoCode ? {
        id: promoCode.id,
        code: promoCode.code,
      } : null,
    });
    
  } catch (error: any) {
    logger.error('[STRIPE COUPONS] Error creating coupon:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: error.message || 'Failed to create coupon' },
      { status: 500 }
    );
  }
}

export const GET = withAuth(getCouponsHandler);
export const POST = withAuth(createCouponHandler);

function formatDiscount(coupon: Stripe.Coupon): string {
  if (coupon.percent_off) {
    return `${coupon.percent_off}% off`;
  }
  if (coupon.amount_off) {
    return `${formatCurrency(coupon.amount_off)} off`;
  }
  return 'Unknown discount';
}
