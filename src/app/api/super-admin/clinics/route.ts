import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

/**
 * Middleware to check for Super Admin role
 */
function withSuperAdminAuth(
  handler: (req: NextRequest, user: AuthUser) => Promise<Response>
) {
  return withAuth(handler, { roles: ['super_admin', 'SUPER_ADMIN'] });
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
            providers: true,
            users: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get total stats
    const totalPatients = await prisma.patient.count();
    const totalProviders = await prisma.provider.count();

    return NextResponse.json({
      clinics,
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

    // Create audit log
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

