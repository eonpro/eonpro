import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../lib/logger';

import { prisma } from '@/lib/db';

/**
 * GET /api/admin/clinics
 * Get all clinics (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    // TODO: Add admin authentication check
    
    const clinics = await prisma.clinic.findMany({
      include: {
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
    
    // Count providers (users with role PROVIDER) per clinic
    const clinicsWithProviderCount = await Promise.all(
      clinics.map(async (clinic) => {
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
    
    return NextResponse.json(clinicsWithProviderCount);
  } catch (error) {
    logger.error('Error fetching clinics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch clinics' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/clinics
 * Create a new clinic (admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    if (!body.name || !body.subdomain || !body.adminEmail) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // Check if subdomain is already taken
    const existing = await prisma.clinic.findUnique({
      where: { subdomain: body.subdomain }
    });
    
    if (existing) {
      return NextResponse.json(
        { error: 'Subdomain already exists' },
        { status: 409 }
      );
    }
    
    // Create the clinic
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
        details: {
          createdBy: 'admin', // TODO: Get from auth
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
}
