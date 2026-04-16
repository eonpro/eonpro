import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import {
  getWellMedrConnectStripe,
  getWellMedrConnectOpts,
} from '@/app/wellmedr-checkout/lib/stripe-connect';
import { rateLimit } from '@/lib/rateLimit';

const promoCodeSchema = z.object({
  promoCode: z.string().min(1, 'Promo code is required').max(100),
  productName: z.string().max(100).optional(),
  medicationType: z.string().max(50).optional(),
  planType: z.string().max(50).optional(),
});

async function handler(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const parsed = promoCodeSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, data: { message: parsed.error.issues[0]?.message || 'Invalid input' } },
        { status: 400 }
      );
    }

    const { promoCode, productName, planType } = parsed.data;

    // Hardcoded coupon-to-plan restrictions (server-side enforcement)
    const COUPON_PLAN_RESTRICTIONS: Record<string, string[]> = {
      GOAL10: ['monthly', 'quarterly', 'sixMonth', 'annual'],
      '50OFF': ['quarterly'],
      '200OFF': ['quarterly'],
      '100OFF': ['sixMonth'],
      '250OFF': ['sixMonth'],
      '150OFF': ['annual'],
      '300OFF': ['annual'],
      '500OFF': ['annual'],
    };

    const codeUpper = promoCode.trim().toUpperCase();
    const effectivePlan = planType || 'monthly';
    const allowedPlans = COUPON_PLAN_RESTRICTIONS[codeUpper];

    if (allowedPlans && !allowedPlans.includes(effectivePlan)) {
      return NextResponse.json({
        success: false,
        data: { message: 'This promo code is not valid for the selected plan' },
      });
    }

    if (effectivePlan === 'monthly' && !allowedPlans?.includes('monthly')) {
      const hasRestrictions = COUPON_PLAN_RESTRICTIONS[codeUpper];
      if (hasRestrictions) {
        return NextResponse.json({
          success: false,
          data: { message: 'Coupons are not available for monthly plans' },
        });
      }
    }

    const stripe = getWellMedrConnectStripe();
    const connectOpts = getWellMedrConnectOpts();
    const promotionCodes = await stripe.promotionCodes.list(
      {
        code: promoCode,
        active: true,
        expand: ['data.coupon'],
      },
      connectOpts
    );

    if (promotionCodes.data.length === 0) {
      return NextResponse.json({ success: false, data: { message: 'Invalid promo code' } });
    }

    const promoCodeObj = promotionCodes.data[0];
    const coupon = (promoCodeObj as unknown as { coupon: Stripe.Coupon }).coupon;

    if (!coupon.valid) {
      return NextResponse.json({
        success: false,
        data: { message: 'This promo code has expired' },
      });
    }

    if (
      promoCodeObj.max_redemptions &&
      promoCodeObj.times_redeemed >= promoCodeObj.max_redemptions
    ) {
      return NextResponse.json({
        success: false,
        data: { message: 'This promo code has reached its maximum redemptions' },
      });
    }

    if (coupon.redeem_by && new Date(coupon.redeem_by * 1000) < new Date()) {
      return NextResponse.json({
        success: false,
        data: { message: 'This promo code has expired' },
      });
    }

    const metadata = promoCodeObj.metadata || {};
    if (metadata.allowed_products && productName) {
      const allowed = metadata.allowed_products
        .split(',')
        .map((s: string) => s.trim().toLowerCase());
      if (!allowed.includes(productName.toLowerCase())) {
        return NextResponse.json({
          success: false,
          data: { message: 'This promo code is not valid for this product' },
        });
      }
    }
    if (metadata.allowed_plans && planType) {
      const allowed = metadata.allowed_plans.split(',').map((s: string) => s.trim().toLowerCase());
      if (!allowed.includes(planType.toLowerCase())) {
        return NextResponse.json({
          success: false,
          data: { message: 'This promo code is not valid for this plan' },
        });
      }
    }

    const discountPercentage = coupon.percent_off || 0;
    const discountAmount = coupon.amount_off ? coupon.amount_off / 100 : 0;
    const label =
      discountPercentage > 0
        ? `${discountPercentage}% OFF`
        : discountAmount > 0
          ? `$${discountAmount} OFF`
          : '';

    return NextResponse.json({
      success: true,
      data: {
        code: promoCode.toUpperCase(),
        promotionCodeId: promoCodeObj.id,
        couponId: coupon.id,
        discountPercentage,
        discountAmount,
        label,
        duration: coupon.duration,
        durationInMonths: coupon.duration_in_months,
      },
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { module: 'wellmedr-checkout', route: 'promo-code-check' },
    });
    return NextResponse.json(
      { success: false, data: { message: 'Failed to validate promo code' } },
      { status: 500 }
    );
  }
}

export const POST = rateLimit({ max: 20, windowMs: 60_000 })(handler);
