/**
 * Super Admin Commission Plans API
 * 
 * GET  - List all commission plans across all clinics
 * POST - Create a new commission plan for a specific clinic
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { basePrisma } from '@/lib/db';

/**
 * GET /api/super-admin/commission-plans
 * List all commission plans across all clinics
 */
export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const plans = await basePrisma.affiliateCommissionPlan.findMany({
      include: {
        clinic: {
          select: {
            id: true,
            name: true,
            subdomain: true,
          },
        },
        _count: {
          select: { assignments: true },
        },
      },
      orderBy: [
        { clinicId: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    return NextResponse.json({
      plans: plans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        description: plan.description,
        planType: plan.planType,
        flatAmountCents: plan.flatAmountCents,
        percentBps: plan.percentBps,
        appliesTo: plan.appliesTo,
        holdDays: plan.holdDays,
        clawbackEnabled: plan.clawbackEnabled,
        isActive: plan.isActive,
        createdAt: plan.createdAt.toISOString(),
        clinicId: plan.clinicId,
        clinic: plan.clinic,
        assignmentCount: plan._count.assignments,
      })),
    });
  } catch (error) {
    console.error('Failed to fetch commission plans:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isPrismaTableError = errorMessage.includes('does not exist') || 
                               errorMessage.includes('relation') ||
                               errorMessage.includes('P2021') ||
                               errorMessage.includes('P2025');
    
    if (isPrismaTableError) {
      return NextResponse.json({
        error: 'Database tables not found. Please run migrations.',
        details: 'Run: npx prisma migrate deploy',
        plans: [],
      }, { status: 200 });
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch commission plans', details: errorMessage },
      { status: 500 }
    );
  }
}, { roles: ['super_admin'] });

/**
 * POST /api/super-admin/commission-plans
 * Create a new commission plan
 */
export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const body = await req.json();
    const {
      clinicId,
      name,
      description,
      planType,
      flatAmountCents,
      percentBps,
      appliesTo,
      holdDays,
      clawbackEnabled,
    } = body;

    // Validate required fields
    if (!clinicId || !name || !planType) {
      return NextResponse.json(
        { error: 'Clinic ID, name, and plan type are required' },
        { status: 400 }
      );
    }

    // Validate clinic exists
    const clinic = await basePrisma.clinic.findUnique({
      where: { id: clinicId },
    });

    if (!clinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
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

    const plan = await basePrisma.affiliateCommissionPlan.create({
      data: {
        clinicId,
        name,
        description: description || null,
        planType: planType as 'FLAT' | 'PERCENT',
        flatAmountCents: planType === 'FLAT' ? flatAmountCents : null,
        percentBps: planType === 'PERCENT' ? percentBps : null,
        appliesTo: appliesTo || 'FIRST_PAYMENT_ONLY',
        holdDays: holdDays || 0,
        clawbackEnabled: clawbackEnabled || false,
        isActive: true,
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
    }, { status: 201 });
  } catch (error) {
    console.error('Failed to create commission plan:', error);
    return NextResponse.json(
      { error: 'Failed to create commission plan' },
      { status: 500 }
    );
  }
}, { roles: ['super_admin'] });
