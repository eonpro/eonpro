/**
 * Provider Self - Consolidated Prescription Provider Resolution
 * ===============================================================
 *
 * GET /api/provider/self
 *
 * Single endpoint for PrescriptionForm. Resolves provider from session only.
 * No client-side role guessing; no fallback chains.
 *
 * Returns:
 * - Provider role: { provider, role: 'provider', isComplete, missing }
 * - Admin role: { providers, role: 'admin' } (list for clinic selection)
 * - Error: { code, message } with structured codes
 *
 * Error codes: PROVIDER_NOT_LINKED, PROVIDER_PROFILE_MISSING, AUTH_INVALID
 *
 * @module api/provider/self
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { providerService, type UserContext } from '@/domains/provider';
import { handleApiError } from '@/domains/shared/errors';
import { prisma, basePrisma } from '@/lib/db';
import { logger } from '@/lib/logger';

const PROVIDER_DEBUG = process.env.PROVIDER_DEBUG === 'true';

const providerSelect = {
  id: true,
  firstName: true,
  lastName: true,
  titleLine: true,
  npi: true,
  dea: true,
  licenseNumber: true,
  licenseState: true,
  email: true,
  phone: true,
  signatureDataUrl: true,
  clinicId: true,
} as const;

function trace(msg: string, ctx: Record<string, unknown> = {}) {
  if (PROVIDER_DEBUG) {
    logger.info(`[ProviderSelf] ${msg}`, ctx);
  }
}

export const GET = withAuth(
  async (req: NextRequest, user: AuthUser) => {
    const start = Date.now();
    trace('Request start', {
      userId: user.id,
      role: user.role,
      providerId: user.providerId,
      clinicId: user.clinicId,
      hasCookie: !!req.cookies.get('provider-token') || !!req.cookies.get('auth-token'),
    });

    try {
      // Provider role: resolve self from session
      if (user.role === 'provider') {
        type ProviderRow = {
          id: number;
          firstName: string;
          lastName: string;
          titleLine: string | null;
          npi: string | null;
          dea: string | null;
          signatureDataUrl: string | null;
          [k: string]: unknown;
        };
        let provider: ProviderRow | null = null;

        const userRow = await prisma.user.findUnique({
          where: { id: user.id },
          select: {
            providerId: true,
            email: true,
            firstName: true,
            lastName: true,
            provider: { select: providerSelect },
          },
        });

        trace('User row', {
          hasUserRow: !!userRow,
          userProviderId: userRow?.providerId,
          hasProviderInclude: !!userRow?.provider,
        });

        if (userRow?.provider) {
          provider = userRow.provider;
          trace('Found via User.provider', { providerId: provider.id });
        }

        const dbProviderId = userRow?.providerId ?? user.providerId;
        const userEmail = (userRow?.email || user.email || '').trim();

        if (!provider && dbProviderId) {
          provider = await basePrisma.provider.findUnique({
            where: { id: dbProviderId },
            select: providerSelect,
          });
          if (provider) trace('Found via providerId', { providerId: provider.id });
        }

        if (!provider && userEmail) {
          provider = await basePrisma.provider.findFirst({
            where: { email: userEmail },
            select: providerSelect,
          });
          if (!provider) {
            provider = await basePrisma.provider.findFirst({
              where: { email: { equals: userEmail.toLowerCase(), mode: 'insensitive' } },
              select: providerSelect,
            });
          }
          if (provider) trace('Found via email match', { providerId: provider.id });
        }

        if (!provider && userRow?.firstName && userRow?.lastName) {
          provider = await basePrisma.provider.findFirst({
            where: {
              firstName: { equals: userRow.firstName, mode: 'insensitive' },
              lastName: { equals: userRow.lastName, mode: 'insensitive' },
            },
            select: providerSelect,
          });
          if (provider) trace('Found via name match', { providerId: provider.id });
        }

        if (provider && !userRow?.providerId) {
          try {
            await prisma.user.update({
              where: { id: user.id },
              data: { providerId: provider.id },
            });
            trace('Linked provider to user', { providerId: provider.id });
          } catch (linkErr) {
            logger.warn('[ProviderSelf] Failed to link provider', { error: linkErr });
          }
        }

        if (!provider) {
          trace('No provider found', { userId: user.id });
          return NextResponse.json(
            {
              code: 'PROVIDER_NOT_LINKED',
              message:
                'Your account is not linked to a provider profile. Please contact your administrator.',
            },
            { status: 404 }
          );
        }

        const hasRequiredCredentials = !!(provider.npi && provider.dea);
        trace('Success', { providerId: provider.id, isComplete: hasRequiredCredentials });

        return NextResponse.json({
          provider: {
            id: provider.id,
            firstName: provider.firstName,
            lastName: provider.lastName,
            titleLine: provider.titleLine,
            npi: provider.npi ?? '',
            signatureDataUrl: provider.signatureDataUrl,
          },
          role: 'provider',
          isComplete: hasRequiredCredentials,
          missing: {
            npi: !provider.npi,
            dea: !provider.dea,
            signature: !provider.signatureDataUrl,
          },
        });
      }

      // Admin/super_admin: return providers list for clinic selection
      let effectiveClinicId = user.clinicId;
      const clinicIdParam = req.nextUrl.searchParams.get('clinicId');
      const activeClinicId = req.nextUrl.searchParams.get('activeClinicId');

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
          if (hasAccess) effectiveClinicId = requestedId;
        }
      } else if (activeClinicId) {
        const parsed = parseInt(activeClinicId, 10);
        if (!Number.isNaN(parsed)) effectiveClinicId = parsed;
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
      trace('Admin list', { count: result.count, effectiveClinicId });

      return NextResponse.json({
        providers: result.providers,
        role: user.role === 'super_admin' ? 'super_admin' : 'admin',
      });
    } catch (error) {
      logger.error('[ProviderSelf] Error', { error, userId: user.id });
      return handleApiError(error, {
        context: { route: 'GET /api/provider/self', durationMs: Date.now() - start },
      });
    }
  },
  {
    roles: ['provider', 'admin', 'super_admin'],
    unauthorizedMessage: 'Authentication required',
  }
);
