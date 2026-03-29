import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { type Prisma } from '@prisma/client';
import { basePrisma as prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { sendUserWelcomeNotification } from '@/lib/notifications/user-welcome';

/**
 * Middleware to check for Super Admin role
 */
function withSuperAdminAuth(
  handler: (
    req: NextRequest,
    user: AuthUser,
    context: { params: Promise<{ id: string }> }
  ) => Promise<Response>
) {
  return withAuth(
    (req: NextRequest, user: AuthUser, context?: { params: Promise<{ id: string }> }) =>
      handler(req, user, context!),
    { roles: ['super_admin'] }
  );
}

/**
 * GET /api/super-admin/providers/[id]/user
 * Get linked user information for a provider
 */
export const GET = withSuperAdminAuth(
  async (req: NextRequest, user: AuthUser, context: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await context.params;
      const providerId = parseInt(id);

      if (isNaN(providerId)) {
        return NextResponse.json({ error: 'Invalid provider ID' }, { status: 400 });
      }

      const provider = await prisma.provider.findUnique({
        where: { id: providerId },
        select: {
          id: true,
          email: true,
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
              status: true,
              lastLogin: true,
              createdAt: true,
              clinicId: true,
              clinic: {
                select: {
                  id: true,
                  name: true,
                  subdomain: true,
                },
              },
              userClinics: {
                where: { isActive: true },
                select: {
                  clinicId: true,
                  role: true,
                  isPrimary: true,
                  clinic: {
                    select: {
                      id: true,
                      name: true,
                      subdomain: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!provider) {
        return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
      }

      return NextResponse.json({
        user: provider.user,
        providerEmail: provider.email,
      });
    } catch (error: unknown) {
      logger.error('[SUPER-ADMIN/PROVIDERS/USER] Error fetching user:', error);
      return NextResponse.json(
        { error: 'Failed to fetch user', details: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }
);

/**
 * POST /api/super-admin/providers/[id]/user
 * Create a new user account and link to provider
 *
 * Body: {
 *   email: string;
 *   password: string;
 *   firstName: string;
 *   lastName: string;
 *   clinicId?: number; // Optional - primary clinic for the user
 *   sendInvite?: boolean; // Optional - send welcome email
 * }
 */
export const POST = withSuperAdminAuth(
  async (req: NextRequest, user: AuthUser, context: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await context.params;
      const providerId = parseInt(id);

      if (isNaN(providerId)) {
        return NextResponse.json({ error: 'Invalid provider ID' }, { status: 400 });
      }

      const body = await req.json();
      const { email, password, firstName, lastName, clinicId, sendInvite } = body;

      // Validate required fields
      if (!email || !password) {
        return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
      }

      // Validate password length
      if (password.length < 8) {
        return NextResponse.json(
          { error: 'Password must be at least 8 characters' },
          { status: 400 }
        );
      }

      logger.info('[SUPER-ADMIN/PROVIDERS/USER] Creating user for provider', {
        providerId,
        email,
        userEmail: user.email,
      });

      // Check provider exists and doesn't already have a user
      const provider = await prisma.provider.findUnique({
        where: { id: providerId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          user: {
            select: { id: true },
          },
          providerClinics: {
            where: { isActive: true },
            select: { clinicId: true, isPrimary: true },
            orderBy: { isPrimary: 'desc' },
          },
        },
      });

      if (!provider) {
        return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
      }

      if (provider.user) {
        return NextResponse.json(
          { error: 'Provider already has a linked user account' },
          { status: 409 }
        );
      }

      // Check if email is already in use
      const existingUser = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (existingUser) {
        return NextResponse.json(
          { error: 'Email is already in use by another account' },
          { status: 409 }
        );
      }

      // Determine clinic ID - use provided, or provider's primary clinic, or first clinic
      let userClinicId = clinicId;
      if (!userClinicId && provider.providerClinics.length > 0) {
        const primaryClinic = provider.providerClinics.find(
          (pc: { isPrimary: boolean; clinicId: number }) => pc.isPrimary
        );
        userClinicId = primaryClinic?.clinicId || provider.providerClinics[0].clinicId;
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // Create user and link to provider in a transaction
      const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Create user with PROVIDER role
        const newUser = await tx.user.create({
          data: {
            email: email.toLowerCase(),
            passwordHash,
            firstName: firstName || provider.firstName,
            lastName: lastName || provider.lastName,
            role: 'PROVIDER',
            status: 'ACTIVE',
            clinicId: userClinicId,
            providerId: providerId,
          },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            status: true,
            clinicId: true,
          },
        });

        // If the user has a clinic, also create UserClinic entry
        if (userClinicId) {
          await tx.userClinic.create({
            data: {
              userId: newUser.id,
              clinicId: userClinicId,
              role: 'PROVIDER',
              isPrimary: true,
              isActive: true,
            },
          });
        }

        // Create additional UserClinic entries for all provider clinics
        for (const pc of provider.providerClinics) {
          if (pc.clinicId !== userClinicId) {
            await tx.userClinic.create({
              data: {
                userId: newUser.id,
                clinicId: pc.clinicId,
                role: 'PROVIDER',
                isPrimary: false,
                isActive: true,
              },
            });
          }
        }

        // Update provider email if different
        if (provider.email !== email.toLowerCase()) {
          await tx.provider.update({
            where: { id: providerId },
            data: { email: email.toLowerCase() },
          });
        }

        // Create audit log
        await tx.providerAudit.create({
          data: {
            providerId,
            actorEmail: user.email,
            action: 'USER_ACCOUNT_CREATED',
            diff: {
              userId: newUser.id,
              email: newUser.email,
              clinicId: userClinicId,
              createdBy: user.email,
            },
          },
        });

        return newUser;
      }, { timeout: 15000 });

      logger.info('[SUPER-ADMIN/PROVIDERS/USER] User created and linked', {
        providerId,
        userId: result.id,
        email: result.email,
      });

      let inviteResult = { emailSent: false, smsSent: false, emailError: undefined as string | undefined, smsError: undefined as string | undefined };
      if (sendInvite) {
        const clinic = userClinicId
          ? await prisma.clinic.findUnique({
              where: { id: userClinicId },
              select: { name: true, subdomain: true, customDomain: true, logoUrl: true },
            })
          : null;

        inviteResult = await sendUserWelcomeNotification({
          userId: result.id,
          email: result.email,
          firstName: result.firstName || provider.firstName,
          lastName: result.lastName || provider.lastName,
          role: 'PROVIDER',
          clinicId: userClinicId || 0,
          clinicName: clinic?.name || 'Your Clinic',
          clinicSubdomain: clinic?.subdomain,
          clinicCustomDomain: clinic?.customDomain,
          clinicLogoUrl: clinic?.logoUrl,
          sendEmail: true,
          sendSms: false,
        });
      }

      return NextResponse.json({
        user: result,
        message: 'User account created and linked to provider',
        inviteEmailSent: inviteResult.emailSent,
        ...(inviteResult.emailError ? { inviteEmailError: inviteResult.emailError } : {}),
      });
    } catch (error: unknown) {
      logger.error('[SUPER-ADMIN/PROVIDERS/USER] Error creating user:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : String(error) || 'Failed to create user account' },
        { status: 500 }
      );
    }
  }
);

/**
 * PUT /api/super-admin/providers/[id]/user
 * Link an existing user to provider
 *
 * Body: {
 *   userId: number;
 * }
 */
export const PUT = withSuperAdminAuth(
  async (req: NextRequest, user: AuthUser, context: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await context.params;
      const providerId = parseInt(id);

      if (isNaN(providerId)) {
        return NextResponse.json({ error: 'Invalid provider ID' }, { status: 400 });
      }

      const body = await req.json();
      const { userId } = body;

      if (!userId) {
        return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
      }

      logger.info('[SUPER-ADMIN/PROVIDERS/USER] Linking existing user to provider', {
        providerId,
        userId,
        userEmail: user.email,
      });

      // Check provider exists and doesn't already have a user
      const provider = await prisma.provider.findUnique({
        where: { id: providerId },
        select: {
          id: true,
          user: { select: { id: true } },
        },
      });

      if (!provider) {
        return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
      }

      if (provider.user) {
        return NextResponse.json(
          { error: 'Provider already has a linked user account. Unlink it first.' },
          { status: 409 }
        );
      }

      // Check user exists and doesn't already have a provider
      const existingUser = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          providerId: true,
        },
      });

      if (!existingUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      if (existingUser.providerId) {
        return NextResponse.json(
          { error: 'User is already linked to another provider' },
          { status: 409 }
        );
      }

      // Link user to provider
      const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: {
            providerId: providerId,
            role: 'PROVIDER', // Ensure role is PROVIDER
          },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            status: true,
            clinicId: true,
          },
        });

        // Create audit log
        await tx.providerAudit.create({
          data: {
            providerId,
            actorEmail: user.email,
            action: 'USER_ACCOUNT_LINKED',
            diff: {
              userId,
              email: existingUser.email,
              linkedBy: user.email,
            },
          },
        });

        return updatedUser;
      }, { timeout: 15000 });

      logger.info('[SUPER-ADMIN/PROVIDERS/USER] User linked to provider', {
        providerId,
        userId: result.id,
      });

      return NextResponse.json({
        user: result,
        message: 'User linked to provider',
      });
    } catch (error: unknown) {
      logger.error('[SUPER-ADMIN/PROVIDERS/USER] Error linking user:', error);
      return NextResponse.json({ error: error instanceof Error ? error.message : String(error) || 'Failed to link user' }, { status: 500 });
    }
  }
);

