import { PrismaClient, Prisma } from "@prisma/client";
import { AsyncLocalStorage } from 'node:async_hooks';
import { logger } from './logger';
// PHI extension disabled - SSN field no longer exists in schema
// import { createPrismaWithPHI, PrismaWithPHI } from './database/phi-extension';

// Use AsyncLocalStorage for request-scoped clinic context
// This prevents race conditions in serverless environments
const clinicContextStorage = new AsyncLocalStorage<{ clinicId?: number }>();

const globalForPrisma = global as unknown as {
  prisma?: PrismaClient;
  currentClinicId?: number; // DEPRECATED: Use clinicContextStorage instead
};

// ============================================================================
// DATABASE CONNECTION POOLING CONFIGURATION
// ============================================================================
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

/**
 * Get connection limit based on environment
 */
function getConnectionLimit(): number {
  // In serverless (Vercel), use minimal connections
  if (process.env.VERCEL) {
    return 1;
  }

  // Use env var or default
  const limit = parseInt(process.env.DATABASE_CONNECTION_LIMIT || '10', 10);
  return Math.min(limit, 20); // Cap at 20 connections per instance
}

/**
 * Get pool timeout
 */
function getPoolTimeout(): number {
  return parseInt(process.env.DATABASE_POOL_TIMEOUT || '10', 10);
}

// Models that require clinic isolation (lowercase for comparison)
// IMPORTANT: Any model with clinicId should be in this list
const CLINIC_ISOLATED_MODELS = [
  // Core clinical models
  'patient',
  'provider',
  'order',
  'prescription',
  'soapnote',
  'appointment',
  'careplan',           // Treatment plans

  // Billing models
  'invoice',
  'payment',
  'subscription',
  'superbill',          // Medical billing

  // Documents & forms
  'patientdocument',
  'intakeformtemplate',

  // Communication
  'internalmessage',
  'patientchatmessage',

  // Support tickets (clinic-specific)
  'ticket',
  'ticketcomment',
  'ticketworklog',
  'ticketassignment',

  // NOTE: Patient health tracking models (patientweightlog, patientmedicationreminder, etc.)
  // are NOT in this list because they don't have a clinicId field directly.
  // They are already isolated via their Patient relationship (patient->clinicId).

  // Affiliate/influencer (clinic-specific programs)
  'influencer',

  // Products (clinic-specific catalog)
  'product',
];

/**
 * Create Prisma client with multi-clinic isolation and connection pooling
 * Using query extension pattern for Prisma v4+
 */
function createPrismaClient() {
  const isProd = process.env.NODE_ENV === 'production';
  const connectionLimit = getConnectionLimit();
  const poolTimeout = getPoolTimeout();

  // Log configuration
  logger.info('Prisma client configuration', {
    environment: process.env.NODE_ENV,
    connectionLimit,
    poolTimeout,
    isVercel: !!process.env.VERCEL,
    hasPgBouncer: process.env.DATABASE_URL?.includes('pgbouncer=true'),
  });

  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development"
      ? ["warn", "error"]
      : isProd
        ? ["error"]  // Only errors in production
        : ["warn", "error"],
    // Prisma handles connection pooling internally
    // For serverless, set connection_limit in DATABASE_URL
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

  // Add query timing middleware for monitoring
  if (isProd || process.env.ENABLE_QUERY_LOGGING === 'true') {
    // @ts-ignore - Prisma v5 middleware
    client.$use?.(async (params, next) => {
      const start = Date.now();
      const result = await next(params);
      const duration = Date.now() - start;

      // Log slow queries (> 1 second)
      if (duration > 1000) {
        logger.warn('Slow database query detected', {
          model: params.model,
          action: params.action,
          duration,
          args: isProd ? '[redacted]' : params.args,
        });
      }

      return result;
    });
  }

  return client;
}

