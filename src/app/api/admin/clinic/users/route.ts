/**
 * Admin Clinic Users API
 * 
 * Allows clinic admins to view and manage users within their own clinic.
 */

import { NextRequest, NextResponse } from 'next/server';
import { basePrisma as prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import bcrypt from 'bcryptjs';

/**
 * GET /api/admin/clinic/users
 * Get all users in the current admin's clinic
 */
export const GET = withAuth(async (request: NextRequest, user: AuthUser) => {
  try {
    if (!user.clinicId) {
      return NextResponse.json(
        { error: 'User is not associated with a clinic' },
        { status: 400 }
      );
    }

    // Get all users for this clinic (either primary clinicId OR via UserClinic table)
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { clinicId: user.clinicId },
          { 
            userClinics: { 
              some: { 
                clinicId: user.clinicId,
                isActive: true 
              } 
            } 
          },
        ]
      },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        createdAt: true,
        lastLogin: true,
        clinicId: true,
        provider: {
          select: {
            id: true,
            npi: true,
            licenseNumber: true,
            licenseState: true,
            specialty: true,
          }
        },
        userClinics: {
          where: { clinicId: user.clinicId },
          select: {
            role: true,
            isPrimary: true,
            isActive: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' },
    });

    // Format response
    const formattedUsers = users.map(u => {
      const clinicAssignment = u.userClinics?.[0];
      return {
        id: u.id,
        email: u.email,
        phone: u.phone,
        firstName: u.firstName,
        lastName: u.lastName,
        role: clinicAssignment?.role || u.role,
        status: u.status,
        createdAt: u.createdAt,
        lastLogin: u.lastLogin,
        isPrimary: clinicAssignment?.isPrimary ?? (u.clinicId === user.clinicId),
        provider: u.provider,
      };
    });

    return NextResponse.json({ users: formattedUsers });
  } catch (error) {
    logger.error('Error fetching clinic users:', error);
    return NextResponse.json(
      { error: 'Failed to fetch clinic users' },
      { status: 500 }
    );
  }
}, { roles: ['admin', 'super_admin'] });

/**
 * POST /api/admin/clinic/users
 * Create a new user in the current admin's clinic
 */
export const POST = withAuth(async (request: NextRequest, user: AuthUser) => {
  try {
    if (!user.clinicId) {
      return NextResponse.json(
        { error: 'User is not associated with a clinic' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { 
      email, phone, firstName, lastName, role, password, sendInvite,
      // Provider-specific fields
      npi, deaNumber, licenseNumber, licenseState, specialty 
    } = body;

    // Validate required fields
    if (!email || !firstName || !lastName || !role || !password) {
      return NextResponse.json(
        { error: 'Email, first name, last name, role, and password are required' },
        { status: 400 }
      );
    }

    // Normalize role for validation
    const normalizedRole = role.toLowerCase();

    // Clinic admins can only create certain roles
    const allowedRoles = ['admin', 'provider', 'staff', 'support'];
    if (!allowedRoles.includes(normalizedRole)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be ADMIN, PROVIDER, STAFF, or SUPPORT' },
        { status: 400 }
      );
    }

    // Validate provider-specific required fields
    if (normalizedRole === 'provider') {
      if (!npi || !licenseNumber || !licenseState) {
        return NextResponse.json(
          { error: 'NPI, license number, and license state are required for providers' },
          { status: 400 }
        );
      }

      // Validate NPI format (10 digits)
      if (!/^\d{10}$/.test(npi)) {
        return NextResponse.json(
          { error: 'NPI must be exactly 10 digits' },
          { status: 400 }
        );
      }

      // Check if NPI is already in use
      const existingNPI = await prisma.provider.findFirst({
        where: { npi },
      });

      if (existingNPI) {
        return NextResponse.json(
          { error: 'This NPI is already registered to another provider' },
          { status: 400 }
        );
      }
    }

    // Check if user with email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      // Check if already in this clinic
      const existingClinicLink = await prisma.userClinic.findFirst({
        where: {
          userId: existingUser.id,
          clinicId: user.clinicId,
        },
      });

      if (existingClinicLink || existingUser.clinicId === user.clinicId) {
        return NextResponse.json(
          { error: 'This user is already a member of this clinic' },
          { status: 400 }
        );
      }

      // Add existing user to this clinic
      await prisma.userClinic.create({
        data: {
          userId: existingUser.id,
          clinicId: user.clinicId,
          role: role.toUpperCase(),
          isPrimary: false,
          isActive: true,
        },
      });

      return NextResponse.json({
        user: {
          id: existingUser.id,
          email: existingUser.email,
          firstName: existingUser.firstName,
          lastName: existingUser.lastName,
          role: existingUser.role,
          status: existingUser.status,
          createdAt: existingUser.createdAt,
        },
        message: 'Existing user added to clinic successfully',
        isExistingUser: true,
      });
    }

    // Create new user
    const passwordHash = await bcrypt.hash(password, 12);
    const prismaRole = role.toUpperCase();

    const newUser = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        phone: phone || null,
        firstName,
        lastName,
        role: prismaRole,
        passwordHash,
        clinicId: user.clinicId,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    // Create UserClinic record
    try {
      await prisma.userClinic.create({
        data: {
          userId: newUser.id,
          clinicId: user.clinicId,
          role: prismaRole,
          isPrimary: true,
          isActive: true,
        },
      });
    } catch (ucError) {
      logger.warn('Could not create UserClinic record');
    }

    // If role is PROVIDER, also create a Provider record
    if (normalizedRole === 'provider') {
      try {
        const providerRecord = await prisma.provider.create({
          data: {
            email: email.toLowerCase(),
            firstName,
            lastName,
            passwordHash,
            clinicId: user.clinicId,
            npi: npi,
            dea: deaNumber || null,
            licenseNumber: licenseNumber || null,
            licenseState: licenseState || null,
            titleLine: specialty || null,
          },
        });

        // Link the Provider record to the User
        await prisma.user.update({
          where: { id: newUser.id },
          data: { providerId: providerRecord.id },
        });
      } catch (providerError: any) {
        logger.error('Error creating provider record:', providerError);
      }
    }

    // Create audit log
    try {
      await prisma.clinicAuditLog.create({
        data: {
          clinicId: user.clinicId,
          action: 'CREATE_USER',
          userId: user.id,
          details: {
            createdBy: user.email,
            newUser: {
              email: newUser.email,
              role: newUser.role,
              firstName: newUser.firstName,
              lastName: newUser.lastName,
            },
          },
        },
      });
    } catch (auditError) {
      logger.warn('Failed to create audit log for user creation');
    }

    logger.info(`[CLINIC-USERS] Admin ${user.email} created user ${newUser.email} in clinic ${user.clinicId}`);

    return NextResponse.json({
      user: newUser,
      message: 'User created successfully',
    });
  } catch (error: any) {
    logger.error('Error creating clinic user:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create user' },
      { status: 500 }
    );
  }
}, { roles: ['admin', 'super_admin'] });
