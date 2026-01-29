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
 * 1. Direct providerId from User (preferred - fastest)
 * 2. Email match fallback
 * 3. Name match fallback (optional)
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
}

/**
 * Get the Provider record for an authenticated user
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
  } = options;

  const baseSelect = {
    id: true,
    firstName: true,
    lastName: true,
    ...(includeClinicId && { clinicId: true }),
    ...additionalSelect,
  };

  let provider: ProviderLookupResult | null = null;

  // Strategy 1: Direct providerId link (fastest, most reliable)
  if (user.providerId) {
    provider = await prisma.provider.findUnique({
      where: { id: user.providerId },
      select: baseSelect,
    }) as ProviderLookupResult | null;

    if (provider) {
      logger.debug('[GetProviderForUser] Found via providerId', {
        userId: user.id,
        providerId: provider.id,
      });
      return provider;
    }
  }

  // Strategy 2: Email match fallback
  if (user.email) {
    provider = await prisma.provider.findFirst({
      where: { email: user.email.toLowerCase() },
      select: baseSelect,
    }) as ProviderLookupResult | null;

    if (provider) {
      logger.debug('[GetProviderForUser] Found via email match', {
        userId: user.id,
        providerId: provider.id,
        email: user.email,
      });
      return provider;
    }
  }

  // Strategy 3: Name match (optional, slower)
  if (tryNameMatch) {
    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      select: { firstName: true, lastName: true },
    });

    if (userData?.firstName && userData?.lastName) {
      provider = await prisma.provider.findFirst({
        where: {
          firstName: { equals: userData.firstName, mode: 'insensitive' },
          lastName: { equals: userData.lastName, mode: 'insensitive' },
        },
        select: baseSelect,
      }) as ProviderLookupResult | null;

      if (provider) {
        logger.debug('[GetProviderForUser] Found via name match', {
          userId: user.id,
          providerId: provider.id,
          name: `${userData.firstName} ${userData.lastName}`,
        });
        return provider;
      }
    }
  }

  // No provider found
  logger.warn('[GetProviderForUser] No provider found for user', {
    userId: user.id,
    email: user.email,
    providerId: user.providerId,
    strategiesAttempted: [
      'providerId',
      'email',
      ...(tryNameMatch ? ['nameMatch'] : []),
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
