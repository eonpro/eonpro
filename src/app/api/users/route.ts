/**
 * User Management API
 * List, Update, and Delete users
 */

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { withAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { hasPermission, PERMISSIONS } from '@/lib/auth/permissions';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

/**
 * GET /api/users
 * List all users with filtering and pagination
 */
export const GET = withAuth(
  async (req: NextRequest, user) => {
    try {
      // Check permission
      if (!hasPermission(user.role as any, PERMISSIONS.USER_READ)) {
        return NextResponse.json(
          { error: 'You do not have permission to view users' },
          { status: 403 }
        );
      }

      const { searchParams } = new URL(req.url);
      const page = parseInt(searchParams.get('page') || '1');
      const limit = parseInt(searchParams.get('limit') || '20');
      const roleParam = searchParams.get('role');
      const roleList = searchParams.getAll('role').filter(Boolean);
      const roleRaw = roleList.length ? roleList : (roleParam ? [roleParam] : []);
      // Support comma-separated roles (e.g. ?role=staff,admin,provider,support from New Ticket page)
      const roles = roleRaw.flatMap((r) => r.split(',').map((s) => s.trim()).filter(Boolean));
      const status = searchParams.get('status');
      const search = searchParams.get('search')?.trim() || null;
      const clinicIdParam = searchParams.get('clinicId');

      // Build filter
      const where: any = {};

      if (roles.length) {
        where.role = roles.length === 1 ? roles[0] : { in: roles };
      }

      if (status) {
        where.status = status;
      }

      if (search) {
        where.OR = [
          { email: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
        ];
      }

      // Clinic scope: only users who belong to this clinic (direct clinicId or via UserClinic)
      if (clinicIdParam) {
        const clinicId = parseInt(clinicIdParam, 10);
        if (!isNaN(clinicId)) {
          where.AND = (where.AND || []).concat([
            {
              OR: [
                { clinicId },
                { userClinics: { some: { clinicId, isActive: true } } },
              ],
            },
          ]);
        }
      }

      // Get users with pagination
      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
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
              },
            },
            createdBy: {
              select: {
                email: true,
                firstName: true,
                lastName: true,
              },
            },
            provider: {
              select: {
                id: true,
                npi: true,
              },
            },
            influencer: {
              select: {
                id: true,
                promoCode: true,
              },
            },
            patient: {
              select: {
                id: true,
                patientId: true,
              },
            },
          },
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.user.count({ where }),
      ]);

      return NextResponse.json({
        users,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error: any) {
      // @ts-ignore

      logger.error('Error fetching users:', error);
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }
  },
  { roles: ['super_admin', 'admin', 'staff', 'support'] }
);

// Update user schema
const updateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  role: z
    .enum(['admin', 'admin', 'provider', 'influencer', 'patient', 'staff', 'support'])
    .optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION', 'LOCKED']).optional(),
  permissions: z.array(z.string()).optional(),
  features: z.array(z.string()).optional(),
  metadata: z.object({}).passthrough().optional(),
  password: z.string().min(8).optional(),
});

/**
 * PUT /api/users
 * Update a user
 */
