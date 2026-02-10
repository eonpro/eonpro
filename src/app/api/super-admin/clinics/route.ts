import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

/**
 * Middleware to check for Super Admin role
 */
function withSuperAdminAuth(handler: (req: NextRequest, user: AuthUser) => Promise<Response>) {
  return withAuth(handler, { roles: ['super_admin'] });
}

/**
 * GET /api/super-admin/clinics
 * Get all clinics with stats
 */
export const GET = withSuperAdminAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    logger.info('Super-admin clinics list', { userId: user.id, role: user.role });

    // Note: Explicitly selecting fields for backwards compatibility
    // (buttonTextColor may not exist in production DB if migration hasn't run)
    const clinics = await prisma.clinic.findMany({
      select: {
        id: true,
        name: true,
        subdomain: true,
        customDomain: true,
        status: true,
        adminEmail: true,
        billingPlan: true,
        primaryColor: true,
        secondaryColor: true,
        accentColor: true,
        logoUrl: true,
        iconUrl: true,
        faviconUrl: true,
        createdAt: true,
        _count: {
          select: {
            patients: true,
            users: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    logger.debug('Super-admin clinics fetched', { count: clinics.length });

    // Count providers per clinic - users with PROVIDER role (matches Users tab display)
    const clinicsWithProviderCount = await Promise.all(
      clinics.map(async (clinic: (typeof clinics)[number]) => {
        const providerCount = await prisma.user.count({
          where: {
            clinicId: clinic.id,
            role: 'PROVIDER',
          },
        });
        return {
          ...clinic,
          _count: {
            ...clinic._count,
            providers: providerCount,
          },
        };
      })
    );

    // Get total stats
    const totalPatients = await prisma.patient.count();
    // Count total providers - users with PROVIDER role (matches Users tab display)
    const totalProviders = await prisma.user.count({ where: { role: 'PROVIDER' } });

    return NextResponse.json({
      clinics: clinicsWithProviderCount,
      totalPatients,
      totalProviders,
      totalClinics: clinics.length,
    });
  } catch (error) {
    logger.error('Error fetching clinics', error instanceof Error ? error : undefined, {
      route: 'GET /api/super-admin/clinics',
      userId: user.id,
    });
    return NextResponse.json(
      {
        error: 'Failed to fetch clinics',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
});

/**
 * POST /api/super-admin/clinics
 * Create a new clinic
 */
export const POST = withSuperAdminAuth(async (req: NextRequest, user: AuthUser) => {
  try {
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
      buttonTextColor,
      logoUrl,
      iconUrl,
      faviconUrl,
    } = body;

    // Validate required fields
    if (!name || !subdomain || !adminEmail) {
      return NextResponse.json(
        { error: 'Name, subdomain, and admin email are required' },
        { status: 400 }
      );
    }

    // Check if subdomain is already taken (select only id for efficiency)
    const existingClinic = await prisma.clinic.findUnique({
      where: { subdomain },
      select: { id: true },
    });

    if (existingClinic) {
      return NextResponse.json({ error: 'Subdomain is already taken' }, { status: 400 });
    }

    // Check if custom domain is already taken
    if (customDomain) {
      const existingDomain = await prisma.clinic.findUnique({
        where: { customDomain },
        select: { id: true },
      });
      if (existingDomain) {
        return NextResponse.json({ error: 'Custom domain is already in use' }, { status: 400 });
      }
    }

    // Create the clinic
    const clinic = await prisma.clinic.create({
      data: {
        name,
        subdomain,
        customDomain: customDomain || null,
        adminEmail,
        supportEmail: supportEmail || null,
        phone: phone || null,
        timezone: timezone || 'America/New_York',
        address: address || null,
        settings: settings || {},
        features: features || {},
        integrations: {},
        billingPlan: billingPlan || 'starter',
        patientLimit: patientLimit || 100,
        providerLimit: providerLimit || 5,
        storageLimit: storageLimit || 5000,
        primaryColor: primaryColor || '#10B981',
        secondaryColor: secondaryColor || '#3B82F6',
        accentColor: accentColor || '#d3f931',
        buttonTextColor: buttonTextColor || 'auto',
        logoUrl: logoUrl || null,
        iconUrl: iconUrl || null,
        faviconUrl: faviconUrl || null,
        status: 'ACTIVE',
      },
    });

    // Create audit log (optional - don't fail if user doesn't exist in DB)
    try {
      // Check if user exists in database before creating audit log
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
      });

      if (dbUser) {
        await prisma.clinicAuditLog.create({
          data: {
            clinicId: clinic.id,
            action: 'CREATE',
            userId: user.id,
            details: {
              createdBy: user.email,
              initialSettings: settings,
            },
          },
        });
      } else {
        // User not in DB - audit log skipped for this clinic creation
      }
    } catch (auditError) {
      logger.error('Failed to create audit log', auditError instanceof Error ? auditError : undefined);
    }

    return NextResponse.json({
      clinic,
      message: 'Clinic created successfully',
    });
  } catch (error) {
    logger.error('Error creating clinic', error instanceof Error ? error : undefined, {
      route: 'POST /api/super-admin/clinics',
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create clinic' },
      { status: 500 }
    );
  }
});
