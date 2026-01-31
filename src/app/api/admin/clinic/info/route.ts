/**
 * Admin Clinic Info API
 *
 * Allows clinic admins to view and update their clinic's contact information.
 * Changes sync with the super-admin clinic management.
 */

import { NextRequest, NextResponse } from 'next/server';
import { basePrisma as prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

/**
 * GET /api/admin/clinic/info
 * Get the current admin's clinic information
 */
export const GET = withAuth(async (request: NextRequest, user: AuthUser) => {
  try {
    if (!user.clinicId) {
      return NextResponse.json(
        { error: 'User is not associated with a clinic' },
        { status: 400 }
      );
    }

    const clinic = await prisma.clinic.findUnique({
      where: { id: user.clinicId },
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
        backgroundColor: true,
        buttonTextColor: true,
        logoUrl: true,
        iconUrl: true,
        faviconUrl: true,
        customCss: true,
        settings: true,
        features: true,
        createdAt: true,
        updatedAt: true,
        // Stripe status
        stripeAccountId: true,
        stripeAccountStatus: true,
        stripeOnboardingComplete: true,
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
        stripePlatformAccount: true,
        // Lifefile status
        lifefileEnabled: true,
        // Counts
        _count: {
          select: {
            patients: true,
            users: true,
            providers: true,
            orders: true,
          }
        }
      }
    });

    if (!clinic) {
      return NextResponse.json(
        { error: 'Clinic not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ clinic });
  } catch (error) {
    logger.error('Error fetching clinic info:', error);
    return NextResponse.json(
      { error: 'Failed to fetch clinic information' },
      { status: 500 }
    );
  }
}, { roles: ['admin', 'super_admin'] });

/**
 * PATCH /api/admin/clinic/info
 * Update the current admin's clinic information
 *
 * Clinic admins can update:
 * - phone
 * - supportEmail
 * - address (business address)
 *
 * These changes sync to the super-admin clinic view.
 */
export const PATCH = withAuth(async (request: NextRequest, user: AuthUser) => {
  try {
    if (!user.clinicId) {
      return NextResponse.json(
        { error: 'User is not associated with a clinic' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { phone, supportEmail, address } = body;

    // Validate email format if provided
    if (supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Validate phone format if provided (basic validation)
    if (phone && phone.replace(/\D/g, '').length < 10) {
      return NextResponse.json(
        { error: 'Phone number must be at least 10 digits' },
        { status: 400 }
      );
    }

    // Validate address structure if provided
    if (address && typeof address === 'object') {
      const validAddressFields = ['address1', 'address2', 'city', 'state', 'zip', 'country'];
      const addressKeys = Object.keys(address);
      const invalidKeys = addressKeys.filter(k => !validAddressFields.includes(k));
      if (invalidKeys.length > 0) {
        return NextResponse.json(
          { error: `Invalid address fields: ${invalidKeys.join(', ')}` },
          { status: 400 }
        );
      }
    }

    // Check if clinic exists
    const existingClinic = await prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: {
        id: true,
        name: true,
        phone: true,
        supportEmail: true,
        address: true,
      },
    });

    if (!existingClinic) {
      return NextResponse.json(
        { error: 'Clinic not found' },
        { status: 404 }
      );
    }

    // Build update data
    const updateData: any = {};
    if (phone !== undefined) updateData.phone = phone || null;
    if (supportEmail !== undefined) updateData.supportEmail = supportEmail || null;
    if (address !== undefined) updateData.address = address || null;

    // Update clinic
    const updatedClinic = await prisma.clinic.update({
      where: { id: user.clinicId },
      data: updateData,
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
        backgroundColor: true,
        buttonTextColor: true,
        logoUrl: true,
        iconUrl: true,
        faviconUrl: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            patients: true,
            users: true,
            providers: true,
            orders: true,
          }
        }
      }
    });

    // Create audit log with detailed changes
    const changes: any = {};
    if (phone !== undefined && phone !== existingClinic.phone) {
      changes.phone = { from: existingClinic.phone, to: phone };
    }
    if (supportEmail !== undefined && supportEmail !== existingClinic.supportEmail) {
      changes.supportEmail = { from: existingClinic.supportEmail, to: supportEmail };
    }
    if (address !== undefined) {
      changes.address = { from: existingClinic.address, to: address };
    }

    if (Object.keys(changes).length > 0) {
      try {
        await prisma.clinicAuditLog.create({
          data: {
            clinicId: user.clinicId,
            action: 'UPDATE_CLINIC_INFO',
            userId: user.id,
            details: {
              updatedBy: user.email,
              changes,
            },
            ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
            userAgent: request.headers.get('user-agent') || 'unknown',
          },
        });
      } catch (auditError) {
        logger.warn('Failed to create audit log for clinic update:', auditError);
      }
    }

    logger.info(`[CLINIC-INFO] Admin ${user.email} updated clinic ${existingClinic.name} info`);

    return NextResponse.json({
      clinic: updatedClinic,
      message: 'Clinic information updated successfully',
    });
  } catch (error) {
    logger.error('Error updating clinic info:', error);
    return NextResponse.json(
      { error: 'Failed to update clinic information' },
      { status: 500 }
    );
  }
}, { roles: ['admin', 'super_admin'] });
