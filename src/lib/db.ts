import { PrismaClient, Prisma } from '@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';
import { logger } from './logger';
import { connectionPool, withRetry, withTimeout } from './database/connection-pool';
import {
  getServerlessConfig,
  buildServerlessConnectionUrl,
  logPoolConfiguration,
  drainManager,
  checkDatabaseHealth,
  getPoolStats,
} from './database/serverless-pool';
import { TenantContextRequiredError } from './tenant-context-errors';

// Re-export Prisma namespace for TransactionClient and other types
export { Prisma } from '@prisma/client';
// PHI extension disabled - SSN field no longer exists in schema
// import { createPrismaWithPHI, PrismaWithPHI } from './database/phi-extension';

// Use AsyncLocalStorage for request-scoped clinic context
// This prevents race conditions in serverless environments
const clinicContextStorage = new AsyncLocalStorage<{ clinicId?: number }>();

const globalForPrisma = global as unknown as {
  prisma?: PrismaClient;
  currentClinicId?: number; // DEPRECATED: Use clinicContextStorage instead
  healthCheckStarted?: boolean;
  shutdownRegistered?: boolean;
};

// ============================================================================
// DATABASE CONNECTION POOLING CONFIGURATION
// ============================================================================
//
// This module now integrates with ConnectionPoolManager for proper pool management.
//
// For production, use PgBouncer or Prisma Accelerate for connection pooling.
//
// Connection Pool Settings:
// - Serverless (Vercel): Use ?pgbouncer=true&connection_limit=1 in DATABASE_URL
// - Traditional: Set connection_limit based on serverless concurrency
//
// DATABASE_URL format with pooling:
// postgresql://user:pass@host:6543/db?pgbouncer=true&connection_limit=1
//
// Or with Prisma Accelerate:
// prisma://accelerate.prisma-data.net/?api_key=YOUR_KEY
//
// Environment Variables:
// - DATABASE_CONNECTION_LIMIT: Max connections per instance (default: 10)
// - DATABASE_POOL_TIMEOUT: Connection timeout in seconds (default: 10)
// ============================================================================

// Connection configuration now handled by serverless-pool.ts

/**
 * Build DATABASE_URL with proper connection pool parameters
 * Now uses serverless-optimized configuration for Vercel deployments
 */
