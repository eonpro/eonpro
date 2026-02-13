/**
 * Admin Commission Plan Detail API
 *
 * GET    /api/admin/commission-plans/[id] - Get commission plan details
 * PATCH  /api/admin/commission-plans/[id] - Update commission plan
 * DELETE /api/admin/commission-plans/[id] - Delete commission plan
 *
 * @security Super Admin or Admin only
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET - Get commission plan details
export const GET = withAuth(
  async (req: NextRequest, user: AuthUser, context?: RouteContext) => {
    try {
      const { id } = await context!.params;
      const planId = parseInt(id);

      if (isNaN(planId)) {
        return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
      }

      const plan = await prisma.affiliateCommissionPlan.findUnique({
        where: { id: planId },
        include: {
          _count: {
            select: { assignments: true },
          },
        },
      });

      if (!plan) {
        return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
      }

      // Verify access (clinic scoping)
      if (user.role !== 'super_admin' && plan.clinicId !== user.clinicId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      return NextResponse.json({
        plan: {
          id: plan.id,
          name: plan.name,
          description: plan.description,
          planType: plan.planType,
          flatAmountCents: plan.flatAmountCents,
          percentBps: plan.percentBps,
          initialPercentBps: plan.initialPercentBps,
          initialFlatAmountCents: plan.initialFlatAmountCents,
          recurringPercentBps: plan.recurringPercentBps,
          recurringFlatAmountCents: plan.recurringFlatAmountCents,
          appliesTo: plan.appliesTo,
          holdDays: plan.holdDays,
          clawbackEnabled: plan.clawbackEnabled,
          recurringEnabled: plan.recurringEnabled,
          recurringMonths: plan.recurringMonths,
          tierEnabled: plan.tierEnabled,
          isActive: plan.isActive,
          createdAt: plan.createdAt,
          updatedAt: plan.updatedAt,
          assignmentCount: plan._count.assignments,
        },
      });
    } catch (error) {
      logger.error('[Admin Commission Plan] Error getting plan', error);
      return NextResponse.json({ error: 'Failed to get plan' }, { status: 500 });
    }
  },
  { roles: ['super_admin', 'admin'] }
);

// PATCH - Update commission plan
export const PATCH = withAuth(
  async (req: NextRequest, user: AuthUser, context?: RouteContext) => {
    try {
      const { id } = await context!.params;
      const planId = parseInt(id);

      if (isNaN(planId)) {
        return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
      }

      // Find existing plan
      const existingPlan = await prisma.affiliateCommissionPlan.findUnique({
        where: { id: planId },
      });

      if (!existingPlan) {
        return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
      }

      // Verify access (clinic scoping)
      if (user.role !== 'super_admin' && existingPlan.clinicId !== user.clinicId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      const body = await req.json();
      const {
        name,
        description,
        planType,
        flatAmountCents,
        percentBps,
        initialPercentBps,
        initialFlatAmountCents,
        recurringPercentBps,
        recurringFlatAmountCents,
        appliesTo,
        holdDays,
        clawbackEnabled,
        recurringEnabled,
        recurringMonths,
        isActive,
      } = body;

      // Validate rates if provided
      const validateBps = (value: number | undefined | null, fieldName: string) => {
        if (value !== undefined && value !== null && (value < 0 || value > 10000)) {
          return `${fieldName} must be between 0 and 10000 (100%)`;
        }
        return null;
      };

      const validateCents = (value: number | undefined | null, fieldName: string) => {
        if (value !== undefined && value !== null && value < 0) {
          return `${fieldName} must be >= 0`;
        }
        return null;
      };

      const validationErrors = [
        validateBps(percentBps, 'percentBps'),
        validateBps(initialPercentBps, 'initialPercentBps'),
        validateBps(recurringPercentBps, 'recurringPercentBps'),
        validateCents(flatAmountCents, 'flatAmountCents'),
        validateCents(initialFlatAmountCents, 'initialFlatAmountCents'),
        validateCents(recurringFlatAmountCents, 'recurringFlatAmountCents'),
      ].filter(Boolean);

      if (validationErrors.length > 0) {
        return NextResponse.json({ error: validationErrors[0] }, { status: 400 });
      }

      // Build update data (only include fields that were provided)
      const updateData: Record<string, unknown> = {};

      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (planType !== undefined) updateData.planType = planType;
      if (flatAmountCents !== undefined) updateData.flatAmountCents = flatAmountCents;
      if (percentBps !== undefined) updateData.percentBps = percentBps;
      if (initialPercentBps !== undefined) updateData.initialPercentBps = initialPercentBps;
      if (initialFlatAmountCents !== undefined)
        updateData.initialFlatAmountCents = initialFlatAmountCents;
      if (recurringPercentBps !== undefined) updateData.recurringPercentBps = recurringPercentBps;
      if (recurringFlatAmountCents !== undefined)
        updateData.recurringFlatAmountCents = recurringFlatAmountCents;
      if (appliesTo !== undefined) updateData.appliesTo = appliesTo;
      if (holdDays !== undefined) updateData.holdDays = holdDays;
      if (clawbackEnabled !== undefined) updateData.clawbackEnabled = clawbackEnabled;
      if (recurringEnabled !== undefined) updateData.recurringEnabled = recurringEnabled;
      if (recurringMonths !== undefined) updateData.recurringMonths = recurringMonths;
      if (isActive !== undefined) updateData.isActive = isActive;

      const updatedPlan = await prisma.affiliateCommissionPlan.update({
        where: { id: planId },
        data: updateData,
      });

      logger.info('[Admin Commission Plan] Updated plan', {
        planId,
        updatedBy: user.id,
        changes: Object.keys(updateData),
      });

      return NextResponse.json({
        success: true,
        plan: updatedPlan,
      });
    } catch (error) {
      logger.error('[Admin Commission Plan] Error updating plan', error);
      return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 });
    }
  },
  { roles: ['super_admin', 'admin'] }
);

// DELETE - Delete commission plan
export const DELETE = withAuth(
  async (req: NextRequest, user: AuthUser, context?: RouteContext) => {
    try {
      const { id } = await context!.params;
      const planId = parseInt(id);

      if (isNaN(planId)) {
        return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
      }

      // Find existing plan
      const existingPlan = await prisma.affiliateCommissionPlan.findUnique({
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

      // Verify access (clinic scoping)
      if (user.role !== 'super_admin' && existingPlan.clinicId !== user.clinicId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      // Check if plan has active assignments
      if (existingPlan._count.assignments > 0) {
        // Option 1: Soft delete (mark inactive)
        await prisma.affiliateCommissionPlan.update({
          where: { id: planId },
          data: { isActive: false },
        });

        logger.info('[Admin Commission Plan] Soft-deleted plan (has assignments)', {
          planId,
          deletedBy: user.id,
          assignmentCount: existingPlan._count.assignments,
        });

        return NextResponse.json({
          success: true,
          message: 'Plan deactivated (has active assignments)',
          softDeleted: true,
        });
      }

      // Option 2: Hard delete (no assignments)
      await prisma.affiliateCommissionPlan.delete({
        where: { id: planId },
      });

      logger.info('[Admin Commission Plan] Deleted plan', {
        planId,
        deletedBy: user.id,
      });

      return NextResponse.json({
        success: true,
        message: 'Plan deleted',
      });
    } catch (error) {
      logger.error('[Admin Commission Plan] Error deleting plan', error);
      return NextResponse.json({ error: 'Failed to delete plan' }, { status: 500 });
    }
  },
  { roles: ['super_admin', 'admin'] }
);
