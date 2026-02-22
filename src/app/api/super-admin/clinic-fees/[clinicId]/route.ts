import { NextRequest, NextResponse } from 'next/server';
import { basePrisma as prisma, runWithClinicContext } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import { platformFeeService } from '@/services/billing';
import { logger } from '@/lib/logger';

/**
 * Middleware to check for Super Admin role
 */
function withSuperAdminAuth(
  handler: (req: NextRequest, user: AuthUser, params: { clinicId: string }) => Promise<Response>
) {
  return async (req: NextRequest, context: { params: Promise<{ clinicId: string }> }) => {
    const params = await context.params;
    return withAuth((req: NextRequest, user: AuthUser) => handler(req, user, params), {
      roles: ['super_admin'],
    })(req);
  };
}

// Custom fee rule schema for complicated per-clinic logic
const customFeeRuleConditionSchema = z.object({
  field: z.enum([
    'feeType',
    'orderTotalCents',
    'medicationKey',
    'medName',
    'form',
    'rxCount',
    'providerType',
  ]),
  operator: z.enum([
    'eq',
    'neq',
    'gte',
    'lte',
    'gt',
    'lt',
    'in',
    'notIn',
    'contains',
    'startsWith',
    'endsWith',
  ]),
  value: z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]),
});

const customFeeRuleChargeSchema = z.object({
  type: z.enum(['FLAT', 'PERCENTAGE']),
  amountCents: z.number().int().min(0).optional(),
  basisPoints: z.number().int().min(0).max(10000).optional(),
  minCents: z.number().int().min(0).optional(),
  maxCents: z.number().int().min(0).optional(),
});

const customFeeRuleSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().max(255).optional(),
  priority: z.number().int().min(0),
  appliesTo: z.enum(['PRESCRIPTION', 'TRANSMISSION', 'BOTH']).optional(),
  conditions: z.array(customFeeRuleConditionSchema).min(0).max(50),
  action: z.enum(['WAIVE', 'CHARGE']),
  charge: customFeeRuleChargeSchema.optional(),
});

// Validation schema for fee configuration update
const feeConfigSchema = z.object({
  prescriptionFeeType: z.enum(['FLAT', 'PERCENTAGE']).optional(),
  prescriptionFeeAmount: z.number().int().min(0).max(1000000).optional(),
  transmissionFeeType: z.enum(['FLAT', 'PERCENTAGE']).optional(),
  transmissionFeeAmount: z.number().int().min(0).max(1000000).optional(),
  adminFeeType: z.enum(['NONE', 'FLAT_WEEKLY', 'PERCENTAGE_WEEKLY']).optional(),
  adminFeeAmount: z.number().int().min(0).max(1000000).optional(),
  prescriptionCycleDays: z.number().int().min(1).max(365).optional(),
  billingEmail: z.string().email().optional().nullable(),
  billingName: z.string().max(255).optional().nullable(),
  billingAddress: z.record(z.unknown()).optional().nullable(),
  paymentTermsDays: z.number().int().min(1).max(90).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().max(1000).optional().nullable(),
  customFeeRules: z.array(customFeeRuleSchema).max(100).optional().nullable(),
});

/**
 * GET /api/super-admin/clinic-fees/[clinicId]
 * Get fee configuration for a clinic
 */
export const GET = withSuperAdminAuth(
  async (req: NextRequest, user: AuthUser, params: { clinicId: string }) => {
    try {
      const clinicId = parseInt(params.clinicId);

      if (isNaN(clinicId)) {
        return NextResponse.json({ error: 'Invalid clinic ID' }, { status: 400 });
      }

      // Verify clinic exists
      const clinic = await prisma.clinic.findUnique({
        where: { id: clinicId },
        select: { id: true, name: true, adminEmail: true },
      });

      if (!clinic) {
        return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
      }

      return await runWithClinicContext(clinicId, async () => {
        // Get or create fee config (tenant-scoped prisma requires clinic context)
        const config = await platformFeeService.getOrCreateFeeConfig(clinicId, user.id);
        const summary = await platformFeeService.getFeeSummary(clinicId);
        return NextResponse.json({
          clinic,
          config,
          summary,
        });
      });
    } catch (error) {
      logger.error('[SuperAdmin] Error getting clinic fee config', {
        error: error instanceof Error ? error.message : 'Unknown error',
        clinicId: params.clinicId,
      });
      return NextResponse.json({ error: 'Failed to get fee configuration' }, { status: 500 });
    }
  }
);