function buildConnectionUrl(): string {
  try {
    // Use the new serverless-optimized URL builder
    return buildServerlessConnectionUrl();
  } catch (error) {
    logger.warn('[Prisma] Could not build connection URL', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return process.env.DATABASE_URL || '';
  }
}

// Models that require clinic isolation (lowercase for comparison).
// MUST include every Prisma model that has a clinicId column. See tests/tenant-isolation/clinic-isolated-models.test.ts.
export const CLINIC_ISOLATED_MODELS: readonly string[] = [
  'addressvalidationlog',
  'affiliate',
  'affiliateapplication',
  'affiliateattributionconfig',
  'affiliatecommission',
  'affiliatecommissionevent',
  'affiliatecommissionplan',
  'affiliatecompetition',
  'affiliatefraudalert',
  'affiliatefraudconfig',
  'affiliatepayout',
  'affiliateplanassignment',
  'affiliateprogram',
  'affiliaterefcode',
  'affiliatereferral',
  'affiliatetouch',
  'aiconversation',
  'apikey',
  'appointment',
  'appointmenttypeconfig',
  'auditlog',
  'billingcode',
  'calendarsubscription',
  'careplan',
  'careplantemplate',
  'challenge',
  'clinicauditlog',
  'clinicinvitecode',
  'clinicplatformfeeconfig',
  'clinicplatforminvoice',
  'commission',
  'discountcode',
  'emaillog',
  'financialmetrics',
  'hipaaauditentry',
  'influencer',
  'intakeformtemplate',
  'integration',
  'internalmessage',
  'invoice',
  'labreport',
  'notification',
  'order',
  'patient',
  'patientchatmessage',
  'patientcounter',
  'patientdocument',
  'patientexerciselog',
  'patientnutritionlog',
  'patientphoto',
  'patientprescriptioncycle',
  'patientsalesrepassignment',
  'patientshippingupdate',
  'patientsleeplog',
  'patientwaterlog',
  'payment',
  'paymentmethod',
  'paymentreconciliation',
  'platformfeeevent',
  'policyacknowledgment',
  'pricingrule',
  'product',
  'productbundle',
  'promotion',
  'provider',
  'provideravailability',
  'providercalendarintegration',
  'providerclinic',
  'providercompensationevent',
  'providercompensationplan',
  'providerroutingconfig',
  'providertimeoff',
  'referraltracking',
  'refillqueue',
  'reportexport',
  'retentionoffer',
  'savedreport',
  'scheduledemail',
  'slapolicyconfig',
  'smslog',
  'smsoptout',
  'smsquiethours',
  'smsratelimit',
  'soapnote',
  'subscription',
  'superbill',
  'systemsettings',
  'telehealthsession',
  'ticket',
  'ticketautomationrule',
  'ticketbusinesshours',
  'ticketmacro',
  'ticketsavedview',
  'ticketteam',
  'tickettemplate',
  'user',
  'userclinic',
  'webhookconfig',
  'webhooklog',
] as const;

/**
 * Allow-list for basePrisma: only these clinic-scoped or global models may be used with basePrisma.
 * All other tenant-scoped access MUST use prisma (wrapper) with runWithClinicContext(clinicId, ...).
 * - clinic: tenant lookup (resolve, auth)
 * - user: auth (login, session)
 * - userClinic, providerClinic: auth / clinic access checks
 * - provider: auth login (lookup by email before clinic is set)
 * - hIPAAAuditEntry: audit write (cross-clinic for super-admin; write-only)
 * - patient: webhook/cron lookup by non-tenant key (e.g. phone) to resolve clinicId only; writes must use prisma with that clinicId
 * - affiliate*, platformfeeevent: super-admin cross-tenant only (must be guarded by withSuperAdminAuth)
 */
const BASE_PRISMA_ALLOWLIST: readonly string[] = [
  'clinic',
  'user',
  'userclinic',
  'providerclinic',
  'provider',
  'patient',
  'hipaaauditentry',
  'affiliate',
  'affiliateapplication',
  'affiliatecommissionevent', // super-admin cross-tenant commission aggregation (guarded by withSuperAdminAuth)
  'affiliatecommissionplan',
  'affiliateplanassignment',
  'platformfeeevent',
  'scheduledemail', // cron needs to query system-level emails (clinicId = null)
  'internalmessage', // user-scoped (senderId/recipientId), not clinic-scoped; clinicId is optional context only
];

/**
 * Create Prisma client with multi-clinic isolation and connection pooling
 * Using query extension pattern for Prisma v4+
 *
 * Now uses serverless-optimized connection configuration for:
 * - Aggressive connection limits (1-3 per function)
 * - RDS Proxy compatibility
 * - Automatic connection draining
 */
function createPrismaClient() {
  const isProd = process.env.NODE_ENV === 'production';
  const config = getServerlessConfig();
  const connectionUrl = buildConnectionUrl();

  // Log serverless-optimized configuration
  logPoolConfiguration();

  const client = new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : isProd
          ? ['error'] // Only errors in production
          : ['warn', 'error'],
    // Use the serverless-optimized connection URL
    datasources: {
      db: {
        url: connectionUrl,
      },
    },
  });

  // Register with drain manager for serverless cleanup
  drainManager.register(client);

  // Add query timing middleware for monitoring + query budget tracking + Sentry metrics
  if (isProd || process.env.ENABLE_QUERY_LOGGING === 'true') {
    // @ts-ignore - Prisma v5 middleware
    client.$use?.(async (params, next) => {
      const start = Date.now();
      try {
        const result = await next(params);
        const duration = Date.now() - start;

        // Log slow queries (> 100ms)
        if (duration > 100) {
          logger.warn('[Prisma] Slow query', {
            model: params.model,
            action: params.action,
            duration,
            args: isProd ? '[redacted]' : params.args,
          });
        }

        // Record metrics for connection pool monitoring
        connectionPool.recordQuery(duration, true);

        // Emit structured Sentry metrics for dashboards
        try {
          const { emitQueryMetric } = require('@/lib/observability/metrics');
          emitQueryMetric({
            operation: params.action || 'unknown',
            table: params.model || 'unknown',
            durationMs: duration,
          });
        } catch {
          // Metrics module not available
        }

        // Track per-request query budget (N+1 and fan-out detection)
        try {
          const { recordQuery } = require('@/lib/database/query-budget');
          recordQuery(params.model, params.action, duration);
        } catch {
          // query-budget module not available (e.g., during migrations)
        }

        return result;
      } catch (error) {
        const duration = Date.now() - start;
        connectionPool.recordQuery(duration, false);

        // Emit error metrics
        try {
          const { emitQueryMetric } = require('@/lib/observability/metrics');
          emitQueryMetric({
            operation: params.action || 'unknown',
            table: params.model || 'unknown',
            durationMs: duration,
          });
        } catch {
          // Metrics module not available
        }

        try {
          const { recordQuery } = require('@/lib/database/query-budget');
          recordQuery(params.model, params.action, duration);
        } catch {
          // query-budget module not available
        }

        throw error;
      }
    });
  }

  return client;
}

/**
 * Start connection health monitoring
 * Only starts once, safe to call multiple times
 */
function startHealthMonitoring(client: PrismaClient): void {
  if (globalForPrisma.healthCheckStarted) {
    return;
  }

  const isProd = process.env.NODE_ENV === 'production';
  const isVercel = !!process.env.VERCEL;

  // Start health checks in production (but not too aggressively in serverless)
  if (isProd && !isVercel) {
    connectionPool.startHealthCheck(client);
    globalForPrisma.healthCheckStarted = true;
    logger.info('[Prisma] Health monitoring started');
  }
}

