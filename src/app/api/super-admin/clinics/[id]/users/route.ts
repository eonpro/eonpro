import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { basePrisma as prisma } from '@/lib/db';
import { withAuthParams, AuthUser } from '@/lib/auth/middleware-with-params';
import bcrypt from 'bcryptjs';
import { logger } from '@/lib/logger';
import { sendUserWelcomeNotification } from '@/lib/notifications/user-welcome';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Middleware to check for Super Admin role.
 * Uses withAuthParams which properly handles dynamic route params and
 * maintains parity with withAuth (JWT algorithm restriction, session
 * validation, clinic context via AsyncLocalStorage, security headers).
 */
function withSuperAdminAuth(
  handler: (req: NextRequest, user: AuthUser, params: { id: string }) => Promise<Response>
) {
  return withAuthParams<RouteContext>(
    async (req, user, context) => {
      const params = await context.params;
      return handler(req, user, params);
    },
    { roles: ['super_admin'] }
  );
}

/**
 * GET /api/super-admin/clinics/[id]/users
 * Get all users for a clinic
 */
export const GET = withSuperAdminAuth(
  async (req: NextRequest, user: AuthUser, params: { id: string }) => {
    const clinicId = parseInt(params.id);
    if (isNaN(clinicId)) {
      return NextResponse.json({ error: 'Invalid clinic ID' }, { status: 400 });
    }

    let step = 'init';
    try {
      step = 'clinic_lookup';
      const clinic = await prisma.clinic.findUnique({
        where: { id: clinicId },
        select: { id: true, name: true },
      });

      if (!clinic) {
        return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
      }

      step = 'role_filter';
      const url = new URL(req.url);
      const rolesParam = url.searchParams.get('roles');
      const roleFilter = rolesParam
        ? rolesParam
            .split(',')
            .map((r) => r.trim())
            .filter(Boolean)
        : null;

      step = 'user_query';
      const users = await prisma.user.findMany({
        where: {
          OR: [{ clinicId }, { userClinics: { some: { clinicId, isActive: true } } }],
          ...(roleFilter && roleFilter.length > 0 ? { role: { in: roleFilter as any[] } } : {}),
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
          userClinics: {
            where: { clinicId },
            select: {
              role: true,
              isPrimary: true,
              isActive: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      step = 'format';
      const formattedUsers = users.map((u) => {
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
          isPrimary: clinicAssignment?.isPrimary ?? u.clinicId === clinicId,
        };
      });

      return NextResponse.json({ users: formattedUsers });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      const stack =
        error instanceof Error ? error.stack?.split('\n').slice(0, 5).join('\n') : undefined;
      logger.error('Error fetching clinic users', { step, clinicId, error: msg });
      return NextResponse.json(
        { error: `Failed at step "${step}"`, detail: msg, stack },
        { status: 500 }
      );
    }
  }
);

/**
 * POST /api/super-admin/clinics/[id]/users
 * Create a new user for a clinic
 */
export const POST = withSuperAdminAuth(
  async (req: NextRequest, user: AuthUser, params: { id: string }) => {
    try {
      const clinicId = parseInt(params.id);

      if (isNaN(clinicId)) {
        return NextResponse.json({ error: 'Invalid clinic ID' }, { status: 400 });
      }

      const clinic = await prisma.clinic.findUnique({
        where: { id: clinicId },
        select: { id: true, name: true, subdomain: true, customDomain: true, logoUrl: true },
      });

      if (!clinic) {
        return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
      }

      const body = await req.json();
      const {
        email,
        phone,
        firstName,
        lastName,
        role,
        password,
        sendInvite,
        // Provider-specific fields
        npi,
        deaNumber,
        licenseNumber,
        licenseState,
        specialty,
      } = body;

      if (!email || !firstName || !lastName || !role) {
        return NextResponse.json(
          { error: 'Email, first name, last name, and role are required' },
          { status: 400 }
        );
      }
      if (!password && !sendInvite) {
        return NextResponse.json(
          { error: 'Password is required when not sending an invitation' },
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
          return NextResponse.json({ error: 'NPI must be exactly 10 digits' }, { status: 400 });
        }
      }

      // Validate role (case-insensitive) - normalizedRole already defined above
      const validRoles = ['admin', 'provider', 'staff', 'support', 'sales_rep', 'pharmacy_rep'];
      if (!validRoles.includes(normalizedRole)) {
        return NextResponse.json(
          {
            error:
              'Invalid role. Must be ADMIN, PROVIDER, STAFF, SUPPORT, SALES_REP, or PHARMACY_REP',
          },
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

        if (existingClinicLink && existingClinicLink.isActive) {
          return NextResponse.json(
            { error: 'This user is already a member of this clinic' },
            { status: 400 }
          );
        }

        // Reactivate if previously deactivated
        if (existingClinicLink && !existingClinicLink.isActive) {
          await prisma.userClinic.update({
            where: { id: existingClinicLink.id },
            data: { isActive: true, role: prismaRole },
          });

          // Also reactivate the user account if it was deactivated
          if (existingUser.status === 'INACTIVE') {
            await prisma.user.update({
              where: { id: existingUser.id },
              data: { status: 'ACTIVE' },
            });
          }

          logger.info('[CLINIC-USERS] Reactivated user in clinic', {
            userId: existingUser.id,
            clinicId,
          });

          return NextResponse.json({
            user: {
              id: existingUser.id,
              email: existingUser.email,
              firstName: existingUser.firstName,
              lastName: existingUser.lastName,
              role: prismaRole,
              status: 'ACTIVE',
              createdAt: existingUser.createdAt,
            },
            message: 'User reactivated in clinic successfully',
            isExistingUser: true,
          });
        }

        // Handle provider record for PROVIDER role
        let needsProviderRecord = false;
        if (normalizedRole === 'provider') {
          if (!existingUser.provider) {
            // User has no Provider record - need to create one
            needsProviderRecord = true;

            // Validate provider credentials are provided
            if (!npi || !licenseNumber || !licenseState) {
              return NextResponse.json(
                {
                  error:
                    'NPI, license number, and license state are required when adding a user as a provider',
                },
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
          } else if (
            existingUser.provider.clinicId !== null &&
            existingUser.provider.clinicId !== clinicId
          ) {
            // User has a Provider from a different clinic - make it shared (clinicId = null)
            // so it appears in all clinics the provider is assigned to
            try {
              await prisma.provider.update({
                where: { id: existingUser.provider.id },
                data: { clinicId: null }, // Make provider shared across clinics
              });
              logger.info('[CLINIC-USERS] Made Provider shared for multi-clinic user', {
                providerId: existingUser.provider.id,
                email: existingUser.email,
              });
            } catch (updateError: unknown) {
              logger.error('Error making provider shared', {
                error: updateError instanceof Error ? updateError.message : String(updateError),
              });
            }
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
                clinicId: null, // Make shared by default for multi-clinic support
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

            logger.info('[CLINIC-USERS] Created and linked Provider record for existing user', {
              email: existingUser.email,
            });
          } catch (providerError: unknown) {
            logger.error('Error creating provider record for existing user', {
              error: providerError instanceof Error ? providerError.message : String(providerError),
            });
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

        if (existingClinicLink && existingClinicLink.isActive) {
          return NextResponse.json(
            { error: 'This provider is already a member of this clinic' },
            { status: 400 }
          );
        }

        // Reactivate if previously deactivated
        if (existingClinicLink && !existingClinicLink.isActive) {
          await prisma.userClinic.update({
            where: { id: existingClinicLink.id },
            data: { isActive: true, role: prismaRole },
          });

          if (existingProvider.user.status === 'INACTIVE') {
            await prisma.user.update({
              where: { id: existingProvider.user.id },
              data: { status: 'ACTIVE' },
            });
          }

          logger.info('[CLINIC-USERS] Reactivated provider in clinic', {
            userId: existingProvider.user.id,
            clinicId,
          });

          return NextResponse.json({
            user: {
              id: existingProvider.user.id,
              email: existingProvider.user.email,
              firstName: existingProvider.user.firstName,
              lastName: existingProvider.user.lastName,
              role: prismaRole,
              status: 'ACTIVE',
              createdAt: existingProvider.user.createdAt,
            },
            message: 'Provider reactivated in clinic successfully',
            isExistingUser: true,
          });
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
          } catch (ucError: unknown) {
            logger.warn('Could not create UserClinic record', { error: (ucError as any).message });
          }

          return NextResponse.json({
            user: newUser,
            message: 'User account created and linked to existing provider',
            isExistingProvider: true,
          });
        } catch (createError: unknown) {
          // If user creation fails due to unique constraint, the email might exist
          // Try to find and link the existing user
          if ((createError as any).code === 'P2002') {
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
      const effectivePassword = password || crypto.randomBytes(32).toString('hex');
      const passwordHash = await bcrypt.hash(effectivePassword, 12);

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
      } catch (ucError: unknown) {
        logger.warn('Could not create UserClinic record', { error: (ucError as any).message });
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
        } catch (providerError: unknown) {
          logger.error('Error creating provider record', {
            error: providerError instanceof Error ? providerError.message : String(providerError),
          });
          // Don't fail the whole operation - the user was created
          // Just log the error for debugging
        }
      }

      // Send welcome notification (non-blocking — user creation already committed)
      const { sendInviteText } = body;
      let inviteResult: {
        emailSent: boolean;
        smsSent: boolean;
        emailError?: string;
        smsError?: string;
      } = { emailSent: false, smsSent: false };
      if (sendInvite || sendInviteText) {
        inviteResult = await sendUserWelcomeNotification({
          userId: newUser.id,
          email: newUser.email,
          firstName: newUser.firstName || firstName,
          lastName: newUser.lastName || lastName,
          role: newUser.role,
          clinicId,
          clinicName: clinic.name,
          clinicSubdomain: clinic.subdomain,
          clinicCustomDomain: clinic.customDomain,
          clinicLogoUrl: clinic.logoUrl,
          phone: newUser.phone,
          sendEmail: !!sendInvite,
          sendSms: !!sendInviteText,
        });
      }

      return NextResponse.json({
        user: newUser,
        message: 'User created successfully',
        inviteEmailSent: inviteResult.emailSent,
        inviteSmsSent: inviteResult.smsSent,
        ...(inviteResult.emailError ? { inviteEmailError: inviteResult.emailError } : {}),
        ...(inviteResult.smsError ? { inviteSmsError: inviteResult.smsError } : {}),
      });
    } catch (error: unknown) {
      logger.error('Error creating clinic user', {
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json(
        { error: (error as any).message || 'Failed to create user' },
        { status: 500 }
      );
    }
  }
);
