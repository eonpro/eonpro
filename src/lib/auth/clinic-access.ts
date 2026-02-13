/**
 * Clinic Access Verification
 *
 * Utility functions to verify user access to clinic data.
 * Used for multi-tenant isolation enforcement.
 *
 * @module lib/auth/clinic-access
 */

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';

export interface UserForClinicAccess {
  id: number;
  role: string;
  clinicId?: number | null;
}

/**
 * Verify that a user has access to a specific clinic.
 *
 * @param user - The authenticated user
 * @param targetClinicId - The clinic ID being accessed
 * @returns true if access is allowed, false otherwise
 */
export function verifyClinicAccess(user: UserForClinicAccess, targetClinicId: number): boolean {
  // Super admins can access any clinic
  if (user.role === 'super_admin') {
    return true;
  }

  // For other roles, user's clinicId must match target
  if (user.clinicId === targetClinicId) {
    return true;
  }

  // Log security event for denied access
  logger.security('Clinic access denied', {
    userId: user.id,
    userRole: user.role,
    userClinicId: user.clinicId,
    targetClinicId,
  });

  return false;
}

/**
 * Check if user has access to a clinic via UserClinic junction table.
 * This supports users who have access to multiple clinics.
 *
 * @param userId - The user ID
 * @param targetClinicId - The clinic ID to check access for
 * @returns true if user has access, false otherwise
 */
export async function hasUserClinicAccess(
  userId: number,
  targetClinicId: number
): Promise<boolean> {
  const userClinic = await prisma.userClinic.findFirst({
    where: {
      userId,
      clinicId: targetClinicId,
      isActive: true,
    },
  });

  return !!userClinic;
}

/**
 * Verify clinic access with fallback to UserClinic table.
 * Use this when users might have access to multiple clinics.
 *
 * @param user - The authenticated user
 * @param targetClinicId - The clinic ID being accessed
 * @returns true if access is allowed
 */
export async function verifyClinicAccessWithFallback(
  user: UserForClinicAccess,
  targetClinicId: number
): Promise<boolean> {
  // Quick check first
  if (verifyClinicAccess(user, targetClinicId)) {
    return true;
  }

  // Check UserClinic junction table for multi-clinic access
  const hasAccess = await hasUserClinicAccess(user.id, targetClinicId);

  if (!hasAccess) {
    logger.security('Clinic access denied (including UserClinic check)', {
      userId: user.id,
      userRole: user.role,
      userClinicId: user.clinicId,
      targetClinicId,
    });
  }

  return hasAccess;
}
