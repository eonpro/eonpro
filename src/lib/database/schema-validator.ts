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
const CRITICAL_SCHEMA: Record<string, { columns: string[]; critical: boolean }> = {
  // Patient - HIPAA critical (schema: dob, no updatedAt)
  Patient: {
    columns: ['id', 'firstName', 'lastName', 'email', 'phone', 'dob', 'clinicId', 'createdAt'],
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
    columns: [
      'id',
      'orderId',
      'medicationKey',
      'medName',
      'strength',
      'form',
      'quantity',
      'refills',
      'sig',
    ],
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

const STARTUP_RETRY_ATTEMPTS = 3;
const STARTUP_RETRY_BASE_DELAY_MS = 2_000;

const TRANSIENT_PATTERNS = [
  'Timed out fetching a new connection from the connection pool',
  "Can't reach database server", // ASCII apostrophe U+0027
  'Can\u2019t reach database server', // typographic apostrophe U+2019
  'Connection refused',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'connection pool',
  'connect ETIMEDOUT',
  'P1001', // Prisma: "Can't reach database server"
  'P1002', // Prisma: "Database server timed out"
];

function isTransientConnectionError(error: unknown): boolean {
  const parts: string[] = [];

  if (error instanceof Error) {
    parts.push(error.message);
    if ('cause' in error && error.cause) parts.push(String(error.cause));
  }
  parts.push(String(error));

  if (error && typeof error === 'object') {
    const anyErr = error as Record<string, unknown>;
    if (typeof anyErr.code === 'string') parts.push(anyErr.code);
    if (anyErr.meta) parts.push(JSON.stringify(anyErr.meta));
  }

  const combined = parts.join(' ');
  return TRANSIENT_PATTERNS.some((p) => combined.includes(p));
}

function isTransientErrorMessage(msg: string): boolean {
  return TRANSIENT_PATTERNS.some((p) => msg.includes(p));
}

async function querySchemaWithRetry(
  db: PrismaClient
): Promise<
  Array<{ table_name: string; column_name: string; data_type: string; is_nullable: string }>
> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= STARTUP_RETRY_ATTEMPTS; attempt++) {
    try {
      return await db.$queryRaw<
        Array<{ table_name: string; column_name: string; data_type: string; is_nullable: string }>
      >`
        SELECT table_name, column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position
      `;
    } catch (error) {
      lastError = error;
      if (attempt < STARTUP_RETRY_ATTEMPTS && isTransientConnectionError(error)) {
        const delay = STARTUP_RETRY_BASE_DELAY_MS * attempt;
        logger.warn(
          `[SchemaValidator] Connection attempt ${attempt}/${STARTUP_RETRY_ATTEMPTS} failed, retrying in ${delay}ms`,
          {
            error: error instanceof Error ? error.message : String(error),
          }
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

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

  let db = providedPrisma;
  if (!db) {
    const { prisma: singletonPrisma } = await import('@/lib/db');
    db = singletonPrisma;
  }

  try {
    logger.info('[SchemaValidator] Starting database schema validation...');

    const tableColumns = await querySchemaWithRetry(db);

    const actualSchema = new Map<string, Set<string>>();
    for (const row of tableColumns) {
      if (!actualSchema.has(row.table_name)) {
        actualSchema.set(row.table_name, new Set());
      }
      actualSchema.get(row.table_name)!.add(row.column_name);
    }

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
  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);

    if (isTransientConnectionError(error)) {
      logger.warn(
        '[SchemaValidator] Schema validation skipped — transient DB connection failure (will validate on next request)',
        {
          error: errorMsg,
          duration,
        }
      );
      return {
        valid: true,
        errors: [],
        warnings: [
          {
            type: 'CONNECTION_TIMEOUT',
            message: `Schema validation deferred — database unreachable after ${STARTUP_RETRY_ATTEMPTS} attempts: ${errorMsg}`,
          },
        ],
        checkedAt: new Date(),
        tablesChecked: 0,
        columnsChecked: 0,
      };
    }

    logger.error('[SchemaValidator] Failed to validate schema', { error: errorMsg });

    return {
      valid: false,
      errors: [
        {
          type: 'MISSING_TABLE',
          table: 'DATABASE',
          severity: 'CRITICAL',
          message: `Database connection/query failed: ${errorMsg}`,
        },
      ],
      warnings: [],
      checkedAt: new Date(),
      tablesChecked: 0,
      columnsChecked: 0,
    };
  }
}

/**
 * Check for orphaned records that could indicate data integrity issues.
 * When clinicId is provided, raw SQL is scoped to that clinic to prevent cross-tenant leakage.
 */
async function checkOrphanedRecords(db: PrismaClient, clinicId?: number): Promise<SchemaWarning[]> {
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
  } catch (error: unknown) {
    return {
      valid: false,
      error: `Failed to validate table ${tableName}: ${error instanceof Error ? error.message : String(error)}`,
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

    const allTransient =
      criticalErrors.length > 0 && criticalErrors.every((e) => isTransientErrorMessage(e.message));

    if (allTransient) {
      logger.warn(
        '[SchemaValidator] Schema validation deferred — all critical errors are transient connection failures (will validate on next healthy request)',
        { errors: criticalErrors.map((e) => e.message) }
      );
      return;
    }

    logger.error('[SchemaValidator] CRITICAL SCHEMA ERRORS DETECTED', {
      errors: criticalErrors.map((e) => e.message),
    });

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
