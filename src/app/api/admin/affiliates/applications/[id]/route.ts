/**
 * Admin Affiliate Application Detail API
 * 
 * GET /api/admin/affiliates/applications/[id] - Get application details
 * 
 * @security Super Admin or Admin only
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuthParams } from '@/lib/auth/middleware-with-params';
import type { AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET - Get application details
export const GET = withAuthParams(
  async (req: NextRequest, user: AuthUser, context: RouteContext) => {
    try {
      const { id } = await context.params;
      const applicationId = parseInt(id);

      if (isNaN(applicationId)) {
        return NextResponse.json({ error: 'Invalid application ID' }, { status: 400 });
      }

      const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

      const application = await prisma.affiliateApplication.findFirst({
        where: {
          id: applicationId,
          ...(clinicId ? { clinicId } : {}),
        },
        include: {
          clinic: {
            select: {
              id: true,
              name: true,
            },
          },
          affiliate: {
            select: {
              id: true,
              displayName: true,
              status: true,
              refCodes: {
                select: {
                  refCode: true,
                  isActive: true,
                },
              },
            },
          },
        },
      });

      if (!application) {
        return NextResponse.json({ error: 'Application not found' }, { status: 404 });
      }

      return NextResponse.json({
        application: {
          id: application.id,
          fullName: application.fullName,
          email: application.email,
          phone: application.phone,
          addressLine1: application.addressLine1,
          addressLine2: application.addressLine2,
          city: application.city,
          state: application.state,
          zipCode: application.zipCode,
          country: application.country,
          socialProfiles: application.socialProfiles,
          website: application.website,
          audienceSize: application.audienceSize,
          promotionPlan: application.promotionPlan,
          status: application.status,
          reviewedAt: application.reviewedAt,
          reviewedBy: application.reviewedBy,
          reviewNotes: application.reviewNotes,
          createdAt: application.createdAt,
          updatedAt: application.updatedAt,
          clinic: application.clinic,
          affiliate: application.affiliate,
        },
      });
    } catch (error) {
      logger.error('[Admin Applications] Error getting application', error);
      return NextResponse.json({ error: 'Failed to get application' }, { status: 500 });
    }
  },
  { roles: ['super_admin', 'admin'] }
);
