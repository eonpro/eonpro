/**
 * Provider Self-Lookup Route
 * ==========================
 *
 * GET /api/providers/me
 * Returns the authenticated user's linked provider profile.
 *
 * This is used by the PrescriptionForm to auto-select the provider
 * when a provider is logged in (they can only prescribe as themselves).
 *
 * Lookup strategy (aligned with /api/provider/settings for consistency):
 * 1. User.provider - direct link via User.providerId
 * 2. Provider by email - exact match first, then case-insensitive
 * 3. Provider by name - firstName + lastName match
 * 4. If found by email/name but not linked, link User.providerId for future requests
 *
 * @module api/providers/me
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma, basePrisma } from '@/lib/db';
import { logger } from '@/lib/logger';

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

export const GET = withAuth(
  async (req: NextRequest, user: AuthUser) => {
    try {
      logger.info('[ProviderMe] Fetching provider for user', {
        userId: user.id,
        email: user.email,
        role: user.role,
        providerId: user.providerId,
      });

      let provider = null;

      // Strategy 1: User.provider via include (same as /api/provider/settings)
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
      if (userRow?.provider) {
        provider = userRow.provider;
        logger.info('[ProviderMe] Found via User.provider', { providerId: provider.id });
      }

      const dbProviderId = userRow?.providerId ?? user.providerId;
      const userEmail = (userRow?.email || user.email || '').trim();

      // Strategy 2a: Direct providerId if Strategy 1 didn't return provider
      if (!provider && dbProviderId) {
        provider = await basePrisma.provider.findUnique({
          where: { id: dbProviderId },
          select: providerSelect,
        });
        if (provider) {
          logger.info('[ProviderMe] Found via providerId', { providerId: provider.id });
        }
      }

      // Strategy 2b: Email match - exact first (like provider/settings), then case-insensitive
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
        if (provider) {
          logger.info('[ProviderMe] Found via email match', { providerId: provider.id });
        }
      }

      // Strategy 3: Name match
      if (!provider && userRow?.firstName && userRow?.lastName) {
        provider = await basePrisma.provider.findFirst({
          where: {
            firstName: { equals: userRow.firstName, mode: 'insensitive' },
            lastName: { equals: userRow.lastName, mode: 'insensitive' },
          },
          select: providerSelect,
        });
        if (provider) {
          logger.info('[ProviderMe] Found via name match', {
            providerId: provider.id,
            name: `${userRow.firstName} ${userRow.lastName}`,
          });
        }
      }

      // If found by email/name but not linked, link User.providerId (like provider/settings PUT)
      if (provider && !userRow?.providerId) {
        try {
          await prisma.user.update({
            where: { id: user.id },
            data: { providerId: provider.id },
          });
          logger.info('[ProviderMe] Linked provider to user', {
            userId: user.id,
            providerId: provider.id,
          });
        } catch (linkErr) {
          logger.warn('[ProviderMe] Failed to link provider to user', { error: linkErr });
        }
      }

      if (!provider) {
        logger.warn('[ProviderMe] No provider found for user', {
          userId: user.id,
          email: user.email,
        });
        return NextResponse.json(
          {
            error: 'No provider profile found',
            message:
              'Your account is not linked to a provider profile. Please contact your administrator.',
          },
          { status: 404 }
        );
      }

      // Check if provider has required credentials
      const hasRequiredCredentials = provider.npi && provider.dea;

      return NextResponse.json({
        provider,
        isComplete: hasRequiredCredentials,
        missing: {
          npi: !provider.npi,
          dea: !provider.dea,
          signature: !provider.signatureDataUrl,
        },
      });
    } catch (error) {
      logger.error('[ProviderMe] Error fetching provider', { error });
      return NextResponse.json({ error: 'Failed to fetch provider profile' }, { status: 500 });
    }
  },
  { roles: ['provider', 'admin', 'super_admin'] }
);
