/**
 * Admin Sales Rep Commission Plans API (dedicated area — separate from affiliates)
 *
 * GET  /api/admin/sales-rep/commission-plans - List sales rep commission plans
 * POST /api/admin/sales-rep/commission-plans - Create new plan
 *
 * @security Super Admin or Admin only
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma, runWithClinicContext } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

// GET - List sales rep commission plans
export const GET = withAuth(
  async (req: NextRequest, user: AuthUser) => {
    try {
      const { searchParams } = new URL(req.url);
      const clinicId =
        user.role === 'super_admin'
          ? searchParams.get('clinicId')
            ? parseInt(searchParams.get('clinicId')!, 10)
            : undefined
          : user.clinicId ?? undefined;

      if (!clinicId) {
        return NextResponse.json(
          { error: 'Clinic ID required', code: 'CLINIC_ID_REQUIRED' },
          { status: 400 }
        );
      }

      const plans = await runWithClinicContext(clinicId, async () =>
        prisma.salesRepCommissionPlan.findMany({
          where: { clinicId },
          include: {
            _count: {
              select: { assignments: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        })
      );

      return NextResponse.json({
        plans: plans.map((plan) => ({
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
          assignmentCount: plan._count.assignments,
          multiItemBonusEnabled: plan.multiItemBonusEnabled,
          multiItemBonusType: plan.multiItemBonusType,
          multiItemBonusPercentBps: plan.multiItemBonusPercentBps,
          multiItemBonusFlatCents: plan.multiItemBonusFlatCents,
          multiItemMinQuantity: plan.multiItemMinQuantity,
        })),
      });
    } catch (error) {
      const errorId = crypto.randomUUID().slice(0, 8);
      logger.error('[Sales Rep Commission Plans GET]', {
        error: error instanceof Error ? error.message : String(error),
        errorId,
        userId: user.id,
      });
      return NextResponse.json(
        { error: 'Failed to list plans', errorId, code: 'PLANS_LIST_ERROR' },
        { status: 500 }
      );
    }
  },
  { roles: ['super_admin', 'admin'] }
);

// POST - Create new sales rep commission plan
export const POST = withAuth(
  async (req: NextRequest, user: AuthUser) => {
    try {
      const body = await req.json();
      const {
        clinicId: bodyClinicId,
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
        multiItemBonusEnabled,
        multiItemBonusType,
        multiItemBonusPercentBps,
        multiItemBonusFlatCents,
        multiItemMinQuantity,
        productRules,
      } = body;

      const clinicId =
        user.role === 'super_admin' && bodyClinicId
          ? Number(bodyClinicId)
          : user.clinicId ?? undefined;

      if (!clinicId) {
        return NextResponse.json(
          { error: 'Clinic ID required', code: 'CLINIC_ID_REQUIRED' },
          { status: 400 }
        );
      }

      if (!name || !planType) {
        return NextResponse.json(
          { error: 'Name and planType are required', code: 'MISSING_REQUIRED_FIELDS' },
          { status: 400 }
        );
      }

      if (planType === 'FLAT' && (flatAmountCents == null || flatAmountCents < 0)) {
        return NextResponse.json(
          { error: 'flatAmountCents must be >= 0 for FLAT plan type', code: 'INVALID_FLAT_AMOUNT' },
          { status: 400 }
        );
      }

      if (planType === 'PERCENT') {
        if (
          percentBps === undefined ||
          percentBps === null ||
          percentBps < 0 ||
          percentBps > 10000
        ) {
          return NextResponse.json(
            {
              error: 'percentBps must be between 0 and 10000 (100%)',
              code: 'INVALID_PERCENT_BPS',
            },
            { status: 400 }
          );
        }
      }

      const validateBps = (value: number | undefined, fieldName: string) => {
        if (value !== undefined && value !== null && (value < 0 || value > 10000)) {
          return `${fieldName} must be between 0 and 10000 (100%)`;
        }
        return null;
      };
      const validateCents = (value: number | undefined, fieldName: string) => {
        if (value !== undefined && value !== null && value < 0) {
          return `${fieldName} must be >= 0`;
        }
        return null;
      };
      if (multiItemBonusEnabled) {
        if (multiItemBonusType !== 'PERCENT' && multiItemBonusType !== 'FLAT') {
          return NextResponse.json(
            { error: 'multiItemBonusType must be PERCENT or FLAT when multi-item bonus is enabled', code: 'INVALID_MULTI_ITEM_BONUS' },
            { status: 400 }
          );
        }
        if (multiItemBonusType === 'PERCENT') {
          const err = validateBps(multiItemBonusPercentBps, 'multiItemBonusPercentBps');
          if (err) {
            return NextResponse.json({ error: err }, { status: 400 });
          }
        } else {
          const err = validateCents(multiItemBonusFlatCents, 'multiItemBonusFlatCents');
          if (err) {
            return NextResponse.json({ error: err }, { status: 400 });
          }
        }
        if (multiItemMinQuantity !== undefined && multiItemMinQuantity !== null && (multiItemMinQuantity < 2 || multiItemMinQuantity > 99)) {
          return NextResponse.json(
            { error: 'multiItemMinQuantity must be between 2 and 99', code: 'INVALID_MULTI_ITEM_MIN' },
            { status: 400 }
          );
        }
      }

      const validationErrors = [
        validateBps(initialPercentBps, 'initialPercentBps'),
        validateBps(recurringPercentBps, 'recurringPercentBps'),
        validateCents(initialFlatAmountCents, 'initialFlatAmountCents'),
        validateCents(recurringFlatAmountCents, 'recurringFlatAmountCents'),
      ].filter(Boolean);

      if (validationErrors.length > 0) {
        return NextResponse.json(
          { error: validationErrors[0] as string },
          { status: 400 }
        );
      }

      const plan = await runWithClinicContext(clinicId, async () =>
        prisma.salesRepCommissionPlan.create({
          data: {
            clinicId,
            name,
            description: description ?? null,
            planType: planType as 'FLAT' | 'PERCENT',
            flatAmountCents: planType === 'FLAT' ? flatAmountCents : null,
            percentBps: planType === 'PERCENT' ? percentBps : null,
            initialPercentBps: initialPercentBps ?? null,
            initialFlatAmountCents: initialFlatAmountCents ?? null,
            recurringPercentBps: recurringPercentBps ?? null,
            recurringFlatAmountCents: recurringFlatAmountCents ?? null,
            appliesTo: appliesTo || 'FIRST_PAYMENT_ONLY',
            holdDays: holdDays ?? 0,
            clawbackEnabled: clawbackEnabled ?? false,
            recurringEnabled: recurringEnabled ?? false,
            recurringMonths: recurringMonths ?? null,
            isActive: true,
            multiItemBonusEnabled: multiItemBonusEnabled ?? false,
            multiItemBonusType: multiItemBonusEnabled ? multiItemBonusType ?? null : null,
            multiItemBonusPercentBps: multiItemBonusEnabled && multiItemBonusType === 'PERCENT' ? multiItemBonusPercentBps ?? null : null,
            multiItemBonusFlatCents: multiItemBonusEnabled && multiItemBonusType === 'FLAT' ? multiItemBonusFlatCents ?? null : null,
            multiItemMinQuantity: multiItemBonusEnabled ? (multiItemMinQuantity ?? 2) : null,
          },
        })
      );

      // Create product/package commission rules if provided
      const rules = Array.isArray(productRules) ? productRules : [];
      for (const r of rules) {
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
        await runWithClinicContext(clinicId, async () =>
          prisma.salesRepProductCommission.create({
            data: {
              planId: plan.id,
              productId: pid ?? undefined,
              productBundleId: pbid ?? undefined,
              bonusType,
              percentBps: bonusType === 'PERCENT' ? Number(r.percentBps) : null,
              flatAmountCents: bonusType === 'FLAT' ? Number(r.flatAmountCents) : null,
            },
          })
        );
      }

      logger.info('[Sales Rep Commission Plans] Created plan', {
        planId: plan.id,
        clinicId,
        name: plan.name,
        createdBy: user.id,
      });

      return NextResponse.json({ success: true, plan }, { status: 201 });
    } catch (error) {
      const errorId = crypto.randomUUID().slice(0, 8);
      logger.error('[Sales Rep Commission Plans POST]', {
        error: error instanceof Error ? error.message : String(error),
        errorId,
        userId: user.id,
      });
      return NextResponse.json(
        { error: 'Failed to create plan', errorId, code: 'PLAN_CREATE_ERROR' },
        { status: 500 }
      );
    }
  },
  { roles: ['super_admin', 'admin'] }
);
