/**
 * HIPAA-Compliant Audit Logging Service
 * Tracks all PHI access and modifications with tamper-proof logging
 *
 * Persists to HIPAAAuditEntry table for queryable compliance reporting.
 * Meets HIPAA §164.312(b) audit control requirements.
 *
 * @module audit/hipaa-audit
 * @version 2.0.0 - Database persistence enabled
 */

import { basePrisma } from '@/lib/db';
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { logger } from '@/lib/logger';

// Feature flag for database persistence (allows gradual rollout). Read at runtime for testability.
function auditWritesToDb(): boolean {
  return process.env.AUDIT_TO_DATABASE !== 'false';
}

// Audit event types
export enum AuditEventType {
  // Authentication events
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  LOGIN_FAILED = 'LOGIN_FAILED',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  PASSWORD_RESET = 'PASSWORD_RESET',
  MFA_CHALLENGE = 'MFA_CHALLENGE',
  SESSION_TIMEOUT = 'SESSION_TIMEOUT',

  // PHI access events
  PHI_VIEW = 'PHI_VIEW',
  PHI_CREATE = 'PHI_CREATE',
  PHI_UPDATE = 'PHI_UPDATE',
  PHI_DELETE = 'PHI_DELETE',
  PHI_EXPORT = 'PHI_EXPORT',
  PHI_PRINT = 'PHI_PRINT',

  // Document events
  DOCUMENT_VIEW = 'DOCUMENT_VIEW',
  DOCUMENT_UPLOAD = 'DOCUMENT_UPLOAD',
  DOCUMENT_DELETE = 'DOCUMENT_DELETE',
  DOCUMENT_DOWNLOAD = 'DOCUMENT_DOWNLOAD',

  // Administrative events
  USER_CREATE = 'USER_CREATE',
  USER_UPDATE = 'USER_UPDATE',
  USER_DELETE = 'USER_DELETE',
  PERMISSION_CHANGE = 'PERMISSION_CHANGE',

  // Emergency access
  EMERGENCY_ACCESS = 'EMERGENCY_ACCESS',
  BREAK_GLASS = 'BREAK_GLASS',

  // System events
  SYSTEM_ACCESS = 'SYSTEM_ACCESS',
  CONFIGURATION_CHANGE = 'CONFIGURATION_CHANGE',
  SECURITY_ALERT = 'SECURITY_ALERT',

  // Prescription queue workflow (admin queue → provider approve → pharmacy)
  PRESCRIPTION_QUEUED = 'PRESCRIPTION_QUEUED', // Admin queued for provider review
  PRESCRIPTION_APPROVED = 'PRESCRIPTION_APPROVED', // Provider approved and sent to pharmacy
}

// Audit context interface
export interface AuditContext {
  userId: number | string;
  userEmail?: string;
  userRole?: string;
  clinicId?: number;
  eventType: AuditEventType;
  resourceType: string;
  resourceId?: string | number;
  patientId?: number;
  action: string;
  outcome: 'SUCCESS' | 'FAILURE' | 'PARTIAL';
  reason?: string;
  metadata?: Record<string, any>;
  emergency?: boolean;
}

// Request context extraction
interface RequestContext {
  ipAddress: string;
  userAgent: string;
  sessionId?: string;
  requestId: string;
  method: string;
  path: string;
  timestamp: Date;
}

/**
 * Extract context from HTTP request
 */
function extractRequestContext(request: NextRequest): RequestContext {
  const cookies = 'cookies' in request && typeof (request as { cookies?: { get: (n: string) => { value?: string } } }).cookies?.get === 'function'
    ? (request as { cookies: { get: (n: string) => { value?: string } } }).cookies.get('session-id')?.value
    : undefined;
  return {
    ipAddress:
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      request.headers.get('cf-connecting-ip') || // Cloudflare
      'unknown',
    userAgent: request.headers.get('user-agent') || 'unknown',
    sessionId: cookies,
    requestId: request.headers.get('x-request-id') || crypto.randomUUID(),
    method: request.method,
    path: new URL(request.url).pathname,
    timestamp: new Date(),
  };
}

