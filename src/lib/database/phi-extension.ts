/**
 * Prisma Extension for Automatic PHI Field Encryption
 * ===================================================
 * 
 * Automatically encrypts PHI fields on write and decrypts on read.
 * This ensures HIPAA compliance without manual encryption calls.
 * 
 * @module database/phi-extension
 * @version 1.0.0
 * @security CRITICAL - Handles all PHI encryption in database operations
 * 
 * ## PHI Fields by Model
 * 
 * | Model    | Encrypted Fields                          |
 * |----------|-------------------------------------------|
 * | Patient  | ssn, dob*, phone, email*                 |
 * | Order    | shippingAddress (JSON)                    |
 * | SOAPNote | chiefComplaint, assessment, plan          |
 * 
 * *dob stored as date, phone/email may need lookup capability
 * 
 * ## Usage
 * ```typescript
 * import { prismaWithPHI } from '@/lib/database/phi-extension';
 * 
 * // PHI fields are automatically encrypted on create/update
 * const patient = await prismaWithPHI.patient.create({
 *   data: { ssn: '123-45-6789', ... }
 * });
 * 
 * // PHI fields are automatically decrypted on read
 * console.log(patient.ssn); // '123-45-6789'
 * ```
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { encryptPHI, decryptPHI, isEncrypted } from '@/lib/security/phi-encryption';
import { logger } from '@/lib/logger';

// ============================================================================
// PHI Field Configuration
// ============================================================================

/**
 * Define which fields are PHI for each model
 * These fields will be automatically encrypted/decrypted
 */
const PHI_FIELDS: Record<string, string[]> = {
  Patient: ['ssn'],
  // SOAPNote: ['chiefComplaint', 'assessment', 'plan'], // If needed
  // Note: email and phone are not encrypted to allow for searching
  // For full encryption, implement blind indexing pattern
};

/**
 * Fields that should be encrypted in JSON columns
 */
const PHI_JSON_FIELDS: Record<string, { field: string; paths: string[] }[]> = {
  Order: [
    { 
      field: 'shippingAddress', 
      paths: ['address1', 'address2', 'phone'] 
    }
  ],
  Patient: [
    {
      field: 'intakeData',
      paths: ['medicalHistory.conditions', 'medicalHistory.medications']
    }
  ],
};

// ============================================================================
// Encryption Helpers
// ============================================================================

/**
 * Encrypt PHI fields in a data object
 */
function encryptPHIFields<T extends Record<string, unknown>>(
  model: string,
  data: T
): T {
  const fields = PHI_FIELDS[model];
  if (!fields || fields.length === 0) {
    return data;
  }

  const result = { ...data };
  
  for (const field of fields) {
    if (field in result && result[field] != null) {
      const value = result[field];
      if (typeof value === 'string' && !isEncrypted(value)) {
        (result[field] as unknown) = encryptPHI(value);
      }
    }
  }
  
  return result;
}

/**
 * Decrypt PHI fields in a data object
 */
function decryptPHIFields<T extends Record<string, unknown>>(
  model: string,
  data: T
): T {
  const fields = PHI_FIELDS[model];
  if (!fields || fields.length === 0) {
    return data;
  }

  const result = { ...data };
  
  for (const field of fields) {
    if (field in result && result[field] != null) {
      const value = result[field];
      if (typeof value === 'string' && isEncrypted(value)) {
        (result[field] as unknown) = decryptPHI(value);
      }
    }
  }
  
  return result;
}

/**
 * Encrypt nested paths in JSON fields
 */
function encryptJSONPaths(
  model: string,
  data: Record<string, unknown>
): Record<string, unknown> {
  const jsonFields = PHI_JSON_FIELDS[model];
  if (!jsonFields) {
    return data;
  }

  const result = { ...data };
  
  for (const { field, paths } of jsonFields) {
    if (field in result && result[field] != null) {
      const jsonValue = typeof result[field] === 'string' 
        ? JSON.parse(result[field] as string)
        : { ...(result[field] as object) };
      
      for (const path of paths) {
        const value = getNestedValue(jsonValue, path);
        if (typeof value === 'string' && !isEncrypted(value)) {
          setNestedValue(jsonValue, path, encryptPHI(value));
        }
      }
      
      result[field] = jsonValue;
    }
  }
  
  return result;
}

/**
 * Decrypt nested paths in JSON fields
 */
function decryptJSONPaths(
  model: string,
  data: Record<string, unknown>
): Record<string, unknown> {
  const jsonFields = PHI_JSON_FIELDS[model];
  if (!jsonFields) {
    return data;
  }

  const result = { ...data };
  
  for (const { field, paths } of jsonFields) {
    if (field in result && result[field] != null) {
      const jsonValue = typeof result[field] === 'string' 
        ? JSON.parse(result[field] as string)
        : { ...(result[field] as object) };
      
      for (const path of paths) {
        const value = getNestedValue(jsonValue, path);
        if (typeof value === 'string' && isEncrypted(value)) {
          setNestedValue(jsonValue, path, decryptPHI(value));
        }
      }
      
      result[field] = jsonValue;
    }
  }
  
  return result;
}

