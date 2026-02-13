/**
 * Super Admin Commission Plans API - Individual Plan Operations
 *
 * GET    /api/super-admin/commission-plans/[id] - Get plan details
 * PUT    /api/super-admin/commission-plans/[id] - Update plan
 * PATCH  /api/super-admin/commission-plans/[id] - Partial update (e.g., toggle active)
 * DELETE /api/super-admin/commission-plans/[id] - Delete plan
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { basePrisma } from '@/lib/db';
import { logger } from '@/lib/logger';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/super-admin/commission-plans/[id]
 * Get a single commission plan with full details
 */
export const GET = withAuth(
  async (req: NextRequest, user: AuthUser, context?: RouteContext) => {
    try {
      const { id } = await context!.params;
      const planId = parseInt(id);

      if (isNaN(planId)) {
        return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
      }

      const plan = await basePrisma.affiliateCommissionPlan.findUnique({
        where: { id: planId },
        include: {
          clinic: {
            select: {
              id: true,
              name: true,
              subdomain: true,
            },
          },
          assignments: {
            include: {
              affiliate: {
                select: {
                  id: true,
                  displayName: true,
                  user: {
                    select: {
                      email: true,
                    },
                  },
                },
              },
            },
          },
          _count: {
            select: { assignments: true },
          },
        },
      });

      if (!plan) {
        return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
      }

      return NextResponse.json({ plan });
    } catch (error) {
      logger.error('Failed to fetch commission plan', { error: error instanceof Error ? error.message : String(error) });
      return NextResponse.json({ error: 'Failed to fetch commission plan' }, { status: 500 });
    }
  },
  { roles: ['super_admin'] }
);

/**
 * PUT /api/super-admin/commission-plans/[id]
 * Full update of a commission plan
 */
export const PUT = withAuth(
  async (req: NextRequest, user: AuthUser, context?: RouteContext) => {
    try {
      const { id } = await context!.params;
      const planId = parseInt(id);

      if (isNaN(planId)) {
        return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
      }

      const body = await req.json();
      const {
        name,
        description,
        planType,
        flatAmountCents,
        percentBps,
        appliesTo,
        holdDays,
        clawbackEnabled,
      } = body;

      // Validate plan exists
      const existingPlan = await basePrisma.affiliateCommissionPlan.findUnique({
        where: { id: planId },
      });

      if (!existingPlan) {
        return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
      }

      // Validate required fields
      if (!name || !planType) {
        return NextResponse.json({ error: 'Name and plan type are required' }, { status: 400 });
      }

      // Validate plan type specific fields
      if (planType === 'FLAT' && (!flatAmountCents || flatAmountCents < 0)) {
        return NextResponse.json(
          { error: 'flatAmountCents must be >= 0 for FLAT plan type' },
          { status: 400 }
        );
      }

      if (planType === 'PERCENT') {
        if (percentBps === undefined || percentBps < 0 || percentBps > 10000) {
          return NextResponse.json(
            { error: 'percentBps must be between 0 and 10000 (100%)' },
            { status: 400 }
          );
        }
      }

      const plan = await basePrisma.affiliateCommissionPlan.update({
        where: { id: planId },
        data: {
          name,
          description: description || null,
          planType: planType as 'FLAT' | 'PERCENT',
          flatAmountCents: planType === 'FLAT' ? flatAmountCents : null,
          percentBps: planType === 'PERCENT' ? percentBps : null,
          appliesTo: appliesTo || 'FIRST_PAYMENT_ONLY',
          holdDays: holdDays ?? 0,
          clawbackEnabled: clawbackEnabled ?? false,
        },
        include: {
          clinic: {
            select: {
              id: true,
              name: true,
              subdomain: true,
            },
          },
        },
      });

      return NextResponse.json({
        success: true,
        plan,
      });
    } catch (error) {
      logger.error('Failed to update commission plan', { error: error instanceof Error ? error.message : String(error) });
      return NextResponse.json({ error: 'Failed to update commission plan' }, { status: 500 });
    }
  },
  { roles: ['super_admin'] }
);

/**
 * PATCH /api/super-admin/commission-plans/[id]
 * Partial update (e.g., toggle isActive)
 */
export const PATCH = withAuth(
  async (req: NextRequest, user: AuthUser, context?: RouteContext) => {
    try {
      const { id } = await context!.params;
      const planId = parseInt(id);

      if (isNaN(planId)) {
        return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
      }

      const body = await req.json();

      // Validate plan exists
      const existingPlan = await basePrisma.affiliateCommissionPlan.findUnique({
        where: { id: planId },
      });

      if (!existingPlan) {
        return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
      }

      // Only allow updating specific fields via PATCH
      const allowedFields = ['isActive', 'name', 'description', 'holdDays', 'clawbackEnabled'];
      const updateData: Record<string, any> = {};

      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          updateData[field] = body[field];
        }
      }

      if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
      }

      const plan = await basePrisma.affiliateCommissionPlan.update({
        where: { id: planId },
        data: updateData,
        include: {
          clinic: {
            select: {
              id: true,
              name: true,
              subdomain: true,
            },
          },
        },
      });

      return NextResponse.json({
        success: true,
        plan,
      });
    } catch (error) {
      logger.error('Failed to update commission plan', { error: error instanceof Error ? error.message : String(error) });
      return NextResponse.json({ error: 'Failed to update commission plan' }, { status: 500 });
    }
  },
  { roles: ['super_admin'] }
);

/**
 * DELETE /api/super-admin/commission-plans/[id]
 * Delete a commission plan
 */
export const DELETE = withAuth(
  async (req: NextRequest, user: AuthUser, context?: RouteContext) => {
    try {
      const { id } = await context!.params;
      const planId = parseInt(id);

      if (isNaN(planId)) {
        return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
      }

      // Validate plan exists
      const existingPlan = await basePrisma.affiliateCommissionPlan.findUnique({
        where: { id: planId },
        include: {
          _count: {
            select: { assignments: true },
          },
        },
      });

      if (!existingPlan) {
        return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
      }

      // Warn if plan has active assignments
      if (existingPlan._count.assignments > 0) {
        // Delete assignments first, then the plan
        await basePrisma.$transaction([
          basePrisma.affiliatePlanAssignment.deleteMany({
            where: { commissionPlanId: planId },
          }),
          basePrisma.affiliateCommissionPlan.delete({
            where: { id: planId },
          }),
        ]);
      } else {
        await basePrisma.affiliateCommissionPlan.delete({
          where: { id: planId },
        });
      }

      return NextResponse.json({
        success: true,
        message: 'Plan deleted successfully',
      });
    } catch (error) {
      logger.error('Failed to delete commission plan', { error: error instanceof Error ? error.message : String(error) });
      return NextResponse.json({ error: 'Failed to delete commission plan' }, { status: 500 });
    }
  },
  { roles: ['super_admin'] }
);
