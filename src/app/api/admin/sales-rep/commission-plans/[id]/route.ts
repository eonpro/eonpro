/**
 * Admin Sales Rep Commission Plan Detail API
 *
 * GET    /api/admin/sales-rep/commission-plans/[id] - Get plan details
 * PATCH  /api/admin/sales-rep/commission-plans/[id] - Update plan
 * DELETE /api/admin/sales-rep/commission-plans/[id] - Delete plan
 *
 * @security Super Admin or Admin only
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, runWithClinicContext } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET - Get plan details
export const GET = withAuth(
  async (req: NextRequest, user: AuthUser, context?: RouteContext) => {
    try {
      const { id } = await context!.params;
      const planId = parseInt(id, 10);
      if (isNaN(planId)) {
        return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
      }

      // Use basePrisma for initial lookup to get clinicId (no tenant context yet)
      const { basePrisma } = await import('@/lib/db');
      const plan = await basePrisma.salesRepCommissionPlan.findUnique({
        where: { id: planId },
        include: { _count: { select: { assignments: true } } },
      });

      if (!plan) {
        return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
      }

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
          isActive: plan.isActive,
          createdAt: plan.createdAt,
          updatedAt: plan.updatedAt,
          assignmentCount: plan._count.assignments,
          multiItemBonusEnabled: plan.multiItemBonusEnabled,
          multiItemBonusType: plan.multiItemBonusType,
          multiItemBonusPercentBps: plan.multiItemBonusPercentBps,
          multiItemBonusFlatCents: plan.multiItemBonusFlatCents,
          multiItemMinQuantity: plan.multiItemMinQuantity,
        },
      });
    } catch (error) {
      logger.error('[Sales Rep Commission Plan GET]', error);
      return NextResponse.json({ error: 'Failed to get plan' }, { status: 500 });
    }
  },
  { roles: ['super_admin', 'admin'] }
);

// PATCH - Update plan
export const PATCH = withAuth(
  async (req: NextRequest, user: AuthUser, context?: RouteContext) => {
    try {
      const { id } = await context!.params;
      const planId = parseInt(id, 10);
      if (isNaN(planId)) {
        return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
      }

      const { basePrisma } = await import('@/lib/db');
      const existingPlan = await basePrisma.salesRepCommissionPlan.findUnique({
        where: { id: planId },
      });

      if (!existingPlan) {
        return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
      }

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
        multiItemBonusEnabled,
        multiItemBonusType,
        multiItemBonusPercentBps,
        multiItemBonusFlatCents,
        multiItemMinQuantity,
        productRules,
      } = body;

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
      if (multiItemBonusEnabled === true) {
        if (multiItemBonusType !== undefined && multiItemBonusType !== 'PERCENT' && multiItemBonusType !== 'FLAT') {
          return NextResponse.json(
            { error: 'multiItemBonusType must be PERCENT or FLAT when multi-item bonus is enabled' },
            { status: 400 }
          );
        }
        if (multiItemBonusType === 'PERCENT' && multiItemBonusPercentBps !== undefined) {
          const err = validateBps(multiItemBonusPercentBps, 'multiItemBonusPercentBps');
          if (err) return NextResponse.json({ error: err }, { status: 400 });
        }
        if (multiItemBonusType === 'FLAT' && multiItemBonusFlatCents !== undefined) {
          const err = validateCents(multiItemBonusFlatCents, 'multiItemBonusFlatCents');
          if (err) return NextResponse.json({ error: err }, { status: 400 });
        }
        if (multiItemMinQuantity !== undefined && multiItemMinQuantity !== null && (multiItemMinQuantity < 2 || multiItemMinQuantity > 99)) {
          return NextResponse.json(
            { error: 'multiItemMinQuantity must be between 2 and 99' },
            { status: 400 }
          );
        }
      }

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
      if (multiItemBonusEnabled !== undefined) {
        updateData.multiItemBonusEnabled = multiItemBonusEnabled;
        if (multiItemBonusEnabled === false) {
          updateData.multiItemBonusType = null;
          updateData.multiItemBonusPercentBps = null;
          updateData.multiItemBonusFlatCents = null;
          updateData.multiItemMinQuantity = null;
        }
      }
      if (multiItemBonusType !== undefined) updateData.multiItemBonusType = multiItemBonusType;
      if (multiItemBonusPercentBps !== undefined) updateData.multiItemBonusPercentBps = multiItemBonusPercentBps;
      if (multiItemBonusFlatCents !== undefined) updateData.multiItemBonusFlatCents = multiItemBonusFlatCents;
      if (multiItemMinQuantity !== undefined) updateData.multiItemMinQuantity = multiItemMinQuantity;

      const updatedPlan = await runWithClinicContext(existingPlan.clinicId, async () => {
        const plan = await prisma.salesRepCommissionPlan.update({
          where: { id: planId },
          data: updateData,
        });
        // Replace product/package commission rules if provided
        if (productRules !== undefined && Array.isArray(productRules)) {
          await prisma.salesRepProductCommission.deleteMany({ where: { planId } });
          for (const r of productRules) {
            const pid = r.productId != null ? Number(r.productId) : null;
            const pbid = r.productBundleId != null ? Number(r.productBundleId) : null;
            const bonusType = r.bonusType === 'FLAT' ? 'FLAT' : 'PERCENT';
            if ((pid == null && pbid == null) || (pid != null && pbid != null)) continue;
            if (bonusType === 'PERCENT') {
              const bps = r.percentBps != null ? Number(r.percentBps) : null;
              if (bps == null || bps < 0 || bps > 10000) continue;
            } else {
              const cents = r.flatAmountCents != null ? Number(r.flatAmountCents) : null;
              if (cents == null || cents < 0) continue;
            }
            await prisma.salesRepProductCommission.create({
              data: {
                planId,
                productId: pid ?? undefined,
                productBundleId: pbid ?? undefined,
                bonusType,
                percentBps: bonusType === 'PERCENT' ? Number(r.percentBps) : null,
                flatAmountCents: bonusType === 'FLAT' ? Number(r.flatAmountCents) : null,
              },
            });
          }
        }
        return plan;
      });

      logger.info('[Sales Rep Commission Plan] Updated plan', {
        planId,
        updatedBy: user.id,
        changes: Object.keys(updateData),
      });

      return NextResponse.json({ success: true, plan: updatedPlan });
    } catch (error) {
      logger.error('[Sales Rep Commission Plan PATCH]', error);
      return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 });
    }
  },
  { roles: ['super_admin', 'admin'] }
);

// DELETE - Delete or deactivate plan
export const DELETE = withAuth(
  async (req: NextRequest, user: AuthUser, context?: RouteContext) => {
    try {
      const { id } = await context!.params;
      const planId = parseInt(id, 10);
      if (isNaN(planId)) {
        return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
      }

      const { basePrisma } = await import('@/lib/db');
      const existingPlan = await basePrisma.salesRepCommissionPlan.findUnique({
        where: { id: planId },
        include: { _count: { select: { assignments: true } } },
      });

      if (!existingPlan) {
        return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
      }

      if (user.role !== 'super_admin' && existingPlan.clinicId !== user.clinicId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      if (existingPlan._count.assignments > 0) {
        await runWithClinicContext(existingPlan.clinicId, async () =>
          prisma.salesRepCommissionPlan.update({
            where: { id: planId },
            data: { isActive: false },
          })
        );
        logger.info('[Sales Rep Commission Plan] Soft-deleted plan (has assignments)', {
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

      await runWithClinicContext(existingPlan.clinicId, async () =>
        prisma.salesRepCommissionPlan.delete({
          where: { id: planId },
        })
      );

      logger.info('[Sales Rep Commission Plan] Deleted plan', { planId, deletedBy: user.id });
      return NextResponse.json({ success: true, message: 'Plan deleted' });
    } catch (error) {
      logger.error('[Sales Rep Commission Plan DELETE]', error);
      return NextResponse.json({ error: 'Failed to delete plan' }, { status: 500 });
    }
  },
  { roles: ['super_admin', 'admin'] }
);
