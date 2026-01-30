import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

const portalSchema = z.object({
  patientId: z.number(),
  returnUrl: z.string().url(),
});

async function createPortalHandler(request: NextRequest, user: AuthUser) {
  try {
    // Dynamic import to avoid build-time errors
    const { StripeCustomerService } = await import('@/services/stripe/customerService');
    
    const body = await request.json();
    
    // Validate request body
    const { patientId, returnUrl } = portalSchema.parse(body);
    
    // Get customer portal URL
    const portalUrl = await StripeCustomerService.getCustomerPortalUrl(
      patientId,
      returnUrl
    );
    
    return NextResponse.json({
      success: true,
      url: portalUrl,
    });
  } catch (error: unknown) {
    logger.error('[API] Error creating customer portal session:', error instanceof Error ? error : new Error(String(error)));
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to create customer portal session' },
      { status: 500 }
    );
  }
}

export const POST = withAuth(createPortalHandler);