/**
 * Register graceful shutdown handlers
 * Ensures connections are properly closed before process exits
 */
function registerShutdownHandlers(client: PrismaClient): void {
  if (globalForPrisma.shutdownRegistered || typeof process === 'undefined') {
    return;
  }

  const shutdown = async (signal: string) => {
    logger.info(`[Prisma] Received ${signal}, initiating graceful shutdown`);

    try {
      // Stop health checks first
      await connectionPool.shutdown();

      // Disconnect Prisma client
      await client.$disconnect();

      logger.info('[Prisma] Graceful shutdown complete');
    } catch (error) {
      logger.error('[Prisma] Error during shutdown', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  // Register shutdown handlers (only in non-serverless environments)
  if (!process.env.VERCEL) {
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    globalForPrisma.shutdownRegistered = true;
    logger.debug('[Prisma] Shutdown handlers registered');
  }
}

// Create the base client (singleton per process to avoid connection pool exhaustion)
const _rawBasePrisma = globalForPrisma.prisma ?? createPrismaClient();
globalForPrisma.prisma = _rawBasePrisma;

// Initialize health monitoring and shutdown handlers
startHealthMonitoring(_rawBasePrisma);
registerShutdownHandlers(_rawBasePrisma);

/** In production, throw if basePrisma is used for a clinic-isolated model not in BASE_PRISMA_ALLOWLIST. */
function createGuardedBasePrisma(client: PrismaClient): PrismaClient {
  if (process.env.NODE_ENV !== 'production') return client;
  return new Proxy(client, {
    get(target, prop: string) {
      const delegate = (target as any)[prop];
      if (
        delegate &&
        typeof prop === 'string' &&
        (CLINIC_ISOLATED_MODELS as readonly string[]).includes(prop.toLowerCase()) &&
        !BASE_PRISMA_ALLOWLIST.includes(prop.toLowerCase())
      ) {
        throw new Error(
          `basePrisma.${prop} is not allowed in production. Use prisma with runWithClinicContext or add to BASE_PRISMA_ALLOWLIST.`
        );
      }
      return delegate;
    },
  }) as PrismaClient;
}

/**
 * Wrapper for Prisma client with clinic filtering
 * This provides clinic isolation without using deprecated $use
 */
class PrismaWithClinicFilter {
  private client: PrismaClient;

  constructor(client: PrismaClient) {
    this.client = client;
  }

  /**
   * Get clinic ID from AsyncLocalStorage (thread-safe) or fallback to global
   */
  private getClinicId(): number | undefined {
    // First try AsyncLocalStorage (preferred - thread-safe)
    const store = clinicContextStorage.getStore();
    // If store exists, use its clinicId value (even if undefined - for withoutClinicFilter)
    if (store !== undefined) {
      return store.clinicId;
    }
    // Fallback to global for backwards compatibility
    // DEPRECATED: This will be removed in future versions
    return globalForPrisma.currentClinicId;
  }

  /**
   * Check if clinic filter should be bypassed
   * SECURITY: Only allowed in non-production environments
   */
  private shouldBypassFilter(): boolean {
    if (process.env.BYPASS_CLINIC_FILTER === 'true') {
      if (process.env.NODE_ENV === 'production') {
        logger.security('CRITICAL: BYPASS_CLINIC_FILTER attempted in production - BLOCKED', {
          timestamp: new Date().toISOString(),
        });
        return false; // NEVER bypass in production
      }
      logger.warn('BYPASS_CLINIC_FILTER is enabled - clinic isolation disabled');
      return true;
    }
    return false;
  }

  /**
   * Apply clinic filter to where clause.
   * NEVER returns unmodified where for clinic-isolated models when tenant context is missing — THROWS instead.
   */
  private applyClinicFilter(where: any = {}, modelName?: string): any {
    const clinicId = this.getClinicId();
    const isClinicIsolated =
      modelName && (CLINIC_ISOLATED_MODELS as readonly string[]).includes(modelName.toLowerCase());

    if (isClinicIsolated && (clinicId === undefined || clinicId === null)) {
      if (!this.shouldBypassFilter()) {
        logger.security('Tenant context required for clinic-isolated query', {
          model: modelName,
          code: 'TENANT_CONTEXT_REQUIRED',
        });
        throw new TenantContextRequiredError(
          `Tenant context is required for ${modelName}. Set clinic context via auth middleware or runWithClinicContext.`
        );
      }
    }

    if (!clinicId || this.shouldBypassFilter()) {
      return where;
    }

    return {
      ...where,
      clinicId: clinicId,
    };
  }

  /**
   * Apply clinic ID to data for creates.
   * NEVER allows create on clinic-isolated models without tenant context — THROWS instead.
   */
  private applyClinicToData(data: any, modelName?: string): any {
    const clinicId = this.getClinicId();
    const isClinicIsolated =
      modelName && (CLINIC_ISOLATED_MODELS as readonly string[]).includes(modelName.toLowerCase());

    if (isClinicIsolated && (clinicId === undefined || clinicId === null)) {
      if (!this.shouldBypassFilter()) {
        logger.security('Tenant context required for clinic-isolated create', {
          model: modelName,
          code: 'TENANT_CONTEXT_REQUIRED',
        });
        throw new TenantContextRequiredError(
          `Tenant context is required for ${modelName}. Set clinic context via auth middleware or runWithClinicContext.`
        );
      }
    }

    if (!clinicId || this.shouldBypassFilter()) {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((item) => ({
        ...item,
        clinicId: clinicId,
      }));
    }

    return {
      ...data,
      clinicId: clinicId,
    };
  }

  /**
   * Apply clinic filter to groupBy args.
   * NEVER allows groupBy on clinic-isolated models without tenant context — THROWS instead.
   */
  private applyClinicToGroupBy(args: any = {}, modelName?: string): any {
    const clinicId = this.getClinicId();
    const isClinicIsolated =
      modelName && (CLINIC_ISOLATED_MODELS as readonly string[]).includes(modelName.toLowerCase());

    if (isClinicIsolated && (clinicId === undefined || clinicId === null)) {
      if (!this.shouldBypassFilter()) {
        logger.security('Tenant context required for clinic-isolated groupBy', {
          model: modelName,
          code: 'TENANT_CONTEXT_REQUIRED',
        });
        throw new TenantContextRequiredError(
          `Tenant context is required for ${modelName}. Set clinic context via auth middleware or runWithClinicContext.`
        );
      }
    }

    if (!clinicId || this.shouldBypassFilter()) {
      return args;
    }

    return {
      ...args,
      where: {
        ...args.where,
        clinicId: clinicId,
      },
    };
  }

  /**
   * Return clinic-filtered delegate for a model by name. Used by export Proxy for dynamic model access.
   */
  getModelDelegate(modelName: string): any {
    return this.createModelProxy(modelName);
  }

  /**
   * Create model proxy with clinic filtering
   */
  private createModelProxy(modelName: string): any {
    const model = (this.client as any)[modelName];

    // If model is undefined, log error and return original client model
    if (!model) {
      logger.error(`Model ${modelName} not found on Prisma client`);
      return (this.client as any)[modelName];
    }

    // If model doesn't need clinic isolation, return original
    // Compare lowercase to handle case differences
    if (!CLINIC_ISOLATED_MODELS.includes(modelName.toLowerCase())) {
      return model;
    }

    // Create proxy with clinic filtering
    return new Proxy(model, {
      get: (target, prop) => {
        const originalMethod = target[prop];

        // If not a function, return as is
        if (typeof originalMethod !== 'function') {
          return originalMethod;
        }

        // Wrap methods that need clinic filtering
        const methodsToWrap = [
          // Read operations
          'findUnique',
          'findFirst',
          'findMany',
          'findUniqueOrThrow',
          'findFirstOrThrow',
          'count',
          'aggregate',
          'groupBy',
          // Write operations
          'create',
          'createMany',
          'createManyAndReturn',
          'update',
          'updateMany',
          'delete',
          'deleteMany',
          'upsert',
        ];

        if (!methodsToWrap.includes(prop as string)) {
          return originalMethod.bind(target);
        }

        // Return wrapped method
        return async (args: any = {}) => {
          let modifiedArgs = { ...args };
          const method = prop as string;

          // Apply clinic filter based on method type (pass modelName for strict tenant enforcement)
          if (
            [
              'findUnique',
              'findFirst',
              'findMany',
              'findUniqueOrThrow',
              'findFirstOrThrow',
              'count',
              'aggregate',
            ].includes(method)
          ) {
            modifiedArgs.where = this.applyClinicFilter(modifiedArgs.where, modelName);
          } else if (method === 'groupBy') {
            modifiedArgs = this.applyClinicToGroupBy(modifiedArgs, modelName);
          } else if (
            method === 'create' ||
            method === 'createMany' ||
            method === 'createManyAndReturn'
          ) {
            modifiedArgs.data = this.applyClinicToData(modifiedArgs.data, modelName);
          } else if (['update', 'updateMany', 'delete', 'deleteMany'].includes(method)) {
            modifiedArgs.where = this.applyClinicFilter(modifiedArgs.where, modelName);
          } else if (method === 'upsert') {
            // Upsert needs both where filter and create data with clinicId
            modifiedArgs.where = this.applyClinicFilter(modifiedArgs.where, modelName);
            modifiedArgs.create = this.applyClinicToData(modifiedArgs.create, modelName);
            // Update clause should NOT override clinicId
            if (modifiedArgs.update && typeof modifiedArgs.update === 'object') {
              delete modifiedArgs.update.clinicId; // Prevent changing clinic via upsert
            }
          }

          // Execute with modified args
          const result = await originalMethod.call(target, modifiedArgs);

          // Validate results (defense-in-depth)
          const currentClinicId = this.getClinicId();
          if (result && currentClinicId) {
            const clinicId = currentClinicId;

            if (Array.isArray(result)) {
              const invalidRecords = result.filter(
                (record: any) => record.clinicId && record.clinicId !== clinicId
              );

              if (invalidRecords.length > 0) {
                logger.security('CRITICAL: Cross-clinic data leak detected', {
                  model: modelName,
                  method: method,
                  expectedClinic: clinicId,
                  leakedRecords: invalidRecords.length,
                  timestamp: new Date().toISOString(),
                });

                // Filter out invalid records - never leak data
                return result.filter(
                  (record: any) => !record.clinicId || record.clinicId === clinicId
                );
              }
            } else if (typeof result === 'object' && result !== null && 'clinicId' in result) {
              if (result.clinicId && result.clinicId !== clinicId) {
                logger.security('CRITICAL: Cross-clinic data access attempted', {
                  model: modelName,
                  method: method,
                  expectedClinic: clinicId,
                  actualClinic: result.clinicId,
                  timestamp: new Date().toISOString(),
                });

                // Block access - return null instead of wrong clinic's data
                return null;
              }
            }
          }

          return result;
        };
      },
    });
  }

  // ============================================================================
  // CLINIC-ISOLATED MODELS (automatically filtered by clinicId)
  // ============================================================================

  // Core clinical models
  get patient() {
    return this.createModelProxy('patient');
  }
  get provider() {
    return this.createModelProxy('provider');
  }
  get order() {
    return this.createModelProxy('order');
  }
  get prescription() {
    return this.createModelProxy('prescription');
  }
  get sOAPNote() {
    return this.createModelProxy('sOAPNote');
  }
  get appointment() {
    return this.createModelProxy('appointment');
  }
  get carePlan() {
    return this.createModelProxy('carePlan');
  }

  // Billing models
  get invoice() {
    return this.createModelProxy('invoice');
  }
  get payment() {
    return this.createModelProxy('payment');
  }
  get subscription() {
    return this.createModelProxy('subscription');
  }
  get superbill() {
    return this.createModelProxy('superbill');
  }

  // Documents & forms
  get patientDocument() {
    return this.createModelProxy('patientDocument');
  }
  get intakeFormTemplate() {
    return this.createModelProxy('intakeFormTemplate');
  }

  // Communication
  get internalMessage() {
    return this.createModelProxy('internalMessage');
  }
  get patientChatMessage() {
    return this.createModelProxy('patientChatMessage');
  }

  // Support tickets (clinic-specific)
  get ticket() {
    return this.createModelProxy('ticket');
  }
  get ticketComment() {
    return this.createModelProxy('ticketComment');
  }
  get ticketWorkLog() {
    return this.createModelProxy('ticketWorkLog');
  }
  get ticketAssignment() {
    return this.createModelProxy('ticketAssignment');
  }

  // Patient health tracking - NOT clinic isolated (isolated via Patient relationship)
  get patientWaterLog() {
    return this.client.patientWaterLog;
  }
  get patientExerciseLog() {
    return this.client.patientExerciseLog;
  }
  get patientSleepLog() {
    return this.client.patientSleepLog;
  }
  get patientNutritionLog() {
    return this.client.patientNutritionLog;
  }
  get patientWeightLog() {
    return this.client.patientWeightLog;
  }
  get patientMedicationReminder() {
    return this.client.patientMedicationReminder;
  }

  // Shipping updates (clinic-isolated)
  get patientShippingUpdate() {
    return this.createModelProxy('patientShippingUpdate');
  }

  // Patient photos (clinic-isolated)
  get patientPhoto() {
    return this.createModelProxy('patientPhoto');
  }

  // Affiliate/influencer
  get influencer() {
    return this.createModelProxy('influencer');
  }

  // Products
  get product() {
    return this.createModelProxy('product');
  }

  // Refill queue (clinic-isolated)
  get refillQueue() {
    return this.createModelProxy('refillQueue');
  }

  // Sales rep patient assignments (clinic-isolated)
  get patientSalesRepAssignment() {
    return this.createModelProxy('patientSalesRepAssignment');
  }

  // ============================================================================
  // NON-ISOLATED MODELS (global or user-scoped, not clinic-scoped)
  // ============================================================================

  // System-wide models
  get user() {
    return this.client.user;
  }
  get clinic() {
    return this.client.clinic;
  }
  get systemSettings() {
    return this.client.systemSettings;
  }
  get integration() {
    return this.client.integration;
  }
  get apiKey() {
    return this.client.apiKey;
  }

  // Auth tokens (user-scoped, not clinic-scoped)
  get passwordResetToken() {
    return this.client.passwordResetToken;
  }
  get emailVerificationToken() {
    return this.client.emailVerificationToken;
  }
  get clinicInviteCode() {
    return this.client.clinicInviteCode;
  }
  get phoneOtp() {
    return this.client.phoneOtp;
  }

  // Patient portal invite (patient-scoped; access controlled by API via patient)
  get patientPortalInvite() {
    return this.client.patientPortalInvite;
  }

  // Payment reconciliation (system-wide)
  get paymentReconciliation() {
    return this.client.paymentReconciliation;
  }

  // Webhook infrastructure (system-wide)
  get webhookConfig() {
    return this.client.webhookConfig;
  }
  get webhookDelivery() {
    return this.client.webhookDelivery;
  }
  get webhookLog() {
    return this.client.webhookLog;
  }
  get idempotencyRecord() {
    return this.client.idempotencyRecord;
  }

  // Audit logs (need cross-clinic visibility for super admin)
  get clinicAuditLog() {
    return this.client.clinicAuditLog;
  }
  get userSession() {
    return this.client.userSession;
  }
  get userAuditLog() {
    return this.client.userAuditLog;
  }
  get patientAudit() {
    return this.client.patientAudit;
  }
  get providerAudit() {
    return this.client.providerAudit;
  }
  get orderEvent() {
    return this.client.orderEvent;
  }
  get auditLog() {
    return this.client.auditLog;
  }
  get hIPAAAuditEntry() {
    return this.client.hIPAAAuditEntry;
  }

  // Multi-clinic junction tables (provider/user to clinic assignments)
  get userClinic() {
    return this.client.userClinic;
  }
  get providerClinic() {
    return this.client.providerClinic;
  }

  // Counters & sequences (clinic-scoped but handled differently)
  get patientCounter() {
    return this.client.patientCounter;
  }

  // AI (user-scoped, not clinic-scoped)
  get aIConversation() {
    return this.client.aIConversation;
  }
  get aIMessage() {
    return this.client.aIMessage;
  }

  // Prescriptions (Rx model is separate from prescription)
  get rx() {
    return this.client.rx;
  }
  get sOAPNoteRevision() {
    return this.client.sOAPNoteRevision;
  }

  // Payment methods (user-scoped)
  get paymentMethod() {
    return this.client.paymentMethod;
  }

  // Referral/affiliate (program-level, not clinic-level)
  get referralTracking() {
    return this.client.referralTracking;
  }
  get influencerBankAccount() {
    return this.client.influencerBankAccount;
  }
  get commission() {
    return this.client.commission;
  }
  get commissionPayout() {
    return this.client.commissionPayout;
  }
  get affiliateReferral() {
    return this.client.affiliateReferral;
  }
  get affiliateCommission() {
    return this.client.affiliateCommission;
  }
  get affiliateProgram() {
    return this.client.affiliateProgram;
  }
  get affiliateTier() {
    return this.client.affiliateTier;
  }

  // Enterprise affiliate system
  get affiliate() {
    return this.client.affiliate;
  }
  get affiliateApplication() {
    return this.client.affiliateApplication;
  }
  get affiliateRefCode() {
    return this.client.affiliateRefCode;
  }
  get affiliateOtpCode() {
    return this.client.affiliateOtpCode;
  }
  get affiliateCommissionPlan() {
    return this.client.affiliateCommissionPlan;
  }
  get affiliatePlanAssignment() {
    return this.client.affiliatePlanAssignment;
  }
  get affiliateCommissionEvent() {
    return this.client.affiliateCommissionEvent;
  }
  get affiliateTouch() {
    return this.client.affiliateTouch;
  }
  get affiliateAttributionConfig() {
    return this.client.affiliateAttributionConfig;
  }
  get affiliateCommissionTier() {
    return this.client.affiliateCommissionTier;
  }
  get affiliateProductRate() {
    return this.client.affiliateProductRate;
  }
  get affiliatePromotion() {
    return this.client.affiliatePromotion;
  }
  get affiliatePayoutMethod() {
    return this.client.affiliatePayoutMethod;
  }
  get affiliatePayout() {
    return this.client.affiliatePayout;
  }
  get affiliateTaxDocument() {
    return this.client.affiliateTaxDocument;
  }
  get affiliateFraudAlert() {
    return this.client.affiliateFraudAlert;
  }
  get affiliateIpIntel() {
    return this.client.affiliateIpIntel;
  }
  get affiliateFraudConfig() {
    return this.client.affiliateFraudConfig;
  }

  // Intake forms (submission-level, not clinic-level)
  get intakeFormSubmission() {
    return this.client.intakeFormSubmission;
  }
  get intakeFormQuestion() {
    return this.client.intakeFormQuestion;
  }
  get intakeFormResponse() {
    return this.client.intakeFormResponse;
  }
  get intakeFormLink() {
    return this.client.intakeFormLink;
  }

  // Ticket metadata (non-isolated - ticket itself is isolated)
  get ticketStatusHistory() {
    return this.client.ticketStatusHistory;
  }
  get ticketEscalation() {
    return this.client.ticketEscalation;
  }
  get ticketSLA() {
    return this.client.ticketSLA;
  }

  // Developer/API tools (system-wide)
  get apiUsageLog() {
    return this.client.apiUsageLog;
  }
  get integrationLog() {
    return this.client.integrationLog;
  }
  get developerTool() {
    return this.client.developerTool;
  }

  // SMS logs and compliance (system-wide)
  get smsLog() {
    return this.client.smsLog;
  }
  get smsOptOut() {
    return this.client.smsOptOut;
  }
  get smsQuietHours() {
    return this.client.smsQuietHours;
  }
  get smsRateLimit() {
    return this.client.smsRateLimit;
  }

  // Notifications (user-scoped, not clinic-scoped - users see their own notifications)
  get notification() {
    return this.client.notification;
  }

  // Policy management (system-wide, SOC 2 compliance)
  get policy() {
    return this.client.policy;
  }
  get policyApproval() {
    return this.client.policyApproval;
  }
  get policyAcknowledgment() {
    return this.client.policyAcknowledgment;
  }

  // Discounts (system-wide promotions)
  get discountCode() {
    return this.client.discountCode;
  }
  get discountUsage() {
    return this.client.discountUsage;
  }
  get promotion() {
    return this.client.promotion;
  }

  // Product bundles (system-wide catalog)
  get productBundle() {
    return this.client.productBundle;
  }
  get productBundleItem() {
    return this.client.productBundleItem;
  }
  get pricingRule() {
    return this.client.pricingRule;
  }
  get invoiceItem() {
    return this.client.invoiceItem;
  }

  // Scheduling models (provider-scoped)
  get appointmentTypeConfig() {
    return this.client.appointmentTypeConfig;
  }
  get providerAvailability() {
    return this.client.providerAvailability;
  }
  get providerTimeOff() {
    return this.client.providerTimeOff;
  }
  get providerCalendarIntegration() {
    return this.client.providerCalendarIntegration;
  }
  get appointmentReminder() {
    return this.client.appointmentReminder;
  }

  // Care plan models
  get carePlanTemplate() {
    return this.client.carePlanTemplate;
  }
  get carePlanGoal() {
    return this.client.carePlanGoal;
  }
  get carePlanActivity() {
    return this.client.carePlanActivity;
  }
  get carePlanProgress() {
    return this.client.carePlanProgress;
  }

  // Billing codes
  get billingCode() {
    return this.client.billingCode;
  }
  get superbillItem() {
    return this.client.superbillItem;
  }

  // Subscription actions
  get subscriptionAction() {
    return this.client.subscriptionAction;
  }
  get retentionOffer() {
    return this.client.retentionOffer;
  }

  // Financial Analytics
  get financialMetrics() {
    return this.client.financialMetrics;
  }
  get savedReport() {
    return this.client.savedReport;
  }
  get reportExport() {
    return this.client.reportExport;
  }

  // Expose transaction support with proper options forwarding
  async $transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: {
      maxWait?: number;
      timeout?: number;
      isolationLevel?: Prisma.TransactionIsolationLevel;
    }
  ): Promise<T> {
    return this.client.$transaction(async (tx) => {
      // Create wrapped transaction client
      const wrappedTx = new PrismaWithClinicFilter(tx as PrismaClient);
      return fn(wrappedTx as any);
    }, options); // CRITICAL: Forward transaction options (timeout, isolation level)
  }

  // Expose other Prisma client methods
  $connect() {
    return this.client.$connect();
  }
  $disconnect() {
    return this.client.$disconnect();
  }
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]) {
    return this.client.$executeRaw(Prisma.sql(query, ...values));
  }
  $executeRawUnsafe(query: string, ...values: unknown[]) {
    return this.client.$executeRawUnsafe(query, ...values);
  }
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T> {
    return this.client.$queryRaw<T>(Prisma.sql(query, ...values));
  }
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T> {
    return this.client.$queryRawUnsafe(query, ...values) as Promise<T>;
  }
}