/**
 * PATCH /api/super-admin/providers/[id]/user
 * Reset password for linked user account
 *
 * Body: {
 *   password: string;
 *   sendNotification?: boolean; // Optional - send email notification to user
 * }
 */
export const PATCH = withSuperAdminAuth(
  async (req: NextRequest, user: AuthUser, context: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await context.params;
      const providerId = parseInt(id);

      if (isNaN(providerId)) {
        return NextResponse.json({ error: 'Invalid provider ID' }, { status: 400 });
      }

      const body = await req.json();
      const { password, sendNotification } = body;

      // Validate password
      if (!password) {
        return NextResponse.json({ error: 'Password is required' }, { status: 400 });
      }

      if (password.length < 8) {
        return NextResponse.json(
          { error: 'Password must be at least 8 characters' },
          { status: 400 }
        );
      }

      logger.info('[SUPER-ADMIN/PROVIDERS/USER] Resetting password for provider user', {
        providerId,
        userEmail: user.email,
      });

      // Check provider exists and has a linked user
      const provider = await prisma.provider.findUnique({
        where: { id: providerId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      if (!provider) {
        return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
      }

      if (!provider.user) {
        return NextResponse.json(
          { error: 'Provider does not have a linked user account' },
          { status: 404 }
        );
      }

      // Hash new password
      const passwordHash = await bcrypt.hash(password, 12);

      // Update user password
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.user.update({
          where: { id: provider.user!.id },
          data: {
            passwordHash,
            lastPasswordChange: new Date(),
            failedLoginAttempts: 0,
            lockedUntil: null,
          },
        });

        // Create audit log
        await tx.providerAudit.create({
          data: {
            providerId,
            actorEmail: user.email,
            action: 'PASSWORD_RESET',
            diff: {
              userId: provider.user!.id,
              email: provider.user!.email,
              resetBy: user.email,
              timestamp: new Date().toISOString(),
            },
          },
        });
      }, { timeout: 15000 });

      logger.info('[SUPER-ADMIN/PROVIDERS/USER] Password reset successful', {
        providerId,
        userId: provider.user.id,
        email: provider.user.email,
      });

      if (sendNotification) {
        try {
          const { sendEmail: sendEmailFn } = await import('@/lib/email');
          await sendEmailFn({
            to: provider.user!.email,
            subject: 'Your Password Has Been Reset',
            html: `
              <div style="max-width: 480px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #374151;">
                <div style="background: #ffffff; border-radius: 16px; padding: 32px; border: 1px solid #e5e7eb;">
                  <h1 style="font-size: 20px; font-weight: 600; color: #111827; margin: 0 0 12px;">Password Reset</h1>
                  <p style="font-size: 15px; line-height: 1.6; color: #4b5563;">
                    Hi ${provider.firstName || 'there'},<br/><br/>
                    Your account password has been reset by an administrator. Please contact your administrator for your new credentials.
                  </p>
                </div>
              </div>
            `,
            sourceType: 'notification',
            sourceId: `provider-password-reset-${provider.user!.id}`,
          });
          logger.info('[SUPER-ADMIN/PROVIDERS/USER] Password reset notification sent', {
            userId: provider.user!.id,
          });
        } catch (notifyErr) {
          logger.error('[SUPER-ADMIN/PROVIDERS/USER] Password reset notification failed', {
            error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
          });
        }
      }

      return NextResponse.json({
        message: 'Password reset successfully',
        userId: provider.user.id,
      });
    } catch (error: unknown) {
      logger.error('[SUPER-ADMIN/PROVIDERS/USER] Error resetting password:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : String(error) || 'Failed to reset password' },
        { status: 500 }
      );
    }
  }
);

