/**
 * Admin Affiliate Application Approve API
 * 
 * POST /api/admin/affiliates/applications/[id]/approve - Approve application and create affiliate
 * 
 * @security Super Admin or Admin only
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, Prisma } from '@/lib/db';
import { withAuthParams } from '@/lib/auth/middleware-with-params';
import type { AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import crypto from 'crypto';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const approveSchema = z.object({
  commissionPlanId: z.number().optional(),
  initialRefCode: z.string().min(3).max(50).optional(),
  reviewNotes: z.string().max(1000).optional(),
});

// POST - Approve application and create affiliate
export const POST = withAuthParams(
  async (req: NextRequest, user: AuthUser, context: RouteContext) => {
    try {
      const { id } = await context.params;
      const applicationId = parseInt(id);

      if (isNaN(applicationId)) {
        return NextResponse.json({ error: 'Invalid application ID' }, { status: 400 });
      }

      const body = await req.json();
      const validationResult = approveSchema.safeParse(body);
      
      if (!validationResult.success) {
        return NextResponse.json(
          { error: 'Validation failed', errors: validationResult.error.errors },
          { status: 400 }
        );
      }

      const { commissionPlanId, initialRefCode, reviewNotes } = validationResult.data;

      const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

      // Find the application
      const application = await prisma.affiliateApplication.findFirst({
        where: {
          id: applicationId,
          ...(clinicId ? { clinicId } : {}),
        },
      });

      if (!application) {
        return NextResponse.json({ error: 'Application not found' }, { status: 404 });
      }

      if (application.status !== 'PENDING') {
        return NextResponse.json(
          { error: `Application has already been ${application.status.toLowerCase()}` },
          { status: 400 }
        );
      }

      // Check if ref code is available (if provided)
      if (initialRefCode) {
        const existingRefCode = await prisma.affiliateRefCode.findUnique({
          where: {
            clinicId_refCode: {
              clinicId: application.clinicId,
              refCode: initialRefCode.toUpperCase(),
            },
          },
        });

        if (existingRefCode) {
          return NextResponse.json(
            { error: 'Ref code already exists in this clinic' },
            { status: 409 }
          );
        }
      }

      // Check if email already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: application.email },
      });

      if (existingUser) {
        return NextResponse.json(
          { error: 'User with this email already exists' },
          { status: 409 }
        );
      }

      // Generate a temporary password (affiliate will use phone auth)
      const tempPassword = crypto.randomBytes(16).toString('hex');
      const bcrypt = await import('bcryptjs');
      const passwordHash = await bcrypt.hash(tempPassword, 12);

      // Parse name
      const nameParts = application.fullName.trim().split(/\s+/);
      const firstName = nameParts[0] || 'Affiliate';
      const lastName = nameParts.slice(1).join(' ') || '';

      // Create user, affiliate, and update application in transaction
      const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Create user account
        const newUser = await tx.user.create({
          data: {
            email: application.email,
            phone: application.phone,
            passwordHash,
            firstName,
            lastName,
            role: 'AFFILIATE',
            clinicId: application.clinicId,
            status: 'ACTIVE',
          },
        });

        // Create affiliate profile with address in metadata
        const newAffiliate = await tx.affiliate.create({
          data: {
            clinicId: application.clinicId,
            userId: newUser.id,
            displayName: application.fullName,
            status: 'ACTIVE',
            metadata: {
              address: {
                line1: application.addressLine1,
                line2: application.addressLine2,
                city: application.city,
                state: application.state,
                zipCode: application.zipCode,
                country: application.country,
              },
              socialProfiles: application.socialProfiles,
              website: application.website,
              audienceSize: application.audienceSize,
              promotionPlan: application.promotionPlan,
              appliedAt: application.createdAt,
            },
          },
        });

        // Generate ref code if not provided
        const refCode = initialRefCode?.toUpperCase() || generateRefCode(application.fullName);

        // Create initial ref code
        await tx.affiliateRefCode.create({
          data: {
            clinicId: application.clinicId,
            affiliateId: newAffiliate.id,
            refCode,
            isActive: true,
          },
        });

        // Assign commission plan if provided
        if (commissionPlanId) {
          await tx.affiliatePlanAssignment.create({
            data: {
              clinicId: application.clinicId,
              affiliateId: newAffiliate.id,
              commissionPlanId,
              effectiveFrom: new Date(),
            },
          });
        }

        // Update application status
        await tx.affiliateApplication.update({
          where: { id: applicationId },
          data: {
            status: 'APPROVED',
            reviewedAt: new Date(),
            reviewedBy: user.id,
            reviewNotes,
            affiliateId: newAffiliate.id,
          },
        });

        return { user: newUser, affiliate: newAffiliate, refCode };
      });

      logger.info('[Admin Applications] Application approved', {
        applicationId,
        affiliateId: result.affiliate.id,
        userId: result.user.id,
        clinicId: application.clinicId,
        approvedBy: user.id,
      });

      // TODO: Send welcome email/SMS to affiliate

      return NextResponse.json({
        success: true,
        message: 'Application approved successfully',
        affiliate: {
          id: result.affiliate.id,
          displayName: result.affiliate.displayName,
          email: result.user.email,
          refCode: result.refCode,
        },
      });
    } catch (error) {
      logger.error('[Admin Applications] Error approving application', error);
      return NextResponse.json({ error: 'Failed to approve application' }, { status: 500 });
    }
  },
  { roles: ['super_admin', 'admin'] }
);

/**
 * Generate a ref code from the affiliate's name
 */
function generateRefCode(fullName: string): string {
  const base = fullName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .substring(0, 6);
  
  const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${base}${suffix}`;
}
