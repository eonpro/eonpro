/**
 * Admin Affiliate Detail API
 * 
 * GET    /api/admin/affiliates/[id] - Get affiliate details
 * PATCH  /api/admin/affiliates/[id] - Update affiliate
 * DELETE /api/admin/affiliates/[id] - Deactivate affiliate
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

// GET - Get affiliate details
export const GET = withAuthParams(async (req: NextRequest, user: AuthUser, context: RouteContext) => {
  try {
    const { id } = await context.params;
    const affiliateId = parseInt(id);

    if (isNaN(affiliateId)) {
      return NextResponse.json({ error: 'Invalid affiliate ID' }, { status: 400 });
    }

    const affiliate = await prisma.affiliate.findUnique({
      where: { id: affiliateId },
      include: {
        clinic: {
          select: {
            id: true,
            name: true,
          }
        },
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            lastLogin: true,
            status: true,
            createdAt: true,
          }
        },
        refCodes: {
          orderBy: { createdAt: 'desc' }
        },
        planAssignments: {
          include: {
            commissionPlan: true
          },
          orderBy: { effectiveFrom: 'desc' }
        },
      }
    });

    if (!affiliate) {
      return NextResponse.json({ error: 'Affiliate not found' }, { status: 404 });
    }

    // Check clinic access
    if (user.role !== 'super_admin' && user.clinicId !== affiliate.clinicId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get aggregated stats
    const stats = await prisma.affiliateCommissionEvent.groupBy({
      by: ['status'],
      where: { affiliateId },
      _sum: {
        commissionAmountCents: true,
        eventAmountCents: true,
      },
      _count: true,
    });

    const statsMap = stats.reduce((acc: Record<string, { count: number; commissionCents: number; revenueCents: number }>, s: typeof stats[number]) => {
      acc[s.status] = {
        count: s._count,
        commissionCents: s._sum.commissionAmountCents || 0,
        revenueCents: s._sum.eventAmountCents || 0,
      };
      return acc;
    }, {});

    return NextResponse.json({
      affiliate: {
        id: affiliate.id,
        displayName: affiliate.displayName,
        status: affiliate.status,
        createdAt: affiliate.createdAt,
        clinic: affiliate.clinic,
        user: affiliate.user,
        refCodes: affiliate.refCodes,
        planAssignments: affiliate.planAssignments,
        currentPlan: affiliate.planAssignments.find(
          (a: typeof affiliate.planAssignments[number]) => !a.effectiveTo || a.effectiveTo >= new Date()
        )?.commissionPlan || null,
      },
      stats: {
        pending: statsMap['PENDING'] || { count: 0, commissionCents: 0, revenueCents: 0 },
        approved: statsMap['APPROVED'] || { count: 0, commissionCents: 0, revenueCents: 0 },
        paid: statsMap['PAID'] || { count: 0, commissionCents: 0, revenueCents: 0 },
        reversed: statsMap['REVERSED'] || { count: 0, commissionCents: 0, revenueCents: 0 },
      }
    });

  } catch (error) {
    logger.error('[Admin Affiliates] Error getting affiliate', error);
    return NextResponse.json({ error: 'Failed to get affiliate' }, { status: 500 });
  }
}, { roles: ['super_admin', 'admin'] });

// PATCH - Update affiliate
export const PATCH = withAuthParams(async (req: NextRequest, user: AuthUser, context: RouteContext) => {
  try {
    const { id } = await context.params;
    const affiliateId = parseInt(id);
    const body = await req.json();

    if (isNaN(affiliateId)) {
      return NextResponse.json({ error: 'Invalid affiliate ID' }, { status: 400 });
    }

    const affiliate = await prisma.affiliate.findUnique({
      where: { id: affiliateId },
    });

    if (!affiliate) {
      return NextResponse.json({ error: 'Affiliate not found' }, { status: 404 });
    }

    // Check clinic access
    if (user.role !== 'super_admin' && user.clinicId !== affiliate.clinicId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { displayName, status } = body;

    const updated = await prisma.affiliate.update({
      where: { id: affiliateId },
      data: {
        ...(displayName && { displayName }),
        ...(status && { status }),
      },
      include: {
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
          }
        }
      }
    });

    logger.info('[Admin Affiliates] Updated affiliate', {
      affiliateId,
      changes: { displayName, status },
      updatedBy: user.id,
    });

    return NextResponse.json({
      success: true,
      affiliate: updated,
    });

  } catch (error) {
    logger.error('[Admin Affiliates] Error updating affiliate', error);
    return NextResponse.json({ error: 'Failed to update affiliate' }, { status: 500 });
  }
}, { roles: ['super_admin', 'admin'] });

// DELETE - Deactivate affiliate (soft delete)
export const DELETE = withAuthParams(async (req: NextRequest, user: AuthUser, context: RouteContext) => {
  try {
    const { id } = await context.params;
    const affiliateId = parseInt(id);

    if (isNaN(affiliateId)) {
      return NextResponse.json({ error: 'Invalid affiliate ID' }, { status: 400 });
    }

    const affiliate = await prisma.affiliate.findUnique({
      where: { id: affiliateId },
    });

    if (!affiliate) {
      return NextResponse.json({ error: 'Affiliate not found' }, { status: 404 });
    }

    // Check clinic access
    if (user.role !== 'super_admin' && user.clinicId !== affiliate.clinicId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Soft delete - set to INACTIVE
    await prisma.$transaction([
      prisma.affiliate.update({
        where: { id: affiliateId },
        data: { status: 'INACTIVE' }
      }),
      prisma.user.update({
        where: { id: affiliate.userId },
        data: { status: 'INACTIVE' }
      }),
      // Deactivate all ref codes
      prisma.affiliateRefCode.updateMany({
        where: { affiliateId },
        data: { isActive: false }
      })
    ]);

    logger.info('[Admin Affiliates] Deactivated affiliate', {
      affiliateId,
      deactivatedBy: user.id,
    });

    return NextResponse.json({
      success: true,
      message: 'Affiliate deactivated',
    });

  } catch (error) {
    logger.error('[Admin Affiliates] Error deactivating affiliate', error);
    return NextResponse.json({ error: 'Failed to deactivate affiliate' }, { status: 500 });
  }
}, { roles: ['super_admin', 'admin'] });
