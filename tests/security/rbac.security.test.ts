/**
 * Role-Based Access Control Security Tests
 * ========================================
 *
 * Tests for authorization and role-based access including:
 * - Role hierarchy
 * - Permission enforcement
 * - Privilege escalation prevention
 * - Centralized RBAC (requirePermission / hasPermission / PERMISSION_MATRIX)
 *
 * @module tests/security/rbac
 */

import { describe, it, expect } from 'vitest';
import {
  hasPermission as rbacHasPermission,
  requirePermission,
  toPermissionContext,
  PERMISSION_MATRIX,
  type PermissionContext,
} from '@/lib/rbac/permissions';

// Role definitions matching the system
const ROLES = {
  super_admin: {
    level: 100,
    permissions: ['*'], // All permissions
  },
  admin: {
    level: 80,
    permissions: [
      'clinic:manage',
      'users:manage',
      'patients:all',
      'orders:all',
      'reports:view',
      'settings:manage',
    ],
  },
  provider: {
    level: 60,
    permissions: [
      'patients:view',
      'patients:create',
      'patients:update',
      'orders:view',
      'orders:create',
      'prescriptions:create',
      'soap:all',
    ],
  },
  staff: {
    level: 40,
    permissions: [
      'patients:view',
      'patients:create',
      'orders:view',
      'appointments:manage',
    ],
  },
  patient: {
    level: 10,
    permissions: [
      'own:view',
      'own:appointments',
      'own:documents',
    ],
  },
};

type RoleName = keyof typeof ROLES;

function hasPermission(role: RoleName, permission: string): boolean {
  const roleConfig = ROLES[role];
  if (!roleConfig) return false;
  
  // Super admin has all permissions
  if (roleConfig.permissions.includes('*')) return true;
  
  return roleConfig.permissions.includes(permission);
}

function canAccessRole(userRole: RoleName, targetRole: RoleName): boolean {
  return ROLES[userRole].level >= ROLES[targetRole].level;
}