/**
 * Transaction function type that properly reflects the wrapped client behavior.
 * The callback receives a PrismaClient (wrapped in PrismaWithClinicFilter),
 * not a raw Prisma.TransactionClient.
 */
type ClinicFilteredTransactionFn = {
  <T>(
    fn: (tx: PrismaClient) => Promise<T>,
    options?: {
      maxWait?: number;
      timeout?: number;
      isolationLevel?: Prisma.TransactionIsolationLevel;
    }
  ): Promise<T>;
  // Also support the array-based transaction syntax
  <P extends Prisma.PrismaPromise<unknown>[]>(
    arg: [...P],
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel;
    }
  ): Promise<{ [K in keyof P]: Awaited<P[K]> }>;
};

/**
 * Prisma client with automatic clinic filtering for multi-tenant isolation.
 *
 * NOTE: The `as unknown as` cast is necessary because PrismaWithClinicFilter implements
 * a Proxy-based interception pattern for model operations that TypeScript cannot
 * statically verify. The wrapper provides all PrismaClient model operations with
 * automatic clinicId filtering for HIPAA-compliant data isolation.
 *
 * All model operations (findMany, create, update, etc.) automatically:
 * 1. Add clinicId to WHERE clauses (reads)
 * 2. Add clinicId to data (creates)
 * 3. Validate results don't leak cross-clinic data (defense-in-depth)
 *
 * The $transaction callback receives a PrismaClient (wrapped), so code should use:
 *   prisma.$transaction(async (tx) => { ... })
 *
 * @see CLINIC_ISOLATED_MODELS for list of models with automatic filtering
 */
