import { PrismaClient, Prisma } from "@prisma/client";
import { logger } from './logger';

const globalForPrisma = global as unknown as { 
  prisma?: PrismaClient;
  currentClinicId?: number;
};

// Models that require clinic isolation (lowercase for comparison)
const CLINIC_ISOLATED_MODELS = [
  'patient',
  'provider', 
  'order',
  'invoice',
  'payment',
  'subscription',
  'influencer',
  'ticket',
  'patientdocument',
  'soapnote',
  'prescription',
  'appointment',
  'intakeformtemplate',
  'internalmessage'
];

/**
 * Create Prisma client with multi-clinic isolation
 * Using query extension pattern for Prisma v4+
 */
function createPrismaClient() {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : [],
  });
  
  // For Prisma v4+, we'll handle clinic filtering in a different way
  // since $use middleware is deprecated
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
   * Apply clinic filter to where clause
   */
  private applyClinicFilter(where: any = {}): any {
    const clinicId = globalForPrisma.currentClinicId;
    
    if (!clinicId || process.env.BYPASS_CLINIC_FILTER === 'true') {
      return where;
    }
    
    return {
      ...where,
      clinicId: clinicId
    };
  }
  
  /**
   * Apply clinic ID to data
   */
  private applyClinicToData(data: any): any {
    const clinicId = globalForPrisma.currentClinicId;
    
    if (!clinicId || process.env.BYPASS_CLINIC_FILTER === 'true') {
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
          'findUnique', 'findFirst', 'findMany', 
          'create', 'createMany', 'update', 'updateMany',
          'delete', 'deleteMany', 'count', 'aggregate'
        ];
        
        if (!methodsToWrap.includes(prop as string)) {
          return originalMethod.bind(target);
        }
        
        // Return wrapped method
        return async (args: any = {}) => {
          let modifiedArgs = { ...args };
          
          // Apply clinic filter based on method
          if (['findUnique', 'findFirst', 'findMany', 'count', 'aggregate'].includes(prop as string)) {
            modifiedArgs.where = this.applyClinicFilter(modifiedArgs.where);
          } else if (prop === 'create') {
            modifiedArgs.data = this.applyClinicToData(modifiedArgs.data);
          } else if (prop === 'createMany') {
            modifiedArgs.data = this.applyClinicToData(modifiedArgs.data);
          } else if (['update', 'updateMany', 'delete', 'deleteMany'].includes(prop as string)) {
            modifiedArgs.where = this.applyClinicFilter(modifiedArgs.where);
          }
          
          // Execute with modified args
          const result = await originalMethod.call(target, modifiedArgs);
          
          // Validate results
          if (result && globalForPrisma.currentClinicId) {
            const clinicId = globalForPrisma.currentClinicId;
            
            if (Array.isArray(result)) {
              const invalidRecords = result.filter((record: any) => 
                record.clinicId && record.clinicId !== clinicId
              );
              
              if (invalidRecords.length > 0) {
                logger.security('CRITICAL: Cross-clinic data leak detected', {
                  model: modelName,
                  method: prop,
                  expectedClinic: clinicId,
                  leakedRecords: invalidRecords.length
                });
                
                // Filter out invalid records
                return result.filter((record: any) => 
                  !record.clinicId || record.clinicId === clinicId
                );
              }
            } else if (typeof result === 'object' && result !== null && 'clinicId' in result) {
              if (result.clinicId && result.clinicId !== clinicId) {
                logger.security('CRITICAL: Cross-clinic data access attempted', {
                  model: modelName,
                  method: prop,
                  expectedClinic: clinicId,
                  actualClinic: result.clinicId
                });
                
                return null;
              }
            }
          }
          
          return result;
        };
      }
    });
  }
  
  // Expose Prisma models with clinic filtering
  get patient() { return this.createModelProxy('patient'); }
  get provider() { return this.createModelProxy('provider'); }
  get order() { return this.createModelProxy('order'); }
  get invoice() { return this.createModelProxy('invoice'); }
  get payment() { return this.createModelProxy('payment'); }
  get subscription() { return this.createModelProxy('subscription'); }
  get influencer() { return this.createModelProxy('influencer'); }
  get ticket() { return this.createModelProxy('ticket'); }
  get patientDocument() { return this.createModelProxy('patientDocument'); }
  get sOAPNote() { return this.createModelProxy('sOAPNote'); }
  get prescription() { return this.createModelProxy('prescription'); }
  get appointment() { return this.createModelProxy('appointment'); }
  get intakeFormTemplate() { return this.createModelProxy('intakeFormTemplate'); }
  get internalMessage() { return this.createModelProxy('internalMessage'); }
  
  // Models that don't need clinic filtering - pass through directly
  get user() { return this.client.user; }
  get clinic() { return this.client.clinic; }
  get systemSettings() { return this.client.systemSettings; }
  get integration() { return this.client.integration; }
  get apiKey() { return this.client.apiKey; }
  get webhookConfig() { return this.client.webhookConfig; }
  get webhookDelivery() { return this.client.webhookDelivery; }
  get webhookLog() { return this.client.webhookLog; }
  get clinicAuditLog() { return this.client.clinicAuditLog; }
  get userSession() { return this.client.userSession; }
  get userAuditLog() { return this.client.userAuditLog; }
  get patientAudit() { return this.client.patientAudit; }
  get providerAudit() { return this.client.providerAudit; }
  get orderEvent() { return this.client.orderEvent; }
  get patientCounter() { return this.client.patientCounter; }
  get aIConversation() { return this.client.aIConversation; }
  get aIMessage() { return this.client.aIMessage; }
  get rx() { return this.client.rx; }
  get sOAPNoteRevision() { return this.client.sOAPNoteRevision; }
  get paymentMethod() { return this.client.paymentMethod; }
  get referralTracking() { return this.client.referralTracking; }
  get influencerBankAccount() { return this.client.influencerBankAccount; }
  get commission() { return this.client.commission; }
  get commissionPayout() { return this.client.commissionPayout; }
  get intakeFormSubmission() { return this.client.intakeFormSubmission; }
  get intakeFormQuestion() { return this.client.intakeFormQuestion; }
  get intakeFormResponse() { return this.client.intakeFormResponse; }
  get intakeFormLink() { return this.client.intakeFormLink; }
  get patientWeightLog() { return this.client.patientWeightLog; }
  get patientMedicationReminder() { return this.client.patientMedicationReminder; }
  get ticketAssignment() { return this.client.ticketAssignment; }
  get ticketComment() { return this.client.ticketComment; }
  get ticketStatusHistory() { return this.client.ticketStatusHistory; }
  get ticketWorkLog() { return this.client.ticketWorkLog; }
  get ticketEscalation() { return this.client.ticketEscalation; }
  get ticketSLA() { return this.client.ticketSLA; }
  get apiUsageLog() { return this.client.apiUsageLog; }
  get integrationLog() { return this.client.integrationLog; }
  get developerTool() { return this.client.developerTool; }
  get auditLog() { return this.client.auditLog; }
  get superbill() { return this.client.superbill; }
  get carePlan() { return this.client.carePlan; }
  get smsLog() { return this.client.smsLog; }
  get discount() { return this.client.discount; }
  get discountUsage() { return this.client.discountUsage; }
  get affiliateInfluencer() { return this.client.affiliateInfluencer; }
  get affiliateReferral() { return this.client.affiliateReferral; }
  get affiliatePayout() { return this.client.affiliatePayout; }
  
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
 */
export function setClinicContext(clinicId: number | undefined) {
  globalForPrisma.currentClinicId = clinicId;
}

/**
 * Get the current clinic context
 */
export function getClinicContext(): number | undefined {
  return globalForPrisma.currentClinicId;
}

/**
 * Execute queries with a specific clinic context
 * Useful for admin operations that need to access specific clinic data
 */
export async function withClinicContext<T>(
  clinicId: number,
  callback: () => Promise<T>
): Promise<T> {
  const previousClinicId = globalForPrisma.currentClinicId;
  
  try {
    globalForPrisma.currentClinicId = clinicId;
    return await callback();
  } finally {
    globalForPrisma.currentClinicId = previousClinicId;
  }
}

/**
 * Execute queries without clinic filtering
 * DANGEROUS: Only use for super admin operations
 */
export async function withoutClinicFilter<T>(
  callback: () => Promise<T>
): Promise<T> {
  const previousClinicId = globalForPrisma.currentClinicId;
  
  try {
    globalForPrisma.currentClinicId = undefined;
    return await callback();
  } finally {
    globalForPrisma.currentClinicId = previousClinicId;
  }
}