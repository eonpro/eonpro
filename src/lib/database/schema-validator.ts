/**
 * DATABASE SCHEMA VALIDATOR
 *
 * CRITICAL: This module ensures database schema consistency for our enterprise medical platform.
 * Schema mismatches can cause:
 * - Data appearing/disappearing (invoices, prescriptions, appointments)
 * - Double-charging patients
 * - Missing prescription records (DANGEROUS for patient safety)
 * - Audit trail gaps (HIPAA violations)
 *
 * This validator runs:
 * 1. At application startup
 * 2. Before critical database operations
 * 3. As part of health checks
 * 4. In pre-deployment CI/CD pipelines
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from '@/lib/logger';

export interface SchemaValidationResult {
  valid: boolean;
  errors: SchemaError[];
  warnings: SchemaWarning[];
  checkedAt: Date;
  tablesChecked: number;
  columnsChecked: number;
}

export interface SchemaError {
  type: 'MISSING_TABLE' | 'MISSING_COLUMN' | 'TYPE_MISMATCH' | 'CONSTRAINT_MISSING';
  table: string;
  column?: string;
  expected?: string;
  actual?: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  message: string;
}

export interface SchemaWarning {
  type: string;
  message: string;
  table?: string;
  column?: string;
}

/**
 * CRITICAL TABLES AND COLUMNS
 * MUST match actual Prisma schema / DB table and column names.
 * Prisma uses model name as table name (e.g. Rx not Prescription).
 */
const CRITICAL_SCHEMA: Record<
  string,
  { columns: string[]; critical: boolean }
> = {
  // Patient - HIPAA critical (schema: dob, no updatedAt)
  Patient: {
    columns: [
      'id',
      'firstName',
      'lastName',
      'email',
      'phone',
      'dob',
      'clinicId',
      'createdAt',
    ],
    critical: true,
  },

  Invoice: {
    columns: [
      'id',
      'patientId',
      'status',
      'amount',
      'amountDue',
      'amountPaid',
      'stripeInvoiceId',
      'createdAt',
      'updatedAt',
      'createSubscription',
      'subscriptionCreated',
    ],
    critical: true,
  },

  Payment: {
    columns: ['id', 'patientId', 'amount', 'status', 'stripePaymentIntentId', 'createdAt'],
    critical: true,
  },

  Subscription: {
    columns: [
      'id',
      'patientId',
      'status',
      'stripeSubscriptionId',
      'currentPeriodStart',
      'currentPeriodEnd',
    ],
    critical: true,
  },

  // SOAPNote - no providerId in schema; has updatedAt
  SOAPNote: {
    columns: [
      'id',
      'patientId',
      'subjective',
      'objective',
      'assessment',
      'plan',
      'createdAt',
      'updatedAt',
    ],
    critical: true,
  },

  // Rx = prescription table (Prisma model Rx, not Prescription)
  Rx: {
    columns: ['id', 'orderId', 'medicationKey', 'medName', 'strength', 'form', 'quantity', 'refills', 'sig'],
    critical: true,
  },

  // AuditLog - schema uses resource, resourceId, createdAt
  AuditLog: {
    columns: ['id', 'userId', 'action', 'resource', 'resourceId', 'createdAt'],
    critical: true,
  },

  User: {
    columns: ['id', 'email', 'role', 'clinicId', 'createdAt'],
    critical: true,
  },

  // Product - schema uses isActive, not active
  Product: {
    columns: ['id', 'name', 'price', 'stripeProductId', 'stripePriceId', 'isActive'],
    critical: true,
  },

  // InvoiceItem - schema uses amount, not total
  InvoiceItem: {
    columns: ['id', 'invoiceId', 'productId', 'quantity', 'unitPrice', 'amount'],
    critical: true,
  },
};

/**
 * Validates the database schema matches expected structure
 * Should be called at startup and before deployments
 */
