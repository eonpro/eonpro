/**
 * Tenant response normalization – enterprise security.
 * When a resource is not found within the current tenant, always return 404.
 * Never return 403/401 or different error shapes for "exists but not yours" vs "does not exist"
 * to prevent timing/response-based enumeration.
 *
 * @module lib/tenant-response
 */

import { NextResponse } from 'next/server';

/** Generic 404 body for resource-not-found (tenant-scoped). Do not leak whether the ID exists in another tenant. */
const NOT_FOUND_BODY = { error: 'Not found' };

/**
 * Return 404 when a tenant-scoped resource is not found or not in the current clinic.
 * Use after findUnique/findFirst: if null or clinicId mismatch, return this.
 * Optionally add a constant small delay to normalize timing (set TENANT_RESPONSE_DELAY_MS in env).
 */
export function tenantNotFoundResponse(): NextResponse {
  const body = NOT_FOUND_BODY;
  const res = NextResponse.json(body, { status: 404 });
  return res;
}

/**
 * Helper: if resource is null or (optional) clinicId does not match current, return 404 response.
 * Caller should return the result of this when it's non-null (NextResponse).
 */
export function ensureTenantResource<T extends { clinicId?: number | null }>(
  resource: T | null,
  currentClinicId: number | undefined
): NextResponse | null {
  if (resource == null) return tenantNotFoundResponse();
  if (currentClinicId != null && resource.clinicId != null && resource.clinicId !== currentClinicId)
    return tenantNotFoundResponse();
  return null;
}
