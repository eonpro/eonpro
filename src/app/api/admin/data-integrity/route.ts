/**
 * DATA INTEGRITY MONITORING API
 *
 * CRITICAL ENDPOINT for monitoring database health and data integrity
 *
 * This endpoint:
 * 1. Validates database schema matches expected structure
 * 2. Checks for orphaned records
 * 3. Verifies critical data can be queried
 * 4. Detects duplicate/inconsistent data
 *
 * Should be monitored continuously in production
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, basePrisma, runWithClinicContext, getClinicContext } from '@/lib/db';
import { logger } from '@/lib/logger';
import { validateDatabaseSchema, SchemaValidationResult } from '@/lib/database/schema-validator';
import { withAdminAuth, type AuthUser } from '@/lib/auth/middleware';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface IntegrityCheckResult {
  status: 'healthy' | 'degraded' | 'critical';
  timestamp: string;
  checks: {
    schema: SchemaValidationResult;
    dataQueries: DataQueryResult;
    dataIntegrity: DataIntegrityResult;
    counts: RecordCountsResult;
  };
  summary: {
    totalChecks: number;
    passed: number;
    warnings: number;
    critical: number;
  };
}

interface DataQueryResult {
  passed: boolean;
  testedQueries: Array<{
    name: string;
    success: boolean;
    error?: string;
    duration: number;
  }>;
}

interface DataIntegrityResult {
  passed: boolean;
  issues: Array<{
    type: string;
    severity: 'warning' | 'critical';
    count: number;
    message: string;
  }>;
}

interface RecordCountsResult {
  patients: number;
  invoices: number;
  payments: number;
  subscriptions: number;
  soapNotes: number;
  products: number;
}

async function handleGet(request: NextRequest, user: AuthUser) {
  const startTime = Date.now();

  try {
    logger.info('[DataIntegrity] Starting comprehensive data integrity check', {
      initiatedBy: user.email,
    });

    const isSuperAdmin = user.role === 'super_admin';
    const scopeClinicId =
      isSuperAdmin
        ? (await basePrisma.clinic.findFirst({ select: { id: true } }))?.id
        : user.clinicId ?? getClinicContext();
    if (scopeClinicId == null) {
      return NextResponse.json(
        { error: 'No clinic context available for query tests and counts' },
        { status: 400 }
      );
    }

    // 1. Schema Validation (orphan checks scoped to clinic when not super_admin)
    const schemaResult = await validateDatabaseSchema(
      prisma,
      isSuperAdmin ? undefined : scopeClinicId
    );

    // 2. Test Critical Data Queries (run inside tenant context to avoid TenantContextRequiredError)
    const dataQueryResult = await runWithClinicContext(scopeClinicId, () => testCriticalQueries());

    // 3. Check Data Integrity (scoped to clinic unless super_admin; raw SQL includes clinicId filter)
    const dataIntegrityResult = await checkDataIntegrity(
      isSuperAdmin ? undefined : scopeClinicId
    );

    // 4. Get Record Counts (scoped to same clinic)
    const countsResult = await runWithClinicContext(scopeClinicId, () => getRecordCounts());

    // Calculate summary
    const criticalIssues =
      schemaResult.errors.filter((e) => e.severity === 'CRITICAL').length +
      dataIntegrityResult.issues.filter((i) => i.severity === 'critical').length +
      dataQueryResult.testedQueries.filter((q) => !q.success).length;

    const warnings =
      schemaResult.errors.filter((e) => e.severity !== 'CRITICAL').length +
      schemaResult.warnings.length +
      dataIntegrityResult.issues.filter((i) => i.severity === 'warning').length;

    const totalChecks =
      schemaResult.tablesChecked +
      dataQueryResult.testedQueries.length +
      dataIntegrityResult.issues.length +
      Object.keys(countsResult).length;

    const passed = totalChecks - criticalIssues - warnings;

    // Determine overall status
    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (criticalIssues > 0) {
      status = 'critical';
    } else if (warnings > 0) {
      status = 'degraded';
    }

    const result: IntegrityCheckResult = {
      status,
      timestamp: new Date().toISOString(),
      checks: {
        schema: schemaResult,
        dataQueries: dataQueryResult,
        dataIntegrity: dataIntegrityResult,
        counts: countsResult,
      },
      summary: {
        totalChecks,
        passed,
        warnings,
        critical: criticalIssues,
      },
    };

    const duration = Date.now() - startTime;
    logger.info('[DataIntegrity] Check completed', { status, duration, criticalIssues, warnings });

    // Set appropriate status code
    const statusCode = status === 'critical' ? 503 : status === 'degraded' ? 200 : 200;

    return NextResponse.json(result, {
      status: statusCode,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Integrity-Status': status,
        'X-Check-Duration': `${duration}ms`,
      },
    });
  } catch (error: any) {
    logger.error('[DataIntegrity] Check failed', { error: error.message });

    return NextResponse.json(
      {
        status: 'critical',
        timestamp: new Date().toISOString(),
        error: 'Operation failed',
        summary: {
          totalChecks: 0,
          passed: 0,
          warnings: 0,
          critical: 1,
        },
      },
      { status: 503 }
    );
  }
}

export const GET = withAdminAuth(handleGet);

async function testCriticalQueries(): Promise<DataQueryResult> {
  const testedQueries: DataQueryResult['testedQueries'] = [];

  // Test Invoice query with all relations (the one that was failing)
  const invoiceStart = Date.now();
  try {
    await prisma.invoice.findFirst({
      include: {
        payments: true,
        items: { include: { product: true } },
      },
    });
    testedQueries.push({
      name: 'Invoice with Relations',
      success: true,
      duration: Date.now() - invoiceStart,
    });
  } catch (error: any) {
    testedQueries.push({
      name: 'Invoice with Relations',
      success: false,
      error: 'Operation failed',
      duration: Date.now() - invoiceStart,
    });
  }

  // Test Patient query
  const patientStart = Date.now();
  try {
    await prisma.patient.findFirst({
      include: { documents: true, clinic: true },
    });
    testedQueries.push({
      name: 'Patient with Relations',
      success: true,
      duration: Date.now() - patientStart,
    });
  } catch (error: any) {
    testedQueries.push({
      name: 'Patient with Relations',
      success: false,
      error: 'Operation failed',
      duration: Date.now() - patientStart,
    });
  }

  // Test Payment query
  const paymentStart = Date.now();
  try {
    await prisma.payment.findFirst({
      include: { patient: true, invoice: true },
    });
    testedQueries.push({
      name: 'Payment with Relations',
      success: true,
      duration: Date.now() - paymentStart,
    });
  } catch (error: any) {
    testedQueries.push({
      name: 'Payment with Relations',
      success: false,
      error: 'Operation failed',
      duration: Date.now() - paymentStart,
    });
  }

  // Test Subscription query
  const subStart = Date.now();
  try {
    await prisma.subscription.findFirst({
      include: { patient: true },
    });
    testedQueries.push({
      name: 'Subscription with Relations',
      success: true,
      duration: Date.now() - subStart,
    });
  } catch (error: any) {
    testedQueries.push({
      name: 'Subscription with Relations',
      success: false,
      error: 'Operation failed',
      duration: Date.now() - subStart,
    });
  }

  // Test SOAP Note query
  const soapStart = Date.now();
  try {
    await prisma.sOAPNote.findFirst({
      include: { patient: true },
    });
    testedQueries.push({
      name: 'SOAP Note with Relations',
      success: true,
      duration: Date.now() - soapStart,
    });
  } catch (error: any) {
    testedQueries.push({
      name: 'SOAP Note with Relations',
      success: false,
      error: 'Operation failed',
      duration: Date.now() - soapStart,
    });
  }

  return {
    passed: testedQueries.every((q) => q.success),
    testedQueries,
  };
}

async function checkDataIntegrity(clinicId?: number): Promise<DataIntegrityResult> {
  const issues: DataIntegrityResult['issues'] = [];
  const { Prisma } = await import('@prisma/client');

  try {
    // Tenant-scoped: only check within clinic unless super_admin (clinicId undefined). Raw SQL includes clinicId to prevent cross-tenant leakage.
    const clinicFilter =
      clinicId != null ? Prisma.sql`AND i."clinicId" = ${clinicId}` : Prisma.sql``;
    const clinicFilterPay =
      clinicId != null ? Prisma.sql`AND pay."clinicId" = ${clinicId}` : Prisma.sql``;
    const clinicFilterSub =
      clinicId != null ? Prisma.sql`AND s."clinicId" = ${clinicId}` : Prisma.sql``;

    // Check for orphaned invoices (patient doesn't exist)
    const orphanedInvoices = await prisma.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`
      SELECT COUNT(*) as count FROM "Invoice" i
      LEFT JOIN "Patient" p ON i."patientId" = p.id
      WHERE p.id IS NULL AND i."patientId" IS NOT NULL
      ${clinicFilter}
    `
    );

    const orphanedInvoiceCount = Number(orphanedInvoices[0]?.count || 0);
    if (orphanedInvoiceCount > 0) {
      issues.push({
        type: 'ORPHANED_INVOICES',
        severity: 'critical',
        count: orphanedInvoiceCount,
        message: `${orphanedInvoiceCount} invoices reference non-existent patients`,
      });
    }

    // Check for orphaned payments
    const orphanedPayments = await prisma.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`
      SELECT COUNT(*) as count FROM "Payment" pay
      LEFT JOIN "Invoice" i ON pay."invoiceId" = i.id
      WHERE i.id IS NULL AND pay."invoiceId" IS NOT NULL
      ${clinicFilterPay}
    `
    );

    const orphanedPaymentCount = Number(orphanedPayments[0]?.count || 0);
    if (orphanedPaymentCount > 0) {
      issues.push({
        type: 'ORPHANED_PAYMENTS',
        severity: 'warning',
        count: orphanedPaymentCount,
        message: `${orphanedPaymentCount} payments reference non-existent invoices`,
      });
    }

    // Check for duplicate active subscriptions per patient
    const duplicateSubs = await prisma.$queryRaw<Array<{ patientId: number; count: bigint }>>(
      Prisma.sql`
      SELECT s."patientId", COUNT(*) as count 
      FROM "Subscription" s
      WHERE s.status = 'ACTIVE'
      ${clinicFilterSub}
      GROUP BY s."patientId" 
      HAVING COUNT(*) > 1
    `
    );

    if (duplicateSubs.length > 0) {
      issues.push({
        type: 'DUPLICATE_SUBSCRIPTIONS',
        severity: 'critical',
        count: duplicateSubs.length,
        message: `${duplicateSubs.length} patients have multiple active subscriptions (potential double-billing)`,
      });
    }

    // Check for paid invoices with $0 amountPaid
    const zeroPaidInvoices = await prisma.invoice.count({
      where: {
        status: 'PAID',
        amountPaid: 0,
      },
    });

    if (zeroPaidInvoices > 0) {
      issues.push({
        type: 'INVALID_PAID_INVOICES',
        severity: 'warning',
        count: zeroPaidInvoices,
        message: `${zeroPaidInvoices} invoices marked as PAID but have $0 amountPaid`,
      });
    }

    // NOTE: Patient.clinicId is now required in schema (NOT NULL constraint)
    // All patients must belong to a clinic - this is enforced at database level
    // No need to check for unassigned patients as the constraint prevents them
  } catch (error: any) {
    issues.push({
      type: 'CHECK_FAILED',
      severity: 'critical',
      count: 1,
      message: `Failed to check data integrity: ${error.message}`,
    });
  }

  return {
    passed: issues.filter((i) => i.severity === 'critical').length === 0,
    issues,
  };
}

async function getRecordCounts(): Promise<RecordCountsResult> {
  const [patients, invoices, payments, subscriptions, soapNotes, products] = await Promise.all([
    prisma.patient.count(),
    prisma.invoice.count(),
    prisma.payment.count(),
    prisma.subscription.count(),
    prisma.sOAPNote.count(),
    prisma.product.count(),
  ]);

  return {
    patients,
    invoices,
    payments,
    subscriptions,
    soapNotes,
    products,
  };
}