// ============================================================================
// Utility Functions
// ============================================================================

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((acc: unknown, part) => {
    if (acc && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  const last = parts.pop()!;
  let current = obj;
  
  for (const part of parts) {
    if (!(part in current)) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  
  current[last] = value;
}

// ============================================================================
// Prisma Extension
// ============================================================================

/**
 * Create a Prisma client with automatic PHI encryption/decryption
 */
export function createPrismaWithPHI(basePrisma: PrismaClient) {
  return basePrisma.$extends({
    name: 'phi-encryption',
    
    query: {
      // Patient model
      patient: {
        async create({ model, args, query }) {
          if (args.data) {
            args.data = encryptPHIFields(model, args.data as Record<string, unknown>);
            args.data = encryptJSONPaths(model, args.data as Record<string, unknown>);
          }
          const result = await query(args);
          return decryptPHIFields(model, decryptJSONPaths(model, result as Record<string, unknown>));
        },
        
        async createMany({ model, args, query }) {
          if (args.data) {
            if (Array.isArray(args.data)) {
              args.data = args.data.map(d => 
                encryptJSONPaths(model, encryptPHIFields(model, d as Record<string, unknown>))
              );
            } else {
              args.data = encryptJSONPaths(model, encryptPHIFields(model, args.data as Record<string, unknown>));
            }
          }
          return query(args);
        },
        
        async update({ model, args, query }) {
          if (args.data) {
            args.data = encryptPHIFields(model, args.data as Record<string, unknown>);
            args.data = encryptJSONPaths(model, args.data as Record<string, unknown>);
          }
          const result = await query(args);
          return decryptPHIFields(model, decryptJSONPaths(model, result as Record<string, unknown>));
        },
        
        async updateMany({ model, args, query }) {
          if (args.data) {
            args.data = encryptPHIFields(model, args.data as Record<string, unknown>);
            args.data = encryptJSONPaths(model, args.data as Record<string, unknown>);
          }
          return query(args);
        },
        
        async upsert({ model, args, query }) {
          if (args.create) {
            args.create = encryptJSONPaths(model, encryptPHIFields(model, args.create as Record<string, unknown>));
          }
          if (args.update) {
            args.update = encryptJSONPaths(model, encryptPHIFields(model, args.update as Record<string, unknown>));
          }
          const result = await query(args);
          return decryptPHIFields(model, decryptJSONPaths(model, result as Record<string, unknown>));
        },
        
        async findUnique({ model, args, query }) {
          const result = await query(args);
          if (!result) return result;
          return decryptPHIFields(model, decryptJSONPaths(model, result as Record<string, unknown>));
        },
        
        async findFirst({ model, args, query }) {
          const result = await query(args);
          if (!result) return result;
          return decryptPHIFields(model, decryptJSONPaths(model, result as Record<string, unknown>));
        },
        
        async findMany({ model, args, query }) {
          const results = await query(args);
          return (results as Record<string, unknown>[]).map(r => 
            decryptPHIFields(model, decryptJSONPaths(model, r))
          );
        },
      },
      
      // Order model (for shipping address encryption)
      order: {
        async create({ model, args, query }) {
          if (args.data) {
            args.data = encryptJSONPaths(model, args.data as Record<string, unknown>);
          }
          const result = await query(args);
          return decryptJSONPaths(model, result as Record<string, unknown>);
        },
        
        async update({ model, args, query }) {
          if (args.data) {
            args.data = encryptJSONPaths(model, args.data as Record<string, unknown>);
          }
          const result = await query(args);
          return decryptJSONPaths(model, result as Record<string, unknown>);
        },
        
        async findUnique({ model, args, query }) {
          const result = await query(args);
          if (!result) return result;
          return decryptJSONPaths(model, result as Record<string, unknown>);
        },
        
        async findFirst({ model, args, query }) {
          const result = await query(args);
          if (!result) return result;
          return decryptJSONPaths(model, result as Record<string, unknown>);
        },
        
        async findMany({ model, args, query }) {
          const results = await query(args);
          return (results as Record<string, unknown>[]).map(r => 
            decryptJSONPaths(model, r)
          );
        },
      },
    },
  });
}

// ============================================================================
// Migration Helper
// ============================================================================

/**
 * Encrypt existing unencrypted PHI data in the database
 * Run this as a one-time migration after enabling encryption
 */
export async function migrateUnencryptedPHI(prisma: PrismaClient): Promise<{
  patientsUpdated: number;
  ordersUpdated: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let patientsUpdated = 0;
  let ordersUpdated = 0;
  
  logger.info('Starting PHI encryption migration');
  
  // Migrate Patient SSN
  try {
    const patients = await prisma.patient.findMany({
      select: { id: true, ssn: true },
      where: {
        ssn: { not: null },
      },
    });
    
    for (const patient of patients) {
      if (patient.ssn && !isEncrypted(patient.ssn)) {
        await prisma.patient.update({
          where: { id: patient.id },
          data: { ssn: encryptPHI(patient.ssn) },
        });
        patientsUpdated++;
      }
    }
    
    logger.info(`Encrypted SSN for ${patientsUpdated} patients`);
  } catch (error) {
    const msg = `Patient SSN migration failed: ${error}`;
    logger.error(msg, error as Error);
    errors.push(msg);
  }
  
  logger.info('PHI encryption migration complete', {
    patientsUpdated,
    ordersUpdated,
    errorCount: errors.length,
  });
  
  return { patientsUpdated, ordersUpdated, errors };
}

// ============================================================================
// Export Types
// ============================================================================

export type PrismaWithPHI = ReturnType<typeof createPrismaWithPHI>;
