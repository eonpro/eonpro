import { NextRequest, NextResponse } from 'next/server';
import { basePrisma as prisma } from '@/lib/db';
import { withAuthParams, AuthUser } from '@/lib/auth/middleware-with-params';
import { logger } from '@/lib/logger';
import {
  getEffectivePermissions,
  getEffectiveFeatures,
  getRolePermissions,
  getRoleFeatures,
  parseOverrides,
  buildOverridesFromDesired,
  PERMISSIONS,
  FEATURES,
  PERMISSION_CATEGORIES,
  isValidRole,
} from '@/lib/auth/permissions';
import type { UserPermissionOverrides } from '@/lib/auth/permissions';

type RouteContext = { params: Promise<{ id: string; userId: string }> };

function withSuperAdminAuth(
  handler: (
    req: NextRequest,
    user: AuthUser,
    params: { id: string; userId: string },
  ) => Promise<Response>,
) {
  return withAuthParams<RouteContext>(
    async (req, user, context) => {
      const params = await context.params;
      return handler(req, user, params);
    },
    { roles: ['super_admin'] },
  );
}

/**
 * GET /api/super-admin/clinics/[id]/users/[userId]/permissions
 *
 * Returns the effective permissions and features for a user,
 * including metadata about which are role defaults vs custom overrides.
 */
export const GET = withSuperAdminAuth(
  async (
    _req: NextRequest,
    _adminUser: AuthUser,
    params: { id: string; userId: string },
  ) => {
    try {
      const clinicId = parseInt(params.id);
      const userId = parseInt(params.userId);

      if (isNaN(clinicId) || isNaN(userId)) {
        return NextResponse.json(
          { error: 'Invalid clinic or user ID' },
          { status: 400 },
        );
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          permissions: true,
          features: true,
          userClinics: {
            where: { clinicId, isActive: true },
            select: { role: true },
          },
        },
      });

      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      // Use clinic-specific role if present, otherwise fall back to user role
      const effectiveRole = (
        user.userClinics?.[0]?.role ?? user.role
      ).toLowerCase();

      if (!isValidRole(effectiveRole)) {
        return NextResponse.json(
          { error: 'Invalid user role' },
          { status: 400 },
        );
      }

      const permOverrides = parseOverrides(user.permissions);
      const featOverrides = parseOverrides(user.features);

      const effectivePermissions = getEffectivePermissions(
        effectiveRole,
        permOverrides,
      );
      const effectiveFeatures = getEffectiveFeatures(
        effectiveRole,
        featOverrides,
      );

      const roleDefaultPermissions = getRolePermissions(effectiveRole);
      const roleDefaultFeatures = getRoleFeatures(effectiveRole);

      return NextResponse.json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: effectiveRole,
        },
        permissions: {
          effective: effectivePermissions,
          roleDefaults: roleDefaultPermissions,
          overrides: permOverrides,
          categories: PERMISSION_CATEGORIES,
        },
        features: {
          effective: effectiveFeatures,
          roleDefaults: roleDefaultFeatures,
          overrides: featOverrides,
          allFeatures: Object.values(FEATURES),
        },
        meta: {
          allPermissions: Object.values(PERMISSIONS),
          totalPermissions: Object.values(PERMISSIONS).length,
          totalFeatures: Object.values(FEATURES).length,
          customPermissionCount:
            permOverrides.granted.length + permOverrides.revoked.length,
          customFeatureCount:
            featOverrides.granted.length + featOverrides.revoked.length,
        },
      });
    } catch (error: unknown) {
      logger.error('Error fetching user permissions', {
        error: error instanceof Error ? error.message : String(error),
        userId: params.userId,
        clinicId: params.id,
      });
      return NextResponse.json(
        { error: 'Failed to fetch user permissions' },
        { status: 500 },
      );
    }
  },
);

