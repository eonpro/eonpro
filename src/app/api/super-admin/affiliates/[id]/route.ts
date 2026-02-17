/**
 * Super Admin Individual Affiliate API
 *
 * GET - Get single affiliate details
 * PUT - Update affiliate
 * DELETE - Delete affiliate
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { basePrisma } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * Middleware to check for Super Admin role
 */
function withSuperAdminAuth(
  handler: (req: NextRequest, user: AuthUser, params: { id: string }) => Promise<Response>
) {
  return (req: NextRequest, context: { params: Promise<{ id: string }> }) => {
    return withAuth(
      async (request: NextRequest, authUser: AuthUser) => {
        const params = await context.params;
        return handler(request, authUser, params);
      },
      { roles: ['super_admin'] }
    )(req);
  };
}

/**
 * GET /api/super-admin/affiliates/[id]
 */
export const GET = withSuperAdminAuth(
  async (req: NextRequest, user: AuthUser, params: { id: string }) => {
    try {
      const affiliateId = parseInt(params.id);

      if (isNaN(affiliateId)) {
        return NextResponse.json({ error: 'Invalid affiliate ID' }, { status: 400 });
      }

      const affiliate = await basePrisma.affiliate.findUnique({
        where: { id: affiliateId },
        include: {
          clinic: {
            select: {
              id: true,
              name: true,
              subdomain: true,
            },
          },
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              lastLogin: true,
              status: true,
              phone: true,
            },
          },
          refCodes: {
            select: {
              id: true,
              refCode: true,
              isActive: true,
              createdAt: true,
            },
          },
          planAssignments: {
            where: { effectiveTo: null },
            include: {
              commissionPlan: true,
            },
            take: 1,
          },
        },
      });

      if (!affiliate) {
        return NextResponse.json({ error: 'Affiliate not found' }, { status: 404 });
      }

      return NextResponse.json({ affiliate });
    } catch (error) {
      logger.error('Failed to fetch affiliate', { error: error instanceof Error ? error.message : String(error) });
      return NextResponse.json({ error: 'Failed to fetch affiliate' }, { status: 500 });
    }
  }
);

/**
 * PUT /api/super-admin/affiliates/[id]
 */
