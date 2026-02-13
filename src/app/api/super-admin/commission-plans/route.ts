/**
 * Super Admin Commission Plans API
 *
 * GET  - List all commission plans across all clinics
 * POST - Create a new commission plan for a specific clinic
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { basePrisma } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * GET /api/super-admin/commission-plans
 * List all commission plans across all clinics
 */
export const GET = withAuth(
  async (req: NextRequest, user: AuthUser) => {
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
        orderBy: [{ clinicId: 'asc' }, { createdAt: 'desc' }],
      });

      return NextResponse.json({
        plans: plans.map((plan) => ({
          id: plan.id,
          name: plan.name,
          description: plan.description,
          planType: plan.planType,
          flatAmountCents: plan.flatAmountCents,
          percentBps: plan.percentBps,
          // Separate initial/recurring rates
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
          createdAt: plan.createdAt.toISOString(),
          clinicId: plan.clinicId,
          clinic: plan.clinic,
          assignmentCount: plan._count.assignments,
        })),
      });
    } catch (error) {
      logger.error('Failed to fetch commission plans', { error: error instanceof Error ? error.message : String(error) });

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isPrismaTableError =
        errorMessage.includes('does not exist') ||
        errorMessage.includes('relation') ||
        errorMessage.includes('P2021') ||
        errorMessage.includes('P2025');

      if (isPrismaTableError) {
        return NextResponse.json(
          {
            error: 'Database tables not found. Please run migrations.',
            details: 'Run: npx prisma migrate deploy',
            plans: [],
          },
          { status: 200 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to fetch commission plans', details: errorMessage },
        { status: 500 }
      );
    }
  },
  { roles: ['super_admin'] }
);

/**
 * POST /api/super-admin/commission-plans
 * Create a new commission plan
 */
export const POST = withAuth(
  async (req: NextRequest, user: AuthUser) => {
    try {
      const body = await req.json();
      const {
        clinicId,
        name,
        description,
        planType,
        flatAmountCents,
        percentBps,
        // Separate initial/recurring rates
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

      // Validate initial/recurring rates if provided
      const validateBps = (value: number | undefined, fieldName: string) => {
        if (value !== undefined && (value < 0 || value > 10000)) {
          return `${fieldName} must be between 0 and 10000 (100%)`;
        }
        return null;
      };

      const validationErrors = [
        validateBps(initialPercentBps, 'initialPercentBps'),
        validateBps(recurringPercentBps, 'recurringPercentBps'),
      ].filter(Boolean);

      if (validationErrors.length > 0) {
        return NextResponse.json({ error: validationErrors[0] }, { status: 400 });
      }

      const plan = await basePrisma.affiliateCommissionPlan.create({
        data: {
          clinicId,
          name,
          description: description || null,
          planType: planType as 'FLAT' | 'PERCENT',
          flatAmountCents: planType === 'FLAT' ? flatAmountCents : null,
          percentBps: planType === 'PERCENT' ? percentBps : null,
          // Separate initial/recurring rates
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

      return NextResponse.json(
        {
          success: true,
          plan,
        },
        { status: 201 }
      );
    } catch (error) {
      logger.error('Failed to create commission plan', { error: error instanceof Error ? error.message : String(error) });
      return NextResponse.json({ error: 'Failed to create commission plan' }, { status: 500 });
    }
  },
  { roles: ['super_admin'] }
);
