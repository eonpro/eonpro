/**
 * Get Provider for Authenticated User
 * ====================================
 *
 * Utility function to reliably look up the Provider record for an authenticated user.
 *
 * IMPORTANT: The Provider model does NOT have a userId field.
 * The relationship is: User.providerId -> Provider.id
 *
 * This utility implements a multi-strategy lookup:
 * 0. Database refresh - check if User.providerId was updated after login (CRITICAL)
 * 1. Direct providerId from User (preferred - fastest)
 * 2. Email match fallback
 * 3. Name match fallback (optional)
 * 4. Clinic + email domain match
 *
 * @module lib/auth/get-provider-for-user
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { AuthUser } from './middleware';

export interface ProviderLookupResult {
  id: number;
  firstName: string;
  lastName: string;
  clinicId?: number | null;
}

export interface GetProviderOptions {
  /** Include clinicId in the result (default: true) */
  includeClinicId?: boolean;
  /** Try name matching as fallback (default: false - slower) */
  tryNameMatch?: boolean;
  /** Additional fields to select */
  additionalSelect?: Record<string, boolean>;
  /** Skip database refresh check (default: false) - use for performance-critical paths */
  skipDatabaseRefresh?: boolean;
}

/**
 * Get the Provider record for an authenticated user
 *
 * ENTERPRISE FIX: This function now ALWAYS checks the database for the latest
 * User.providerId, because the JWT token may be stale if the link was created
 * after the user logged in.
 *
 * @param user - The authenticated user from middleware
 * @param options - Lookup options
 * @returns Provider record or null if not found
 *
 * @example
 * ```typescript
 * const provider = await getProviderForUser(user);
 * if (!provider) {
 *   return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
 * }
 * ```
 */
