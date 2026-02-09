/**
 * Auth Module - Central Exports
 *
 * This file provides a unified export point for authentication utilities.
 */

// Re-export everything from middleware
export {
  withAuth,
  withSuperAdminAuth,
  withAdminAuth,
  withProviderAuth,
  withClinicalAuth,
  withSupportAuth,
  withInfluencerAuth,
  withAffiliateAuth,
  withPatientAuth,
  verifyAuth,
  getCurrentUser,
  hasRole,
  hasPermission,
  canAccessClinic,
  type AuthUser,
  type UserRole,
  type AuthOptions,
} from './middleware';

// Re-export from config
export { JWT_SECRET, AUTH_CONFIG } from './config';

// Re-export from session manager
export { validateSession } from './session-manager';

// Re-export from registration
export { validatePassword } from './registration';

// Re-export from permissions
export {
  hasPermission as checkPermission,
  getRolePermissions as getPermissionsForRole,
  PERMISSIONS,
  ROLE_PERMISSIONS,
} from './permissions';

// Client-side stored role (for layout nav consistency)
export { getStoredUserRole } from './stored-role';

// Convenience aliases for common patterns
import { NextRequest } from 'next/server';
import { verifyAuth, type AuthUser } from './middleware';

/**
 * Get authenticated user from request
 * Returns null if not authenticated
 *
 * @example
 * const user = await getAuthUser(request);
 * if (!user) {
 *   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 * }
 */
export async function getAuthUser(request: NextRequest): Promise<AuthUser | null> {
  const result = await verifyAuth(request);
  return result.success ? (result.user ?? null) : null;
}

/**
 * Require authentication - throws if not authenticated
 * Use getAuthUser for more control over error handling
 *
 * @example
 * const user = await requireAuth(request);
 * // If we get here, user is guaranteed to be authenticated
 */
export async function requireAuth(request: NextRequest): Promise<AuthUser> {
  const result = await verifyAuth(request);
  if (!result.success || !result.user) {
    throw new Error(result.error || 'Authentication required');
  }
  return result.user;
}
