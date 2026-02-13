/**
 * Tenant (Clinic) Context – Enterprise Multi-Tenant Enforcement
 *
 * Single source of truth for tenant resolution per request.
 * Use getTenantRequire() in routes that must never run without tenant context.
 *
 * @module lib/tenant-context
 * @security CRITICAL - Tenant isolation
 */

import { getClinicContext, runWithClinicContext } from '@/lib/db';
import { logger } from '@/lib/logger';
import { TenantContextRequiredError } from './tenant-context-errors';

export { TenantContextRequiredError } from './tenant-context-errors';

/**
 * Returns the current tenant (clinic) ID from request context.
 * Use in routes that support both single-tenant and super-admin (null = all clinics).
 */
export function getTenant(): number | undefined {
  return getClinicContext();
}

/**
 * Returns the current tenant ID or throws TenantContextRequiredError.
 * Use in all protected routes that must never operate without tenant scope.
 *
 * @param routeOrContext - Optional label for logs (e.g. 'GET /api/patients')
 * @throws TenantContextRequiredError when context is missing
 */
export function getTenantRequire(routeOrContext?: string): number {
  const clinicId = getClinicContext();
  if (clinicId === undefined || clinicId === null) {
    logger.security('Tenant context required but missing', {
      route: routeOrContext,
      code: 'TENANT_CONTEXT_REQUIRED',
    });
    throw new TenantContextRequiredError(
      routeOrContext
        ? `Tenant context is required for ${routeOrContext}`
        : 'Tenant (clinic) context is required for this operation'
    );
  }
  return clinicId;
}

/**
 * Run a callback with the given tenant context set.
 * Use for webhooks/cron that resolve tenant from payload and then run tenant-scoped logic.
 */
export function runWithTenant<T>(clinicId: number | undefined, callback: () => T): T {
  return runWithClinicContext(clinicId, callback);
}
