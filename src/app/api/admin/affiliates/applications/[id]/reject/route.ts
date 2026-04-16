/**
 * Admin Affiliate Application Reject API
 *
 * POST /api/admin/affiliates/applications/[id]/reject - Reject application
 *
 * @security Super Admin or Admin only
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuthParams } from '@/lib/auth/middleware-with-params';
import type { AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { z } from 'zod';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const rejectSchema = z.object({
  reviewNotes: z.string().max(1000).optional(),
  reason: z.string().max(500).optional(), // User-facing reason
});

// POST - Reject application
export const POST = withAuthParams(
  async (req: NextRequest, user: AuthUser, context: RouteContext) => {
    try {
      const { id } = await context.params;
      const applicationId = parseInt(id);

      if (isNaN(applicationId)) {
        return NextResponse.json({ error: 'Invalid application ID' }, { status: 400 });
      }

      const body = await req.json();
      const validationResult = rejectSchema.safeParse(body);

      if (!validationResult.success) {
        return NextResponse.json(
          { error: 'Validation failed', errors: validationResult.error.errors },
          { status: 400 }
        );
      }

      const { reviewNotes, reason } = validationResult.data;

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

      // Update application status
      await prisma.affiliateApplication.update({
        where: { id: applicationId },
        data: {
          status: 'REJECTED',
          reviewedAt: new Date(),
          reviewedBy: user.id,
          reviewNotes: reviewNotes || reason || null,
        },
      });

      logger.info('[Admin Applications] Application rejected', {
        applicationId,
        clinicId: application.clinicId,
        rejectedBy: user.id,
      });

      // HIPAA/SOC2 audit log for admin actions on affiliate data
      logger.security('[AffiliateAudit] Admin rejected affiliate application', {
        action: 'AFFILIATE_APPLICATION_REJECTED',
        applicationId,
        clinicId: application.clinicId,
        performedBy: user.id,
        performedByRole: user.role,
        applicantEmail: application.email,
      });

      // Send rejection email to applicant (fire-and-forget)
      if (application.email) {
        import('@/lib/email')
          .then(({ sendTemplatedEmail }) =>
            sendTemplatedEmail({
              to: application.email,
              template: 'GENERIC' as any,
              subject: 'Application Update',
              data: {
                heading: 'Application Update',
                body: reason
                  ? `Thank you for your interest in our affiliate program. Unfortunately, we are unable to approve your application at this time. Reason: ${reason}`
                  : 'Thank you for your interest in our affiliate program. Unfortunately, we are unable to approve your application at this time. You are welcome to reapply in the future.',
              },
            })
          )
          .catch((err) =>
            logger.error('[Admin Applications] Failed to send rejection email', {
              error: err instanceof Error ? err.message : 'Unknown',
              applicationId,
            })
          );
      }

      return NextResponse.json({
        success: true,
        message: 'Application rejected',
      });
    } catch (error) {
      logger.error('[Admin Applications] Error rejecting application', error);
      return NextResponse.json({ error: 'Failed to reject application' }, { status: 500 });
    }
  },
  { roles: ['super_admin', 'admin'] }
);