/**
 * Calculate hash for tamper detection
 */
function calculateAuditHash(data: any): string {
  const content = JSON.stringify({
    ...data,
    // Exclude the hash field itself
    hash: undefined,
    integrity: undefined,
  });

  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Main audit logging function
 */
export async function auditLog(request: NextRequest | null, context: AuditContext): Promise<void> {
  try {
    const requestContext = request ? extractRequestContext(request) : null;

    // Create comprehensive audit record
    const auditData = {
      // User context
      userId: String(context.userId),
      userEmail: context.userEmail || 'unknown',
      userRole: context.userRole || 'unknown',
      clinicId: context.clinicId,

      // Event details
      eventType: context.eventType,
      resourceType: context.resourceType,
      resourceId: String(context.resourceId || ''),
      patientId: context.patientId,
      action: context.action,
      outcome: context.outcome,
      reason: context.reason,

      // Request context
      ipAddress: requestContext?.ipAddress || 'system',
      userAgent: requestContext?.userAgent || 'system',
      sessionId: requestContext?.sessionId,
      requestId: requestContext?.requestId || crypto.randomUUID(),
      requestMethod: requestContext?.method || 'INTERNAL',
      requestPath: requestContext?.path || 'system',

      // Metadata
      metadata: context.metadata || {},
      emergency: context.emergency || false,
      timestamp: requestContext?.timestamp || new Date(),
    };

    // Calculate integrity hash
    const hash = calculateAuditHash(auditData);

    // PERSIST TO DATABASE for queryable audit trail (HIPAA requirement)
    if (auditWritesToDb()) {
      try {
        await basePrisma.hIPAAAuditEntry.create({
          data: {
            userId: auditData.userId,
            userEmail: auditData.userEmail,
            userRole: auditData.userRole,
            clinicId: auditData.clinicId,
            eventType: auditData.eventType,
            resourceType: auditData.resourceType,
            resourceId: auditData.resourceId || null,
            patientId: auditData.patientId,
            ipAddress: auditData.ipAddress,
            userAgent: auditData.userAgent,
            sessionId: auditData.sessionId,
            requestId: auditData.requestId,
            requestMethod: auditData.requestMethod,
            requestPath: auditData.requestPath,
            outcome: auditData.outcome,
            reason: auditData.reason,
            hash: hash,
            metadata: auditData.metadata,
            emergency: auditData.emergency,
          },
        });
      } catch (dbError) {
        // Database write failed - log but don't fail the request
        logger.error('Failed to persist audit log to database', dbError as Error);
        // Fall through to Sentry logging as backup
      }
    }

    // Also log to Sentry for real-time monitoring (PHI redacted in logs)
    logger.api('AUDIT', context.eventType, {
      ...redactPhiForLogs(auditData as Record<string, unknown>),
      hash,
      integrity: 'SHA256',
      persistedToDb: auditWritesToDb(),
    });

    // If this is a security event, trigger alerts
    if (
      context.eventType === AuditEventType.SECURITY_ALERT ||
      context.eventType === AuditEventType.EMERGENCY_ACCESS ||
      (context.eventType === AuditEventType.LOGIN_FAILED && (context.metadata?.attempts || 0) > 3)
    ) {
      await triggerSecurityAlert(auditData);
    }

    // Store critical events in separate immutable log (PHI redacted)
    if (isCriticalEvent(context.eventType)) {
      await logCriticalEvent(redactPhiForLogs(auditData as Record<string, unknown>), hash);
    }
  } catch (error) {
    // Audit logging should never break the application
    logger.error('Audit logging failed', error);

    // Try fallback logging
    try {
      await fallbackAuditLog(context);
    } catch (fallbackError) {
      logger.error('Fallback audit logging failed', fallbackError);
    }
  }
}

/**
 * Redact PHI from audit data before logging to application logs (Vercel, CloudWatch, etc.).
 * Database persistence keeps full userEmail for audit trail; logs must not expose PHI.
 */
function redactPhiForLogs(data: Record<string, unknown>): Record<string, unknown> {
  const { userEmail, ...rest } = data;
  return { ...rest, userEmail: '[REDACTED]' };
}

/**
 * Determine if event is critical for compliance
 */
function isCriticalEvent(eventType: AuditEventType): boolean {
  const criticalEvents = [
    AuditEventType.PHI_VIEW,
    AuditEventType.PHI_UPDATE,
    AuditEventType.PHI_DELETE,
    AuditEventType.PHI_EXPORT,
    AuditEventType.DOCUMENT_DOWNLOAD,
    AuditEventType.EMERGENCY_ACCESS,
    AuditEventType.BREAK_GLASS,
    AuditEventType.PERMISSION_CHANGE,
    AuditEventType.SECURITY_ALERT,
  ];

  return criticalEvents.includes(eventType);
}

/**
 * Log critical events to immutable store
 */
async function logCriticalEvent(data: any, hash: string): Promise<void> {
  // In production, this should write to:
  // 1. Write-once storage (WORM)
  // 2. External SIEM system
  // 3. Blockchain or other immutable ledger

  const criticalLog = {
    ...data,
    hash,
    integrity: 'CRITICAL',
    immutable: true,
    timestamp: new Date().toISOString(),
  };

  // For now, use special logger channel
  logger.security('CRITICAL_AUDIT', criticalLog);
}

/**
 * Trigger security alerts for suspicious events
 */
async function triggerSecurityAlert(data: any): Promise<void> {
  const alert = {
    severity: 'HIGH',
    type: data.eventType,
    userId: data.userId,
    ip: data.ipAddress,
    timestamp: data.timestamp,
    action: data.action,
    metadata: data.metadata,
  };

  // Send to security team
  logger.security('SECURITY_ALERT', alert);

  // In production, also:
  // 1. Send email/SMS to security team
  // 2. Create incident ticket
  // 3. Trigger automated response (e.g., lock account)
}

/**
 * Fallback audit logging to file system
 */
async function fallbackAuditLog(context: AuditContext): Promise<void> {
  const fs = await import('fs/promises');
  const path = await import('path');

  const logDir = path.join(process.cwd(), 'audit-logs');
  await fs.mkdir(logDir, { recursive: true });

  const date = new Date();
  const filename = `audit-${date.toISOString().split('T')[0]}.jsonl`;
  const filepath = path.join(logDir, filename);

  const logEntry =
    JSON.stringify({
      ...context,
      timestamp: date.toISOString(),
      fallback: true,
    }) + '\n';

  await fs.appendFile(filepath, logEntry);
}

/**
 * Audit log middleware for automatic tracking
 */
export function withAuditLog<T extends (...args: any[]) => any>(
  handler: T,
  auditConfig: {
    eventType: AuditEventType;
    resourceType: string;
    extractResourceId?: (args: any[]) => string | number;
    extractPatientId?: (args: any[]) => number | undefined;
  }
): T {
  return (async (...args: any[]) => {
    const [request, user, ...rest] = args;
    let outcome: 'SUCCESS' | 'FAILURE' = 'SUCCESS';
    let result;

    try {
      // Execute handler
      result = await handler(...args);

      // Log successful access
      await auditLog(request, {
        userId: user?.id || 'anonymous',
        userEmail: user?.email,
        userRole: user?.role,
        clinicId: user?.clinicId,
        eventType: auditConfig.eventType,
        resourceType: auditConfig.resourceType,
        resourceId: auditConfig.extractResourceId?.(args),
        patientId: auditConfig.extractPatientId?.(args),
        action: `${auditConfig.eventType}_${auditConfig.resourceType}`,
        outcome: 'SUCCESS',
      });

      return result;
    } catch (error) {
      outcome = 'FAILURE';

      // Log failed access
      await auditLog(request, {
        userId: user?.id || 'anonymous',
        userEmail: user?.email,
        userRole: user?.role,
        clinicId: user?.clinicId,
        eventType: auditConfig.eventType,
        resourceType: auditConfig.resourceType,
        resourceId: auditConfig.extractResourceId?.(args),
        patientId: auditConfig.extractPatientId?.(args),
        action: `${auditConfig.eventType}_${auditConfig.resourceType}`,
        outcome: 'FAILURE',
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      throw error;
    }
  }) as T;
}

/**
 * Query audit logs with filters
 * Returns audit entries matching the specified criteria
 */
export async function queryAuditLogs(filters: {
  userId?: string;
  patientId?: number;
  clinicId?: number;
  eventType?: AuditEventType;
  startDate?: Date;
  endDate?: Date;
  outcome?: 'SUCCESS' | 'FAILURE';
  limit?: number;
  offset?: number;
}): Promise<any[]> {
  try {
    const where: any = {};

    if (filters.userId) {
      where.userId = filters.userId;
    }
    if (filters.patientId) {
      where.patientId = filters.patientId;
    }
    if (filters.clinicId) {
      where.clinicId = filters.clinicId;
    }
    if (filters.eventType) {
      where.eventType = filters.eventType;
    }
    if (filters.outcome) {
      where.outcome = filters.outcome;
    }
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    const logs = await basePrisma.hIPAAAuditEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters.limit || 1000,
      skip: filters.offset || 0,
    });

    return logs;
  } catch (error) {
    logger.error('Failed to query audit logs', error as Error);
    return [];
  }
}

/**
 * Generate audit report for compliance
 */
export async function generateAuditReport(
  startDate: Date,
  endDate: Date,
  format: 'json' | 'csv' | 'pdf' = 'json'
): Promise<string | Buffer> {
  const logs = await queryAuditLogs({
    startDate,
    endDate,
  });

  if (format === 'json') {
    return JSON.stringify(logs, null, 2);
  } else if (format === 'csv') {
    // Convert to CSV
    const headers = Object.keys(logs[0] || {}).join(',');
    const rows = logs.map((log) =>
      Object.values(log)
        .map((v) => (typeof v === 'string' && v.includes(',') ? `"${v}"` : v))
        .join(',')
    );
    return [headers, ...rows].join('\n');
  } else {
    // Generate PDF report (would use a PDF library)
    return Buffer.from('PDF report not implemented');
  }
}

/**
 * Verify audit log integrity by recalculating and comparing hash
 * Used for tamper detection in compliance audits
 */
export async function verifyAuditIntegrity(
  logId: number
): Promise<{ valid: boolean; reason?: string }> {
  try {
    const entry = await basePrisma.hIPAAAuditEntry.findUnique({
      where: { id: logId },
    });

    if (!entry) {
      return { valid: false, reason: 'Audit entry not found' };
    }

    // Reconstruct the data object for hash verification
    const auditData = {
      userId: entry.userId,
      userEmail: entry.userEmail,
      userRole: entry.userRole,
      clinicId: entry.clinicId,
      eventType: entry.eventType,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      patientId: entry.patientId,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      sessionId: entry.sessionId,
      requestId: entry.requestId,
      requestMethod: entry.requestMethod,
      requestPath: entry.requestPath,
      outcome: entry.outcome,
      reason: entry.reason,
      metadata: entry.metadata,
      emergency: entry.emergency,
    };

    const recalculatedHash = calculateAuditHash(auditData);

    if (recalculatedHash !== entry.hash) {
      logger.security('AUDIT_INTEGRITY_VIOLATION', {
        logId,
        expectedHash: entry.hash,
        calculatedHash: recalculatedHash,
      });
      return { valid: false, reason: 'Hash mismatch - possible tampering detected' };
    }

    return { valid: true };
  } catch (error) {
    logger.error('Failed to verify audit integrity', error as Error);
    return { valid: false, reason: 'Verification failed due to error' };
  }
}

/**
 * Get audit statistics for compliance reporting
 */
export async function getAuditStats(filters: {
  clinicId?: number;
  startDate: Date;
  endDate: Date;
}): Promise<{
  totalEvents: number;
  byEventType: Record<string, number>;
  byOutcome: Record<string, number>;
  phiAccessCount: number;
}> {
  try {
    const where: any = {
      createdAt: {
        gte: filters.startDate,
        lte: filters.endDate,
      },
    };

    if (filters.clinicId) {
      where.clinicId = filters.clinicId;
    }

    const [totalEvents, phiAccessCount, eventTypeGroups, outcomeGroups] = await Promise.all([
      basePrisma.hIPAAAuditEntry.count({ where }),
      basePrisma.hIPAAAuditEntry.count({
        where: {
          ...where,
          eventType: { in: ['PHI_VIEW', 'PHI_UPDATE', 'PHI_CREATE', 'PHI_DELETE', 'PHI_EXPORT'] },
        },
      }),
      basePrisma.hIPAAAuditEntry.groupBy({
        by: ['eventType'],
        where,
        _count: true,
      }),
      basePrisma.hIPAAAuditEntry.groupBy({
        by: ['outcome'],
        where,
        _count: true,
      }),
    ]);

    const byEventType: Record<string, number> = {};
    eventTypeGroups.forEach((g: any) => {
      byEventType[g.eventType] = g._count;
    });

    const byOutcome: Record<string, number> = {};
    outcomeGroups.forEach((g: any) => {
      byOutcome[g.outcome] = g._count;
    });

    return {
      totalEvents,
      byEventType,
      byOutcome,
      phiAccessCount,
    };
  } catch (error) {
    logger.error('Failed to get audit stats', error as Error);
    return {
      totalEvents: 0,
      byEventType: {},
      byOutcome: {},
      phiAccessCount: 0,
    };
  }
}

// Export event types for use in application
export const AUDIT_EVENTS = AuditEventType;

// ============================================================================
// ENTERPRISE: auditPhiAccess — PHI/Financial access audit (no PHI content stored)
// ============================================================================

/** Keys that must NEVER appear in audit metadata (PHI content) */
const PHI_METADATA_BLOCKLIST = new Set([
  'name',
  'firstName',
  'lastName',
  'first_name',
  'last_name',
  'dob',
  'dateOfBirth',
  'date_of_birth',
  'address',
  'address1',
  'address2',
  'city',
  'state',
  'zip',
  'phone',
  'email',
  'ssn',
  'socialSecurityNumber',
  'content',
  'message',
  'body',
  'description',
]);

export interface AuditPhiAccessOptions {
  clinicId: number | null | undefined;
  userId: number | string;
  action: string; // e.g. patient:view, patient:edit, invoice:view, report:export, financial:view, message:view, message:send, order:create
  patientId?: number | null;
  route: string;
  ip: string;
  requestId: string;
  timestamp?: Date;
  /** Optional; must not contain PHI keys (blocklisted keys are stripped) */
  metadata?: Record<string, unknown>;
}

/**
 * Sanitize metadata: remove any key that could hold PHI content.
 * Only identifiers and non-PHI metadata are allowed.
 */
function sanitizeAuditMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(metadata)) {
    const keyLower = k.toLowerCase().replace(/_/g, '');
    const blocklisted =
      PHI_METADATA_BLOCKLIST.has(k) ||
      Array.from(PHI_METADATA_BLOCKLIST).some((b) => keyLower.includes(b.replace(/_/g, '')));
    if (!blocklisted && v !== undefined) out[k] = v;
  }
  return out;
}