// Create the base client
const basePrisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = basePrisma;
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
   * Apply clinic filter to where clause
   */
  private applyClinicFilter(where: any = {}): any {
    const clinicId = this.getClinicId();

    if (!clinicId || this.shouldBypassFilter()) {
      return where;
    }

    return {
      ...where,
      clinicId: clinicId
    };
  }

  /**
   * Apply clinic ID to data for creates
   */
  private applyClinicToData(data: any): any {
    const clinicId = this.getClinicId();

    if (!clinicId || this.shouldBypassFilter()) {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map(item => ({
        ...item,
        clinicId: clinicId
      }));
    }

    return {
      ...data,
      clinicId: clinicId
    };
  }

  /**
   * Apply clinic filter to groupBy args
   */
  private applyClinicToGroupBy(args: any = {}): any {
    const clinicId = this.getClinicId();

    if (!clinicId || this.shouldBypassFilter()) {
      return args;
    }

    return {
      ...args,
      where: {
        ...args.where,
        clinicId: clinicId
      }
    };
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
          'findUnique', 'findFirst', 'findMany',
          'findUniqueOrThrow', 'findFirstOrThrow',
          'count', 'aggregate', 'groupBy',
          // Write operations
          'create', 'createMany', 'createManyAndReturn',
          'update', 'updateMany',
          'delete', 'deleteMany',
          'upsert',
        ];

        if (!methodsToWrap.includes(prop as string)) {
          return originalMethod.bind(target);
        }

        // Return wrapped method
        return async (args: any = {}) => {
          let modifiedArgs = { ...args };
          const method = prop as string;

          // Apply clinic filter based on method type
          if ([
            'findUnique', 'findFirst', 'findMany',
            'findUniqueOrThrow', 'findFirstOrThrow',
            'count', 'aggregate'
          ].includes(method)) {
            modifiedArgs.where = this.applyClinicFilter(modifiedArgs.where);
          } else if (method === 'groupBy') {
            modifiedArgs = this.applyClinicToGroupBy(modifiedArgs);
          } else if (method === 'create' || method === 'createMany' || method === 'createManyAndReturn') {
            modifiedArgs.data = this.applyClinicToData(modifiedArgs.data);
          } else if (['update', 'updateMany', 'delete', 'deleteMany'].includes(method)) {
            modifiedArgs.where = this.applyClinicFilter(modifiedArgs.where);
          } else if (method === 'upsert') {
            // Upsert needs both where filter and create data with clinicId
            modifiedArgs.where = this.applyClinicFilter(modifiedArgs.where);
            modifiedArgs.create = this.applyClinicToData(modifiedArgs.create);
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
              const invalidRecords = result.filter((record: any) =>
                record.clinicId && record.clinicId !== clinicId
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
                return result.filter((record: any) =>
                  !record.clinicId || record.clinicId === clinicId
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
      }
    });
  }

  // ============================================================================
  // CLINIC-ISOLATED MODELS (automatically filtered by clinicId)
  // ============================================================================

  // Core clinical models
  get patient() { return this.createModelProxy('patient'); }
  get provider() { return this.createModelProxy('provider'); }
  get order() { return this.createModelProxy('order'); }
  get prescription() { return this.createModelProxy('prescription'); }
  get sOAPNote() { return this.createModelProxy('sOAPNote'); }
  get appointment() { return this.createModelProxy('appointment'); }
  get carePlan() { return this.createModelProxy('carePlan'); }

  // Billing models
  get invoice() { return this.createModelProxy('invoice'); }
  get payment() { return this.createModelProxy('payment'); }
  get subscription() { return this.createModelProxy('subscription'); }
  get superbill() { return this.createModelProxy('superbill'); }

  // Documents & forms
  get patientDocument() { return this.createModelProxy('patientDocument'); }
  get intakeFormTemplate() { return this.createModelProxy('intakeFormTemplate'); }

  // Communication
  get internalMessage() { return this.createModelProxy('internalMessage'); }
  get patientChatMessage() { return this.createModelProxy('patientChatMessage'); }

  // Support tickets (clinic-specific)
  get ticket() { return this.createModelProxy('ticket'); }
  get ticketComment() { return this.createModelProxy('ticketComment'); }
  get ticketWorkLog() { return this.createModelProxy('ticketWorkLog'); }
  get ticketAssignment() { return this.createModelProxy('ticketAssignment'); }

  // Patient health tracking - NOT clinic isolated (isolated via Patient relationship)
  get patientWaterLog() { return this.client.patientWaterLog; }
  get patientExerciseLog() { return this.client.patientExerciseLog; }
  get patientSleepLog() { return this.client.patientSleepLog; }
  get patientNutritionLog() { return this.client.patientNutritionLog; }
  get patientWeightLog() { return this.client.patientWeightLog; }
  get patientMedicationReminder() { return this.client.patientMedicationReminder; }

  // Affiliate/influencer
  get influencer() { return this.createModelProxy('influencer'); }

  // Products
  get product() { return this.createModelProxy('product'); }

  // ============================================================================
  // NON-ISOLATED MODELS (global or user-scoped, not clinic-scoped)
  // ============================================================================

  // System-wide models
  get user() { return this.client.user; }
  get clinic() { return this.client.clinic; }
  get systemSettings() { return this.client.systemSettings; }
  get integration() { return this.client.integration; }
  get apiKey() { return this.client.apiKey; }

  // Auth tokens (user-scoped, not clinic-scoped)
  get passwordResetToken() { return this.client.passwordResetToken; }
  get emailVerificationToken() { return this.client.emailVerificationToken; }
  get clinicInviteCode() { return this.client.clinicInviteCode; }
  get phoneOtp() { return this.client.phoneOtp; }

  // Payment reconciliation (system-wide)
  get paymentReconciliation() { return this.client.paymentReconciliation; }

  // Webhook infrastructure (system-wide)
  get webhookConfig() { return this.client.webhookConfig; }
  get webhookDelivery() { return this.client.webhookDelivery; }
  get webhookLog() { return this.client.webhookLog; }

  // Audit logs (need cross-clinic visibility for super admin)
  get clinicAuditLog() { return this.client.clinicAuditLog; }
  get userSession() { return this.client.userSession; }
  get userAuditLog() { return this.client.userAuditLog; }
  get patientAudit() { return this.client.patientAudit; }
  get providerAudit() { return this.client.providerAudit; }
  get orderEvent() { return this.client.orderEvent; }
  get auditLog() { return this.client.auditLog; }
  get hIPAAAuditEntry() { return this.client.hIPAAAuditEntry; }

  // Multi-clinic junction tables (provider/user to clinic assignments)
  get userClinic() { return this.client.userClinic; }
  get providerClinic() { return this.client.providerClinic; }

  // Counters & sequences (clinic-scoped but handled differently)
  get patientCounter() { return this.client.patientCounter; }

  // AI (user-scoped, not clinic-scoped)
  get aIConversation() { return this.client.aIConversation; }
  get aIMessage() { return this.client.aIMessage; }

  // Prescriptions (Rx model is separate from prescription)
  get rx() { return this.client.rx; }
  get sOAPNoteRevision() { return this.client.sOAPNoteRevision; }

  // Payment methods (user-scoped)
  get paymentMethod() { return this.client.paymentMethod; }

  // Referral/affiliate (program-level, not clinic-level)
  get referralTracking() { return this.client.referralTracking; }
  get influencerBankAccount() { return this.client.influencerBankAccount; }
  get commission() { return this.client.commission; }
  get commissionPayout() { return this.client.commissionPayout; }
  get affiliateReferral() { return this.client.affiliateReferral; }
  get affiliateCommission() { return this.client.affiliateCommission; }
  get affiliateProgram() { return this.client.affiliateProgram; }
  get affiliateTier() { return this.client.affiliateTier; }

  // Enterprise affiliate system
  get affiliate() { return this.client.affiliate; }
  get affiliateApplication() { return this.client.affiliateApplication; }
  get affiliateRefCode() { return this.client.affiliateRefCode; }
  get affiliateOtpCode() { return this.client.affiliateOtpCode; }
  get affiliateCommissionPlan() { return this.client.affiliateCommissionPlan; }
  get affiliatePlanAssignment() { return this.client.affiliatePlanAssignment; }
  get affiliateCommissionEvent() { return this.client.affiliateCommissionEvent; }
  get affiliateTouch() { return this.client.affiliateTouch; }
  get affiliateAttributionConfig() { return this.client.affiliateAttributionConfig; }
  get affiliateCommissionTier() { return this.client.affiliateCommissionTier; }
  get affiliateProductRate() { return this.client.affiliateProductRate; }
  get affiliatePromotion() { return this.client.affiliatePromotion; }
  get affiliatePayoutMethod() { return this.client.affiliatePayoutMethod; }
  get affiliatePayout() { return this.client.affiliatePayout; }
  get affiliateTaxDocument() { return this.client.affiliateTaxDocument; }
  get affiliateFraudAlert() { return this.client.affiliateFraudAlert; }
  get affiliateIpIntel() { return this.client.affiliateIpIntel; }
  get affiliateFraudConfig() { return this.client.affiliateFraudConfig; }

  // Intake forms (submission-level, not clinic-level)
  get intakeFormSubmission() { return this.client.intakeFormSubmission; }
  get intakeFormQuestion() { return this.client.intakeFormQuestion; }
  get intakeFormResponse() { return this.client.intakeFormResponse; }
  get intakeFormLink() { return this.client.intakeFormLink; }

  // Ticket metadata (non-isolated - ticket itself is isolated)
  get ticketStatusHistory() { return this.client.ticketStatusHistory; }
  get ticketEscalation() { return this.client.ticketEscalation; }
  get ticketSLA() { return this.client.ticketSLA; }

  // Developer/API tools (system-wide)
  get apiUsageLog() { return this.client.apiUsageLog; }
  get integrationLog() { return this.client.integrationLog; }
  get developerTool() { return this.client.developerTool; }

  // SMS logs (system-wide)
  get smsLog() { return this.client.smsLog; }

  // Discounts (system-wide promotions)
  get discountCode() { return this.client.discountCode; }
  get discountUsage() { return this.client.discountUsage; }
  get promotion() { return this.client.promotion; }

  // Product bundles (system-wide catalog)
  get productBundle() { return this.client.productBundle; }
  get productBundleItem() { return this.client.productBundleItem; }
  get pricingRule() { return this.client.pricingRule; }
  get invoiceItem() { return this.client.invoiceItem; }

  // Scheduling models (provider-scoped)
  get appointmentTypeConfig() { return this.client.appointmentTypeConfig; }
  get providerAvailability() { return this.client.providerAvailability; }
  get providerTimeOff() { return this.client.providerTimeOff; }
  get providerCalendarIntegration() { return this.client.providerCalendarIntegration; }
  get appointmentReminder() { return this.client.appointmentReminder; }

  // Care plan models
  get carePlanTemplate() { return this.client.carePlanTemplate; }
  get carePlanGoal() { return this.client.carePlanGoal; }
  get carePlanActivity() { return this.client.carePlanActivity; }
  get carePlanProgress() { return this.client.carePlanProgress; }

  // Billing codes
  get billingCode() { return this.client.billingCode; }
  get superbillItem() { return this.client.superbillItem; }

  // Subscription actions
  get subscriptionAction() { return this.client.subscriptionAction; }
  get retentionOffer() { return this.client.retentionOffer; }

  // Expose transaction support
  async $transaction(fn: (tx: any) => Promise<any>) {
    return this.client.$transaction(async (tx) => {
      // Create wrapped transaction client
      const wrappedTx = new PrismaWithClinicFilter(tx as PrismaClient);
      return fn(wrappedTx);
    });
  }

  // Expose other Prisma client methods
  $connect() { return this.client.$connect(); }
  $disconnect() { return this.client.$disconnect(); }
  $executeRaw(query: TemplateStringsArray, ...values: any[]) {
    return this.client.$executeRaw(query, ...values);
  }
  $executeRawUnsafe(query: string, ...values: any[]) {
    return this.client.$executeRawUnsafe(query, ...values);
  }
  $queryRaw(query: TemplateStringsArray, ...values: any[]) {
    return this.client.$queryRaw(query, ...values);
  }
  $queryRawUnsafe(query: string, ...values: any[]) {
    return this.client.$queryRawUnsafe(query, ...values);
  }
}

// Export the wrapped client (uses clinic filtering)
export const prisma = new PrismaWithClinicFilter(basePrisma) as any;

// Export the base client for public endpoints (no clinic filtering)
export { basePrisma };

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
export function runWithClinicContext<T>(
  clinicId: number | undefined,
  callback: () => T
): T {
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
export async function withoutClinicFilter<T>(
  callback: () => Promise<T>
): Promise<T> {
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