/**
 * PUT /api/super-admin/clinics/[id]/users/[userId]/permissions
 *
 * Save per-user permission and feature overrides.
 * Accepts the desired enabled sets and computes the overrides internally.
 *
 * Body: {
 *   permissions: string[]   – desired enabled permission strings
 *   features: string[]      – desired enabled feature IDs
 * }
 */
export const PUT = withSuperAdminAuth(
  async (
    req: NextRequest,
    adminUser: AuthUser,
    params: { id: string; userId: string },
  ) => {
    try {
      const clinicId = parseInt(params.id);
      const userId = parseInt(params.userId);

      if (isNaN(clinicId) || isNaN(userId)) {
        return NextResponse.json(
          { error: 'Invalid clinic or user ID' },
          { status: 400 },
        );
      }

      const body = await req.json();
      const desiredPermissions: string[] = body.permissions;
      const desiredFeatures: string[] = body.features;

      if (!Array.isArray(desiredPermissions) || !Array.isArray(desiredFeatures)) {
        return NextResponse.json(
          { error: 'permissions and features must be arrays of strings' },
          { status: 400 },
        );
      }

      // Validate that all values are known
      const allPermValues: string[] = Object.values(PERMISSIONS);
      const allFeatureIds: string[] = Object.values(FEATURES).map((f) => f.id);

      const invalidPerms = desiredPermissions.filter(
        (p) => !allPermValues.includes(p),
      );
      const invalidFeats = desiredFeatures.filter(
        (f) => !allFeatureIds.includes(f),
      );

      if (invalidPerms.length > 0 || invalidFeats.length > 0) {
        return NextResponse.json(
          {
            error: 'Unknown permissions or features',
            invalidPermissions: invalidPerms,
            invalidFeatures: invalidFeats,
          },
          { status: 400 },
        );
      }

      // Fetch current state for audit trail
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          role: true,
          permissions: true,
          features: true,
          userClinics: {
            where: { clinicId, isActive: true },
            select: { role: true },
          },
        },
      });

      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const effectiveRole = (
        user.userClinics?.[0]?.role ?? user.role
      ).toLowerCase();

      if (!isValidRole(effectiveRole)) {
        return NextResponse.json(
          { error: 'Invalid user role' },
          { status: 400 },
        );
      }

      const previousPermOverrides = parseOverrides(user.permissions);
      const previousFeatOverrides = parseOverrides(user.features);

      const { permissionOverrides, featureOverrides } =
        buildOverridesFromDesired(effectiveRole, desiredPermissions, desiredFeatures);

      // Persist — cast to JSON-compatible shape for Prisma
      await prisma.user.update({
        where: { id: userId },
        data: {
          permissions: JSON.parse(JSON.stringify(permissionOverrides)),
          features: JSON.parse(JSON.stringify(featureOverrides)),
        },
      });

      // HIPAA audit log for permission changes
      logger.info('User permissions updated by super admin', {
        action: 'PERMISSION_UPDATE',
        targetUserId: userId,
        adminUserId: adminUser.id,
        clinicId,
        role: effectiveRole,
        previousPermissions: {
          granted: previousPermOverrides.granted,
          revoked: previousPermOverrides.revoked,
        },
        newPermissions: {
          granted: permissionOverrides.granted,
          revoked: permissionOverrides.revoked,
        },
        previousFeatures: {
          granted: previousFeatOverrides.granted,
          revoked: previousFeatOverrides.revoked,
        },
        newFeatures: {
          granted: featureOverrides.granted,
          revoked: featureOverrides.revoked,
        },
      });

      return NextResponse.json({
        success: true,
        permissionOverrides,
        featureOverrides,
        message: 'User permissions updated successfully',
      });
    } catch (error: unknown) {
      logger.error('Error updating user permissions', {
        error: error instanceof Error ? error.message : String(error),
        userId: params.userId,
        clinicId: params.id,
      });
      return NextResponse.json(
        { error: 'Failed to update user permissions' },
        { status: 500 },
      );
    }
  },
);
