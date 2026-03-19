import { NextRequest, NextResponse } from 'next/server';
import { findOrderBySubscriptionId } from '@/app/wellmedr-checkout/lib/order-store';

export async function GET(req: NextRequest) {
  try {
    const subscriptionId = req.nextUrl.searchParams.get('subscriptionId');
    if (!subscriptionId) {
      return NextResponse.json({ exists: false });
    }

    const order = await findOrderBySubscriptionId(subscriptionId);
    if (!order) {
      return NextResponse.json({ exists: false });
    }

    return NextResponse.json({
      exists: true,
      order: {
        subscriptionId: order.subscriptionId,
        paymentStatus: order.paymentStatus,
        subscriptionStatus: order.subscriptionStatus,
        orderStatus: order.orderStatus,
        customerEmail: order.customerEmail,
        shippingAddress: order.shippingAddress,
        billingAddress: order.billingAddress,
      },
    });
  } catch (error) {
    console.error('[wellmedr/get-order]', error);
    return NextResponse.json({ exists: false }, { status: 500 });
  }
}
