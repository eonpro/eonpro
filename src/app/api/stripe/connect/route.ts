/**
 * STRIPE CONNECT API
 *
 * Endpoints for managing Stripe Connect accounts:
 * - POST: Create connected account for a clinic
 * - GET: Get connected account status
 * - DELETE: Remove connected account
 *
 * PROTECTED: Requires admin authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import {
  createConnectedAccount,
  getOnboardingLink,
  getDashboardLink,
  syncConnectedAccountStatus,
  deleteConnectedAccount,
} from '@/lib/stripe/connect';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

/**
 * GET /api/stripe/connect
 * Get connected account status for a clinic
 */
async function getConnectHandler(request: NextRequest, user: AuthUser) {
  try {
    // Only admins can view Stripe Connect status
    if (!['admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized - admin access required' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinicId');
    const action = searchParams.get('action'); // 'status', 'onboarding', 'dashboard'

    if (!clinicId) {
      return NextResponse.json(
        { error: 'clinicId is required' },
        { status: 400 }
      );
    }

    const clinicIdNum = parseInt(clinicId);

    // Get clinic info
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicIdNum },
      select: {
        id: true,
        name: true,
        stripeAccountId: true,
        stripeAccountStatus: true,
        stripeOnboardingComplete: true,
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
        stripeDetailsSubmitted: true,
        stripePlatformAccount: true,
        stripeConnectedAt: true,
      },
    });

    if (!clinic) {
      return NextResponse.json(
        { error: 'Clinic not found' },
        { status: 404 }
      );
    }

    // Handle different actions
    if (action === 'onboarding' && clinic.stripeAccountId) {
      const url = await getOnboardingLink(clinicIdNum);
      return NextResponse.json({ onboardingUrl: url });
    }

    if (action === 'dashboard' && clinic.stripeAccountId) {
      try {
        const url = await getDashboardLink(clinicIdNum);
        return NextResponse.json({ dashboardUrl: url });
      } catch (error: any) {
        // Login links only work for Standard accounts with completed onboarding
        return NextResponse.json(
          { error: 'Dashboard access not available. Complete onboarding first.' },
          { status: 400 }
        );
      }
    }

    if (action === 'sync' && clinic.stripeAccountId) {
      const status = await syncConnectedAccountStatus(clinicIdNum);
      return NextResponse.json({ status });
    }

    // Default: return current status
    return NextResponse.json({
      clinic: {
        id: clinic.id,
        name: clinic.name,
      },
      stripe: {
        hasConnectedAccount: !!clinic.stripeAccountId,
        accountId: clinic.stripeAccountId,
        status: clinic.stripeAccountStatus,
        isPlatformAccount: clinic.stripePlatformAccount,
        onboardingComplete: clinic.stripeOnboardingComplete,
        chargesEnabled: clinic.stripeChargesEnabled,
        payoutsEnabled: clinic.stripePayoutsEnabled,
        detailsSubmitted: clinic.stripeDetailsSubmitted,
        connectedAt: clinic.stripeConnectedAt,
      },
    });

  } catch (error: any) {
    logger.error('[STRIPE CONNECT] GET Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get connect status' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/stripe/connect
 * Create a new connected account for a clinic
 *
 * AUTHORIZATION:
 * - Super admins can create for any clinic
 * - Clinic admins can create for their own clinic only
 */
async function createConnectHandler(request: NextRequest, user: AuthUser) {
  try {
    const body = await request.json();
    const { clinicId, email, businessType, country } = body;

    // Authorization check
    if (user.role === 'super_admin') {
      // Super admin can create for any clinic
    } else if (user.role === 'admin') {
      // Clinic admin can only create for their own clinic
      if (user.clinicId !== clinicId) {
        return NextResponse.json(
          { error: 'Unauthorized - can only connect Stripe for your own clinic' },
          { status: 403 }
        );
      }
    } else {
      return NextResponse.json(
        { error: 'Unauthorized - admin access required' },
        { status: 403 }
      );
    }

    if (!clinicId) {
      return NextResponse.json(
        { error: 'clinicId is required' },
        { status: 400 }
      );
    }

    if (!email) {
      return NextResponse.json(
        { error: 'email is required for Stripe Connect' },
        { status: 400 }
      );
    }

    const result = await createConnectedAccount(clinicId, {
      email,
      businessType: businessType || 'company',
      country: country || 'US',
    });

    logger.info('[STRIPE CONNECT] Created account', {
      clinicId,
      accountId: result.accountId,
    });

    return NextResponse.json({
      success: true,
      accountId: result.accountId,
      onboardingUrl: result.onboardingUrl,
      message: 'Connected account created. Redirect user to onboardingUrl to complete setup.',
    });

  } catch (error: any) {
    logger.error('[STRIPE CONNECT] POST Error:', error);

    if (error.message?.includes('already has a connected account')) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to create connected account' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/stripe/connect
 * Remove a connected account from a clinic
 *
 * AUTHORIZATION:
 * - Super admins can delete for any clinic
 * - Clinic admins can delete for their own clinic only
 */
async function deleteConnectHandler(request: NextRequest, user: AuthUser) {
  try {
    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinicId');

    if (!clinicId) {
      return NextResponse.json(
        { error: 'clinicId is required' },
        { status: 400 }
      );
    }

    const clinicIdNum = parseInt(clinicId);

    // Authorization check
    if (user.role === 'super_admin') {
      // Super admin can delete for any clinic
    } else if (user.role === 'admin') {
      // Clinic admin can only delete for their own clinic
      if (user.clinicId !== clinicIdNum) {
        return NextResponse.json(
          { error: 'Unauthorized - can only disconnect Stripe for your own clinic' },
          { status: 403 }
        );
      }
    } else {
      return NextResponse.json(
        { error: 'Unauthorized - admin access required' },
        { status: 403 }
      );
    }

    await deleteConnectedAccount(clinicIdNum);

    logger.info('[STRIPE CONNECT] Deleted account', { clinicId, userId: user.id });

    return NextResponse.json({
      success: true,
      message: 'Connected account removed',
    });

  } catch (error: any) {
    logger.error('[STRIPE CONNECT] DELETE Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete connected account' },
      { status: 500 }
    );
  }
}

export const GET = withAuth(getConnectHandler);
export const POST = withAuth(createConnectHandler);
export const DELETE = withAuth(deleteConnectHandler);