const clinicFilterWrapper = new PrismaWithClinicFilter(_rawBasePrisma);
export const prisma = new Proxy(clinicFilterWrapper, {
  get(target: PrismaWithClinicFilter, prop: string) {
    if (prop in target) return (target as any)[prop];
    const client = (target as any).client as PrismaClient;
    const delegate = (client as any)[prop];
    if (delegate && typeof prop === 'string' && (CLINIC_ISOLATED_MODELS as readonly string[]).includes(prop.toLowerCase())) {
      return target.getModelDelegate(prop);
    }
    return delegate;
  },
}) as unknown as PrismaClient & {
  $transaction: ClinicFilteredTransactionFn;
};

// Export the base client for allow-listed use only; in production, throws if used for non-allow-listed clinic-isolated models
export const basePrisma = createGuardedBasePrisma(_rawBasePrisma);

/**
 * Set the current clinic context for queries
 * This should be called by auth middleware after authentication
 *
 * NOTE: For proper request isolation, use runWithClinicContext instead
 * This function is maintained for backwards compatibility
 */
export function setClinicContext(clinicId: number | undefined) {
  // Also set the global for backwards compatibility
  globalForPrisma.currentClinicId = clinicId;
}

/**
 * Get the current clinic context
 */
export function getClinicContext(): number | undefined {
  // First try AsyncLocalStorage (thread-safe)
  const store = clinicContextStorage.getStore();
  // If store exists, use its clinicId value (even if undefined - for withoutClinicFilter)
  if (store !== undefined) {
    return store.clinicId;
  }
  // Fallback to global for backwards compatibility
  return globalForPrisma.currentClinicId;
}

