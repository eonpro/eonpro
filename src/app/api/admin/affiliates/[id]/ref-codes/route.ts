/**
 * Admin Affiliate Ref Codes API
 *
 * GET  /api/admin/affiliates/[id]/ref-codes - List ref codes
 * POST /api/admin/affiliates/[id]/ref-codes - Add new ref code
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

// GET - List ref codes for affiliate
export const GET = withAuthParams(
  async (req: NextRequest, user: AuthUser, context: RouteContext) => {
    try {
      const { id } = await context.params;
      const affiliateId = parseInt(id);

      if (isNaN(affiliateId)) {
        return NextResponse.json({ error: 'Invalid affiliate ID' }, { status: 400 });
      }

      const affiliate = await prisma.affiliate.findUnique({
        where: { id: affiliateId },
        select: { clinicId: true },
      });

      if (!affiliate) {
        return NextResponse.json({ error: 'Affiliate not found' }, { status: 404 });
      }

      // Check clinic access
      if (user.role !== 'super_admin' && user.clinicId !== affiliate.clinicId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      const refCodes = await prisma.affiliateRefCode.findMany({
        where: { affiliateId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      return NextResponse.json({ refCodes });
    } catch (error) {
      logger.error('[Admin Affiliates] Error listing ref codes', error);
      return NextResponse.json({ error: 'Failed to list ref codes' }, { status: 500 });
    }
  },
  { roles: ['super_admin', 'admin'] }
);

// POST - Create new ref code
export const POST = withAuthParams(
  async (req: NextRequest, user: AuthUser, context: RouteContext) => {
    try {
      const { id } = await context.params;
      const affiliateId = parseInt(id);
      const body = await req.json();

      if (isNaN(affiliateId)) {
        return NextResponse.json({ error: 'Invalid affiliate ID' }, { status: 400 });
      }

      const { refCode, description } = body;

      if (!refCode) {
        return NextResponse.json({ error: 'Ref code is required' }, { status: 400 });
      }

      const affiliate = await prisma.affiliate.findUnique({
        where: { id: affiliateId },
        select: { clinicId: true },
      });

      if (!affiliate) {
        return NextResponse.json({ error: 'Affiliate not found' }, { status: 404 });
      }

      // Check clinic access
      if (user.role !== 'super_admin' && user.clinicId !== affiliate.clinicId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      // Check uniqueness
      const existing = await prisma.affiliateRefCode.findUnique({
        where: {
          clinicId_refCode: {
            clinicId: affiliate.clinicId,
            refCode: refCode.toUpperCase(),
          },
        },
      });

      if (existing) {
        return NextResponse.json(
          {
            error: 'Ref code already exists in this clinic',
          },
          { status: 409 }
        );
      }

      const newRefCode = await prisma.affiliateRefCode.create({
        data: {
          clinicId: affiliate.clinicId,
          affiliateId,
          refCode: refCode.toUpperCase(),
          description,
          isActive: true,
        },
      });

      logger.info('[Admin Affiliates] Created ref code', {
        refCodeId: newRefCode.id,
        affiliateId,
        refCode: newRefCode.refCode,
        createdBy: user.id,
      });

      return NextResponse.json(
        {
          success: true,
          refCode: newRefCode,
        },
        { status: 201 }
      );
    } catch (error) {
      logger.error('[Admin Affiliates] Error creating ref code', error);
      return NextResponse.json({ error: 'Failed to create ref code' }, { status: 500 });
    }
  },
  { roles: ['super_admin', 'admin'] }
);