export async function validateDatabaseSchema(
  providedPrisma?: PrismaClient,
  /** When set, orphan checks are scoped to this clinic to avoid cross-tenant leakage. */
  clinicId?: number
): Promise<SchemaValidationResult> {
  const startTime = Date.now();
  const errors: SchemaError[] = [];
  const warnings: SchemaWarning[] = [];
  let tablesChecked = 0;
  let columnsChecked = 0;

  // Use provided prisma or dynamic import (avoids pulling db/connection-pool into Edge instrumentation bundle)
  let db = providedPrisma;
  if (!db) {
    const { prisma: singletonPrisma } = await import('@/lib/db');
    db = singletonPrisma;
  }

  try {
    logger.info('[SchemaValidator] Starting database schema validation...');

    // Get actual database schema from information_schema
    const tableColumns = await db.$queryRaw<
      Array<{ table_name: string; column_name: string; data_type: string; is_nullable: string }>
    >`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `;

    // Build a map of actual schema
    const actualSchema = new Map<string, Set<string>>();
    for (const row of tableColumns) {
      if (!actualSchema.has(row.table_name)) {
        actualSchema.set(row.table_name, new Set());
      }
      actualSchema.get(row.table_name)!.add(row.column_name);
    }

    // Validate each critical table
    for (const [tableName, config] of Object.entries(CRITICAL_SCHEMA)) {
      tablesChecked++;

      const actualColumns = actualSchema.get(tableName);

      if (!actualColumns) {
        errors.push({
          type: 'MISSING_TABLE',
          table: tableName,
          severity: config.critical ? 'CRITICAL' : 'HIGH',
          message: `Critical table "${tableName}" does not exist in database`,
        });
        continue;
      }

      // Check each expected column
      for (const columnName of config.columns) {
        columnsChecked++;

        if (!actualColumns.has(columnName)) {
          errors.push({
            type: 'MISSING_COLUMN',
            table: tableName,
            column: columnName,
            severity: config.critical ? 'CRITICAL' : 'HIGH',
            message: `Column "${tableName}.${columnName}" is missing from database`,
          });
        }
      }
    }

    // Check for orphaned foreign keys (data integrity); scope to clinic when provided
    const orphanChecks = await checkOrphanedRecords(db, clinicId);
    warnings.push(...orphanChecks);

    const duration = Date.now() - startTime;
    const valid = errors.filter((e) => e.severity === 'CRITICAL').length === 0;

    const result: SchemaValidationResult = {
      valid,
      errors,
      warnings,
      checkedAt: new Date(),
      tablesChecked,
      columnsChecked,
    };

    if (!valid) {
      logger.error('[SchemaValidator] CRITICAL: Schema validation FAILED', {
        errorCount: errors.length,
        criticalErrors: errors.filter((e) => e.severity === 'CRITICAL').length,
        duration,
      });
    } else if (errors.length > 0) {
      logger.warn('[SchemaValidator] Schema validation passed with warnings', {
        errorCount: errors.length,
        warningCount: warnings.length,
        duration,
      });
    } else {
      logger.info('[SchemaValidator] Schema validation PASSED', {
        tablesChecked,
        columnsChecked,
        duration,
      });
    }

    return result;
  } catch (error: any) {
    logger.error('[SchemaValidator] Failed to validate schema', { error: error.message });

    return {
      valid: false,
      errors: [
        {
          type: 'MISSING_TABLE',
          table: 'DATABASE',
          severity: 'CRITICAL',
          message: `Database connection/query failed: ${error.message}`,
        },
      ],
      warnings: [],
      checkedAt: new Date(),
      tablesChecked: 0,
      columnsChecked: 0,
    };
  }
  // Note: Don't disconnect singleton PrismaClient - it's managed globally
}

/**
 * Check for orphaned records that could indicate data integrity issues.
 * When clinicId is provided, raw SQL is scoped to that clinic to prevent cross-tenant leakage.
 */
