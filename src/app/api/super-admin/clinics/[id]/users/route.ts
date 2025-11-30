import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
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
      { roles: ['super_admin', 'SUPER_ADMIN'] }
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

    // Verify clinic exists
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
    });

    if (!clinic) {
      return NextResponse.json(
        { error: 'Clinic not found' },
        { status: 404 }
      );
    }

    // Get all users for this clinic
    const users = await prisma.user.findMany({
      where: { clinicId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        createdAt: true,
        lastLogin: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ users });
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

    // Verify clinic exists
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
    });

    if (!clinic) {
      return NextResponse.json(
        { error: 'Clinic not found' },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { email, firstName, lastName, role, password, sendInvite } = body;

    // Validate required fields
    if (!email || !firstName || !lastName || !role || !password) {
      return NextResponse.json(
        { error: 'Email, first name, last name, role, and password are required' },
        { status: 400 }
      );
    }

    // Check if email is already in use
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'A user with this email already exists' },
        { status: 400 }
      );
    }

    // Validate role
    const validRoles = ['ADMIN', 'PROVIDER', 'STAFF', 'SUPPORT'];
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be ADMIN, PROVIDER, STAFF, or SUPPORT' },
        { status: 400 }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create the user
    const newUser = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        firstName,
        lastName,
        role,
        passwordHash,
        clinicId,
        status: 'ACTIVE',
        mustChangePassword: true, // Force password change on first login
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

    // If role is PROVIDER, also create a Provider record
    if (role === 'PROVIDER') {
      await prisma.provider.create({
        data: {
          email: email.toLowerCase(),
          firstName,
          lastName,
          passwordHash,
          clinicId,
          userId: newUser.id,
          specialty: 'General',
          status: 'ACTIVE',
        },
      });
    }

    // TODO: Send invitation email if sendInvite is true
    // This would integrate with your email service (SES, SendGrid, etc.)
    if (sendInvite) {
      console.log(`Invitation email would be sent to ${email} for clinic ${clinic.name}`);
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