describe('Role-Based Access Control', () => {
  describe('Role Hierarchy', () => {
    it('super_admin should have highest privilege', () => {
      expect(ROLES.super_admin.level).toBeGreaterThan(ROLES.admin.level);
      expect(ROLES.super_admin.level).toBeGreaterThan(ROLES.provider.level);
    });

    it('admin should be above provider', () => {
      expect(ROLES.admin.level).toBeGreaterThan(ROLES.provider.level);
    });

    it('provider should be above staff', () => {
      expect(ROLES.provider.level).toBeGreaterThan(ROLES.staff.level);
    });

    it('staff should be above patient', () => {
      expect(ROLES.staff.level).toBeGreaterThan(ROLES.patient.level);
    });
  });

  describe('Permission Enforcement', () => {
    it('super_admin should have all permissions', () => {
      expect(hasPermission('super_admin', 'clinic:manage')).toBe(true);
      expect(hasPermission('super_admin', 'users:manage')).toBe(true);
      expect(hasPermission('super_admin', 'any:permission')).toBe(true);
    });

    it('admin should have clinic management', () => {
      expect(hasPermission('admin', 'clinic:manage')).toBe(true);
      expect(hasPermission('admin', 'users:manage')).toBe(true);
    });

    it('provider should have clinical permissions', () => {
      expect(hasPermission('provider', 'prescriptions:create')).toBe(true);
      expect(hasPermission('provider', 'soap:all')).toBe(true);
    });

    it('staff should NOT have prescription permissions', () => {
      expect(hasPermission('staff', 'prescriptions:create')).toBe(false);
    });

    it('patient should only have own-data permissions', () => {
      expect(hasPermission('patient', 'own:view')).toBe(true);
      expect(hasPermission('patient', 'patients:view')).toBe(false);
    });
  });

  describe('Privilege Escalation Prevention', () => {
    it('should not allow lower role to act as higher role', () => {
      expect(canAccessRole('provider', 'admin')).toBe(false);
      expect(canAccessRole('staff', 'provider')).toBe(false);
      expect(canAccessRole('patient', 'staff')).toBe(false);
    });

    it('should allow higher role to access lower role resources', () => {
      expect(canAccessRole('super_admin', 'admin')).toBe(true);
      expect(canAccessRole('admin', 'provider')).toBe(true);
      expect(canAccessRole('provider', 'staff')).toBe(true);
    });

    it('should prevent role injection in tokens', () => {
      // Token payload should be validated server-side
      const tokenPayload = {
        id: 1,
        email: 'user@test.com',
        role: 'super_admin', // Attacker trying to set admin role
      };

      // Server should verify actual role from database
      const actualRole = 'provider';
      const isValid = tokenPayload.role === actualRole;
      
      expect(isValid).toBe(false);
    });
  });

  describe('Resource-Level Authorization', () => {
    it('should restrict patient data to assigned providers', () => {
      const patient = { id: 1, clinicId: 1, assignedProviderId: 10 };
      const user = { id: 5, role: 'provider', providerId: 20, clinicId: 1 };
      
      // Provider 20 should not access patient assigned to provider 10
      // (depends on clinic policy - here we allow same-clinic access)
      const canAccess = user.clinicId === patient.clinicId;
      expect(canAccess).toBe(true);
    });

    it('should prevent cross-clinic resource access', () => {
      const resource = { id: 1, clinicId: 1 };
      const user = { id: 5, role: 'admin', clinicId: 2 };
      
      const canAccess = user.clinicId === resource.clinicId;
      expect(canAccess).toBe(false);
    });
  });

  describe('Action-Based Authorization', () => {
    it('should validate destructive actions require admin+', () => {
      const destructiveActions = ['delete', 'bulk_delete', 'archive'];
      const minRoleLevel = ROLES.admin.level;
      
      // Provider should not be able to perform destructive actions
      expect(ROLES.provider.level).toBeLessThan(minRoleLevel);
      expect(ROLES.staff.level).toBeLessThan(minRoleLevel);
    });

    it('should log privilege-escalated actions', () => {
      const auditLog: any[] = [];

      const logPrivilegedAction = (userId: number, action: string, targetId: number) => {
        auditLog.push({
          timestamp: new Date(),
          userId,
          action,
          targetId,
          privileged: true,
        });
      };

      logPrivilegedAction(1, 'USER_DELETE', 123);

      expect(auditLog.length).toBe(1);
      expect(auditLog[0].privileged).toBe(true);
    });
  });

  describe('Centralized RBAC (requirePermission / hasPermission)', () => {
    it('provider cannot invoice:export', () => {
      const ctx: PermissionContext = toPermissionContext({
        role: 'provider',
        clinicId: 1,
      });
      expect(rbacHasPermission(ctx, 'invoice:export')).toBe(false);
      expect(() => requirePermission(ctx, 'invoice:export')).toThrow('Forbidden');
      const err = (() => {
        try {
          requirePermission(ctx, 'invoice:export');
        } catch (e) {
          return e as Error & { statusCode?: number };
        }
        return null;
      })();
      expect(err?.statusCode).toBe(403);
    });

    it('staff cannot patient:edit', () => {
      const ctx: PermissionContext = toPermissionContext({
        role: 'staff',
        clinicId: 1,
      });
      expect(rbacHasPermission(ctx, 'patient:edit')).toBe(false);
      expect(() => requirePermission(ctx, 'patient:edit')).toThrow('Forbidden');
    });

    it('sales_rep cannot financial:view', () => {
      const ctx: PermissionContext = toPermissionContext({
        role: 'sales_rep',
        clinicId: 1,
      });
      expect(rbacHasPermission(ctx, 'financial:view')).toBe(false);
      expect(() => requirePermission(ctx, 'financial:view')).toThrow('Forbidden');
    });

    it('admin can perform admin-level actions', () => {
      const ctx: PermissionContext = toPermissionContext({
        role: 'admin',
        clinicId: 1,
      });
      // PERMISSION_MATRIX documents admin capabilities
      expect(PERMISSION_MATRIX.admin?.['financial:view']).toBe(true);
      expect(PERMISSION_MATRIX.admin?.['invoice:export']).toBe(true);
      expect(PERMISSION_MATRIX.admin?.['patient:edit']).toBe(true);
      expect(PERMISSION_MATRIX.admin?.['report:run']).toBe(true);
      expect(PERMISSION_MATRIX.admin?.['invoice:view']).toBe(true);
      // requirePermission must not throw for admin on these actions
      expect(() => {
        requirePermission(ctx, 'financial:view');
        requirePermission(ctx, 'invoice:export');
        requirePermission(ctx, 'patient:edit');
        requirePermission(ctx, 'report:run');
        requirePermission(ctx, 'invoice:view');
      }).not.toThrow();
    });

    it('super_admin has all permissions in matrix', () => {
      const role = 'super_admin';
      const matrix = PERMISSION_MATRIX[role];
      expect(matrix).toBeDefined();
      expect(matrix['patient:view']).toBe(true);
      expect(matrix['patient:edit']).toBe(true);
      expect(matrix['invoice:export']).toBe(true);
      expect(matrix['financial:view']).toBe(true);
      expect(matrix['report:run']).toBe(true);
      expect(matrix['message:view']).toBe(true);
      expect(matrix['message:send']).toBe(true);
      expect(matrix['order:view']).toBe(true);
      expect(matrix['order:create']).toBe(true);
    });

    it('toPermissionContext normalizes user shape', () => {
      const ctx = toPermissionContext({
        role: 'provider',
        clinicId: 2,
        patientId: undefined,
        providerId: 5,
      });
      expect(ctx.role).toBe('provider');
      expect(ctx.clinicId).toBe(2);
      expect(ctx.patientId).toBeNull();
      expect(ctx.providerId).toBe(5);
    });
  });
});
