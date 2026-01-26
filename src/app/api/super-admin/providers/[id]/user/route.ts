import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { type Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

/**
 * Middleware to check for Super Admin role
 */
function withSuperAdminAuth(
  handler: (req: NextRequest, user: AuthUser, context: { params: Promise<{ id: string }> }) => Promise<Response>
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
export const GET = withSuperAdminAuth(async (
  req: NextRequest,
  user: AuthUser,
  context: { params: Promise<{ id: string }> }
) => {
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
  } catch (error: any) {
    logger.error('[SUPER-ADMIN/PROVIDERS/USER] Error fetching user:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user', details: error.message },
      { status: 500 }
    );
  }
});

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
export const POST = withSuperAdminAuth(async (
  req: NextRequest,
  user: AuthUser,
  context: { params: Promise<{ id: string }> }
) => {
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
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
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
      const primaryClinic = provider.providerClinics.find((pc: { isPrimary: boolean; clinicId: number }) => pc.isPrimary);
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
    });

    logger.info('[SUPER-ADMIN/PROVIDERS/USER] User created and linked', {
      providerId,
      userId: result.id,
      email: result.email,
    });

    // TODO: Send invite email if requested
    if (sendInvite) {
      logger.info('[SUPER-ADMIN/PROVIDERS/USER] Would send invite email', {
        email: result.email,
      });
      // Email sending would go here
    }

    return NextResponse.json({
      user: result,
      message: 'User account created and linked to provider',
    });
  } catch (error: any) {
    logger.error('[SUPER-ADMIN/PROVIDERS/USER] Error creating user:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create user account' },
      { status: 500 }
    );
  }
});

/**
 * PUT /api/super-admin/providers/[id]/user
 * Link an existing user to provider
 * 
 * Body: {
 *   userId: number;
 * }
 */
export const PUT = withSuperAdminAuth(async (
  req: NextRequest,
  user: AuthUser,
  context: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await context.params;
    const providerId = parseInt(id);

    if (isNaN(providerId)) {
      return NextResponse.json({ error: 'Invalid provider ID' }, { status: 400 });
    }

    const body = await req.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
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
    });

    logger.info('[SUPER-ADMIN/PROVIDERS/USER] User linked to provider', {
      providerId,
      userId: result.id,
    });

    return NextResponse.json({
      user: result,
      message: 'User linked to provider',
    });
  } catch (error: any) {
    logger.error('[SUPER-ADMIN/PROVIDERS/USER] Error linking user:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to link user' },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/super-admin/providers/[id]/user
 * Unlink user from provider (does not delete the user)
 */
export const DELETE = withSuperAdminAuth(async (
  req: NextRequest,
  user: AuthUser,
  context: { params: Promise<{ id: string }> }
) => {
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
    });

    logger.info('[SUPER-ADMIN/PROVIDERS/USER] User unlinked from provider', {
      providerId,
      userId: linkedUserId,
    });

    return NextResponse.json({
      message: 'User unlinked from provider',
      unlinkedUserId: linkedUserId,
    });
  } catch (error: any) {
    logger.error('[SUPER-ADMIN/PROVIDERS/USER] Error unlinking user:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to unlink user' },
      { status: 500 }
    );
  }
});