export async function getProviderForUser(
  user: AuthUser,
  options: GetProviderOptions = {}
): Promise<ProviderLookupResult | null> {
  const {
    includeClinicId = true,
    tryNameMatch = false,
    additionalSelect = {},
    skipDatabaseRefresh = false,
  } = options;

  const baseSelect = {
    id: true,
    firstName: true,
    lastName: true,
    ...(includeClinicId && { clinicId: true }),
    ...additionalSelect,
  };

  let provider: ProviderLookupResult | null = null;

  // ============================================================================
  // STRATEGY 0: Database Refresh (CRITICAL for stale token issue)
  // ============================================================================
  // The JWT token may have been created BEFORE the user-provider link was established.
  // Always check the database for the current providerId.
  // This solves the "linked but can't approve" issue.
  // ============================================================================
  if (!skipDatabaseRefresh) {
    try {
      const currentUserData = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          providerId: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      });

      if (currentUserData?.providerId) {
        // User has providerId in database - use it even if token doesn't have it
        provider = (await prisma.provider.findUnique({
          where: { id: currentUserData.providerId },
          select: baseSelect,
        })) as ProviderLookupResult | null;

        if (provider) {
          logger.debug('[GetProviderForUser] Found via database refresh', {
            userId: user.id,
            providerId: provider.id,
            tokenHadProviderId: !!user.providerId,
            source: 'database_refresh',
          });
          return provider;
        }
      }

      // Also check if there's a provider with matching email that we should auto-link
      if (currentUserData?.email && !currentUserData.providerId) {
        const providerByEmail = await prisma.provider.findFirst({
          where: { email: { equals: currentUserData.email, mode: 'insensitive' } },
          select: { ...baseSelect, email: true },
        });

        if (providerByEmail) {
          // Auto-link the user to this provider for future requests
          try {
            await prisma.user.update({
              where: { id: user.id },
              data: { providerId: providerByEmail.id },
            });
            logger.info('[GetProviderForUser] Auto-linked user to provider', {
              userId: user.id,
              providerId: providerByEmail.id,
              email: currentUserData.email,
            });
          } catch (linkError) {
            // Non-critical - just log
            logger.warn('[GetProviderForUser] Failed to auto-link user to provider', {
              userId: user.id,
              providerId: providerByEmail.id,
              error: linkError,
            });
          }

          logger.debug('[GetProviderForUser] Found via email match (database refresh)', {
            userId: user.id,
            providerId: providerByEmail.id,
            email: currentUserData.email,
            source: 'database_refresh_email',
          });
          return providerByEmail as ProviderLookupResult;
        }
      }
    } catch (refreshError) {
      // Log but don't fail - fall through to other strategies
      logger.warn('[GetProviderForUser] Database refresh failed', {
        userId: user.id,
        error: refreshError,
      });
    }
  }

  // ============================================================================
  // STRATEGY 1: Direct providerId from token (fast path)
  // ============================================================================
  if (user.providerId) {
    provider = (await prisma.provider.findUnique({
      where: { id: user.providerId },
      select: baseSelect,
    })) as ProviderLookupResult | null;

    if (provider) {
      logger.debug('[GetProviderForUser] Found via token providerId', {
        userId: user.id,
        providerId: provider.id,
        source: 'token',
      });
      return provider;
    }
  }

  // ============================================================================
  // STRATEGY 2: Email match fallback (case-insensitive)
  // ============================================================================
  if (user.email) {
    provider = (await prisma.provider.findFirst({
      where: {
        email: { equals: user.email, mode: 'insensitive' },
      },
      select: baseSelect,
    })) as ProviderLookupResult | null;

    if (provider) {
      logger.debug('[GetProviderForUser] Found via email match', {
        userId: user.id,
        providerId: provider.id,
        email: user.email,
        source: 'email',
      });
      return provider;
    }
  }

  // ============================================================================
  // STRATEGY 3: Name match (optional, slower)
  // ============================================================================
  if (tryNameMatch) {
    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      select: { firstName: true, lastName: true },
    });

    if (userData?.firstName && userData?.lastName) {
      provider = (await prisma.provider.findFirst({
        where: {
          firstName: { equals: userData.firstName, mode: 'insensitive' },
          lastName: { equals: userData.lastName, mode: 'insensitive' },
        },
        select: baseSelect,
      })) as ProviderLookupResult | null;

      if (provider) {
        logger.debug('[GetProviderForUser] Found via name match', {
          userId: user.id,
          providerId: provider.id,
          name: `${userData.firstName} ${userData.lastName}`,
          source: 'name',
        });
        return provider;
      }
    }
  }

  // ============================================================================
  // STRATEGY 4: Clinic + email domain match (last resort)
  // ============================================================================
  if (user.clinicId && (user.role === 'provider' || user.role === 'admin')) {
    const emailDomain = user.email?.split('@')[1];
    if (emailDomain) {
      provider = (await prisma.provider.findFirst({
        where: {
          clinicId: user.clinicId,
          email: { endsWith: `@${emailDomain}`, mode: 'insensitive' },
          status: 'ACTIVE',
        },
        select: baseSelect,
      })) as ProviderLookupResult | null;

      if (provider) {
        logger.debug('[GetProviderForUser] Found via clinic + email domain match', {
          userId: user.id,
          providerId: provider.id,
          clinicId: user.clinicId,
          source: 'clinic_domain',
        });
        return provider;
      }
    }
  }

  // No provider found - log detailed diagnostics
  logger.warn('[GetProviderForUser] No provider found for user after all strategies', {
    userId: user.id,
    email: user.email,
    tokenProviderId: user.providerId,
    tokenClinicId: user.clinicId,
    role: user.role,
    strategiesAttempted: [
      'database_refresh',
      'token_providerId',
      'email',
      ...(tryNameMatch ? ['name'] : []),
      'clinic_domain',
    ],
  });

  return null;
}

/**
 * Get the Provider ID for an authenticated user (simple version)
 *
 * @param user - The authenticated user from middleware
 * @returns Provider ID or null if not found
 */
export async function getProviderIdForUser(user: AuthUser): Promise<number | null> {
  const provider = await getProviderForUser(user, { includeClinicId: false });
  return provider?.id ?? null;
}
