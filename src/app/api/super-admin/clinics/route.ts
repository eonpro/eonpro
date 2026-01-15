import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

/**
 * Middleware to check for Super Admin role
 */
function withSuperAdminAuth(
  handler: (req: NextRequest, user: AuthUser) => Promise<Response>
) {
  return withAuth(handler, { roles: ['super_admin', 'super_admin'] });
}

/**
 * GET /api/super-admin/clinics
 * Get all clinics with stats
 */
export const GET = withSuperAdminAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const clinics = await prisma.clinic.findMany({
      include: {
        _count: {
          select: {
            patients: true,
            users: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' },
    });

    // Count providers per clinic from both User table (role PROVIDER) and Provider table
    const clinicsWithProviderCount = await Promise.all(
      clinics.map(async (clinic) => {
        const [userProviderCount, providerTableCount] = await Promise.all([
          prisma.user.count({
            where: {
              clinicId: clinic.id,
              role: 'PROVIDER',
            },
          }),
          prisma.provider.count({
            where: {
              clinicId: clinic.id,
            },
          }),
        ]);
        // Use the higher count (some providers may be in both tables)
        const providerCount = Math.max(userProviderCount, providerTableCount);
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
    // Count total providers from both User table (role PROVIDER) and Provider table
    const [userProviderCount, providerTableCount] = await Promise.all([
      prisma.user.count({ where: { role: 'PROVIDER' } }),
      prisma.provider.count(),
    ]);
    // Use the higher count (some providers may be in both tables)
    const totalProviders = Math.max(userProviderCount, providerTableCount);

    return NextResponse.json({
      clinics: clinicsWithProviderCount,
      totalPatients,
      totalProviders,
      totalClinics: clinics.length,
    });
  } catch (error: any) {
    console.error('Error fetching clinics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch clinics' },
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
      logoUrl,
      faviconUrl,
    } = body;

    // Validate required fields
    if (!name || !subdomain || !adminEmail) {
      return NextResponse.json(
        { error: 'Name, subdomain, and admin email are required' },
        { status: 400 }
      );
    }

    // Check if subdomain is already taken
    const existingClinic = await prisma.clinic.findUnique({
      where: { subdomain },
    });

    if (existingClinic) {
      return NextResponse.json(
        { error: 'Subdomain is already taken' },
        { status: 400 }
      );
    }

    // Check if custom domain is already taken
    if (customDomain) {
      const existingDomain = await prisma.clinic.findUnique({
        where: { customDomain },
      });
      if (existingDomain) {
        return NextResponse.json(
          { error: 'Custom domain is already in use' },
          { status: 400 }
        );
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
        logoUrl: logoUrl || null,
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
      // Don't fail the request if audit log fails
      console.error('Failed to create audit log:', auditError);
    }

    return NextResponse.json({
      clinic,
      message: 'Clinic created successfully',
    });
  } catch (error: any) {
    console.error('Error creating clinic:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create clinic' },
      { status: 500 }
    );
  }
});

