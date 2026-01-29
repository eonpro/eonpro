import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

type TransactionClient = Prisma.TransactionClient;

/**
 * Middleware to check for Super Admin role
 */
function withSuperAdminAuth(
  handler: (req: NextRequest, user: AuthUser, context: { params: Promise<{ id: string }> }) => Promise<Response>
) {
  return withAuth(
    (req: NextRequest, user: AuthUser, context?: { params: Promise<{ id: string }> }) => 
      handler(req, user, context!),
    { roles: ['super_admin'] }
  );
}

/**
 * POST /api/super-admin/providers/[id]/archive
 * Archive a provider (soft delete)
 */
export const POST = withSuperAdminAuth(async (
  req: NextRequest,
  user: AuthUser,
  context: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await context.params;
    const providerId = parseInt(id);

    if (isNaN(providerId)) {
      return NextResponse.json({ error: 'Invalid provider ID' }, { status: 400 });
    }

    logger.info('[SUPER-ADMIN/PROVIDERS] Archiving provider', {
      providerId,
      userEmail: user.email,
    });

    // Check provider exists
    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        npi: true,
        status: true,
      },
    });

    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    if (provider.status === 'ARCHIVED') {
      return NextResponse.json({ error: 'Provider is already archived' }, { status: 400 });
    }

    // Archive the provider
    const updatedProvider = await prisma.$transaction(async (tx: TransactionClient) => {
      // Update provider status
      const archived = await tx.provider.update({
        where: { id: providerId },
        data: {
          status: 'ARCHIVED',
          archivedAt: new Date(),
          archivedBy: user.id,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          npi: true,
          status: true,
          archivedAt: true,
        },
      });

      // Deactivate all clinic assignments
      await tx.providerClinic.updateMany({
        where: { providerId },
        data: { isActive: false },
      });

      // Create audit log
      await tx.providerAudit.create({
        data: {
          providerId,
          actorEmail: user.email,
          action: 'ARCHIVE',
          diff: {
            previousStatus: provider.status,
            newStatus: 'ARCHIVED',
            archivedBy: user.email,
            archivedAt: new Date().toISOString(),
          },
        },
      });

      return archived;
    });

    logger.info('[SUPER-ADMIN/PROVIDERS] Provider archived', {
      providerId,
      npi: provider.npi,
    });

    return NextResponse.json({
      message: 'Provider archived successfully',
      provider: updatedProvider,
    });
  } catch (error: any) {
    logger.error('[SUPER-ADMIN/PROVIDERS] Error archiving provider:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to archive provider' },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/super-admin/providers/[id]/archive
 * Unarchive a provider (restore from archive)
 */
export const DELETE = withSuperAdminAuth(async (
  req: NextRequest,
  user: AuthUser,
  context: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await context.params;
    const providerId = parseInt(id);

    if (isNaN(providerId)) {
      return NextResponse.json({ error: 'Invalid provider ID' }, { status: 400 });
    }

    logger.info('[SUPER-ADMIN/PROVIDERS] Unarchiving provider', {
      providerId,
      userEmail: user.email,
    });

    // Check provider exists
    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        npi: true,
        status: true,
      },
    });

    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    if (provider.status !== 'ARCHIVED') {
      return NextResponse.json({ error: 'Provider is not archived' }, { status: 400 });
    }

    // Unarchive the provider
    const updatedProvider = await prisma.$transaction(async (tx: TransactionClient) => {
      // Update provider status
      const restored = await tx.provider.update({
        where: { id: providerId },
        data: {
          status: 'ACTIVE',
          archivedAt: null,
          archivedBy: null,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          npi: true,
          status: true,
        },
      });

      // Create audit log
      await tx.providerAudit.create({
        data: {
          providerId,
          actorEmail: user.email,
          action: 'UNARCHIVE',
          diff: {
            previousStatus: 'ARCHIVED',
            newStatus: 'ACTIVE',
            restoredBy: user.email,
            restoredAt: new Date().toISOString(),
          },
        },
      });

      return restored;
    });

    logger.info('[SUPER-ADMIN/PROVIDERS] Provider unarchived', {
      providerId,
      npi: provider.npi,
    });

    return NextResponse.json({
      message: 'Provider unarchived successfully',
      provider: updatedProvider,
    });
  } catch (error: any) {
    logger.error('[SUPER-ADMIN/PROVIDERS] Error unarchiving provider:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to unarchive provider' },
      { status: 500 }
    );
  }
});