/**
 * Map action string to HIPAA event type for storage
 */
function eventTypeFromAction(action: string): string {
  if (action.includes('view') || action === 'invoice:view' || action === 'message:view') return 'PHI_VIEW';
  if (action.includes('edit') || action.includes('create') || action === 'message:send') return 'PHI_UPDATE';
  if (action.includes('export')) return 'PHI_EXPORT';
  return 'PHI_VIEW';
}

/**
 * Enterprise HIPAA audit: log PHI/financial access with required fields.
 * Call AFTER permission check and BEFORE sending response.
 * NEVER stores PHI content — only identifiers and metadata (blocklisted keys stripped).
 */
export async function auditPhiAccess(
  request: NextRequest | null,
  options: AuditPhiAccessOptions
): Promise<void> {
  try {
    const reqCtx = request ? extractRequestContext(request) : null;
    const ip = options.ip || reqCtx?.ipAddress || 'unknown';
    const requestId = options.requestId || reqCtx?.requestId || crypto.randomUUID();
    const route = options.route || reqCtx?.path || 'unknown';
    const timestamp = options.timestamp || reqCtx?.timestamp || new Date();
    const metadata = sanitizeAuditMetadata(options.metadata);

    const auditData = {
      userId: String(options.userId),
      userEmail: 'audit', // No PHI: do not store email in audit
      userRole: 'audit',
      clinicId: options.clinicId ?? null,
      eventType: eventTypeFromAction(options.action),
      resourceType: options.action.split(':')[0] || 'resource',
      resourceId: options.patientId != null ? String(options.patientId) : null,
      patientId: options.patientId ?? null,
      action: options.action,
      ipAddress: ip,
      userAgent: reqCtx?.userAgent || 'unknown',
      sessionId: reqCtx?.sessionId ?? null,
      requestId,
      requestMethod: reqCtx?.method || 'GET',
      requestPath: route,
      outcome: 'SUCCESS' as const,
      reason: null as string | null,
      metadata,
      emergency: false,
      timestamp,
    };

    const hash = calculateAuditHash(auditData);

    if (auditWritesToDb()) {
      try {
        await basePrisma.hIPAAAuditEntry.create({
          data: {
            userId: auditData.userId,
            userEmail: auditData.userEmail,
            userRole: auditData.userRole,
            clinicId: auditData.clinicId,
            eventType: auditData.eventType,
            resourceType: auditData.resourceType,
            resourceId: auditData.resourceId,
            patientId: auditData.patientId,
            ipAddress: auditData.ipAddress,
            userAgent: auditData.userAgent,
            sessionId: auditData.sessionId,
            requestId: auditData.requestId,
            requestMethod: auditData.requestMethod,
            requestPath: auditData.requestPath,
            outcome: auditData.outcome,
            reason: auditData.reason,
            hash,
            metadata: auditData.metadata as object,
            emergency: auditData.emergency,
          },
        });
      } catch (dbError) {
        logger.error('Failed to persist auditPhiAccess to database', dbError as Error);
      }
    }

    logger.api('AUDIT_PHI', options.action, {
      clinicId: options.clinicId,
      userId: options.userId,
      requestId,
      route,
      patientId: options.patientId,
    });
  } catch (error) {
    logger.error('auditPhiAccess failed', error);
  }
}

