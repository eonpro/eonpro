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
import { sendEmail } from '@/lib/email';
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
        return NextResponse.json({ error: 'User with this email already exists' }, { status: 409 });
      }

      // Generate a temporary password (affiliate will set their own via email link)
      const tempPassword = crypto.randomBytes(32).toString('hex');
      const bcrypt = await import('bcryptjs');
      const passwordHash = await bcrypt.hash(tempPassword, 12);

      // Generate password setup token for welcome email
      const RESET_TOKEN_EXPIRY_HOURS = 72; // 3 days for initial setup
      const rawSetupToken = crypto.randomBytes(32).toString('hex');
      const hashedSetupToken = crypto.createHash('sha256').update(rawSetupToken).digest('hex');
      const setupTokenExpiresAt = new Date();
      setupTokenExpiresAt.setHours(setupTokenExpiresAt.getHours() + RESET_TOKEN_EXPIRY_HOURS);

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

        // Create password setup token (for welcome email)
        await tx.passwordResetToken.create({
          data: {
            userId: newUser.id,
            token: hashedSetupToken,
            expiresAt: setupTokenExpiresAt,
          },
        });

        return { user: newUser, affiliate: newAffiliate, refCode };
      }, { timeout: 15000 });

      logger.info('[Admin Applications] Application approved', {
        applicationId,
        affiliateId: result.affiliate.id,
        userId: result.user.id,
        clinicId: application.clinicId,
        approvedBy: user.id,
      });

      // HIPAA/SOC2 audit log for admin actions on affiliate data
      logger.security('[AffiliateAudit] Admin approved affiliate application', {
        action: 'AFFILIATE_APPLICATION_APPROVED',
        applicationId,
        affiliateId: result.affiliate.id,
        clinicId: application.clinicId,
        performedBy: user.id,
        performedByRole: user.role,
        applicantEmail: application.email,
      });

      // Send welcome email with password setup link
      // Resolve clinic branding for email
      const clinic = await prisma.clinic.findUnique({
        where: { id: application.clinicId },
        select: {
          name: true,
          subdomain: true,
          customDomain: true,
          logoUrl: true,
        },
      });

      // Build the setup URL using the clinic's domain
      const clinicDomain = clinic?.customDomain
        || (clinic?.subdomain ? `${clinic.subdomain}.eonpro.io` : null)
        || 'app.eonpro.io';
      const setupUrl = `https://${clinicDomain}/affiliate/welcome?token=${rawSetupToken}`;
      const clinicName = clinic?.name || 'EONPro';
      const logoUrl = clinic?.logoUrl;
      const logoHtml = logoUrl
        ? `<img src="${logoUrl}" alt="${clinicName}" style="height: 40px; max-width: 200px; object-fit: contain;" />`
        : `<h2 style="color: #1f2937; margin: 0;">${clinicName}</h2>`;

      sendEmail({
        to: application.email,
        subject: `Welcome to ${clinicName} Partner Program!`,
        html: `
          <div style="max-width: 480px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #374151;">
            <div style="text-align: center; padding: 32px 0 24px;">
              ${logoHtml}
            </div>
            <div style="background: #ffffff; border-radius: 16px; padding: 32px; border: 1px solid #e5e7eb;">
              <h1 style="font-size: 20px; font-weight: 600; color: #111827; margin: 0 0 8px;">
                Welcome, ${firstName}!
              </h1>
              <p style="font-size: 15px; line-height: 1.6; color: #4b5563; margin: 0 0 16px;">
                Your application to the <strong>${clinicName}</strong> Partner Program has been approved.
                To get started, set your password by clicking the button below.
              </p>
              ${result.refCode ? `
                <div style="background: #f9fafb; border-radius: 12px; padding: 16px; margin: 0 0 24px; text-align: center;">
                  <p style="font-size: 12px; color: #6b7280; margin: 0 0 4px;">Your referral code</p>
                  <p style="font-size: 24px; font-weight: 700; color: #111827; margin: 0; letter-spacing: 2px;">${result.refCode}</p>
                </div>
              ` : ''}
              <div style="text-align: center; margin: 24px 0;">
                <a href="${setupUrl}" style="
                  display: inline-block;
                  background: #111827;
                  color: #ffffff;
                  padding: 14px 32px;
                  border-radius: 12px;
                  text-decoration: none;
                  font-weight: 600;
                  font-size: 15px;
                ">
                  Set My Password
                </a>
              </div>
              <p style="font-size: 13px; line-height: 1.5; color: #6b7280; margin: 24px 0 0;">
                This link expires in 72 hours. After setting your password, you can log in to your Partner Portal at any time.
              </p>
            </div>
            <div style="text-align: center; padding: 24px 0;">
              <p style="font-size: 12px; color: #9ca3af; margin: 0;">
                Powered by <strong>EONPro</strong> • Partner Portal
              </p>
            </div>
          </div>
        `,
        clinicId: application.clinicId,
        sourceType: 'notification',
        sourceId: `affiliate-welcome-${result.affiliate.id}`,
      }).catch((err) => {
        logger.warn('[Admin Applications] Failed to send welcome email', {
          error: err instanceof Error ? err.message : 'Unknown error',
          affiliateId: result.affiliate.id,
          email: application.email,
        });
      });

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
