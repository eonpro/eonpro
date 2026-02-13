/**
 * Super Admin - Clinic Routing Configuration API
 *
 * GET  - Get routing configuration for a clinic
 * PUT  - Update routing configuration for a clinic
 */

import { NextRequest, NextResponse } from 'next/server';
import { withSuperAdminAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { providerRoutingService, providerCompensationService } from '@/services/provider';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const routingConfigSchema = z.object({
  routingEnabled: z.boolean().optional(),
  compensationEnabled: z.boolean().optional(),
  routingStrategy: z
    .enum(['STATE_LICENSE_MATCH', 'ROUND_ROBIN', 'MANUAL_ASSIGNMENT', 'PROVIDER_CHOICE'])
    .optional(),
  soapApprovalMode: z.enum(['REQUIRED', 'ADVISORY', 'DISABLED']).optional(),
  autoAssignOnPayment: z.boolean().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/super-admin/clinics/[id]/routing-config
 * Get routing configuration for a clinic
 */
async function handleGet(req: NextRequest, user: AuthUser, context: RouteContext) {
  try {
    const params = await context.params;
    const clinicId = parseInt(params.id, 10);

    if (isNaN(clinicId)) {
      return NextResponse.json({ error: 'Invalid clinic ID' }, { status: 400 });
    }

    // Verify clinic exists
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { id: true, name: true, subdomain: true },
    });

    if (!clinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    logger.info('[SUPER-ADMIN-ROUTING] Getting routing config', {
      userId: user.id,
      clinicId,
    });

    const config = await providerRoutingService.getRoutingConfig(clinicId);

    // Get compensation plans for this clinic
    const compensationPlans =
      await providerCompensationService.getClinicCompensationPlans(clinicId);

    return NextResponse.json({
      clinic: {
        id: clinic.id,
        name: clinic.name,
        subdomain: clinic.subdomain,
      },
      config: config
        ? {
            routingEnabled: config.routingEnabled,
            compensationEnabled: config.compensationEnabled,
            routingStrategy: config.routingStrategy,
            soapApprovalMode: config.soapApprovalMode,
            autoAssignOnPayment: config.autoAssignOnPayment,
            lastAssignedIndex: config.lastAssignedIndex,
            createdAt: config.createdAt,
            updatedAt: config.updatedAt,
          }
        : {
            routingEnabled: false,
            compensationEnabled: false,
            routingStrategy: 'PROVIDER_CHOICE',
            soapApprovalMode: 'ADVISORY',
            autoAssignOnPayment: false,
          },
      compensationPlans: compensationPlans.map((plan) => ({
        id: plan.id,
        providerId: plan.providerId,
        providerName: `${plan.provider.firstName} ${plan.provider.lastName}`,
        providerNpi: plan.provider.npi,
        flatRatePerScript: plan.flatRatePerScript,
        flatRateFormatted: `$${(plan.flatRatePerScript / 100).toFixed(2)}`,
        isActive: plan.isActive,
        effectiveFrom: plan.effectiveFrom,
      })),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[SUPER-ADMIN-ROUTING] Error getting routing config', {
      error: errorMessage,
      userId: user.id,
    });
    return NextResponse.json(
      { error: 'Failed to get routing configuration', details: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/super-admin/clinics/[id]/routing-config
 * Update routing configuration for a clinic
 */
async function handlePut(req: NextRequest, user: AuthUser, context: RouteContext) {
  try {
    const params = await context.params;
    const clinicId = parseInt(params.id, 10);

    if (isNaN(clinicId)) {
      return NextResponse.json({ error: 'Invalid clinic ID' }, { status: 400 });
    }

    // Verify clinic exists
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { id: true, name: true },
    });

    if (!clinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    const body = await req.json();
    const parsed = routingConfigSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.issues },
        { status: 400 }
      );
    }

    logger.info('[SUPER-ADMIN-ROUTING] Updating routing config', {
      userId: user.id,
      clinicId,
      config: parsed.data,
    });

    const config = await providerRoutingService.upsertRoutingConfig(clinicId, parsed.data, user.id);

    logger.info('[SUPER-ADMIN-ROUTING] Routing config updated', {
      clinicId,
      clinicName: clinic.name,
      config: {
        routingEnabled: config.routingEnabled,
        compensationEnabled: config.compensationEnabled,
        routingStrategy: config.routingStrategy,
      },
      updatedBy: user.id,
    });

    return NextResponse.json({
      success: true,
      message: 'Routing configuration updated',
      config: {
        routingEnabled: config.routingEnabled,
        compensationEnabled: config.compensationEnabled,
        routingStrategy: config.routingStrategy,
        soapApprovalMode: config.soapApprovalMode,
        autoAssignOnPayment: config.autoAssignOnPayment,
        updatedAt: config.updatedAt,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[SUPER-ADMIN-ROUTING] Error updating routing config', {
      error: errorMessage,
      userId: user.id,
    });
    return NextResponse.json(
      { error: 'Failed to update routing configuration', details: errorMessage },
      { status: 500 }
    );
  }
}

export const GET = withSuperAdminAuth(async (req: NextRequest, user: AuthUser) => {
  const context = { params: Promise.resolve({ id: '' }) };
  // Extract ID from URL
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  const clinicIdIndex = pathParts.indexOf('clinics') + 1;
  const clinicId = pathParts[clinicIdIndex];
  context.params = Promise.resolve({ id: clinicId });
  return handleGet(req, user, context);
});

export const PUT = withSuperAdminAuth(async (req: NextRequest, user: AuthUser) => {
  const context = { params: Promise.resolve({ id: '' }) };
  // Extract ID from URL
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  const clinicIdIndex = pathParts.indexOf('clinics') + 1;
  const clinicId = pathParts[clinicIdIndex];
  context.params = Promise.resolve({ id: clinicId });
  return handlePut(req, user, context);
});
