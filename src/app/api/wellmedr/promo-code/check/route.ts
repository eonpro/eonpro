import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import {
  getWellMedrConnectStripe,
  getWellMedrConnectOpts,
} from '@/app/wellmedr-checkout/lib/stripe-connect';

export async function POST(req: NextRequest) {
  try {
    const { promoCode, productName, medicationType, planType } = await req.json();

    if (!promoCode) {
      return NextResponse.json({ success: false, data: { message: 'Promo code is required' } });
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
    console.error('[wellmedr/promo-code/check]', error);
    return NextResponse.json(
      { success: false, data: { message: 'Failed to validate promo code' } },
      { status: 500 }
    );
  }
}
