/**
 * API endpoint to create test Stripe customers
 */

import { NextRequest, NextResponse } from "next/server";
import { isFeatureEnabled } from "@/lib/features";
import { getStripe } from "@/lib/stripe";
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    // Check feature flag
    if (!isFeatureEnabled("STRIPE_SUBSCRIPTIONS")) {
      return NextResponse.json(
        { error: "Stripe Subscriptions feature is not enabled" },
        { status: 403 }
      );
    }

    const { email, name } = await req.json();

    // Check if using mock mode
    const isMockMode = !process.env.STRIPE_SECRET_KEY || process.env.STRIPE_USE_MOCK === 'true';

    if (isMockMode) {
      // Return mock customer
      const mockCustomer = {
        id: `cus_mock_${Date.now()}`,
        email,
        name,
        created: Date.now() / 1000,
        mock: true,
      };

      logger.debug('[STRIPE_TEST] Created mock customer:', { value: mockCustomer.id });

      return NextResponse.json({
        success: true,
        customerId: mockCustomer.id,
        customer: mockCustomer,
        mock: true,
      });
    }

    // Create real Stripe customer
    try {
      const stripe = getStripe();
      
      const customer = await stripe.customers.create({
        email,
        name,
        metadata: {
          test: 'true',
          createdBy: 'test-suite',
          timestamp: new Date().toISOString(),
        } as any,
      });

      logger.debug('[STRIPE_TEST] Created test customer:', { value: customer.id });

      return NextResponse.json({
        success: true,
        customerId: customer.id,
        customer: {
          id: customer.id,
          email: customer.email,
          name: customer.name,
          created: customer.created,
        },
        mock: false,
      });
    } catch (stripeError: any) {
    const errorMessage = stripeError instanceof Error ? stripeError.message : String(stripeError);
      logger.error('[STRIPE_TEST] Customer creation failed:', { value: stripeError });
      return NextResponse.json(
        { error: "Failed to create customer", details: errorMessage },
        { status: 400 }
      );
    }
  } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[STRIPE_TEST] Error:', error);
    return NextResponse.json(
      { error: "Failed to create test customer", details: errorMessage },
      { status: 500 }
    );
  }
}
