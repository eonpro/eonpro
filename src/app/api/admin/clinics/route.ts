import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../lib/logger';
import { basePrisma as prisma } from '@/lib/db';
import { UserRole } from '@prisma/client';
import { withSuperAdminAuth, AuthUser } from '@/lib/auth/middleware';

/**
 * GET /api/admin/clinics
 * Get all clinics (super_admin only - clinic management is restricted)
 */
export const GET = withSuperAdminAuth(async (request: NextRequest, user: AuthUser) => {
  try {
    // Use explicit select for backwards compatibility with schema changes
    const clinics = await prisma.clinic.findMany({
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
        billingPlan: true,
        patientLimit: true,
        providerLimit: true,
        storageLimit: true,
        primaryColor: true,
        secondaryColor: true,
        accentColor: true,
        logoUrl: true,
        faviconUrl: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            patients: true,
            users: true,
            orders: true,
            invoices: true,
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Count providers per clinic from both User table (role PROVIDER) and Provider table
    const clinicsWithProviderCount = await Promise.all(
      clinics.map(async (clinic) => {
        const [userProviderCount, providerTableCount] = await Promise.all([
          prisma.user.count({
            where: {
              clinicId: clinic.id,
              role: UserRole.PROVIDER,
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

    return NextResponse.json({ clinics: clinicsWithProviderCount });
  } catch (error) {
    logger.error('Error fetching clinics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch clinics' },
      { status: 500 }
    );
  }
});

/**
 * POST /api/admin/clinics
 * Create a new clinic (super_admin only)
 */
export const POST = withSuperAdminAuth(async (request: NextRequest, user: AuthUser) => {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.name || !body.subdomain || !body.adminEmail) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check if subdomain is already taken (select only id for efficiency)
    const existing = await prisma.clinic.findUnique({
      where: { subdomain: body.subdomain },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Subdomain already exists' },
        { status: 409 }
      );
    }

    // Create the clinic
    // Generate default patientIdPrefix from subdomain if not provided
    const patientIdPrefix = body.patientIdPrefix
      ? body.patientIdPrefix.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5)
      : body.subdomain.toUpperCase().slice(0, 3);

    const clinic = await prisma.clinic.create({
      data: {
        name: body.name,
        subdomain: body.subdomain.toLowerCase().replace(/[^a-z0-9]/g, ''),
        customDomain: body.customDomain || null,
        status: body.status || 'TRIAL',
        adminEmail: body.adminEmail,
        supportEmail: body.supportEmail || body.adminEmail,
        phone: body.phone || null,
        billingPlan: body.billingPlan || 'starter',
        patientLimit: body.patientLimit || 100,
        providerLimit: body.providerLimit || 5,
        storageLimit: body.storageLimit || 5000,
        primaryColor: body.primaryColor || '#3B82F6',
        secondaryColor: body.secondaryColor || '#10B981',
        timezone: body.timezone || 'America/New_York',
        patientIdPrefix: patientIdPrefix || null,
        address: body.address || {},
        settings: body.settings || {
          allowPatientRegistration: true,
          requireEmailVerification: false,
          enableTelehealth: false,
          enableEPrescribing: false,
        },
        features: body.features || {
          STRIPE_SUBSCRIPTIONS: false,
          TWILIO_SMS: false,
          TWILIO_CHAT: false,
          ZOOM_TELEHEALTH: false,
          AWS_S3: false,
          AI_SOAP_NOTES: false,
          INTERNAL_MESSAGING: true,
          TICKET_SYSTEM: true,
        },
        integrations: body.integrations || {},
      }
    });
    
    // Create audit log
    await prisma.clinicAuditLog.create({
      data: {
        clinicId: clinic.id,
        action: 'CREATE',
        userId: user.id,
        details: {
          createdBy: user.email,
          initialPlan: clinic.billingPlan,
        }
      }
    });
    
    return NextResponse.json(clinic, { status: 201 });
  } catch (error) {
    logger.error('Error creating clinic:', error);
    return NextResponse.json(
      { error: 'Failed to create clinic' },
      { status: 500 }
    );
  }
});
