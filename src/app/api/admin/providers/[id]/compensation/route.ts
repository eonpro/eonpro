/**
 * Admin Provider Compensation API
 * 
 * GET  - Get compensation plan for a provider
 * PUT  - Create or update compensation plan for a provider
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { providerCompensationService, providerRoutingService } from '@/services/provider';
import { z } from 'zod';

const compensationTypeEnum = z.enum(['FLAT_RATE', 'PERCENTAGE', 'HYBRID']);

const compensationPlanSchema = z.object({
  compensationType: compensationTypeEnum.default('FLAT_RATE'),
  flatRatePerScript: z.number().int().min(0).max(100000).optional(), // Max $1000 per script (in cents)
  percentBps: z.number().int().min(0).max(10000).optional(), // Max 100% (in basis points)
  notes: z.string().optional(),
}).refine((data) => {
  // Validate that required fields are present based on compensation type
  if (data.compensationType === 'FLAT_RATE' || data.compensationType === 'HYBRID') {
    return data.flatRatePerScript !== undefined && data.flatRatePerScript >= 0;
  }
  return true;
}, { message: 'Flat rate is required for FLAT_RATE or HYBRID compensation types' })
.refine((data) => {
  if (data.compensationType === 'PERCENTAGE' || data.compensationType === 'HYBRID') {
    return data.percentBps !== undefined && data.percentBps >= 0;
  }
  return true;
}, { message: 'Percentage is required for PERCENTAGE or HYBRID compensation types' });

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/providers/[id]/compensation
 * Get compensation plan for a provider
 */
async function handleGet(
  req: NextRequest,
  user: AuthUser,
  context: RouteContext
) {
  try {
    const params = await context.params;
    const providerId = parseInt(params.id, 10);

    if (isNaN(providerId)) {
      return NextResponse.json(
        { error: 'Invalid provider ID' },
        { status: 400 }
      );
    }

    const clinicId = user.clinicId;
    
    if (!clinicId && user.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Admin must be associated with a clinic' },
        { status: 400 }
      );
    }

    // For super admin, need to determine which clinic's plan to fetch
    // They may pass clinicId as query param
    const { searchParams } = new URL(req.url);
    const queryClinicId = searchParams.get('clinicId');
    const effectiveClinicId = user.role === 'super_admin' && queryClinicId
      ? parseInt(queryClinicId, 10)
      : clinicId;

    if (!effectiveClinicId) {
      return NextResponse.json(
        { error: 'Clinic ID is required' },
        { status: 400 }
      );
    }

    logger.info('[ADMIN-COMPENSATION] Getting compensation plan', {
      userId: user.id,
      providerId,
      clinicId: effectiveClinicId,
    });

    // Check if compensation is enabled
    const config = await providerRoutingService.getRoutingConfig(effectiveClinicId);
    
    const plan = await providerCompensationService.getCompensationPlan(
      effectiveClinicId,
      providerId
    );

    // Get earnings summary for this provider
    const dateRange = providerCompensationService.getDateRange('month');
    const earnings = plan
      ? await providerCompensationService.getProviderEarnings(
          providerId,
          dateRange,
          effectiveClinicId
        )
      : null;

    return NextResponse.json({
      compensationEnabled: config?.compensationEnabled ?? false,
      plan: plan
        ? {
            id: plan.id,
            compensationType: plan.compensationType,
            flatRatePerScript: plan.flatRatePerScript,
            flatRateFormatted: `$${(plan.flatRatePerScript / 100).toFixed(2)}`,
            percentBps: plan.percentBps,
            percentFormatted: `${(plan.percentBps / 100).toFixed(2)}%`,
            effectiveFrom: plan.effectiveFrom,
            effectiveTo: plan.effectiveTo,
            isActive: plan.isActive,
            notes: plan.notes,
            createdAt: plan.createdAt,
            updatedAt: plan.updatedAt,
          }
        : null,
      currentMonthEarnings: earnings,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[ADMIN-COMPENSATION] Error getting compensation plan', {
      error: errorMessage,
      userId: user.id,
    });
    return NextResponse.json(
      { error: 'Failed to get compensation plan', details: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/providers/[id]/compensation
 * Create or update compensation plan for a provider
 */
async function handlePut(
  req: NextRequest,
  user: AuthUser,
  context: RouteContext
) {
  try {
    const params = await context.params;
    const providerId = parseInt(params.id, 10);

    if (isNaN(providerId)) {
      return NextResponse.json(
        { error: 'Invalid provider ID' },
        { status: 400 }
      );
    }

    const clinicId = user.clinicId;
    
    if (!clinicId && user.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Admin must be associated with a clinic' },
        { status: 400 }
      );
    }

    const body = await req.json();
    
    // Super admin can specify clinicId in body
    const effectiveClinicId = user.role === 'super_admin' && body.clinicId
      ? body.clinicId
      : clinicId;

    if (!effectiveClinicId) {
      return NextResponse.json(
        { error: 'Clinic ID is required' },
        { status: 400 }
      );
    }

    const parsed = compensationPlanSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { compensationType, flatRatePerScript, percentBps, notes } = parsed.data;

    logger.info('[ADMIN-COMPENSATION] Updating compensation plan', {
      userId: user.id,
      providerId,
      clinicId: effectiveClinicId,
      compensationType,
      flatRatePerScript,
      percentBps,
    });

    const plan = await providerCompensationService.upsertCompensationPlan(
      effectiveClinicId,
      providerId,
      {
        compensationType,
        flatRatePerScript,
        percentBps,
        notes,
      },
      user.id
    );

    logger.info('[ADMIN-COMPENSATION] Compensation plan updated', {
      planId: plan.id,
      providerId,
      clinicId: effectiveClinicId,
      compensationType: plan.compensationType,
      flatRatePerScript: plan.flatRatePerScript,
      percentBps: plan.percentBps,
      updatedBy: user.email,
    });

    return NextResponse.json({
      success: true,
      message: 'Compensation plan updated',
      plan: {
        id: plan.id,
        compensationType: plan.compensationType,
        flatRatePerScript: plan.flatRatePerScript,
        flatRateFormatted: `$${(plan.flatRatePerScript / 100).toFixed(2)}`,
        percentBps: plan.percentBps,
        percentFormatted: `${(plan.percentBps / 100).toFixed(2)}%`,
        effectiveFrom: plan.effectiveFrom,
        isActive: plan.isActive,
        notes: plan.notes,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[ADMIN-COMPENSATION] Error updating compensation plan', {
      error: errorMessage,
      userId: user.id,
    });
    return NextResponse.json(
      { error: 'Failed to update compensation plan', details: errorMessage },
      { status: 500 }
    );
  }
}

export const GET = withAdminAuth(
  (req: NextRequest, user: AuthUser, context?: unknown) => 
    handleGet(req, user, context as RouteContext)
);

export const PUT = withAdminAuth(
  (req: NextRequest, user: AuthUser, context?: unknown) => 
    handlePut(req, user, context as RouteContext)
);
