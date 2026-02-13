/**
 * Provider Detail Route
 * =====================
 *
 * API endpoints for individual provider operations.
 * Uses the provider service layer for business logic.
 *
 * @module api/providers/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { providerService, type UserContext } from '@/domains/provider';
import { handleApiError, ValidationError } from '@/domains/shared/errors';
import { withAuthParams } from '@/lib/auth/middleware-with-params';
import { AuthUser } from '@/lib/auth/middleware';

type Params = {
  params: Promise<{ id: string }>;
};

/**
 * Parse and validate provider ID from params
 */
function parseProviderId(idString: string): number {
  const id = Number(idString);
  if (Number.isNaN(id) || id <= 0) {
    throw new ValidationError('Invalid provider ID');
  }
  return id;
}

/**
 * GET /api/providers/[id]
 * Get a single provider by ID
 * Protected: Requires authentication
 */
const getProviderHandler = withAuthParams(
  async (request: NextRequest, user: AuthUser, { params }: Params) => {
    try {
      const resolvedParams = await params;
      const id = parseProviderId(resolvedParams.id);

      // Create user context for access control
      const userContext: UserContext = {
        id: user.id,
        email: user.email,
        role: user.role as UserContext['role'],
        clinicId: user.clinicId || null,
        patientId: user.patientId || null,
        providerId: user.providerId || null,
      };

      const provider = await providerService.getById(id, userContext);

      if (!provider) {
        return NextResponse.json({ error: 'Provider not found or access denied' }, { status: 404 });
      }

      return Response.json({ provider });
    } catch (error) {
      return handleApiError(error, {
        context: { route: 'GET /api/providers/[id]' },
      });
    }
  },
  { roles: ['super_admin', 'admin', 'provider', 'staff'] }
);

export const GET = getProviderHandler;

/**
 * PATCH /api/providers/[id]
 * Update a provider
 * Protected: Requires admin or super_admin role
 */
const updateProviderHandler = withAuthParams(
  async (request: NextRequest, user: AuthUser, { params }: Params) => {
    try {
      const resolvedParams = await params;
      const id = parseProviderId(resolvedParams.id);
      const body = await request.json();

      // Create user context for access control and audit logging
      const userContext: UserContext = {
        id: user.id,
        email: user.email,
        role: user.role as UserContext['role'],
        clinicId: user.clinicId || null,
        patientId: user.patientId || null,
        providerId: user.providerId || null,
      };

      const provider = await providerService.updateProvider(id, body, userContext);

      return Response.json({ provider });
    } catch (error) {
      return handleApiError(error, {
        context: { route: 'PATCH /api/providers/[id]' },
      });
    }
  },
  { roles: ['super_admin', 'admin'] }
);

export const PATCH = updateProviderHandler;
