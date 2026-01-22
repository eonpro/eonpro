/**
 * Providers Route
 * ===============
 *
 * API endpoints for provider list and creation.
 * All handlers use the provider service layer for business logic.
 *
 * @module api/providers
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { providerService, type UserContext } from '@/domains/provider';
import { handleApiError } from '@/domains/shared/errors';

/**
 * GET /api/providers
 * List providers based on user's access level
 *
 * - Super admin: all providers
 * - Other roles: linked provider + clinic providers + shared providers
 */
export const GET = withAuth(
  async (req: NextRequest, user: AuthUser) => {
    try {
      // Convert auth user to service UserContext
      const userContext: UserContext = {
        id: user.id,
        email: user.email,
        role: user.role as UserContext['role'],
        clinicId: user.clinicId,
        patientId: user.patientId,
        providerId: user.providerId,
      };

      const result = await providerService.listProviders(userContext);

      return NextResponse.json({ providers: result.providers });
    } catch (error) {
      return handleApiError(error, {
        context: { route: 'GET /api/providers' },
      });
    }
  },
  { roles: ['admin', 'super_admin', 'provider'] }
);

/**
 * POST /api/providers
 * Create a new provider
 *
 * - Validates input with NPI checksum
 * - Verifies NPI with national registry
 * - Creates provider with audit logging
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // For unauthenticated provider creation (registration flow),
    // use a system context
    const systemContext: UserContext = {
      id: 0,
      email: 'system@registration',
      role: 'admin',
      clinicId: null,
      patientId: null,
      providerId: null,
    };

    const provider = await providerService.createProvider(body, systemContext);

    return Response.json({ provider });
  } catch (error) {
    return handleApiError(error, {
      context: { route: 'POST /api/providers' },
    });
  }
}
