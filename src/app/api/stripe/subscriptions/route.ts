import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { verifyAuth } from '@/lib/auth/middleware';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-11-17.clover',
});

/**
 * GET /api/stripe/subscriptions - List subscriptions
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const authResult = await verifyAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as Stripe.Subscription.Status | null;
    const limit = parseInt(searchParams.get('limit') || '100');
    const customerId = searchParams.get('customerId');

    // Check if Stripe is configured
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ 
        subscriptions: [],
        message: 'Stripe not configured'
      });
    }

    const params: Stripe.SubscriptionListParams = {
      limit,
    };

    if (status) {
      params.status = status;
    }

    if (customerId) {
      params.customer = customerId;
    }

    const subscriptions = await stripe.subscriptions.list(params);

    return NextResponse.json({
      subscriptions: subscriptions.data,
      hasMore: subscriptions.has_more,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Stripe Subscriptions] Error:', errorMessage);
    
    // Return empty array instead of error for dashboard compatibility
    return NextResponse.json({ 
      subscriptions: [],
      error: errorMessage 
    });
  }
}
