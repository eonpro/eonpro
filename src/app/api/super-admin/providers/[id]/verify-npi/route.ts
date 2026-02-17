import { NextRequest, NextResponse } from 'next/server';
import { type Prisma } from '@prisma/client';
import { basePrisma as prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { lookupNpi } from '@/lib/npi';
import { logger } from '@/lib/logger';

/**
 * Middleware to check for Super Admin role
 */
function withSuperAdminAuth(
  handler: (
    req: NextRequest,
    user: AuthUser,
    context: { params: Promise<{ id: string }> }
  ) => Promise<Response>
) {
  return withAuth(
    (req: NextRequest, user: AuthUser, context?: { params: Promise<{ id: string }> }) =>
      handler(req, user, context!),
    { roles: ['super_admin'] }
  );
}

/**
 * POST /api/super-admin/providers/[id]/verify-npi
 * Verify NPI with national registry and save verification to provider profile
 */
export const POST = withSuperAdminAuth(
  async (req: NextRequest, user: AuthUser, context: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await context.params;
      const providerId = parseInt(id);

      if (isNaN(providerId)) {
        return NextResponse.json({ error: 'Invalid provider ID' }, { status: 400 });
      }

      logger.info('[SUPER-ADMIN/PROVIDERS/VERIFY-NPI] Verifying NPI for provider', {
        providerId,
        userEmail: user.email,
      });

      // Get the provider
      const provider = await prisma.provider.findUnique({
        where: { id: providerId },
        select: {
          id: true,
          npi: true,
          firstName: true,
          lastName: true,
          npiVerifiedAt: true,
        },
      });

      if (!provider) {
        return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
      }

      if (!provider.npi) {
        return NextResponse.json(
          { error: 'Provider does not have an NPI number' },
          { status: 400 }
        );
      }

      // Lookup NPI in national registry
      let npiResult;
      try {
        npiResult = await lookupNpi(provider.npi);
      } catch (error) {
        logger.error('[SUPER-ADMIN/PROVIDERS/VERIFY-NPI] NPI lookup failed', {
          providerId,
          npi: provider.npi,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        return NextResponse.json(
          {
            error: error instanceof Error ? error.message : 'NPI lookup failed',
            valid: false,
          },
          { status: 400 }
        );
      }

      // Save verification to provider profile
      const updatedProvider = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const updated = await tx.provider.update({
          where: { id: providerId },
          data: {
            npiVerifiedAt: new Date(),
            npiRawResponse: npiResult as any,
          },
          select: {
            id: true,
            npi: true,
            firstName: true,
            lastName: true,
            npiVerifiedAt: true,
            npiRawResponse: true,
          },
        });

        // Create audit log
        await tx.providerAudit.create({
          data: {
            providerId,
            actorEmail: user.email,
            action: 'NPI_VERIFIED',
            diff: {
              npi: provider.npi,
              registryName: `${npiResult.basic?.firstName || npiResult.basic?.first_name} ${npiResult.basic?.lastName || npiResult.basic?.last_name}`,
              verifiedBy: user.email,
              verifiedAt: new Date().toISOString(),
            },
          },
        });

        return updated;
      }, { timeout: 15000 });

      logger.info('[SUPER-ADMIN/PROVIDERS/VERIFY-NPI] NPI verified and saved', {
        providerId,
        npi: provider.npi,
        verifiedAt: updatedProvider.npiVerifiedAt,
      });

      return NextResponse.json({
        message: 'NPI verified and saved successfully',
        provider: {
          id: updatedProvider.id,
          npi: updatedProvider.npi,
          npiVerifiedAt: updatedProvider.npiVerifiedAt,
          npiRawResponse: updatedProvider.npiRawResponse,
        },
        result: {
          valid: true,
          basic: npiResult.basic,
          addresses: npiResult.addresses,
        },
      });
    } catch (error: any) {
      logger.error('[SUPER-ADMIN/PROVIDERS/VERIFY-NPI] Error:', error);
      return NextResponse.json({ error: error.message || 'Failed to verify NPI' }, { status: 500 });
    }
  }
);
