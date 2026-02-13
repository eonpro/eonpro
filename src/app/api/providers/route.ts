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
import { authRateLimiter } from '@/lib/security/rate-limiter-redis';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';

/**
 * GET /api/providers
 * List providers based on user's access level
 *
 * - Super admin: all providers
 * - Other roles: linked provider + clinic providers + shared providers
 *
 * Optional ?clinicId=N: when admin is viewing a specific clinic (e.g. via subdomain or
 * clinic switcher), pass clinicId so providers for that clinic are returned. The user
 * must have access to the clinic (primary clinic or UserClinic).
 */
export const GET = withAuth(
  async (req: NextRequest, user: AuthUser) => {
    try {
      let effectiveClinicId = user.clinicId;

      // Optional clinic scope: allow admins to request providers for a specific clinic
      // (e.g. when on wellmedr.eonpro.io or after switching clinic in UI)
      const clinicIdParam = req.nextUrl.searchParams.get('clinicId');
      if (clinicIdParam && (user.role === 'admin' || user.role === 'super_admin')) {
        const requestedId = parseInt(clinicIdParam, 10);
        if (!Number.isNaN(requestedId)) {
          const hasAccess =
            user.role === 'super_admin' ||
            user.clinicId === requestedId ||
            (await prisma.userClinic.findFirst({
              where: {
                userId: user.id,
                clinicId: requestedId,
                isActive: true,
              },
            }));
          if (hasAccess) {
            effectiveClinicId = requestedId;
            logger.debug('[GET /api/providers] Using requested clinicId for provider list', {
              userId: user.id,
              requestedClinicId: requestedId,
            });
          }
        }
      }

      const userContext: UserContext = {
        id: user.id,
        email: user.email,
        role: user.role as UserContext['role'],
        clinicId: effectiveClinicId ?? null,
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
 * SECURITY NOTE: This endpoint is intentionally public for the registration flow.
 * Rate limited strictly to prevent abuse.
 *
 * - Validates input with NPI checksum
 * - Verifies NPI with national registry
 * - Creates provider with audit logging
 */
const createProviderHandler = async (req: NextRequest) => {
  try {
    const body = await req.json();

    // Validate required fields for registration
    if (!body.email || !body.npi) {
      return NextResponse.json(
        { error: 'Email and NPI are required for provider registration' },
        { status: 400 }
      );
    }

    // Log registration attempt for security monitoring
    logger.info('Provider registration attempt', {
      email: body.email,
      npi: body.npi ? body.npi.substring(0, 4) + '****' : undefined,
      ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
    });

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
};

// Apply strict rate limiting to prevent registration abuse
// 5 attempts per 15 minutes
export const POST = authRateLimiter(createProviderHandler);