/**
 * DELETE /api/super-admin/providers/[id]/user
 * Unlink user from provider (does not delete the user)
 */
export const DELETE = withSuperAdminAuth(
  async (req: NextRequest, user: AuthUser, context: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await context.params;
      const providerId = parseInt(id);

      if (isNaN(providerId)) {
        return NextResponse.json({ error: 'Invalid provider ID' }, { status: 400 });
      }

      logger.info('[SUPER-ADMIN/PROVIDERS/USER] Unlinking user from provider', {
        providerId,
        userEmail: user.email,
      });

      // Check provider exists and has a user
      const provider = await prisma.provider.findUnique({
        where: { id: providerId },
        select: {
          id: true,
          user: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });

      if (!provider) {
        return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
      }

      if (!provider.user) {
        return NextResponse.json(
          { error: 'Provider does not have a linked user account' },
          { status: 404 }
        );
      }

      const linkedUserId = provider.user.id;
      const linkedUserEmail = provider.user.email;

      // Unlink user from provider
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.user.update({
          where: { id: linkedUserId },
          data: {
            providerId: null,
          },
        });

        // Create audit log
        await tx.providerAudit.create({
          data: {
            providerId,
            actorEmail: user.email,
            action: 'USER_ACCOUNT_UNLINKED',
            diff: {
              userId: linkedUserId,
              email: linkedUserEmail,
              unlinkedBy: user.email,
            },
          },
        });
      }, { timeout: 15000 });

      logger.info('[SUPER-ADMIN/PROVIDERS/USER] User unlinked from provider', {
        providerId,
        userId: linkedUserId,
      });

      return NextResponse.json({
        message: 'User unlinked from provider',
        unlinkedUserId: linkedUserId,
      });
    } catch (error: unknown) {
      logger.error('[SUPER-ADMIN/PROVIDERS/USER] Error unlinking user:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : String(error) || 'Failed to unlink user' },
        { status: 500 }
      );
    }
  }
);
