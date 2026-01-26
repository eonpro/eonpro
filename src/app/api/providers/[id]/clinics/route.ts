/**
 * Provider Clinics API
 * ====================
 *
 * ENTERPRISE: Endpoints for managing provider multi-clinic assignments
 * Follows the UserClinic pattern for consistent multi-tenant architecture.
 *
 * @module api/providers/[id]/clinics
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { providerService, type UserContext } from '@/domains/provider';
import { handleApiError } from '@/domains/shared/errors';
import { logger } from '@/lib/logger';
import { z } from 'zod';

// Validation schema for clinic assignment
const assignClinicSchema = z.object({
  clinicId: z.number().int().positive(),
  isPrimary: z.boolean().optional(),
  titleLine: z.string().optional(),
  deaNumber: z.string().optional(),
  licenseNumber: z.string().optional(),
  licenseState: z.string().optional(),
});

// Validation schema for setting primary clinic
const setPrimarySchema = z.object({
  clinicId: z.number().int().positive(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/providers/[id]/clinics
 * List all clinics a provider is assigned to
 *
 * Returns clinic assignments with metadata (titleLine, DEA, license per clinic)
 */
export const GET = withAuth(
  async (req: NextRequest, user: AuthUser, context: RouteContext) => {
    try {
      const { id } = await context.params;
      const providerId = parseInt(id, 10);

      if (isNaN(providerId)) {
        return NextResponse.json({ error: 'Invalid provider ID' }, { status: 400 });
      }

      const userContext: UserContext = {
        id: user.id,
        email: user.email,
        role: user.role as UserContext['role'],
        clinicId: user.clinicId,
        patientId: user.patientId,
        providerId: user.providerId,
      };

      const clinics = await providerService.getProviderClinics(providerId, userContext);

      return NextResponse.json({
        providerId,
        clinics,
        count: clinics.length,
      });
    } catch (error) {
      return handleApiError(error, {
        context: { route: 'GET /api/providers/[id]/clinics' },
      });
    }
  },
  { roles: ['admin', 'super_admin', 'provider'] }
);

/**
 * POST /api/providers/[id]/clinics
 * Assign a provider to a clinic
 *
 * Request body:
 * - clinicId: number (required)
 * - isPrimary: boolean (optional)
 * - titleLine: string (optional) - clinic-specific title
 * - deaNumber: string (optional) - clinic-specific DEA
 * - licenseNumber: string (optional) - clinic-specific license
 * - licenseState: string (optional) - license state
 */
export const POST = withAuth(
  async (req: NextRequest, user: AuthUser, context: RouteContext) => {
    try {
      const { id } = await context.params;
      const providerId = parseInt(id, 10);

      if (isNaN(providerId)) {
        return NextResponse.json({ error: 'Invalid provider ID' }, { status: 400 });
      }

      const body = await req.json();
      const parsed = assignClinicSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid request body', details: parsed.error.issues },
          { status: 400 }
        );
      }

      const { clinicId, ...metadata } = parsed.data;

      const userContext: UserContext = {
        id: user.id,
        email: user.email,
        role: user.role as UserContext['role'],
        clinicId: user.clinicId,
        patientId: user.patientId,
        providerId: user.providerId,
      };

      const result = await providerService.assignToClinic(
        providerId,
        clinicId,
        metadata,
        userContext
      );

      logger.info('[API] Provider assigned to clinic', {
        providerId,
        clinicId,
        actor: user.email,
      });

      return NextResponse.json({
        success: true,
        assignment: result,
      });
    } catch (error) {
      return handleApiError(error, {
        context: { route: 'POST /api/providers/[id]/clinics' },
      });
    }
  },
  { roles: ['admin', 'super_admin'] }
);

/**
 * DELETE /api/providers/[id]/clinics
 * Remove a provider from a clinic
 *
 * Query params:
 * - clinicId: number (required)
 */
export const DELETE = withAuth(
  async (req: NextRequest, user: AuthUser, context: RouteContext) => {
    try {
      const { id } = await context.params;
      const providerId = parseInt(id, 10);

      if (isNaN(providerId)) {
        return NextResponse.json({ error: 'Invalid provider ID' }, { status: 400 });
      }

      const url = new URL(req.url);
      const clinicIdParam = url.searchParams.get('clinicId');

      if (!clinicIdParam) {
        return NextResponse.json({ error: 'clinicId query parameter required' }, { status: 400 });
      }

      const clinicId = parseInt(clinicIdParam, 10);
      if (isNaN(clinicId)) {
        return NextResponse.json({ error: 'Invalid clinic ID' }, { status: 400 });
      }

      const userContext: UserContext = {
        id: user.id,
        email: user.email,
        role: user.role as UserContext['role'],
        clinicId: user.clinicId,
        patientId: user.patientId,
        providerId: user.providerId,
      };

      await providerService.removeFromClinic(providerId, clinicId, userContext);

      logger.info('[API] Provider removed from clinic', {
        providerId,
        clinicId,
        actor: user.email,
      });

      return NextResponse.json({
        success: true,
        providerId,
        clinicId,
        message: 'Provider removed from clinic',
      });
    } catch (error) {
      return handleApiError(error, {
        context: { route: 'DELETE /api/providers/[id]/clinics' },
      });
    }
  },
  { roles: ['admin', 'super_admin'] }
);

/**
 * PATCH /api/providers/[id]/clinics
 * Set a clinic as the provider's primary clinic
 *
 * Request body:
 * - clinicId: number (required)
 */
export const PATCH = withAuth(
  async (req: NextRequest, user: AuthUser, context: RouteContext) => {
    try {
      const { id } = await context.params;
      const providerId = parseInt(id, 10);

      if (isNaN(providerId)) {
        return NextResponse.json({ error: 'Invalid provider ID' }, { status: 400 });
      }

      const body = await req.json();
      const parsed = setPrimarySchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid request body', details: parsed.error.issues },
          { status: 400 }
        );
      }

      const { clinicId } = parsed.data;

      const userContext: UserContext = {
        id: user.id,
        email: user.email,
        role: user.role as UserContext['role'],
        clinicId: user.clinicId,
        patientId: user.patientId,
        providerId: user.providerId,
      };

      await providerService.setPrimaryClinic(providerId, clinicId, userContext);

      logger.info('[API] Provider primary clinic set', {
        providerId,
        clinicId,
        actor: user.email,
      });

      return NextResponse.json({
        success: true,
        providerId,
        primaryClinicId: clinicId,
        message: 'Primary clinic updated',
      });
    } catch (error) {
      return handleApiError(error, {
        context: { route: 'PATCH /api/providers/[id]/clinics' },
      });
    }
  },
  { roles: ['admin', 'super_admin', 'provider'] }
);
