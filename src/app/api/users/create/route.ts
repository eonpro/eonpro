/**
 * User Creation API
 * Only SUPER_ADMIN and ADMIN can create users
 */

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { withAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { hasPermission, PERMISSIONS, getRolePermissions, getRoleFeatures } from '@/lib/auth/permissions';
import { z } from 'zod';

// User creation schema
const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    'Password must contain uppercase, lowercase, number, and special character'
  ),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(["admin", "admin", "provider", "influencer", "patient", 'STAFF', 'SUPPORT']),
  permissions: z.array(z.string()).optional(),
  features: z.array(z.string()).optional(),
  metadata: z.object({}).passthrough().optional(),
  
  // Optional relations
  providerId: z.number().optional(),
  influencerId: z.number().optional(),
  patientId: z.number().optional(),
});

/**
 * POST /api/users/create
 * Create a new user with role-based permissions
 */
export const POST = withAuth(async (req: NextRequest, user) => {
  try {
    // Check if user has permission to create users
    const canCreateUsers = hasPermission(user.role as any, PERMISSIONS.USER_CREATE);
    
    if (!canCreateUsers) {
      logger.warn(`User ${user.email} attempted to create user without permission`);
      return NextResponse.json(
        { error: 'You do not have permission to create users' },
        { status: 403 }
      );
    }
    
    const body = await req.json();
    const validated = createUserSchema.parse(body);
    
    // Role hierarchy check - users can only create roles below their level
    const roleHierarchy = {
      SUPER_ADMIN: 7,
      ADMIN: 6,
      PROVIDER: 5,
      STAFF: 4,
      INFLUENCER: 3,
      SUPPORT: 2,
      PATIENT: 1,
    };
    
    const userRoleLevel = roleHierarchy[user.role as keyof typeof roleHierarchy] || 0;
    const newRoleLevel = roleHierarchy[validated.role] || 0;
    
    // Only SUPER_ADMIN can create other SUPER_ADMINs
    if ((validated.role as string) === "admin" && user.role !== "admin") {
      return NextResponse.json(
        { error: 'Only Super Admins can create other Super Admins' },
        { status: 403 }
      );
    }
    
    // Check role hierarchy
    if (newRoleLevel > userRoleLevel) {
      return NextResponse.json(
        { error: 'You cannot create users with higher roles than your own' },
        { status: 403 }
      );
    }
    
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: validated.email.toLowerCase() },
    });
    
    if (existingUser) {
      return NextResponse.json(
        { error: 'A user with this email already exists' },
        { status: 409 }
      );
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(validated.password, 12);
    
    // Get default permissions and features for the role
    const defaultPermissions = getRolePermissions(validated.role as any);
    const defaultFeatures = getRoleFeatures(validated.role as any);
    
    // Merge with custom permissions/features if provided
    const finalPermissions = validated.permissions 
      ? [...new Set([...defaultPermissions, ...validated.permissions])]
      : defaultPermissions;
      
    const finalFeatures = validated.features
      ? [...new Set([...defaultFeatures, ...validated.features])]
      : defaultFeatures;
    
    // Create user in transaction
    const newUser = await prisma.$transaction(async (tx: any) => {
      // Create the user
      const createdUser = await tx.user.create({
        data: {
          email: validated.email.toLowerCase(),
          passwordHash,
          firstName: validated.firstName,
          lastName: validated.lastName,
          role: validated.role,
          permissions: finalPermissions,
          features: finalFeatures,
          metadata: (validated.metadata  || {}) as any,
          createdById: user.id > 0  ? user.id  : undefined, // Handle admin with ID 0
          providerId: validated.providerId,
          influencerId: validated.influencerId,
          patientId: validated.patientId,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          permissions: true,
          features: true,
          createdAt: true,
          provider: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              npi: true,
            },
          },
          influencer: {
            select: {
              id: true,
              name: true,
              promoCode: true,
            },
          },
          patient: {
            select: {
              id: true,
              patientId: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });
      
      // Create audit log
      await tx.userAuditLog.create({
        data: {
          userId: createdUser.id,
          action: 'USER_CREATED',
          details: {
            createdBy: user.email,
            createdByRole: user.role,
            role: validated.role,
            hasCustomPermissions: !!validated.permissions,
            hasCustomFeatures: !!validated.features,
          },
          ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
          userAgent: req.headers.get('user-agent'),
        },
      });
      
      return createdUser;
    });
    
    logger.info(`User ${validated.email} created by ${user.email}`);
    
    // Remove password from response
    const { passwordHash: _, ...userWithoutPassword } = newUser as any;
    
    return NextResponse.json({
      success: true,
      message: 'User created successfully',
      user: userWithoutPassword,
    });
    
  } catch (error: any) {
    logger.error('User creation error:', error);
    
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }
    
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'A user with this email already exists' },
        { status: 409 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    );
  }
}, { roles: ["admin", "admin"] });
