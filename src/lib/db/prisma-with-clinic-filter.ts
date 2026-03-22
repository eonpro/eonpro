/**
 * PrismaWithClinicFilter — Multi-Tenant Data Access Proxy
 * ========================================================
 *
 * Wraps PrismaClient to automatically inject clinicId into all queries
 * for clinic-isolated models. This is the core tenant isolation mechanism.
 *
 * Extracted from db.ts to reduce blast radius and improve testability.
 *
 * @module lib/db/prisma-with-clinic-filter
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from '../logger';
import { TenantContextRequiredError } from '../tenant-context-errors';
import { CLINIC_ISOLATED_MODELS } from './clinic-isolation-config';
import { clinicContextStorage, getClinicContext } from './clinic-context';

export class PrismaWithClinicFilter {
  private client: PrismaClient;

  constructor(client: PrismaClient) {
    this.client = client;
  }

  private getClinicId(): number | undefined {
    const store = clinicContextStorage.getStore();
    if (store !== undefined) {
      return store.clinicId;
    }
    return (global as any).__eonpro_currentClinicId;
  }

  private shouldBypassFilter(): boolean {
    const store = clinicContextStorage.getStore();
    if (store?.bypassFilter === true) {
      return true;
    }

    if (process.env.BYPASS_CLINIC_FILTER === 'true') {
      if (process.env.NODE_ENV === 'production') {
        logger.security('CRITICAL: BYPASS_CLINIC_FILTER attempted in production - BLOCKED', {
          timestamp: new Date().toISOString(),
        });
        return false;
      }
      logger.warn('BYPASS_CLINIC_FILTER is enabled - clinic isolation disabled');
      return true;
    }
    return false;
  }

  /**
   * Apply clinic filter to where clause.
   * NEVER returns unmodified where for clinic-isolated models when tenant context is missing.
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

    if (where.clinicId !== undefined && where.clinicId !== null && typeof where.clinicId === 'object') {
      if (where.clinicId.in && Array.isArray(where.clinicId.in)) {
        if (!where.clinicId.in.includes(clinicId)) {
          logger.security('Multi-clinic query does not include current context clinic', {
            model: modelName,
            contextClinicId: clinicId,
            queryClinicIds: where.clinicId.in,
            code: 'CLINIC_FILTER_MISMATCH',
          });
        }
      }
      return where;
    }

    return {
      ...where,
      clinicId: clinicId,
    };
  }

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

  getModelDelegate(modelName: string): any {
    return this.createModelProxy(modelName);
  }

  private createModelProxy(modelName: string): any {
    const model = (this.client as any)[modelName];

    if (!model) {
      logger.error(`Model ${modelName} not found on Prisma client`);
      return (this.client as any)[modelName];
    }

    if (!CLINIC_ISOLATED_MODELS.includes(modelName.toLowerCase())) {
      return model;
    }

    return new Proxy(model, {
      get: (target, prop) => {
        const originalMethod = target[prop];

        if (typeof originalMethod !== 'function') {
          return originalMethod;
        }

        const methodsToWrap = [
          'findUnique',
          'findFirst',
          'findMany',
          'findUniqueOrThrow',
          'findFirstOrThrow',
          'count',
          'aggregate',
          'groupBy',
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

        return async (args: any = {}) => {
          let modifiedArgs = { ...args };
          const method = prop as string;

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
            modifiedArgs.where = this.applyClinicFilter(modifiedArgs.where, modelName);
            modifiedArgs.create = this.applyClinicToData(modifiedArgs.create, modelName);
            if (modifiedArgs.update && typeof modifiedArgs.update === 'object') {
              delete modifiedArgs.update.clinicId;
            }
          }

          const result = await originalMethod.call(target, modifiedArgs);

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
  // CLINIC-ISOLATED MODELS
  // ============================================================================

  get patient() { return this.createModelProxy('patient'); }
  get provider() { return this.createModelProxy('provider'); }
  get order() { return this.createModelProxy('order'); }
  get prescription() { return this.createModelProxy('prescription'); }
  get sOAPNote() { return this.createModelProxy('sOAPNote'); }
  get appointment() { return this.createModelProxy('appointment'); }
  get carePlan() { return this.createModelProxy('carePlan'); }
  get invoice() { return this.createModelProxy('invoice'); }
  get payment() { return this.createModelProxy('payment'); }
  get subscription() { return this.createModelProxy('subscription'); }
  get superbill() { return this.createModelProxy('superbill'); }
  get patientDocument() { return this.createModelProxy('patientDocument'); }
  get intakeFormTemplate() { return this.createModelProxy('intakeFormTemplate'); }
  get internalMessage() { return this.createModelProxy('internalMessage'); }
  get patientChatMessage() { return this.createModelProxy('patientChatMessage'); }
  get ticket() { return this.createModelProxy('ticket'); }
  get ticketComment() { return this.createModelProxy('ticketComment'); }
  get ticketWorkLog() { return this.createModelProxy('ticketWorkLog'); }
  get ticketAssignment() { return this.createModelProxy('ticketAssignment'); }
  get patientShippingUpdate() { return this.createModelProxy('patientShippingUpdate'); }
  get patientPhoto() { return this.createModelProxy('patientPhoto'); }
  get influencer() { return this.createModelProxy('influencer'); }
  get product() { return this.createModelProxy('product'); }
  get refillQueue() { return this.createModelProxy('refillQueue'); }
  get patientSalesRepAssignment() { return this.createModelProxy('patientSalesRepAssignment'); }
  get salesRepRefCode() { return this.createModelProxy('salesRepRefCode'); }
  get salesRepTouch() { return this.createModelProxy('salesRepTouch'); }
  get salesRepCommissionPlan() { return this.createModelProxy('salesRepCommissionPlan'); }
  get salesRepPlanAssignment() { return this.createModelProxy('salesRepPlanAssignment'); }
  get salesRepCommissionEvent() { return this.createModelProxy('salesRepCommissionEvent'); }
  get rxOrderSet() { return this.createModelProxy('rxOrderSet'); }

  // Patient health tracking — isolated via Patient relationship, not clinicId
  get patientWaterLog() { return this.client.patientWaterLog; }
  get patientExerciseLog() { return this.client.patientExerciseLog; }
  get patientSleepLog() { return this.client.patientSleepLog; }
  get patientNutritionLog() { return this.client.patientNutritionLog; }
  get patientWeightLog() { return this.client.patientWeightLog; }
  get patientMedicationReminder() { return this.client.patientMedicationReminder; }

  // ============================================================================
  // NON-ISOLATED MODELS
  // ============================================================================

  get user() { return this.client.user; }
  get clinic() { return this.client.clinic; }
  get systemSettings() { return this.client.systemSettings; }
  get integration() { return this.client.integration; }
  get apiKey() { return this.client.apiKey; }
  get passwordResetToken() { return this.client.passwordResetToken; }
  get emailVerificationToken() { return this.client.emailVerificationToken; }
  get emailVerificationCode() { return this.client.emailVerificationCode; }
  get clinicInviteCode() { return this.client.clinicInviteCode; }
  get phoneOtp() { return this.client.phoneOtp; }
  get patientPortalInvite() { return this.client.patientPortalInvite; }
  get paymentReconciliation() { return this.client.paymentReconciliation; }
  get webhookConfig() { return this.client.webhookConfig; }
  get webhookDelivery() { return this.client.webhookDelivery; }
  get webhookLog() { return this.client.webhookLog; }
  get idempotencyRecord() { return this.client.idempotencyRecord; }
  get clinicAuditLog() { return this.client.clinicAuditLog; }
  get userSession() { return this.client.userSession; }
  get userAuditLog() { return this.client.userAuditLog; }
  get patientAudit() { return this.client.patientAudit; }
  get providerAudit() { return this.client.providerAudit; }
  get orderEvent() { return this.client.orderEvent; }
  get auditLog() { return this.client.auditLog; }
  get hIPAAAuditEntry() { return this.client.hIPAAAuditEntry; }
  get userClinic() { return this.client.userClinic; }
  get providerClinic() { return this.client.providerClinic; }
  get patientCounter() { return this.client.patientCounter; }
  get aIConversation() { return this.client.aIConversation; }
  get aIMessage() { return this.client.aIMessage; }
  get rx() { return this.client.rx; }
  get rxOrderSetItem() { return this.client.rxOrderSetItem; }
  get sOAPNoteRevision() { return this.client.sOAPNoteRevision; }
  get paymentMethod() { return this.client.paymentMethod; }
  get referralTracking() { return this.client.referralTracking; }
  get influencerBankAccount() { return this.client.influencerBankAccount; }
  get commission() { return this.client.commission; }
  get commissionPayout() { return this.client.commissionPayout; }
  get affiliateReferral() { return this.client.affiliateReferral; }
  get affiliateCommission() { return this.client.affiliateCommission; }
  get affiliateProgram() { return this.client.affiliateProgram; }
  get affiliateTier() { return this.client.affiliateTier; }
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
  get intakeFormSubmission() { return this.client.intakeFormSubmission; }
  get intakeFormQuestion() { return this.client.intakeFormQuestion; }
  get intakeFormResponse() { return this.client.intakeFormResponse; }
  get intakeFormLink() { return this.client.intakeFormLink; }
  get ticketStatusHistory() { return this.client.ticketStatusHistory; }
  get ticketEscalation() { return this.client.ticketEscalation; }
  get ticketSLA() { return this.client.ticketSLA; }
  get apiUsageLog() { return this.client.apiUsageLog; }
  get integrationLog() { return this.client.integrationLog; }
  get developerTool() { return this.client.developerTool; }
  get smsLog() { return this.client.smsLog; }
  get smsOptOut() { return this.client.smsOptOut; }
  get smsQuietHours() { return this.client.smsQuietHours; }
  get smsRateLimit() { return this.client.smsRateLimit; }
  get notification() { return this.client.notification; }
  get policy() { return this.client.policy; }
  get policyApproval() { return this.client.policyApproval; }
  get policyAcknowledgment() { return this.client.policyAcknowledgment; }
  get discountCode() { return this.client.discountCode; }
  get discountUsage() { return this.client.discountUsage; }
  get promotion() { return this.client.promotion; }
  get productBundle() { return this.client.productBundle; }
  get productBundleItem() { return this.client.productBundleItem; }
  get pricingRule() { return this.client.pricingRule; }
  get invoiceItem() { return this.client.invoiceItem; }
  get appointmentTypeConfig() { return this.client.appointmentTypeConfig; }
  get providerAvailability() { return this.client.providerAvailability; }
  get providerTimeOff() { return this.client.providerTimeOff; }
  get providerCalendarIntegration() { return this.client.providerCalendarIntegration; }
  get appointmentReminder() { return this.client.appointmentReminder; }
  get carePlanTemplate() { return this.client.carePlanTemplate; }
  get carePlanGoal() { return this.client.carePlanGoal; }
  get carePlanActivity() { return this.client.carePlanActivity; }
  get carePlanProgress() { return this.client.carePlanProgress; }
  get billingCode() { return this.client.billingCode; }
  get superbillItem() { return this.client.superbillItem; }
  get subscriptionAction() { return this.client.subscriptionAction; }
  get retentionOffer() { return this.client.retentionOffer; }
  get financialMetrics() { return (this.client as any).financialMetrics; }
  get savedReport() { return (this.client as any).savedReport; }
  get reportExport() { return (this.client as any).reportExport; }

  // ============================================================================
  // PRISMA CLIENT METHODS
  // ============================================================================

  async $transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: {
      maxWait?: number;
      timeout?: number;
      isolationLevel?: Prisma.TransactionIsolationLevel;
    }
  ): Promise<T> {
    return this.client.$transaction(async (tx) => {
      const wrappedTx = new PrismaWithClinicFilter(tx as PrismaClient);
      const proxiedTx = new Proxy(wrappedTx, {
        get(target: PrismaWithClinicFilter, prop: string) {
          if (prop in target) return (target as any)[prop];
          const client = (target as any).client;
          const delegate = client[prop];
          if (
            delegate &&
            typeof prop === 'string' &&
            (CLINIC_ISOLATED_MODELS as readonly string[]).includes(prop.toLowerCase())
          ) {
            return target.getModelDelegate(prop);
          }
          return delegate;
        },
      });
      return fn(proxiedTx as any);
    }, options);
  }

  $connect() { return this.client.$connect(); }
  $disconnect() { return this.client.$disconnect(); }
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
 */
