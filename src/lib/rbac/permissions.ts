/**
 * Centralized permission map – enterprise RBAC.
 * Replace inline role checks with requirePermission(user, action, resource).
 * Permissions are evaluated with user.role, clinicId, and optional patientId.
 *
 * @module lib/rbac/permissions
 */

export type Permission =
  | 'patient:view'
  | 'patient:edit'
  | 'order:view'
  | 'order:create'
  | 'invoice:view'
  | 'invoice:create'
  | 'invoice:export'
  | 'report:run'
  | 'financial:view'
  | 'admin:cross-tenant'
  | 'message:view'
  | 'message:send'
  | 'affiliate:view'
  | 'affiliate:manage'
  | 'settings:manage'
  | 'user:manage';

export interface PermissionContext {
  role: string;
  clinicId?: number | null;
  patientId?: number | null;
  providerId?: number | null;
}

/** Role -> set of permissions (coarse). Fine-grained (e.g. provider sees only own patients) is done in requirePermission with resource. */
const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  super_admin: [
    'patient:view',
    'patient:edit',
    'order:view',
    'order:create',
    'invoice:view',
    'invoice:create',
    'invoice:export',
    'report:run',
    'financial:view',
    'admin:cross-tenant',
    'message:view',
    'message:send',
    'affiliate:view',
    'affiliate:manage',
    'settings:manage',
    'user:manage',
  ],
  admin: [
    'patient:view',
    'patient:edit',
    'order:view',
    'order:create',
    'invoice:view',
    'invoice:create',
    'invoice:export',
    'report:run',
    'financial:view',
    'message:view',
    'message:send',
    'affiliate:view',
    'affiliate:manage',
    'settings:manage',
    'user:manage',
  ],
  provider: [
    'patient:view',
    'patient:edit',
    'patient:delete',
    'order:view',
    'order:create',
    'invoice:view',
    'invoice:create',
    'report:run',
    'message:view',
    'message:send',
  ],
  staff: [
    'patient:view',
    'order:view',
    'invoice:view',
    'report:run',
    'message:view',
    'message:send',
  ],
  sales_rep: ['patient:view', 'order:view', 'report:run'],
  patient: ['patient:view', 'patient:edit'], // only own
  affiliate: ['affiliate:view'],
};

/**
 * Check if the user has the given permission.
 * For clinic-scoped resources, caller must ensure clinicId matches when required.
 */
export function hasPermission(
  ctx: PermissionContext,
  permission: Permission,
  resource?: { clinicId?: number | null; patientId?: number | null; ownerId?: number | null }
): boolean {
  const normalizedRole = ctx.role.toLowerCase();
  const rolePerms = ROLE_PERMISSIONS[normalizedRole] ?? [];
  if (!rolePerms.includes(permission)) return false;
  if (normalizedRole === 'super_admin') return true;
  if (resource?.clinicId != null && ctx.clinicId != null && resource.clinicId !== ctx.clinicId)
    return false;
  if (permission === 'patient:view' || permission === 'patient:edit') {
    if (normalizedRole === 'patient' && resource?.patientId != null && ctx.patientId !== resource.patientId)
      return false;
    if (normalizedRole === 'provider' && resource?.ownerId != null && ctx.providerId !== resource.ownerId)
      return false; // provider can only see own patients when resource has ownerId
  }
  return true;
}

/**
 * Require permission or throw. Use in route handlers after auth.
 * Throws an error with statusCode 403 that handleApiError can turn into JSON.
 */
export function requirePermission(
  ctx: PermissionContext,
  permission: Permission,
  resource?: { clinicId?: number | null; patientId?: number | null; ownerId?: number | null }
): void {
  if (!hasPermission(ctx, permission, resource)) {
    const err = new Error('Forbidden') as Error & { statusCode?: number };
    err.statusCode = 403;
    throw err;
  }
}

/** Build PermissionContext from auth user (role, clinicId, patientId, providerId). Use in API routes after auth. */
export function toPermissionContext(user: {
  role: string;
  clinicId?: number | null;
  patientId?: number | null;
  providerId?: number | null;
}): PermissionContext {
  return {
    role: user.role.toLowerCase(),
    clinicId: user.clinicId ?? null,
    patientId: user.patientId ?? null,
    providerId: user.providerId ?? null,
  };
}

/**
 * Permission matrix (role x permission). Export for docs.
 */
export const PERMISSION_MATRIX: Record<string, Record<Permission, boolean>> = (
  ['super_admin', 'admin', 'provider', 'staff', 'sales_rep', 'patient', 'affiliate'] as const
).reduce((acc, role) => {
  const perms = ROLE_PERMISSIONS[role] ?? [];
  acc[role] = {
    'patient:view': perms.includes('patient:view'),
    'patient:edit': perms.includes('patient:edit'),
    'order:view': perms.includes('order:view'),
    'order:create': perms.includes('order:create'),
    'invoice:view': perms.includes('invoice:view'),
    'invoice:create': perms.includes('invoice:create'),
    'invoice:export': perms.includes('invoice:export'),
    'report:run': perms.includes('report:run'),
    'financial:view': perms.includes('financial:view'),
    'admin:cross-tenant': perms.includes('admin:cross-tenant'),
    'message:view': perms.includes('message:view'),
    'message:send': perms.includes('message:send'),
    'affiliate:view': perms.includes('affiliate:view'),
    'affiliate:manage': perms.includes('affiliate:manage'),
    'settings:manage': perms.includes('settings:manage'),
    'user:manage': perms.includes('user:manage'),
  };
  return acc;
}, {} as Record<string, Record<Permission, boolean>>);