/**
 * PUT /api/super-admin/clinic-fees/[clinicId]
 * Update fee configuration for a clinic
 */
export const PUT = withSuperAdminAuth(
  async (req: NextRequest, user: AuthUser, params: { clinicId: string }) => {
    try {
      const clinicId = parseInt(params.clinicId);

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

      // Validate request body
      const body = await req.json();
      const result = feeConfigSchema.safeParse(body);

      if (!result.success) {
        return NextResponse.json(
          { error: 'Validation failed', details: result.error.flatten() },
          { status: 400 }
        );
      }

      return await runWithClinicContext(clinicId, async () => {
        const config = await platformFeeService.updateFeeConfig(
          clinicId,
          result.data as Parameters<typeof platformFeeService.updateFeeConfig>[1],
          user.id
        );
        logger.info('[SuperAdmin] Updated clinic fee config', {
          clinicId,
          updatedBy: user.id,
          changes: result.data,
        });
        return NextResponse.json({
          success: true,
          config,
        });
      });
    } catch (error) {
      logger.error('[SuperAdmin] Error updating clinic fee config', {
        error: error instanceof Error ? error.message : 'Unknown error',
        clinicId: params.clinicId,
      });
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to update fee configuration' },
        { status: 500 }
      );
    }
  }
);

/**
 * DELETE /api/super-admin/clinic-fees/[clinicId]
 * Reset fee configuration to defaults
 */
export const DELETE = withSuperAdminAuth(
  async (req: NextRequest, user: AuthUser, params: { clinicId: string }) => {
    try {
      const clinicId = parseInt(params.clinicId);

      if (isNaN(clinicId)) {
        return NextResponse.json({ error: 'Invalid clinic ID' }, { status: 400 });
      }

      return await runWithClinicContext(clinicId, async () => {
        const existingConfig = await platformFeeService.getFeeConfig(clinicId);
        if (!existingConfig) {
          return NextResponse.json(
            { error: 'No fee configuration exists for this clinic' },
            { status: 404 }
          );
        }

        const pendingFees = await prisma.platformFeeEvent.count({
          where: {
            configId: existingConfig.id,
            status: { in: ['PENDING', 'INVOICED'] },
          },
        });

        if (pendingFees > 0) {
          return NextResponse.json(
            {
              error:
                'Cannot reset configuration with pending fees. Please process or void pending fees first.',
            },
            { status: 400 }
          );
        }

        const config = await platformFeeService.updateFeeConfig(
          clinicId,
          {
            prescriptionFeeType: 'FLAT',
            prescriptionFeeAmount: 2000,
            transmissionFeeType: 'FLAT',
            transmissionFeeAmount: 500,
            adminFeeType: 'NONE',
            adminFeeAmount: 0,
            prescriptionCycleDays: 90,
            paymentTermsDays: 30,
            isActive: true,
            notes: `Reset to defaults by user ${user.id} on ${new Date().toISOString()}`,
          },
          user.id
        );

        logger.info('[SuperAdmin] Reset clinic fee config to defaults', {
          clinicId,
          resetBy: user.id,
        });

        return NextResponse.json({
          success: true,
          config,
        });
      });
    } catch (error) {
      logger.error('[SuperAdmin] Error resetting clinic fee config', {
        error: error instanceof Error ? error.message : 'Unknown error',
        clinicId: params.clinicId,
      });
      return NextResponse.json({ error: 'Failed to reset fee configuration' }, { status: 500 });
    }
  }
);