/**
 * Build options for auditPhiAccess from request + user (after permission check).
 * Extracts ip, requestId, route from request when available.
 */
export function buildAuditPhiOptions(
  request: NextRequest | null,
  user: { id: number; role: string; clinicId?: number | null },
  action: string,
  opts: { patientId?: number | null; route?: string } = {}
): AuditPhiAccessOptions {
  const reqCtx = request ? extractRequestContext(request) : null;
  return {
    clinicId: user.clinicId ?? null,
    userId: user.id,
    action,
    patientId: opts.patientId,
    route: opts.route ?? reqCtx?.path ?? 'unknown',
    ip: reqCtx?.ipAddress ?? 'unknown',
    requestId: reqCtx?.requestId ?? crypto.randomUUID(),
    timestamp: reqCtx?.timestamp,
    metadata: {},
  };
}

// ============================================================================
// CONVENIENCE HELPERS FOR COMMON PHI ACCESS PATTERNS
// ============================================================================

/**
 * User context for audit logging (simplified from auth middleware)
 */
export interface AuditUserContext {
  id: number;
  email?: string;
  role: string;
  clinicId?: number | null;
}

/**
 * Log PHI view access (read operation)
 */
export async function logPHIAccess(
  request: NextRequest | null,
  user: AuditUserContext,
  resourceType: string,
  resourceId: string | number,
  patientId?: number,
  metadata?: Record<string, unknown>
): Promise<void> {
  await auditLog(request, {
    eventType: AuditEventType.PHI_VIEW,
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    clinicId: user.clinicId ?? undefined,
    resourceType,
    resourceId,
    patientId,
    action: `view_${resourceType.toLowerCase()}`,
    outcome: 'SUCCESS',
    metadata,
  });
}

