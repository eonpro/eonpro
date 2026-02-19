import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

const portalSchema = z.object({
  patientId: z.number().optional(),
  returnUrl: z.string().url(),
});

async function createPortalHandler(request: NextRequest, user: AuthUser) {
  try {
    const { StripeCustomerService } = await import('@/services/stripe/customerService');

    const body = await request.json();
    const parsed = portalSchema.parse(body);

    const patientId = parsed.patientId ?? user.patientId;
    if (!patientId) {
      return NextResponse.json(
        { error: 'Patient ID required. Please log in again.' },
        { status: 400 }
      );
    }

    const portalUrl = await StripeCustomerService.getCustomerPortalUrl(patientId, parsed.returnUrl);

    return NextResponse.json({
      success: true,
      url: portalUrl,
    });
  } catch (error: unknown) {
    logger.error(
      '[API] Error creating customer portal session:',
      error instanceof Error ? error : new Error(String(error))
    );

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
