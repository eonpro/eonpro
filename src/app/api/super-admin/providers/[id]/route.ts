import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { providerService } from '@/domains/provider';
import { logger } from '@/lib/logger';

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
 * GET /api/super-admin/providers/[id]
 * Get provider details with all clinic assignments
 */
export const GET = withSuperAdminAuth(async (
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

    logger.info('[SUPER-ADMIN/PROVIDERS] Fetching provider details', {
      providerId,
      userEmail: user.email,
    });

    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        npi: true,
        email: true,
        phone: true,
        titleLine: true,
        licenseState: true,
        licenseNumber: true,
        dea: true,
        signatureDataUrl: true,
        clinicId: true,
        primaryClinicId: true,
        activeClinicId: true,
        npiVerifiedAt: true,
        npiRawResponse: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true,
        clinic: {
          select: {
            id: true,
            name: true,
            subdomain: true,
            status: true,
          },
        },
        providerClinics: {
          select: {
            id: true,
            clinicId: true,
            isPrimary: true,
            isActive: true,
            titleLine: true,
            deaNumber: true,
            licenseNumber: true,
            licenseState: true,
            createdAt: true,
            updatedAt: true,
            clinic: {
              select: {
                id: true,
                name: true,
                subdomain: true,
                status: true,
                primaryColor: true,
              },
            },
          },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            lastLogin: true,
          },
        },
        _count: {
          select: {
            orders: true,
            appointments: true,
            approvedSoapNotes: true,
          },
        },
      },
    });

    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    // Get audit history
    const auditHistory = await prisma.providerAudit.findMany({
      where: { providerId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        action: true,
        actorEmail: true,
        diff: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      provider,
      auditHistory,
    });
  } catch (error: any) {
    logger.error('[SUPER-ADMIN/PROVIDERS] Error fetching provider:', error);
    return NextResponse.json(
      { error: 'Failed to fetch provider', details: error.message },
      { status: 500 }
    );
  }
});

/**
 * PUT /api/super-admin/providers/[id]
 * Update provider core information
 */
export const PUT = withSuperAdminAuth(async (
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

    const body = await req.json();

    logger.info('[SUPER-ADMIN/PROVIDERS] Updating provider', {
      providerId,
      userEmail: user.email,
    });

    // Check provider exists
    const existing = await prisma.provider.findUnique({
      where: { id: providerId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    // Use provider service for update
    const userContext = {
      id: user.id,
      email: user.email,
      role: 'super_admin' as const,
      clinicId: null,
    };

    const provider = await providerService.updateProvider(providerId, body, userContext);

    // Create audit log for super admin action
    try {
      await prisma.providerAudit.create({
        data: {
          providerId,
          actorEmail: user.email,
          action: 'SUPER_ADMIN_UPDATE',
          diff: {
            updatedBy: user.email,
            fields: Object.keys(body),
          },
        },
      });
    } catch (auditError) {
      logger.warn('[SUPER-ADMIN/PROVIDERS] Failed to create audit log', { error: auditError });
    }

    logger.info('[SUPER-ADMIN/PROVIDERS] Provider updated', {
      providerId,
      updatedFields: Object.keys(body),
    });

    return NextResponse.json({
      provider,
      message: 'Provider updated successfully',
    });
  } catch (error: any) {
    logger.error('[SUPER-ADMIN/PROVIDERS] Error updating provider:', error);

    if (error.code === 'CONFLICT') {
      return NextResponse.json(
        { error: error.message || 'NPI already registered' },
        { status: 409 }
      );
    }

    if (error.code === 'VALIDATION_ERROR') {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to update provider' },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/super-admin/providers/[id]
 * Delete provider with safeguards
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

    const { searchParams } = new URL(req.url);
    const force = searchParams.get('force') === 'true';

    logger.info('[SUPER-ADMIN/PROVIDERS] Deleting provider', {
      providerId,
      userEmail: user.email,
      force,
    });

    // Check provider exists and get stats
    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        npi: true,
        _count: {
          select: {
            orders: true,
            appointments: true,
            approvedSoapNotes: true,
          },
        },
      },
    });

    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    // Check for active data
    const hasActiveData =
      provider._count.orders > 0 ||
      provider._count.appointments > 0 ||
      provider._count.approvedSoapNotes > 0;

    if (hasActiveData && !force) {
      return NextResponse.json(
        {
          error: 'Provider has active data',
          message: 'This provider has associated orders, appointments, or SOAP notes. Use force=true to delete anyway.',
          stats: provider._count,
        },
        { status: 409 }
      );
    }

    // Use provider service for delete
    const userContext = {
      id: user.id,
      email: user.email,
      role: 'super_admin' as const,
      clinicId: null,
    };

    await providerService.deleteProvider(providerId, userContext);

    logger.info('[SUPER-ADMIN/PROVIDERS] Provider deleted', {
      providerId,
      npi: provider.npi,
      force,
    });

    return NextResponse.json({
      message: 'Provider deleted successfully',
      deletedProvider: {
        id: provider.id,
        name: `${provider.firstName} ${provider.lastName}`,
        npi: provider.npi,
      },
    });
  } catch (error: any) {
    logger.error('[SUPER-ADMIN/PROVIDERS] Error deleting provider:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete provider' },
      { status: 500 }
    );
  }
});
