/**
 * Automatic HIPAA Audit Middleware
 * ================================
 *
 * Wraps API route handlers to automatically log PHI access based on
 * the route path and HTTP method. Routes no longer need to manually
 * call auditPhiAccess() — this middleware infers the audit context
 * from the request metadata.
 *
 * Usage:
 *   import { withAutoAudit } from '@/lib/audit/audit-middleware';
 *
 *   // Wrap any auth-protected handler:
 *   export const GET = withAuth(
 *     withAutoAudit(async (req, user) => {
 *       const patient = await patientService.getPatient(id, userCtx);
 *       return Response.json({ patient });
 *     }),
 *     { roles: ['admin', 'provider'] }
 *   );
 *
 * Design:
 *   - Infers resourceType from the URL path (e.g. /api/patients/123 → Patient)
 *   - Infers action from HTTP method (GET → view, POST → create, etc.)
 *   - Extracts resourceId from path segments
 *   - Logs AFTER the handler completes (success or failure)
 *   - Never blocks the response — audit failures are caught and logged
 *
 * @module audit/audit-middleware
 * @security CRITICAL — ensures no PHI access goes unaudited
 */

import { NextRequest } from 'next/server';
import { auditPhiAccess, type AuditPhiAccessOptions } from './hipaa-audit';
import { logger } from '@/lib/logger';
import type { AuthUser } from '@/lib/auth/middleware';

// ============================================================================
// Route → Resource Type Mapping
// ============================================================================

/**
 * Map URL path prefixes to HIPAA resource types.
 * Ordered by specificity (longer prefixes first).
 */
const ROUTE_RESOURCE_MAP: Array<{ prefix: string; resourceType: string; isPhi: boolean }> = [
  { prefix: '/api/patients', resourceType: 'patient', isPhi: true },
  { prefix: '/api/patient-portal', resourceType: 'patient', isPhi: true },
  { prefix: '/api/patient-chat', resourceType: 'message', isPhi: true },
  { prefix: '/api/providers', resourceType: 'provider', isPhi: false },
  { prefix: '/api/orders', resourceType: 'order', isPhi: true },
  { prefix: '/api/prescriptions', resourceType: 'prescription', isPhi: true },
  { prefix: '/api/soap-notes', resourceType: 'soapNote', isPhi: true },
  { prefix: '/api/invoices', resourceType: 'invoice', isPhi: true },
  { prefix: '/api/appointments', resourceType: 'appointment', isPhi: true },
  { prefix: '/api/documents', resourceType: 'document', isPhi: true },
  { prefix: '/api/intakes', resourceType: 'intake', isPhi: true },
  { prefix: '/api/subscriptions', resourceType: 'subscription', isPhi: true },
  { prefix: '/api/lab-reports', resourceType: 'labReport', isPhi: true },
  { prefix: '/api/tickets', resourceType: 'ticket', isPhi: false },
  { prefix: '/api/affiliate', resourceType: 'affiliate', isPhi: false },
  { prefix: '/api/admin', resourceType: 'admin', isPhi: false },
];

/**
 * Map HTTP method to audit action verb.
 */
function methodToAction(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET': return 'view';
    case 'POST': return 'create';
    case 'PUT':
    case 'PATCH': return 'edit';
    case 'DELETE': return 'delete';
    default: return 'access';
  }
}

/**
 * Extract a numeric resource ID from the URL path.
 * Handles patterns like /api/patients/123 or /api/patients/123/documents.
 */
function extractResourceId(pathname: string): number | undefined {
  const segments = pathname.split('/').filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i--) {
    const num = parseInt(segments[i], 10);
    if (!isNaN(num) && num > 0) return num;
  }
  return undefined;
}

/**
 * Resolve the route to a resource type and PHI flag.
 */
function resolveRoute(pathname: string): { resourceType: string; isPhi: boolean } | null {
  for (const entry of ROUTE_RESOURCE_MAP) {
    if (pathname.startsWith(entry.prefix)) {
      return entry;
    }
  }
  return null;
}

// ============================================================================
// Middleware
// ============================================================================

type AuthHandler = (req: NextRequest, user: AuthUser, ...rest: unknown[]) => Promise<Response>;

/**
 * Wrap an API route handler with automatic HIPAA audit logging.
 *
 * Only audits routes that access PHI-bearing resources (as defined in ROUTE_RESOURCE_MAP).
 * Non-PHI routes pass through with zero overhead.
 *
 * The audit entry is written after the handler completes. If the handler throws,
 * the error is re-thrown after the audit log is written.
 */
export function withAutoAudit<T extends AuthHandler>(handler: T): T {
  const wrapped = async (req: NextRequest, user: AuthUser, ...rest: unknown[]): Promise<Response> => {
    const pathname = new URL(req.url).pathname;
    const routeInfo = resolveRoute(pathname);

    // Non-PHI or unknown route — skip audit
    if (!routeInfo || !routeInfo.isPhi) {
      return handler(req, user, ...rest);
    }

    const action = `${routeInfo.resourceType}:${methodToAction(req.method)}`;
    const resourceId = extractResourceId(pathname);
    const startTime = Date.now();
    let response: Response;
    let failed = false;

    try {
      response = await handler(req, user, ...rest);
    } catch (error) {
      failed = true;
      // Log the failed access attempt, then re-throw
      logAuditAsync(req, user, action, resourceId, routeInfo.resourceType, pathname);
      throw error;
    }

    // Fire-and-forget audit log for successful access
    if (!failed) {
      logAuditAsync(req, user, action, resourceId, routeInfo.resourceType, pathname);
    }

    return response;
  };

  return wrapped as T;
}

/**
 * Fire-and-forget audit log. Never blocks the response.
 */
function logAuditAsync(
  req: NextRequest,
  user: AuthUser,
  action: string,
  resourceId: number | undefined,
  resourceType: string,
  route: string
): void {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  const requestId = req.headers.get('x-request-id') || crypto.randomUUID();

  const options: AuditPhiAccessOptions = {
    clinicId: user.clinicId ?? null,
    userId: user.id,
    action,
    patientId: resourceType === 'patient' ? resourceId : undefined,
    route,
    ip,
    requestId,
  };

  auditPhiAccess(req, options).catch((err) => {
    logger.error('Auto-audit failed (non-blocking)', {
      error: err instanceof Error ? err.message : 'Unknown',
      action,
      route,
    });
  });
}
