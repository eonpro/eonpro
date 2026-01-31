/**
 * Stripe Context Helper
 *
 * Utility function to get the appropriate Stripe context based on user role and clinic selection.
 * Used by Stripe API routes to support multi-tenant data isolation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuthUser } from '@/lib/auth/middleware';
import { getClinicIdFromRequest } from '@/lib/clinic/utils';
import { getStripeForClinic, getStripeForPlatform, StripeContext } from './connect';

export interface StripeContextResult {
  context: StripeContext | null;
  error?: NextResponse;
  notConnected?: boolean;
}

/**
 * Get Stripe context for an API request
 *
 * Priority:
 * 1. clinicId query param (for super_admin)
 * 2. x-clinic-id header / selected-clinic cookie (for all users)
 * 3. user.clinicId from JWT token
 *
 * Returns:
 * - context: StripeContext if successful
 * - error: NextResponse if there's an error to return immediately
 * - notConnected: true if clinic has no Stripe account
 */
export async function getStripeContextForRequest(
  request: NextRequest,
  user: AuthUser
): Promise<StripeContextResult> {
  const { searchParams } = new URL(request.url);
  const clinicIdParam = searchParams.get('clinicId');

  let stripeContext: StripeContext;

  if (user.role === 'super_admin') {
    // Super admin can specify clinicId, defaults to platform account
    if (clinicIdParam) {
      stripeContext = await getStripeForClinic(parseInt(clinicIdParam));
    } else {
      stripeContext = getStripeForPlatform();
    }
  } else {
    // Regular admins use their clinic's Stripe account
    const contextClinicId = await getClinicIdFromRequest(request);
    const clinicId = contextClinicId || user.clinicId;

    if (!clinicId) {
      return {
        context: null,
        error: NextResponse.json(
          { error: 'Clinic context required' },
          { status: 400 }
        ),
      };
    }

    stripeContext = await getStripeForClinic(clinicId);
  }

  const { isPlatformAccount, stripeAccountId, clinicId } = stripeContext;

  // If clinic has no Stripe account configured
  if (!isPlatformAccount && !stripeAccountId) {
    return {
      context: stripeContext,
      notConnected: true,
    };
  }

  return { context: stripeContext };
}

/**
 * Generate a "not connected" response for clinics without Stripe
 */
export function getNotConnectedResponse(clinicId?: number) {
  return NextResponse.json({
    success: true,
    notConnected: true,
    message: 'This clinic has not connected a Stripe account yet',
    clinicId,
    timestamp: new Date().toISOString(),
  });
}
