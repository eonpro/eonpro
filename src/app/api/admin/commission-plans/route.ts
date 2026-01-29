/**
 * Admin Commission Plans API
 * 
 * GET  /api/admin/commission-plans - List commission plans
 * POST /api/admin/commission-plans - Create new commission plan
 * 
 * @security Super Admin or Admin only
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

// GET - List commission plans
export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const { searchParams } = new URL(req.url);
    const clinicId = user.role === 'super_admin' 
      ? searchParams.get('clinicId') ? parseInt(searchParams.get('clinicId')!) : undefined
      : user.clinicId;

    if (!clinicId && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Clinic ID required' }, { status: 400 });
    }

    const plans = await prisma.affiliateCommissionPlan.findMany({
      where: clinicId ? { clinicId } : {},
      include: {
        _count: {
          select: { assignments: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({
      plans: plans.map((plan: typeof plans[number]) => ({
        id: plan.id,
        name: plan.name,
        description: plan.description,
        planType: plan.planType,
        flatAmountCents: plan.flatAmountCents,
        percentBps: plan.percentBps,
        // Initial/First payment commission rates
        initialPercentBps: plan.initialPercentBps,
        initialFlatAmountCents: plan.initialFlatAmountCents,
        // Recurring payment commission rates
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
      }))
    });

  } catch (error) {
    logger.error('[Admin Commission Plans] Error listing plans', error);
    return NextResponse.json({ error: 'Failed to list plans' }, { status: 500 });
  }
}, { roles: ['super_admin', 'admin'] });

// POST - Create new commission plan
export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const body = await req.json();
    const {
      clinicId: bodyClinicId,
      name,
      description,
      planType,
      flatAmountCents,
      percentBps,
      // New: Separate initial/recurring rates
      initialPercentBps,
      initialFlatAmountCents,
      recurringPercentBps,
      recurringFlatAmountCents,
      appliesTo,
      holdDays,
      clawbackEnabled,
      recurringEnabled,
      recurringMonths,
    } = body;

    // Determine clinic ID
    const clinicId = user.role === 'super_admin' && bodyClinicId
      ? bodyClinicId
      : user.clinicId;

    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic ID required' }, { status: 400 });
    }

    // Validate required fields
    if (!name || !planType) {
      return NextResponse.json({ 
        error: 'Name and planType are required' 
      }, { status: 400 });
    }

    // Validate plan type specific fields
    if (planType === 'FLAT' && (!flatAmountCents || flatAmountCents < 0)) {
      return NextResponse.json({ 
        error: 'flatAmountCents must be >= 0 for FLAT plan type' 
      }, { status: 400 });
    }

    if (planType === 'PERCENT') {
      if (percentBps === undefined || percentBps < 0 || percentBps > 10000) {
        return NextResponse.json({ 
          error: 'percentBps must be between 0 and 10000 (100%)' 
        }, { status: 400 });
      }
    }

    // Validate initial/recurring specific rates if provided
    const validateBps = (value: number | undefined, fieldName: string) => {
      if (value !== undefined && (value < 0 || value > 10000)) {
        return `${fieldName} must be between 0 and 10000 (100%)`;
      }
      return null;
    };

    const validateCents = (value: number | undefined, fieldName: string) => {
      if (value !== undefined && value < 0) {
        return `${fieldName} must be >= 0`;
      }
      return null;
    };

    // Validate new fields
    const validationErrors = [
      validateBps(initialPercentBps, 'initialPercentBps'),
      validateBps(recurringPercentBps, 'recurringPercentBps'),
      validateCents(initialFlatAmountCents, 'initialFlatAmountCents'),
      validateCents(recurringFlatAmountCents, 'recurringFlatAmountCents'),
    ].filter(Boolean);

    if (validationErrors.length > 0) {
      return NextResponse.json({ error: validationErrors[0] }, { status: 400 });
    }

    const plan = await prisma.affiliateCommissionPlan.create({
      data: {
        clinicId,
        name,
        description: description || null,
        planType: planType as 'FLAT' | 'PERCENT',
        flatAmountCents: planType === 'FLAT' ? flatAmountCents : null,
        percentBps: planType === 'PERCENT' ? percentBps : null,
        // Separate initial/recurring rates (optional)
        initialPercentBps: initialPercentBps ?? null,
        initialFlatAmountCents: initialFlatAmountCents ?? null,
        recurringPercentBps: recurringPercentBps ?? null,
        recurringFlatAmountCents: recurringFlatAmountCents ?? null,
        appliesTo: appliesTo || 'FIRST_PAYMENT_ONLY',
        holdDays: holdDays || 0,
        clawbackEnabled: clawbackEnabled || false,
        recurringEnabled: recurringEnabled || false,
        recurringMonths: recurringMonths ?? null,
        isActive: true,
      }
    });

    logger.info('[Admin Commission Plans] Created plan', {
      planId: plan.id,
      clinicId,
      name: plan.name,
      createdBy: user.id,
    });

    return NextResponse.json({
      success: true,
      plan,
    }, { status: 201 });

  } catch (error) {
    logger.error('[Admin Commission Plans] Error creating plan', error);
    return NextResponse.json({ error: 'Failed to create plan' }, { status: 500 });
  }
}, { roles: ['super_admin', 'admin'] });