/**
 * Log PHI creation
 */
export async function logPHICreate(
  request: NextRequest | null,
  user: AuditUserContext,
  resourceType: string,
  resourceId: string | number,
  patientId?: number,
  metadata?: Record<string, unknown>
): Promise<void> {
  await auditLog(request, {
    eventType: AuditEventType.PHI_CREATE,
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    clinicId: user.clinicId ?? undefined,
    resourceType,
    resourceId,
    patientId,
    action: `create_${resourceType.toLowerCase()}`,
    outcome: 'SUCCESS',
    metadata,
  });
}

/**
 * Log PHI update
 */
export async function logPHIUpdate(
  request: NextRequest | null,
  user: AuditUserContext,
  resourceType: string,
  resourceId: string | number,
  patientId?: number,
  changedFields?: string[],
  metadata?: Record<string, unknown>
): Promise<void> {
  await auditLog(request, {
    eventType: AuditEventType.PHI_UPDATE,
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    clinicId: user.clinicId ?? undefined,
    resourceType,
    resourceId,
    patientId,
    action: `update_${resourceType.toLowerCase()}`,
    outcome: 'SUCCESS',
    metadata: {
      ...metadata,
      changedFields: changedFields?.join(', '),
    },
  });
}

/**
 * Log PHI deletion
 */
