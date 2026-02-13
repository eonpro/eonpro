/**
 * Tenant context error classes.
 * Separated from tenant-context.ts to avoid circular dependency with db.ts.
 *
 * @module lib/tenant-context-errors
 */

/** Error thrown when a route requires tenant context but it is missing */
export class TenantContextRequiredError extends Error {
  readonly code = 'TENANT_CONTEXT_REQUIRED';

  constructor(message = 'Tenant (clinic) context is required for this operation') {
    super(message);
    this.name = 'TenantContextRequiredError';
  }
}
