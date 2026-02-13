/**
 * Admin Affiliate Applications API
 *
 * GET /api/admin/affiliates/applications - List applications for clinic
 *
 * @security Super Admin or Admin only
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

// GET - List affiliate applications for clinic
export const GET = withAuth(
  async (req: NextRequest, user: AuthUser) => {
    try {
      const { searchParams } = new URL(req.url);
      const status = searchParams.get('status') as 'PENDING' | 'APPROVED' | 'REJECTED' | null;
      const page = parseInt(searchParams.get('page') || '1');
      const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
      const skip = (page - 1) * limit;

      const clinicId =
        user.role === 'super_admin'
          ? searchParams.get('clinicId')
            ? parseInt(searchParams.get('clinicId')!)
            : undefined
          : user.clinicId;

      if (!clinicId && user.role !== 'super_admin') {
        return NextResponse.json({ error: 'Clinic ID required' }, { status: 400 });
      }

      const where = {
        ...(clinicId ? { clinicId } : {}),
        ...(status ? { status } : {}),
      };

      const [applications, total] = await Promise.all([
        prisma.affiliateApplication.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: {
            affiliate: {
              select: {
                id: true,
                displayName: true,
                status: true,
              },
            },
          },
        }),
        prisma.affiliateApplication.count({ where }),
      ]);

      // Get status counts for filters
      const statusCounts = await prisma.affiliateApplication.groupBy({
        by: ['status'],
        where: clinicId ? { clinicId } : {},
        _count: true,
      });

      const counts = {
        PENDING: 0,
        APPROVED: 0,
        REJECTED: 0,
      };
      statusCounts.forEach((s: { status: string; _count: number }) => {
        counts[s.status as keyof typeof counts] = s._count;
      });

      return NextResponse.json({
        applications: applications.map((app: (typeof applications)[number]) => ({
          id: app.id,
          fullName: app.fullName,
          email: app.email,
          phone: app.phone,
          city: app.city,
          state: app.state,
          socialProfiles: app.socialProfiles,
          website: app.website,
          audienceSize: app.audienceSize,
          status: app.status,
          createdAt: app.createdAt,
          reviewedAt: app.reviewedAt,
          affiliate: app.affiliate,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        counts,
      });
    } catch (error) {
      logger.error('[Admin Applications] Error listing applications', error);
      return NextResponse.json({ error: 'Failed to list applications' }, { status: 500 });
    }
  },
  { roles: ['super_admin', 'admin'] }
);