export type ClinicFilteredTransactionFn = {
  <T>(
    fn: (tx: PrismaClient) => Promise<T>,
    options?: {
      maxWait?: number;
      timeout?: number;
      isolationLevel?: Prisma.TransactionIsolationLevel;
    }
  ): Promise<T>;
  <P extends Prisma.PrismaPromise<unknown>[]>(
    arg: [...P],
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel;
    }
  ): Promise<{ [K in keyof P]: Awaited<P[K]> }>;
};

/**
 * Create a guarded basePrisma that throws in production if used for
 * clinic-isolated models not in the allowlist.
 */
export function createGuardedBasePrisma(
  client: PrismaClient,
  allowlist: readonly string[],
): PrismaClient {
  if (process.env.NODE_ENV !== 'production') return client;
  return new Proxy(client, {
    get(target, prop: string) {
      const delegate = (target as any)[prop];
      if (
        delegate &&
        typeof prop === 'string' &&
        (CLINIC_ISOLATED_MODELS as readonly string[]).includes(prop.toLowerCase()) &&
        !allowlist.includes(prop.toLowerCase())
      ) {
        throw new Error(
          `basePrisma.${prop} is not allowed in production. Use prisma with runWithClinicContext or add to BASE_PRISMA_ALLOWLIST.`
        );
      }
      return delegate;
    },
  }) as PrismaClient;
}