export const PUT = withAuth(
  async (req: NextRequest, user) => {
    try {
      // Check permission
      if (!hasPermission(user.role as any, PERMISSIONS.USER_UPDATE)) {
        return NextResponse.json(
          { error: 'You do not have permission to update users' },
          { status: 403 }
        );
      }

      const body = await req.json();
      const { id, ...updateData } = body;

      if (!id) {
        return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
      }

      const validated = updateUserSchema.parse(updateData);

      // Check if target user exists
      const targetUser = await prisma.user.findUnique({
        where: { id },
      });

      if (!targetUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      // Role hierarchy check
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
      const targetRoleLevel = roleHierarchy[targetUser.role as keyof typeof roleHierarchy] || 0;

      // Can't modify users with higher or equal roles (except self)
      if (targetRoleLevel >= userRoleLevel && targetUser.id !== user.id) {
        return NextResponse.json(
          { error: 'You cannot modify users with equal or higher roles' },
          { status: 403 }
        );
      }

      // Prepare update data
      const updatePayload: any = {
        ...validated,
        updatedAt: new Date(),
      };

      // Hash password if provided
      if (validated.password) {
        updatePayload.passwordHash = await bcrypt.hash(validated.password, 12);
        updatePayload.lastPasswordChange = new Date();
        delete updatePayload.password;
      }

      // Update user in transaction
      const updatedUser = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const updated = await tx.user.update({
          where: { id },
          data: updatePayload,
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            status: true,
            permissions: true,
            features: true,
            updatedAt: true,
          },
        });

        // Create audit log
        await tx.userAuditLog.create({
          data: {
            userId: id,
            action: 'USER_UPDATED',
            details: {
              updatedBy: user.id,
              updatedByRole: user.role,
              diff: Object.keys(validated),
              passwordChanged: !!validated.password,
            },
            ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
            userAgent: req.headers.get('user-agent'),
          },
        });

        return updated;
      }, { timeout: 15000 });

      logger.info('User updated', { targetUserId: targetUser.id, userId: user.id });

      return NextResponse.json({
        success: true,
        message: 'User updated successfully',
        user: updatedUser,
      });
    } catch (error: any) {
      logger.error('User update error:', error);

      if (error.name === 'ZodError') {
        return NextResponse.json(
          { error: 'Invalid request data', details: error.errors },
          { status: 400 }
        );
      }

      return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
    }
  },
  { roles: ['super_admin', 'admin'] }
);

/**
 * DELETE /api/users
 * Delete or suspend a user
 */
export const DELETE = withAuth(
  async (req: NextRequest, user) => {
    try {
      // Only SUPER_ADMIN can delete users
      if (user.role !== 'admin') {
        return NextResponse.json({ error: 'Only Super Admins can delete users' }, { status: 403 });
      }

      const { searchParams } = new URL(req.url);
      const id = parseInt(searchParams.get('id') || '0');
      const action = searchParams.get('action') || 'suspend'; // 'suspend' or 'delete'

      if (!id) {
        return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
      }

      // Prevent self-deletion
      if (id === user.id) {
        return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 403 });
      }

      // Check if user exists
      const targetUser = await prisma.user.findUnique({
        where: { id },
      });

      if (!targetUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      if (action === 'delete') {
        // Hard delete
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          // Delete related records first
          await tx.userAuditLog.deleteMany({ where: { userId: id } });
          await tx.userSession.deleteMany({ where: { userId: id } });

          // Delete the user
          await tx.user.delete({ where: { id } });

          // Log the deletion
          await tx.userAuditLog.create({
            data: {
              userId: user.id, // Log under the admin who deleted
              action: 'USER_DELETED',
              details: {
                deletedUser: targetUser.email,
                deletedUserId: id,
                deletedByRole: user.role,
              },
              ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
              userAgent: req.headers.get('user-agent'),
            },
          });
        }, { timeout: 15000 });

        logger.warn('User permanently deleted', { targetUserId: targetUser.id, userId: user.id });

        return NextResponse.json({
          success: true,
          message: 'User permanently deleted',
        });
      } else {
        // Soft delete (suspend)
        const suspended = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          const updated = await tx.user.update({
            where: { id },
            data: {
              status: 'SUSPENDED',
              updatedAt: new Date(),
            },
          });

          // Invalidate all sessions
          await tx.userSession.deleteMany({ where: { userId: id } });

          // Create audit log
          await tx.userAuditLog.create({
            data: {
              userId: id,
              action: 'USER_SUSPENDED',
              details: {
                suspendedBy: user.email,
                suspendedByRole: user.role,
              },
              ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
              userAgent: req.headers.get('user-agent'),
            },
          });

          return updated;
        }, { timeout: 15000 });

        logger.info('User suspended', { targetUserId: targetUser.id, userId: user.id });

        return NextResponse.json({
          success: true,
          message: 'User suspended successfully',
        });
      }
    } catch (error: any) {
      // @ts-ignore

      logger.error('User deletion error:', error);
      return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
    }
  },
  { roles: ['super_admin'] }
);
