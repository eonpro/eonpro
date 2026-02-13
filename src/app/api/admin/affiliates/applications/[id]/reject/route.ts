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

      // TODO: Send rejection email/SMS to applicant (optionally with reason)

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
