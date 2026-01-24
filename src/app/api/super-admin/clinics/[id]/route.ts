import { NextRequest, NextResponse } from 'next/server';
import { basePrisma as prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { UserRole } from '@prisma/client';

/**
 * Middleware to check for Super Admin role
 */
function withSuperAdminAuth(
  handler: (req: NextRequest, user: AuthUser, params: { id: string }) => Promise<Response>
) {
  return async (req: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const params = await context.params;
    return withAuth(
      (req: NextRequest, user: AuthUser) => handler(req, user, params),
      { roles: ['super_admin', 'super_admin'] }
    )(req);
  };
}

/**
 * GET /api/super-admin/clinics/[id]
 * Get a single clinic by ID
 */
export const GET = withSuperAdminAuth(async (req: NextRequest, user: AuthUser, params: { id: string }) => {
  try {
    const clinicId = parseInt(params.id);
    
    if (isNaN(clinicId)) {
      return NextResponse.json(
        { error: 'Invalid clinic ID' },
        { status: 400 }
      );
    }

    // Note: Explicitly selecting fields for backwards compatibility
    // (buttonTextColor may not exist in production DB if migration hasn't run)
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: {
        id: true,
        name: true,
        subdomain: true,
        customDomain: true,
        status: true,
        adminEmail: true,
        supportEmail: true,
        phone: true,
        timezone: true,
        address: true,
        billingPlan: true,
        patientLimit: true,
        providerLimit: true,
        storageLimit: true,
        primaryColor: true,
        secondaryColor: true,
        accentColor: true,
        logoUrl: true,
        iconUrl: true,
        faviconUrl: true,
        customCss: true,
        settings: true,
        features: true,
        integrations: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            patients: true,
            users: true,
          }
        }
      },
    });

    if (!clinic) {
      return NextResponse.json(
        { error: 'Clinic not found' },
        { status: 404 }
      );
    }

    // Count providers (users with role PROVIDER) for this clinic
    const providerCount = await prisma.user.count({
      where: {
        clinicId: clinic.id,
        role: UserRole.PROVIDER,
      },
    });

    // Add provider count to the response
    const clinicWithProviderCount = {
      ...clinic,
      _count: {
        ...clinic._count,
        providers: providerCount,
      },
    };

    return NextResponse.json({ clinic: clinicWithProviderCount });
  } catch (error: any) {
    console.error('Error fetching clinic:', error);
    return NextResponse.json(
      { error: 'Failed to fetch clinic', details: error?.message || String(error) },
      { status: 500 }
    );
  }
});

/**
 * PUT /api/super-admin/clinics/[id]
 * Update a clinic
 */
export const PUT = withSuperAdminAuth(async (req: NextRequest, user: AuthUser, params: { id: string }) => {
  try {
    const clinicId = parseInt(params.id);
    
    if (isNaN(clinicId)) {
      return NextResponse.json(
        { error: 'Invalid clinic ID' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const {
      name,
      subdomain,
      customDomain,
      adminEmail,
      supportEmail,
      phone,
      timezone,
      address,
      settings,
      features,
      billingPlan,
      patientLimit,
      providerLimit,
      storageLimit,
      primaryColor,
      secondaryColor,
      accentColor,
      // NOTE: buttonTextColor removed - column doesn't exist in production yet
      // Uncomment after migration is deployed: buttonTextColor,
      logoUrl,
      iconUrl,
      faviconUrl,
      status,
    } = body;

    // Check if clinic exists (select only needed fields for backwards compatibility)
    const existingClinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { id: true, subdomain: true },
    });

    if (!existingClinic) {
      return NextResponse.json(
        { error: 'Clinic not found' },
        { status: 404 }
      );
    }

    // Check if subdomain is taken by another clinic
    if (subdomain && subdomain !== existingClinic.subdomain) {
      const subdomainTaken = await prisma.clinic.findUnique({
        where: { subdomain },
        select: { id: true },
      });
      if (subdomainTaken) {
        return NextResponse.json(
          { error: 'Subdomain is already taken' },
          { status: 400 }
        );
      }
    }

    // Update the clinic
    const updatedClinic = await prisma.clinic.update({
      where: { id: clinicId },
      data: {
        ...(name && { name }),
        ...(subdomain && { subdomain }),
        ...(customDomain !== undefined && { customDomain: customDomain || null }),
        ...(adminEmail && { adminEmail }),
        ...(supportEmail !== undefined && { supportEmail: supportEmail || null }),
        ...(phone !== undefined && { phone: phone || null }),
        ...(timezone && { timezone }),
        ...(address !== undefined && { address: address || null }),
        ...(settings && { settings }),
        ...(features && { features }),
        ...(billingPlan && { billingPlan }),
        ...(patientLimit && { patientLimit }),
        ...(providerLimit && { providerLimit }),
        ...(storageLimit && { storageLimit }),
        ...(primaryColor && { primaryColor }),
        ...(secondaryColor && { secondaryColor }),
        ...(accentColor && { accentColor }),
        // NOTE: buttonTextColor removed - column doesn't exist in production yet
        // Uncomment after migration is deployed: ...(buttonTextColor && { buttonTextColor }),
        ...(logoUrl !== undefined && { logoUrl: logoUrl || null }),
        ...(iconUrl !== undefined && { iconUrl: iconUrl || null }),
        ...(faviconUrl !== undefined && { faviconUrl: faviconUrl || null }),
        ...(status && { status }),
      },
    });

    // Create audit log (optional)
    try {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
      });
      
      if (dbUser) {
        await prisma.clinicAuditLog.create({
          data: {
            clinicId: updatedClinic.id,
            action: 'UPDATE',
            userId: user.id,
            details: {
              updatedBy: user.email,
              changes: body,
            },
          },
        });
      }
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
    }

    return NextResponse.json({
      clinic: updatedClinic,
      message: 'Clinic updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating clinic:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update clinic' },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/super-admin/clinics/[id]
 * Delete a clinic
 */
export const DELETE = withSuperAdminAuth(async (req: NextRequest, user: AuthUser, params: { id: string }) => {
  try {
    const clinicId = parseInt(params.id);
    
    if (isNaN(clinicId)) {
      return NextResponse.json(
        { error: 'Invalid clinic ID' },
        { status: 400 }
      );
    }

    // Check if clinic exists (select only needed fields for backwards compatibility)
    const existingClinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { id: true, name: true },
    });

    if (!existingClinic) {
      return NextResponse.json(
        { error: 'Clinic not found' },
        { status: 404 }
      );
    }

    // Delete the clinic (this will cascade delete related records based on schema)
    await prisma.clinic.delete({
      where: { id: clinicId },
    });

    return NextResponse.json({
      message: 'Clinic deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting clinic:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete clinic' },
      { status: 500 }
    );
  }
});