/**
 * Run a function within a clinic context (thread-safe)
 * This is the preferred method for setting clinic context in serverless environments
 *
 * @param clinicId - The clinic ID to use for all queries within the callback
 * @param callback - The function to execute within the clinic context
 * @returns The result of the callback
 */
export function runWithClinicContext<T>(clinicId: number | undefined, callback: () => T): T {
  return clinicContextStorage.run({ clinicId }, callback);
}

/**
 * Execute async queries with a specific clinic context (thread-safe)
 * Useful for admin operations that need to access specific clinic data
 */
export async function withClinicContext<T>(
  clinicId: number,
  callback: () => Promise<T>
): Promise<T> {
  return clinicContextStorage.run({ clinicId }, callback);
}

/**
 * Execute queries without clinic filtering (thread-safe)
 * DANGEROUS: Only use for super admin operations
 */
export async function withoutClinicFilter<T>(callback: () => Promise<T>): Promise<T> {
  return clinicContextStorage.run({ clinicId: undefined }, callback);
}

/**
 * Export the storage for use in middleware
 * Use this to wrap request handlers in a clinic context
 */
export { clinicContextStorage };

// ============================================================================
// PHI ENCRYPTION
// ============================================================================
// PHI extension disabled - SSN field no longer exists in Patient schema
// Re-enable when PHI fields are added back or use existing phi-encryption.ts
// for field-level encryption in repositories

// export const prismaWithPHI: PrismaWithPHI = createPrismaWithPHI(basePrisma);

// ============================================================================
// CONNECTION UTILITIES FOR API ROUTES
// ============================================================================
// Export retry and timeout utilities for use in critical API routes

export { withRetry, withTimeout } from './database/connection-pool';
export { connectionPool };

// Export serverless utilities
export {
  checkDatabaseHealth,
  getPoolStats,
  drainManager,
  getServerlessConfig,
} from './database/serverless-pool';

/**
 * Get connection pool health status
 * Useful for health check endpoints
 */
export function getConnectionPoolHealth() {
  return connectionPool.getHealthStatus();
}

/**
 * Get connection pool metrics
 * Useful for monitoring endpoints
 */
export function getConnectionPoolMetrics() {
  return connectionPool.getMetrics();
}
