/**
 * Change Password endpoint
 * Allows authenticated users to change their own password.
 * HIPAA Compliant: Logs all password change events for audit trail.
 * @module api/auth/change-password
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

// Validation schema
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
});

/**
 * POST /api/auth/change-password
 * Change the authenticated user's password
 */
async function handlePost(req: NextRequest, user: AuthUser): Promise<Response> {
  try {
    const body = await req.json();

    // Validate input
    const validation = changePasswordSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword, confirmPassword } = validation.data;

    // Check if passwords match
    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { error: 'New passwords do not match' },
        { status: 400 }
      );
    }

    // Get user from database to verify current password
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, passwordHash: true },
    });

    if (!dbUser || !dbUser.passwordHash) {
      logger.warn('[Change Password] User not found or no password set', {
        userId: user.id,
      });
      return NextResponse.json(
        { error: 'Unable to change password. Please contact support.' },
        { status: 400 }
      );
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, dbUser.passwordHash);
    if (!isValidPassword) {
      await auditLog(req, {
        userId: String(user.id),
        userRole: user.role,
        clinicId: user.clinicId,
        eventType: AuditEventType.PASSWORD_CHANGE,
        resourceType: 'User',
        resourceId: String(user.id),
        action: 'PASSWORD_CHANGE_FAILED',
        outcome: 'FAILURE',
        metadata: { reason: 'Invalid current password' },
      });

      return NextResponse.json(
        { error: 'Current password is incorrect' },
        { status: 401 }
      );
    }

    // Don't allow using the same password
    const isSamePassword = await bcrypt.compare(newPassword, dbUser.passwordHash);
    if (isSamePassword) {
      return NextResponse.json(
        { error: 'New password must be different from current password' },
        { status: 400 }
      );
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Update password
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
        lastPasswordChange: new Date(),
      },
    });

    // Log successful password change
    await auditLog(req, {
      userId: String(user.id),
      userRole: user.role,
      clinicId: user.clinicId,
      eventType: AuditEventType.PASSWORD_CHANGE,
      resourceType: 'User',
      resourceId: String(user.id),
      action: 'PASSWORD_CHANGE',
      outcome: 'SUCCESS',
    });

    logger.info('[Change Password] Password changed successfully', {
      userId: user.id,
    });

    return NextResponse.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Change Password] Error', {
      userId: user.id,
      error: errorMessage,
    });

    return NextResponse.json(
      { error: 'Failed to change password. Please try again.' },
      { status: 500 }
    );
  }
}

export const POST = withAuth(handlePost);
