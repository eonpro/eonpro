/**
 * Provider Settings API
 * Allows providers to view and update their own profile, including signature
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, basePrisma } from '@/lib/db';
import { withProviderAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import bcrypt from 'bcryptjs';

/**
 * GET /api/provider/settings
 * Get the authenticated provider's profile and settings
 */
async function handleGet(req: NextRequest, user: AuthUser) {
  try {
    // Get user data with provider association
    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        provider: true,
        clinic: {
          select: {
            id: true,
            name: true,
            subdomain: true,
          },
        },
      },
    });

    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // If user is a provider, get provider details
    let providerData = userData.provider;

    // If no direct provider association, try to find by email
    // Use basePrisma to bypass clinic filtering since providers can be shared
    if (!providerData && user.role === 'provider') {
      providerData = await basePrisma.provider.findFirst({
        where: { email: user.email },
      });
    }

    // Get user's clinics for multi-clinic support
    let clinics: any[] = [];
    try {
      const userClinics = await prisma.userClinic.findMany({
        where: {
          userId: user.id,
          isActive: true,
        },
        include: {
          clinic: {
            select: {
              id: true,
              name: true,
              subdomain: true,
              logoUrl: true,
            },
          },
        },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        take: 100,
      });

      type UserClinicEntry = (typeof userClinics)[number];
      clinics = userClinics.map((uc: UserClinicEntry) => ({
        id: uc.clinic.id,
        name: uc.clinic.name,
        subdomain: uc.clinic.subdomain,
        logoUrl: uc.clinic.logoUrl,
        role: uc.role,
        isPrimary: uc.isPrimary,
      }));
    } catch {
      // UserClinic might not exist, fallback to user's clinic
      if (userData.clinic) {
        clinics = [
          {
            id: userData.clinic.id,
            name: userData.clinic.name,
            subdomain: userData.clinic.subdomain,
            role: user.role,
            isPrimary: true,
          },
        ];
      }
    }

    return NextResponse.json({
      user: {
        id: userData.id,
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.role,
        clinicId: userData.clinicId,
      },
      provider: providerData
        ? {
            id: providerData.id,
            firstName: providerData.firstName,
            lastName: providerData.lastName,
            email: providerData.email,
            phone: providerData.phone,
            npi: providerData.npi,
            dea: providerData.dea,
            licenseNumber: providerData.licenseNumber,
            licenseState: providerData.licenseState,
            titleLine: providerData.titleLine,
            signatureDataUrl: providerData.signatureDataUrl,
            hasSignature: !!providerData.signatureDataUrl,
          }
        : null,
      clinics,
      activeClinicId: userData.clinicId,
      hasMultipleClinics: clinics.length > 1,
    });
  } catch (error: any) {
    logger.error('Error fetching provider settings', { error: error.message, userId: user.id });
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

/**
 * PUT /api/provider/settings
 * Update the authenticated provider's profile
 */
async function handlePut(req: NextRequest, user: AuthUser) {
  try {
    const body = await req.json();
    const {
      firstName,
      lastName,
      phone,
      titleLine,
      signatureDataUrl,
      currentPassword,
      newPassword,
      // New provider credentials registration
      npi,
      dea,
      licenseNumber,
      licenseState,
    } = body;

    // Get user with provider
    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      include: { provider: true },
    });

    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get provider record - use basePrisma to bypass clinic filtering
    let provider = userData.provider;
    if (!provider && user.role === 'provider') {
      provider = await basePrisma.provider.findFirst({
        where: { email: user.email },
      });

      // If found by email but not linked, link it now
      if (provider && !userData.providerId) {
        await prisma.user.update({
          where: { id: user.id },
          data: { providerId: provider.id },
        });
        logger.info('Linked existing provider to user', {
          userId: user.id,
          providerId: provider.id,
        });
      }
    }

    // Update user record
    const userUpdateData: any = {};
    if (firstName) userUpdateData.firstName = firstName;
    if (lastName) userUpdateData.lastName = lastName;

    // Handle password change
    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: 'Current password is required to change password' },
          { status: 400 }
        );
      }

      // Verify current password
      const isValid = await bcrypt.compare(currentPassword, userData.passwordHash || '');
      if (!isValid) {
        return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
      }

      // Hash new password
      userUpdateData.passwordHash = await bcrypt.hash(newPassword, 12);
    }

    // Update user if there are changes
    if (Object.keys(userUpdateData).length > 0) {
      await prisma.user.update({
        where: { id: user.id },
        data: userUpdateData,
      });
    }

    // If no provider record exists but NPI provided, create one
    if (!provider && npi) {
      // Validate NPI format
      if (!/^\d{10}$/.test(npi)) {
        return NextResponse.json(
          { error: 'Invalid NPI format. Must be 10 digits.' },
          { status: 400 }
        );
      }

      // Check if NPI already exists - use basePrisma to search all clinics
      const existingProvider = await basePrisma.provider.findFirst({
        where: { npi },
      });

      if (existingProvider) {
        // Link to existing provider if email matches
        if (existingProvider.email === user.email) {
          await prisma.user.update({
            where: { id: user.id },
            data: { providerId: existingProvider.id },
          });
          provider = existingProvider;
        } else {
          return NextResponse.json(
            { error: 'This NPI is already registered to another provider.' },
            { status: 400 }
          );
        }
      } else {
        // Create new provider record - use basePrisma to bypass clinic filtering
        provider = await basePrisma.provider.create({
          data: {
            firstName: firstName || userData.firstName,
            lastName: lastName || userData.lastName,
            email: user.email,
            phone: phone || '',
            npi,
            dea: dea || '',
            licenseNumber: licenseNumber || '',
            licenseState: licenseState || '',
            titleLine: titleLine || '',
            clinicId: userData.clinicId,
          },
        });

        // Link provider to user
        await prisma.user.update({
          where: { id: user.id },
          data: { providerId: provider.id },
        });

        // Create audit log
        await prisma.providerAudit.create({
          data: {
            providerId: provider.id,
            actorEmail: user.email,
            action: 'credentials_registered',
            diff: { npi, dea, licenseNumber, licenseState },
          },
        });

        logger.info('Provider credentials registered', {
          userId: user.id,
          providerId: provider.id,
          npi,
        });
      }
    }

    // Update provider record if exists
    if (provider) {
      const providerUpdateData: any = {};
      if (firstName) providerUpdateData.firstName = firstName;
      if (lastName) providerUpdateData.lastName = lastName;
      if (phone !== undefined) providerUpdateData.phone = phone;
      if (titleLine !== undefined) providerUpdateData.titleLine = titleLine;
      if (signatureDataUrl !== undefined) providerUpdateData.signatureDataUrl = signatureDataUrl;
      // Allow updating DEA/license if not already set
      if (dea && !provider.dea) providerUpdateData.dea = dea;
      if (licenseNumber && !provider.licenseNumber)
        providerUpdateData.licenseNumber = licenseNumber;
      if (licenseState && !provider.licenseState) providerUpdateData.licenseState = licenseState;

      if (Object.keys(providerUpdateData).length > 0) {
        // Use basePrisma to bypass clinic filtering for provider updates
        await basePrisma.provider.update({
          where: { id: provider.id },
          data: providerUpdateData,
        });

        // Create audit log - only if provider has an id
        try {
          await prisma.providerAudit.create({
            data: {
              providerId: provider.id,
              actorEmail: user.email,
              action: 'settings_update',
              diff: providerUpdateData,
            },
          });
        } catch (auditError) {
          // Log but don't fail if audit creation fails
          logger.warn('Failed to create provider audit log', { error: auditError });
        }
      }
    } else if (signatureDataUrl) {
      // User is trying to save a signature but doesn't have a provider profile
      return NextResponse.json(
        {
          error:
            'Please register your provider credentials (NPI) in the Credentials tab before saving a signature.',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Settings updated successfully',
    });
  } catch (error: any) {
    logger.error('Error updating provider settings', {
      error: error.message,
      userId: user.id,
      code: error.code,
    });
    return NextResponse.json(
      { error: `Failed to update settings: ${error.message}` },
      { status: 500 }
    );
  }
}

export const GET = withProviderAuth(handleGet);
export const PUT = withProviderAuth(handlePut);
