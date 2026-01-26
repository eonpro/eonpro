import { NextRequest, NextResponse } from 'next/server';
import { basePrisma as prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import bcrypt from 'bcryptjs';

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
 * GET /api/super-admin/clinics/[id]/users
 * Get all users for a clinic
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

    // Verify clinic exists (select only needed fields for backwards compatibility)
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { id: true, name: true },
    });

    if (!clinic) {
      return NextResponse.json(
        { error: 'Clinic not found' },
        { status: 404 }
      );
    }

    // Get all users for this clinic (either primary clinicId OR via UserClinic table)
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { clinicId }, // Users with this as primary clinic
          { 
            userClinics: { 
              some: { 
                clinicId,
                isActive: true 
              } 
            } 
          }, // Users added via UserClinic
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
        clinicId: true, // Include to check if this is their primary clinic
        userClinics: {
          where: { clinicId },
          select: {
            role: true,
            isPrimary: true,
            isActive: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' },
    });

    // Format response - use UserClinic role if different from User role
    const formattedUsers = users.map(user => {
      const clinicAssignment = user.userClinics?.[0];
      return {
        id: user.id,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        role: clinicAssignment?.role || user.role, // Use clinic-specific role if exists
        status: user.status,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        isPrimary: clinicAssignment?.isPrimary ?? (user.clinicId === clinicId),
      };
    });

    return NextResponse.json({ users: formattedUsers });
  } catch (error: any) {
    console.error('Error fetching clinic users:', error);
    return NextResponse.json(
      { error: 'Failed to fetch clinic users' },
      { status: 500 }
    );
  }
});

/**
 * POST /api/super-admin/clinics/[id]/users
 * Create a new user for a clinic
 */