export async function logPHIDelete(
  request: NextRequest | null,
  user: AuditUserContext,
  resourceType: string,
  resourceId: string | number,
  patientId?: number,
  reason?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await auditLog(request, {
    eventType: AuditEventType.PHI_DELETE,
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    clinicId: user.clinicId ?? undefined,
    resourceType,
    resourceId,
    patientId,
    action: `delete_${resourceType.toLowerCase()}`,
    outcome: 'SUCCESS',
    reason,
    metadata,
  });
}

/**
 * Log failed PHI access attempt (for security monitoring)
 */
export async function logPHIAccessDenied(
  request: NextRequest | null,
  user: AuditUserContext,
  resourceType: string,
  resourceId: string | number,
  reason: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await auditLog(request, {
    eventType: AuditEventType.PHI_VIEW,
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    clinicId: user.clinicId ?? undefined,
    resourceType,
    resourceId,
    action: `access_denied_${resourceType.toLowerCase()}`,
    outcome: 'FAILURE',
    reason,
    metadata,
  });
}

/**
 * Log security event (login failures, suspicious activity)
 */
export async function logSecurityEvent(
  request: NextRequest | null,
  eventType: 'LOGIN_FAILED' | 'SECURITY_ALERT' | 'BREAK_GLASS',
  userId: number | string | null,
  reason: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await auditLog(request, {
    eventType: AuditEventType[eventType],
    userId: userId ?? 'anonymous',
    resourceType: 'Security',
    action: eventType.toLowerCase(),
    outcome: eventType === 'BREAK_GLASS' ? 'SUCCESS' : 'FAILURE',
    reason,
    metadata,
  });
}