export const PUT = withSuperAdminAuth(
  async (req: NextRequest, user: AuthUser, params: { id: string }) => {
    try {
      const affiliateId = parseInt(params.id);

      if (isNaN(affiliateId)) {
        return NextResponse.json({ error: 'Invalid affiliate ID' }, { status: 400 });
      }

      const body = await req.json();
      const { displayName, status, firstName, lastName, email, phone, commissionPlanId } = body;

      // Check affiliate exists
      const existingAffiliate = await basePrisma.affiliate.findUnique({
        where: { id: affiliateId },
        include: {
          user: true,
          planAssignments: {
            where: { effectiveTo: null },
            take: 1,
          },
        },
      });

      if (!existingAffiliate) {
        return NextResponse.json({ error: 'Affiliate not found' }, { status: 404 });
      }

      // Update in transaction
      await basePrisma.$transaction(async (tx) => {
        // Update affiliate
        await tx.affiliate.update({
          where: { id: affiliateId },
          data: {
            ...(displayName && { displayName }),
            ...(status && { status }),
          },
        });

        // Update user if needed
        if (firstName || lastName || email || phone) {
          const emailToCheck = email?.toLowerCase();

          // Check if email is changing and if it's already taken
          if (emailToCheck && emailToCheck !== existingAffiliate.user.email) {
            const existingEmail = await tx.user.findUnique({
              where: { email: emailToCheck },
            });
            if (existingEmail) {
              throw new Error('Email already in use by another user');
            }
          }

          await tx.user.update({
            where: { id: existingAffiliate.userId },
            data: {
              ...(firstName && { firstName }),
              ...(lastName && { lastName }),
              ...(emailToCheck && { email: emailToCheck }),
              ...(phone !== undefined && { phone }),
            },
          });
        }

        // Update commission plan if changed
        if (commissionPlanId !== undefined) {
          const currentAssignment = existingAffiliate.planAssignments[0];

          // If there's a current plan and it's different, end it
          if (currentAssignment && currentAssignment.commissionPlanId !== commissionPlanId) {
            await tx.affiliatePlanAssignment.update({
              where: { id: currentAssignment.id },
              data: { effectiveTo: new Date() },
            });
          }

          // Create new assignment if a plan is selected
          if (
            commissionPlanId &&
            (!currentAssignment || currentAssignment.commissionPlanId !== commissionPlanId)
          ) {
            await tx.affiliatePlanAssignment.create({
              data: {
                clinicId: existingAffiliate.clinicId,
                affiliateId,
                commissionPlanId,
                effectiveFrom: new Date(),
              },
            });
          }
        }
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      logger.error('Failed to update affiliate', { error: error instanceof Error ? error.message : String(error) });
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return NextResponse.json(
        { error: errorMessage || 'Failed to update affiliate' },
        { status: 500 }
      );
    }
  }
);

/**
 * DELETE /api/super-admin/affiliates/[id]
 */
export const DELETE = withSuperAdminAuth(
  async (req: NextRequest, user: AuthUser, params: { id: string }) => {
    try {
      const affiliateId = parseInt(params.id);

      if (isNaN(affiliateId)) {
        return NextResponse.json({ error: 'Invalid affiliate ID' }, { status: 400 });
      }

      const affiliate = await basePrisma.affiliate.findUnique({
        where: { id: affiliateId },
        include: {
          commissionEvents: { select: { id: true }, take: 1 },
          payouts: { select: { id: true }, take: 1 },
        },
      });

      if (!affiliate) {
        return NextResponse.json({ error: 'Affiliate not found' }, { status: 404 });
      }

      const hasHistory = affiliate.commissionEvents.length > 0 || affiliate.payouts.length > 0;

      if (hasHistory) {
        // Soft delete - deactivate affiliate and related records
        await basePrisma.$transaction(async (tx) => {
          await tx.affiliate.update({
            where: { id: affiliateId },
            data: { status: 'INACTIVE' },
          });

          await tx.affiliateRefCode.updateMany({
            where: { affiliateId },
            data: { isActive: false },
          });

          await tx.user.update({
            where: { id: affiliate.userId },
            data: { status: 'INACTIVE' },
          });
        });

        return NextResponse.json({
          success: true,
          message: 'Affiliate deactivated (has history)',
          softDeleted: true,
        });
      }

      // Hard delete - no commission/payout history
      await basePrisma.$transaction(async (tx) => {
        // 1. Delete all affiliate-related child records
        await tx.affiliateTouch.deleteMany({ where: { affiliateId } });
        await tx.affiliateCommissionEvent.deleteMany({ where: { affiliateId } });
        await tx.affiliateFraudAlert.deleteMany({ where: { affiliateId } });
        await tx.affiliateTaxDocument.deleteMany({ where: { affiliateId } });
        await tx.affiliatePayoutMethod.deleteMany({ where: { affiliateId } });
        await tx.affiliatePayout.deleteMany({ where: { affiliateId } });
        await tx.affiliatePlanAssignment.deleteMany({ where: { affiliateId } });
        await tx.affiliateRefCode.deleteMany({ where: { affiliateId } });
        // Competition entries cascade automatically (onDelete: Cascade)
        // OTP codes cascade automatically (onDelete: Cascade)

        // 2. Unlink attributed patients (nullable FK)
        await tx.patient.updateMany({
          where: { attributionAffiliateId: affiliateId },
          data: {
            attributionAffiliateId: null,
            attributionRefCode: null,
            attributionFirstTouchAt: null,
          },
        });

        // 3. Unlink application if one exists (nullable FK)
        await tx.affiliateApplication.updateMany({
          where: { affiliateId },
          data: { affiliateId: null },
        });

        // 4. Delete the affiliate record
        await tx.affiliate.delete({ where: { id: affiliateId } });

        // 5. Clean up user-related records before deleting the user
        const userId = affiliate.userId;
        await tx.userSession.deleteMany({ where: { userId } });
        await tx.userAuditLog.deleteMany({ where: { userId } });
        await tx.passwordResetToken.deleteMany({ where: { userId } });
        await tx.emailVerificationToken.deleteMany({ where: { userId } });
        await tx.apiKey.deleteMany({ where: { userId } });
        await tx.userClinic.deleteMany({ where: { userId } });

        // 6. Delete the user
        await tx.user.delete({ where: { id: userId } });
      }, { timeout: 30000 });

      return NextResponse.json({
        success: true,
        message: 'Affiliate permanently deleted',
        softDeleted: false,
      });
    } catch (error) {
      logger.error('Failed to delete affiliate', {
        affiliateId: params.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json(
        { error: 'Failed to delete affiliate', details: error instanceof Error ? error.message : 'Unknown error' },
        { status: 500 }
      );
    }
  }
);
