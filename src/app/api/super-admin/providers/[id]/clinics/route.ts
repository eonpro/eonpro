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
 * GET /api/super-admin/providers/[id]/clinics
 * Get all clinic assignments for a provider
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

    logger.info('[SUPER-ADMIN/PROVIDERS/CLINICS] Fetching clinic assignments', {
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
        clinicId: true,
        primaryClinicId: true,
      },
    });

    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    // Get all clinic assignments (including inactive for history)
    const clinicAssignments = await prisma.providerClinic.findMany({
      where: { providerId },
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
            logoUrl: true,
          },
        },
      },
      orderBy: [{ isActive: 'desc' }, { isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    // Get list of all available clinics for assignment
    const allClinics = await prisma.clinic.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        subdomain: true,
        primaryColor: true,
        logoUrl: true,
      },
      orderBy: { name: 'asc' },
    });

    // Filter out already assigned clinics
    const assignedClinicIds = new Set(
      clinicAssignments.filter((a: { isActive: boolean }) => a.isActive).map((a: { clinicId: number }) => a.clinicId)
    );
    const availableClinics = allClinics.filter((c: { id: number }) => !assignedClinicIds.has(c.id));

    return NextResponse.json({
      providerId,
      providerName: `${provider.firstName} ${provider.lastName}`,
      clinicAssignments,
      availableClinics,
      legacyClinicId: provider.clinicId,
      primaryClinicId: provider.primaryClinicId,
    });
  } catch (error: any) {
    logger.error('[SUPER-ADMIN/PROVIDERS/CLINICS] Error fetching clinic assignments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch clinic assignments', details: error.message },
      { status: 500 }
    );
  }
});

/**
 * POST /api/super-admin/providers/[id]/clinics
 * Assign provider to a clinic
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

    const body = await req.json();
    const { clinicId, isPrimary, titleLine, deaNumber, licenseNumber, licenseState } = body;

    if (!clinicId) {
      return NextResponse.json({ error: 'clinicId is required' }, { status: 400 });
    }

    logger.info('[SUPER-ADMIN/PROVIDERS/CLINICS] Assigning provider to clinic', {
      providerId,
      clinicId,
      userEmail: user.email,
    });

    // Check provider exists
    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
      select: { id: true },
    });

    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    // Check clinic exists
    const clinic = await prisma.clinic.findUnique({
      where: { id: parseInt(clinicId) },
      select: { id: true, name: true },
    });

    if (!clinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    // Use provider service for assignment
    const userContext = {
      id: user.id,
      email: user.email,
      role: 'super_admin' as const,
      clinicId: null,
    };

    const result = await providerService.assignToClinic(
      providerId,
      parseInt(clinicId),
      {
        isPrimary: isPrimary || false,
        titleLine,
        deaNumber,
        licenseNumber,
        licenseState,
      },
      userContext
    );

    logger.info('[SUPER-ADMIN/PROVIDERS/CLINICS] Provider assigned to clinic', {
      providerId,
      clinicId,
      isPrimary: result.isPrimary,
    });

    return NextResponse.json({
      message: 'Provider assigned to clinic successfully',
      assignment: result,
      clinic: clinic,
    });
  } catch (error: any) {
    logger.error('[SUPER-ADMIN/PROVIDERS/CLINICS] Error assigning provider to clinic:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to assign provider to clinic' },
      { status: 500 }
    );
  }
});

/**
 * PATCH /api/super-admin/providers/[id]/clinics
 * Update clinic assignment (e.g., set primary, update metadata)
 */
export const PATCH = withSuperAdminAuth(async (
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
    const { clinicId, isPrimary, titleLine, deaNumber, licenseNumber, licenseState } = body;

    if (!clinicId) {
      return NextResponse.json({ error: 'clinicId is required' }, { status: 400 });
    }

    logger.info('[SUPER-ADMIN/PROVIDERS/CLINICS] Updating clinic assignment', {
      providerId,
      clinicId,
      isPrimary,
      userEmail: user.email,
    });

    // If setting as primary
    if (isPrimary) {
      const userContext = {
        id: user.id,
        email: user.email,
        role: 'super_admin' as const,
        clinicId: null,
      };

      await providerService.setPrimaryClinic(providerId, parseInt(clinicId), userContext);
    }

    // Update other metadata
    const updated = await prisma.providerClinic.update({
      where: {
        providerId_clinicId: {
          providerId,
          clinicId: parseInt(clinicId),
        },
      },
      data: {
        ...(titleLine !== undefined && { titleLine }),
        ...(deaNumber !== undefined && { deaNumber }),
        ...(licenseNumber !== undefined && { licenseNumber }),
        ...(licenseState !== undefined && { licenseState }),
        updatedAt: new Date(),
      },
      include: {
        clinic: {
          select: {
            id: true,
            name: true,
            subdomain: true,
          },
        },
      },
    });

    // Create audit log
    await prisma.providerAudit.create({
      data: {
        providerId,
        actorEmail: user.email,
        action: 'CLINIC_ASSIGNMENT_UPDATE',
        diff: {
          clinicId,
          isPrimary,
          updatedFields: Object.keys(body).filter(k => k !== 'clinicId'),
        },
      },
    });

    return NextResponse.json({
      message: 'Clinic assignment updated successfully',
      assignment: updated,
    });
  } catch (error: any) {
    logger.error('[SUPER-ADMIN/PROVIDERS/CLINICS] Error updating clinic assignment:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update clinic assignment' },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/super-admin/providers/[id]/clinics
 * Remove provider from a clinic
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
    const clinicId = searchParams.get('clinicId');

    if (!clinicId) {
      return NextResponse.json({ error: 'clinicId query parameter is required' }, { status: 400 });
    }

    logger.info('[SUPER-ADMIN/PROVIDERS/CLINICS] Removing provider from clinic', {
      providerId,
      clinicId,
      userEmail: user.email,
    });

    // Check provider exists
    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
      select: { id: true },
    });

    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    // Use provider service for removal
    const userContext = {
      id: user.id,
      email: user.email,
      role: 'super_admin' as const,
      clinicId: null,
    };

    await providerService.removeFromClinic(providerId, parseInt(clinicId), userContext);

    logger.info('[SUPER-ADMIN/PROVIDERS/CLINICS] Provider removed from clinic', {
      providerId,
      clinicId,
    });

    return NextResponse.json({
      message: 'Provider removed from clinic successfully',
    });
  } catch (error: any) {
    logger.error('[SUPER-ADMIN/PROVIDERS/CLINICS] Error removing provider from clinic:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to remove provider from clinic' },
      { status: 500 }
    );
  }
});
