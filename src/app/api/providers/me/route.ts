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
 * Lookup strategy (in order):
 * 1. User.providerId - direct link
 * 2. Provider.email match - email-based link
 * 3. Provider name match - firstName + lastName match
 *
 * @module api/providers/me
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { basePrisma as prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

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

      // Strategy 0: User table providerId (may have been linked after login; token can be stale)
      const userRow = await prisma.user.findUnique({
        where: { id: user.id },
        select: { providerId: true, email: true, firstName: true, lastName: true },
      });
      const dbProviderId = userRow?.providerId ?? user.providerId;
      const userEmail = (userRow?.email || user.email || '').trim().toLowerCase();

      // Strategy 1: Direct providerId link (from DB or JWT)
      if (dbProviderId) {
        provider = await prisma.provider.findUnique({
          where: { id: dbProviderId },
          select: {
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
          },
        });
        if (provider) {
          logger.info('[ProviderMe] Found via providerId', { providerId: provider.id });
        }
      }

      // Strategy 2: Email match (case-insensitive)
      if (!provider && userEmail) {
        provider = await prisma.provider.findFirst({
          where: { email: { equals: userEmail, mode: 'insensitive' } },
          select: {
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
          },
        });
        if (provider) {
          logger.info('[ProviderMe] Found via email match', { providerId: provider.id });
        }
      }

      // Strategy 3: Name match (use userRow from Strategy 0)
      if (!provider && userRow?.firstName && userRow?.lastName) {
        provider = await prisma.provider.findFirst({
          where: {
            firstName: { equals: userRow.firstName, mode: 'insensitive' },
            lastName: { equals: userRow.lastName, mode: 'insensitive' },
          },
          select: {
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
          },
        });
        if (provider) {
          logger.info('[ProviderMe] Found via name match', {
            providerId: provider.id,
            name: `${userRow.firstName} ${userRow.lastName}`,
          });
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