export const POST = withSuperAdminAuth(async (req: NextRequest, user: AuthUser, params: { id: string }) => {
  try {
    const clinicId = parseInt(params.id);
    
    if (isNaN(clinicId)) {
      return NextResponse.json(
        { error: 'Invalid clinic ID' },
        { status: 400 }
      );
    }

    // Verify clinic exists (select only needed fields for backwards compatibility)
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { id: true, name: true },
    });

    if (!clinic) {
      return NextResponse.json(
        { error: 'Clinic not found' },
        { status: 404 }
      );
    }

    const body = await req.json();
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

    // Normalize role for validation (handle uppercase from frontend)
    const normalizedRole = role.toLowerCase();

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
    }

    // Validate role (case-insensitive) - normalizedRole already defined above
    const validRoles = ['admin', 'provider', 'staff', 'support'];
    if (!validRoles.includes(normalizedRole)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be ADMIN, PROVIDER, STAFF, or SUPPORT' },
        { status: 400 }
      );
    }

    // Convert role to uppercase for Prisma enum
    const prismaRole = role.toUpperCase();

    // Check if user with email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { provider: true },
    });

    // Check if NPI is already in use (for providers)
    let existingProvider = null;
    if (normalizedRole === 'provider' && npi) {
      existingProvider = await prisma.provider.findFirst({
        where: { npi },
        include: { user: true },
      });
    }

    // CASE 1: Existing user found - add them to this clinic
    if (existingUser) {
      // Check if user is already in this clinic
      const existingClinicLink = await prisma.userClinic.findFirst({
        where: {
          userId: existingUser.id,
          clinicId,
        },
      });

      if (existingClinicLink) {
        return NextResponse.json(
          { error: 'This user is already a member of this clinic' },
          { status: 400 }
        );
      }

      // If adding as PROVIDER role and user doesn't have a Provider record, validate first
      let needsProviderRecord = false;
      if (normalizedRole === 'provider' && !existingUser.provider) {
        needsProviderRecord = true;
        
        // Validate provider credentials are provided
        if (!npi || !licenseNumber || !licenseState) {
          return NextResponse.json(
            { error: 'NPI, license number, and license state are required when adding a user as a provider' },
            { status: 400 }
          );
        }

        // Check if NPI is already in use by another provider
        const npiInUse = await prisma.provider.findFirst({
          where: { npi },
        });

        if (npiInUse) {
          return NextResponse.json(
            { error: 'This NPI is already registered to another provider' },
            { status: 400 }
          );
        }
      }

      // Add user to this clinic via UserClinic
      await prisma.userClinic.create({
        data: {
          userId: existingUser.id,
          clinicId,
          role: prismaRole,
          isPrimary: false, // Not primary since they already have a primary clinic
          isActive: true,
        },
      });

      // Create Provider record if needed (validated above)
      if (needsProviderRecord) {
        try {
          // Create Provider record for existing user
          const providerRecord = await prisma.provider.create({
            data: {
              email: existingUser.email.toLowerCase(),
              firstName: existingUser.firstName || firstName,
              lastName: existingUser.lastName || lastName,
              passwordHash: existingUser.passwordHash || '', // Use existing user's password hash
              clinicId,
              npi: npi,
              dea: deaNumber || null,
              licenseNumber: licenseNumber || null,
              licenseState: licenseState || null,
              titleLine: specialty || null,
            },
          });

          // Link Provider record to existing User
          await prisma.user.update({
            where: { id: existingUser.id },
            data: { providerId: providerRecord.id },
          });

          console.log(`[CLINIC-USERS] Created and linked Provider record for existing user ${existingUser.email}`);
        } catch (providerError: any) {
          console.error('Error creating provider record for existing user:', providerError);
          // Don't fail the operation - the user was already added to the clinic
          // They can complete their provider profile later
        }
      }

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

    // CASE 2: Existing provider by NPI but different email - link to clinic
    if (existingProvider && existingProvider.user) {
      // Check if this provider's user is already in this clinic
      const existingClinicLink = await prisma.userClinic.findFirst({
        where: {
          userId: existingProvider.user.id,
          clinicId,
        },
      });

      if (existingClinicLink) {
        return NextResponse.json(
          { error: 'This provider is already a member of this clinic' },
          { status: 400 }
        );
      }

      // Add existing provider's user to this clinic
      await prisma.userClinic.create({
        data: {
          userId: existingProvider.user.id,
          clinicId,
          role: prismaRole,
          isPrimary: false,
          isActive: true,
        },
      });

      return NextResponse.json({
        user: {
          id: existingProvider.user.id,
          email: existingProvider.user.email,
          firstName: existingProvider.user.firstName,
          lastName: existingProvider.user.lastName,
          role: existingProvider.user.role,
          status: existingProvider.user.status,
          createdAt: existingProvider.user.createdAt,
        },
        message: 'Existing provider added to clinic successfully',
        isExistingUser: true,
      });
    }

    // CASE 3: Provider NPI exists but no linked user - create user and link them
    if (existingProvider && !existingProvider.user) {
      // Hash password for new user
      const passwordHash = await bcrypt.hash(password, 12);

      try {
        // Create new user linked to existing provider
        const newUser = await prisma.user.create({
          data: {
            email: email.toLowerCase(),
            firstName: existingProvider.firstName || firstName,
            lastName: existingProvider.lastName || lastName,
            role: prismaRole,
            passwordHash,
            clinicId,
            status: 'ACTIVE',
            providerId: existingProvider.id,
          },
          select: {
            id: true,
            email: true,
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
              clinicId,
              role: prismaRole,
              isPrimary: true,
              isActive: true,
            },
          });
        } catch (ucError: any) {
          console.warn('Could not create UserClinic record:', ucError.message);
        }

        return NextResponse.json({
          user: newUser,
          message: 'User account created and linked to existing provider',
          isExistingProvider: true,
        });
      } catch (createError: any) {
        // If user creation fails due to unique constraint, the email might exist
        // Try to find and link the existing user
        if (createError.code === 'P2002') {
          const existingUserByEmail = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
          });
          
          if (existingUserByEmail) {
            // Link existing user to the orphan provider
            await prisma.user.update({
              where: { id: existingUserByEmail.id },
              data: { providerId: existingProvider.id },
            });

            // Add to this clinic
            const existingLink = await prisma.userClinic.findFirst({
              where: { userId: existingUserByEmail.id, clinicId },
            });

            if (!existingLink) {
              await prisma.userClinic.create({
                data: {
                  userId: existingUserByEmail.id,
                  clinicId,
                  role: prismaRole,
                  isPrimary: false,
                  isActive: true,
                },
              });
            }

            return NextResponse.json({
              user: existingUserByEmail,
              message: 'Existing user linked to provider and added to clinic',
              isExistingUser: true,
            });
          }
        }
        throw createError;
      }
    }

    // CASE 4: New user - create everything fresh
    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create the user
    const newUser = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        phone: phone || null,
        firstName,
        lastName,
        role: prismaRole,
        passwordHash,
        clinicId,
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

    // Create UserClinic record for multi-clinic support
    try {
      await prisma.userClinic.create({
        data: {
          userId: newUser.id,
          clinicId,
          role: prismaRole,
          isPrimary: true,
          isActive: true,
        },
      });
    } catch (ucError: any) {
      console.warn('Could not create UserClinic record:', ucError.message);
      // Continue anyway - the user was created successfully
    }

    // If role is PROVIDER, also create a Provider record with credentials
    let providerRecord = null;
    if (normalizedRole === 'provider') {
      try {
        providerRecord = await prisma.provider.create({
          data: {
            email: email.toLowerCase(),
            firstName,
            lastName,
            passwordHash,
            clinicId,
            npi: npi,
            dea: deaNumber || null,
            licenseNumber: licenseNumber || null,
            licenseState: licenseState || null,
            titleLine: specialty || null,
          },
        });

        // Link the Provider record to the User
        if (providerRecord) {
          await prisma.user.update({
            where: { id: newUser.id },
            data: { providerId: providerRecord.id },
          });
        }
      } catch (providerError: any) {
        console.error('Error creating provider record:', providerError);
        // Don't fail the whole operation - the user was created
        // Just log the error for debugging
      }
    }

    // TODO: Send invitation email if sendInvite is true
    // This would integrate with your email service (SES, SendGrid, etc.)
    if (sendInvite) {
      // TODO: Implement invitation email via SES/SendGrid
      // await sendInvitationEmail({ email, firstName, password, clinicName: clinic.name });
    }

    return NextResponse.json({
      user: newUser,
      message: 'User created successfully',
    });
  } catch (error: any) {
    console.error('Error creating clinic user:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create user' },
      { status: 500 }
    );
  }
});

