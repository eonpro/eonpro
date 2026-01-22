/**
 * Provider Detail Route
 * =====================
 *
 * API endpoints for individual provider operations.
 * Uses the provider service layer for business logic.
 *
 * @module api/providers/[id]
 */

import { NextRequest } from 'next/server';
import { providerService, type UserContext } from '@/domains/provider';
import { handleApiError, ValidationError } from '@/domains/shared/errors';

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
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const resolvedParams = await params;
    const id = parseProviderId(resolvedParams.id);

    // No auth context - return provider without access control
    // Access control is handled at route middleware level
    const provider = await providerService.getById(id);

    return Response.json({ provider });
  } catch (error) {
    return handleApiError(error, {
      context: { route: 'GET /api/providers/[id]' },
    });
  }
}

/**
 * PATCH /api/providers/[id]
 * Update a provider
 *
 * Uses x-actor-email or x-user-email header for audit logging
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const resolvedParams = await params;
    const id = parseProviderId(resolvedParams.id);
    const body = await request.json();

    // Get actor email from headers for audit logging
    const actorEmail =
      request.headers.get('x-actor-email') ??
      request.headers.get('x-user-email') ??
      'unknown';

    // Create a system context for the update
    // TODO: This route should use withAuth middleware for proper access control
    const systemContext: UserContext = {
      id: 0,
      email: actorEmail,
      role: 'admin', // Allow update
      clinicId: null,
      patientId: null,
      providerId: null,
    };

    const provider = await providerService.updateProvider(id, body, systemContext);

    return Response.json({ provider });
  } catch (error) {
    return handleApiError(error, {
      context: { route: 'PATCH /api/providers/[id]' },
    });
  }
}