async function checkOrphanedRecords(
  db: PrismaClient,
  clinicId?: number
): Promise<SchemaWarning[]> {
  const warnings: SchemaWarning[] = [];

  try {
    const clinicFilterInv =
      clinicId != null ? Prisma.sql`AND i."clinicId" = ${clinicId}` : Prisma.sql``;
    const clinicFilterPay =
      clinicId != null ? Prisma.sql`AND pay."clinicId" = ${clinicId}` : Prisma.sql``;

    // Check for invoices without patients
    const orphanedInvoices = await db.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`
      SELECT COUNT(*) as count FROM "Invoice" i
      LEFT JOIN "Patient" p ON i."patientId" = p.id
      WHERE p.id IS NULL AND i."patientId" IS NOT NULL
      ${clinicFilterInv}
    `
    );

    if (orphanedInvoices[0] && Number(orphanedInvoices[0].count) > 0) {
      warnings.push({
        type: 'ORPHANED_RECORDS',
        table: 'Invoice',
        message: `Found ${orphanedInvoices[0].count} invoices referencing non-existent patients`,
      });
    }

    // Check for payments without invoices
    const orphanedPayments = await db.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`
      SELECT COUNT(*) as count FROM "Payment" pay
      LEFT JOIN "Invoice" i ON pay."invoiceId" = i.id
      WHERE i.id IS NULL AND pay."invoiceId" IS NOT NULL
      ${clinicFilterPay}
    `
    );

    if (orphanedPayments[0] && Number(orphanedPayments[0].count) > 0) {
      warnings.push({
        type: 'ORPHANED_RECORDS',
        table: 'Payment',
        message: `Found ${orphanedPayments[0].count} payments referencing non-existent invoices`,
      });
    }
  } catch (error) {
    // Non-critical - just log and continue
    logger.warn('[SchemaValidator] Could not check for orphaned records', { error });
  }

  return warnings;
}

/**
 * Quick validation that can be called before critical operations
 * Much faster than full validation - only checks specific table
 */
export async function validateTableBeforeOperation(
  tableName: keyof typeof CRITICAL_SCHEMA,
  prisma: PrismaClient
): Promise<{ valid: boolean; error?: string }> {
  const config = CRITICAL_SCHEMA[tableName];
  if (!config) {
    return { valid: true };
  }

  try {
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${tableName}
    `;

    const actualColumns = new Set(columns.map((c) => c.column_name));
    const missingColumns = config.columns.filter((col) => !actualColumns.has(col));

    if (missingColumns.length > 0) {
      return {
        valid: false,
        error: `Table ${tableName} is missing columns: ${missingColumns.join(', ')}`,
      };
    }

    return { valid: true };
  } catch (error: any) {
    return {
      valid: false,
      error: `Failed to validate table ${tableName}: ${error.message}`,
    };
  }
}

/**
 * Run validation at startup - called from Next.js instrumentation in production.
 * In production, critical schema errors block startup unless ALLOW_SCHEMA_ERRORS=true.
 */
export async function runStartupValidation(): Promise<void> {
  if (process.env.SKIP_SCHEMA_VALIDATION === 'true') {
    logger.warn('[SchemaValidator] Schema validation SKIPPED (SKIP_SCHEMA_VALIDATION=true)');
    return;
  }

  const result = await validateDatabaseSchema();

  if (!result.valid) {
    const criticalErrors = result.errors.filter((e) => e.severity === 'CRITICAL');

    logger.error('[SchemaValidator] ⛔ CRITICAL SCHEMA ERRORS DETECTED', {
      errors: criticalErrors.map((e) => e.message),
    });

    // In production: block startup on critical errors unless explicitly allowed (enterprise default: fail fast)
    const blockInProduction =
      process.env.NODE_ENV === 'production' &&
      (process.env.BLOCK_ON_SCHEMA_ERROR === 'true' || process.env.ALLOW_SCHEMA_ERRORS !== 'true');

    if (criticalErrors.length > 0 && blockInProduction) {
      throw new Error(
        `Database schema validation failed with ${criticalErrors.length} critical errors. ` +
          `Deployment blocked to prevent data integrity issues. ` +
          `Set ALLOW_SCHEMA_ERRORS=true to override (not recommended). ` +
          `Errors: ${criticalErrors.map((e) => e.message).join('; ')}`
      );
    }
  }
}
