#!/usr/bin/env npx ts-node
/**
 * PRE-DEPLOYMENT DATABASE & DATA INTEGRITY CHECK
 * 
 * ⚠️  CRITICAL: Run this BEFORE every deployment to production
 * 
 * This script validates:
 * 1. Database connectivity
 * 2. Schema consistency (all required columns exist)
 * 3. Critical data can be queried (invoices, patients, payments)
 * 4. No orphaned records
 * 5. Foreign key integrity
 * 
 * Usage:
 *   npm run pre-deploy-check
 *   # or
 *   DATABASE_URL="postgresql://..." npx ts-node scripts/pre-deploy-check.ts
 * 
 * Exit codes:
 *   0 = All checks passed, safe to deploy
 *   1 = Critical errors found, DO NOT DEPLOY
 *   2 = Warnings found, review before deploying
 */

import { PrismaClient } from '@prisma/client';

// Colors for terminal output
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

interface CheckResult {
  name: string;
  passed: boolean;
  critical: boolean;
  message: string;
  details?: string[];
}

const results: CheckResult[] = [];

async function main() {
  console.log(`\n${BOLD}${BLUE}════════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${BLUE}   🏥 EONPRO MEDICAL PLATFORM - PRE-DEPLOYMENT VALIDATION${RESET}`);
  console.log(`${BOLD}${BLUE}════════════════════════════════════════════════════════════════${RESET}\n`);

  const startTime = Date.now();
  const prisma = new PrismaClient();

  try {
    // 1. Database Connectivity
    await checkDatabaseConnectivity(prisma);

    // 2. Schema Validation
    await checkSchemaIntegrity(prisma);

    // 3. Schema Drift Detection (Prisma schema vs actual DB)
    await checkSchemaDrift(prisma);

    // 4. Critical Data Queries
    await checkCriticalDataQueries(prisma);

    // 5. Data Integrity
    await checkDataIntegrity(prisma);

    // 6. API Endpoints (if in same environment)
    await checkCriticalEndpoints();

  } catch (error: any) {
    results.push({
      name: 'Unexpected Error',
      passed: false,
      critical: true,
      message: `Validation failed with unexpected error: ${error.message}`,
    });
  } finally {
    await prisma.$disconnect();
  }

  // Print Results
  printResults(startTime);

  // Determine exit code
  const criticalFailures = results.filter(r => !r.passed && r.critical);
  const warnings = results.filter(r => !r.passed && !r.critical);

  if (criticalFailures.length > 0) {
    console.log(`\n${RED}${BOLD}⛔ DEPLOYMENT BLOCKED: ${criticalFailures.length} critical check(s) failed${RESET}`);
    console.log(`${RED}Fix these issues before deploying to production!${RESET}\n`);
    process.exit(1);
  } else if (warnings.length > 0) {
    console.log(`\n${YELLOW}${BOLD}⚠️  WARNINGS: ${warnings.length} non-critical check(s) failed${RESET}`);
    console.log(`${YELLOW}Review these issues before deploying.${RESET}\n`);
    process.exit(2);
  } else {
    console.log(`\n${GREEN}${BOLD}✅ ALL CHECKS PASSED - Safe to deploy!${RESET}\n`);
    process.exit(0);
  }
}

async function checkDatabaseConnectivity(prisma: PrismaClient) {
  console.log(`${BLUE}[1/5]${RESET} Checking database connectivity...`);
  
  try {
    const result = await prisma.$queryRaw`SELECT 1 as connected`;
    results.push({
      name: 'Database Connectivity',
      passed: true,
      critical: true,
      message: 'Successfully connected to database',
    });
    console.log(`  ${GREEN}✓${RESET} Database connection established`);
  } catch (error: any) {
    results.push({
      name: 'Database Connectivity',
      passed: false,
      critical: true,
      message: `Cannot connect to database: ${error.message}`,
    });
    console.log(`  ${RED}✗${RESET} Database connection failed`);
  }
}

async function checkSchemaIntegrity(prisma: PrismaClient) {
  console.log(`${BLUE}[2/5]${RESET} Validating database schema...`);

  // Critical tables and their required columns
  // NOTE: When adding new columns to Clinic, add them here BEFORE deploying code that uses them
  const criticalTables = {
    Invoice: ['id', 'patientId', 'status', 'amountDue', 'amountPaid', 'stripeInvoiceId', 'createSubscription', 'subscriptionCreated'],
    Patient: ['id', 'firstName', 'lastName', 'email', 'clinicId'],
    Payment: ['id', 'patientId', 'amount', 'status'],
    Subscription: ['id', 'patientId', 'status', 'stripeSubscriptionId'],
    SOAPNote: ['id', 'patientId', 'subjective', 'objective', 'assessment', 'plan'],
    User: ['id', 'email', 'role'],
    Product: ['id', 'name', 'price', 'stripeProductId'],
    InvoiceItem: ['id', 'invoiceId', 'quantity', 'unitPrice'],
    // Clinic model - critical for multi-tenant architecture
    Clinic: [
      'id', 'name', 'subdomain', 'status', 'adminEmail',
      'primaryColor', 'secondaryColor', 'accentColor',
      'logoUrl', 'iconUrl', 'faviconUrl',
      'billingPlan', 'patientLimit', 'providerLimit',
      'buttonTextColor', // Added 2026-01-24
    ],
  };

  const missingColumns: string[] = [];

  try {
    // Get all columns from database
    const columns = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `;

    const schemaMap = new Map<string, Set<string>>();
    for (const col of columns) {
      if (!schemaMap.has(col.table_name)) {
        schemaMap.set(col.table_name, new Set());
      }
      schemaMap.get(col.table_name)!.add(col.column_name);
    }

    for (const [table, requiredCols] of Object.entries(criticalTables)) {
      const actualCols = schemaMap.get(table);
      
      if (!actualCols) {
        missingColumns.push(`Table "${table}" does not exist`);
        continue;
      }

      for (const col of requiredCols) {
        if (!actualCols.has(col)) {
          missingColumns.push(`${table}.${col}`);
        }
      }
    }

    if (missingColumns.length > 0) {
      results.push({
        name: 'Schema Integrity',
        passed: false,
        critical: true,
        message: `Missing ${missingColumns.length} required column(s)`,
        details: missingColumns,
      });
      console.log(`  ${RED}✗${RESET} Missing columns detected:`);
      missingColumns.forEach(col => console.log(`    ${RED}-${RESET} ${col}`));
    } else {
      results.push({
        name: 'Schema Integrity',
        passed: true,
        critical: true,
        message: 'All required tables and columns exist',
      });
      console.log(`  ${GREEN}✓${RESET} All critical tables and columns verified`);
    }
  } catch (error: any) {
    results.push({
      name: 'Schema Integrity',
      passed: false,
      critical: true,
      message: `Failed to check schema: ${error.message}`,
    });
    console.log(`  ${RED}✗${RESET} Schema check failed`);
  }
}

/**
 * Check for schema drift between Prisma schema expectations and actual database.
 * This catches cases where the Prisma client expects columns that don't exist in DB.
 * 
 * IMPORTANT: This is a critical check that prevents deployment failures when
 * new columns are added to the Prisma schema but migrations haven't been run.
 */
async function checkSchemaDrift(prisma: PrismaClient) {
  console.log(`${BLUE}[3/6]${RESET} Checking for schema drift...`);

  // Models that are frequently updated and need drift detection
  // Add new columns here when they are added to the Prisma schema
  const expectedColumns: Record<string, string[]> = {
    Clinic: [
      // Core fields
      'id', 'createdAt', 'updatedAt', 'name', 'subdomain', 'customDomain', 'status',
      // Contact
      'adminEmail', 'supportEmail', 'phone', 'timezone', 'address',
      // Branding - frequently updated
      'primaryColor', 'secondaryColor', 'accentColor', 'buttonTextColor',
      'logoUrl', 'iconUrl', 'faviconUrl', 'customCss',
      // Billing
      'billingPlan', 'patientLimit', 'providerLimit', 'storageLimit',
      // Settings
      'settings', 'features', 'integrations',
      // Lifefile integration
      'lifefileEnabled', 'lifefileBaseUrl', 'lifefileUsername', 'lifefilePassword',
      'lifefileVendorId', 'lifefilePracticeId', 'lifefileLocationId',
    ],
    PatientCounter: ['id', 'clinicId', 'current'],
  };

  const driftIssues: string[] = [];

  try {
    // Get actual columns from database
    const columns = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `;

    const schemaMap = new Map<string, Set<string>>();
    for (const col of columns) {
      if (!schemaMap.has(col.table_name)) {
        schemaMap.set(col.table_name, new Set());
      }
      schemaMap.get(col.table_name)!.add(col.column_name);
    }

    // Check each monitored model for missing columns
    for (const [model, expectedCols] of Object.entries(expectedColumns)) {
      const actualCols = schemaMap.get(model);
      
      if (!actualCols) {
        driftIssues.push(`⚠️  Table "${model}" expected but not found in database`);
        continue;
      }

      for (const col of expectedCols) {
        if (!actualCols.has(col)) {
          driftIssues.push(`🔴 ${model}.${col} - Column expected by Prisma but missing in DB`);
        }
      }
    }

    if (driftIssues.length > 0) {
      results.push({
        name: 'Schema Drift Detection',
        passed: false,
        critical: true, // Schema drift is critical - will cause 500 errors
        message: `Schema drift detected: ${driftIssues.length} missing column(s)`,
        details: [
          ...driftIssues,
          '',
          '💡 To fix: Run migrations before deploying:',
          '   npx prisma migrate deploy',
        ],
      });
      console.log(`  ${RED}✗${RESET} Schema drift detected!`);
      driftIssues.forEach(issue => console.log(`    ${RED}-${RESET} ${issue}`));
      console.log(`\n    ${YELLOW}Run 'npx prisma migrate deploy' to fix${RESET}`);
    } else {
      results.push({
        name: 'Schema Drift Detection',
        passed: true,
        critical: true,
        message: 'No schema drift detected - DB matches Prisma expectations',
      });
      console.log(`  ${GREEN}✓${RESET} No schema drift - database is in sync`);
    }
  } catch (error: any) {
    results.push({
      name: 'Schema Drift Detection',
      passed: false,
      critical: false, // Don't block if check itself fails
      message: `Schema drift check failed: ${error.message}`,
    });
    console.log(`  ${YELLOW}⚠${RESET} Schema drift check failed: ${error.message}`);
  }
}

async function checkCriticalDataQueries(prisma: PrismaClient) {
  console.log(`${BLUE}[4/6]${RESET} Testing critical data queries...`);

  const queries = [
    {
      name: 'Invoice Query (with relations)',
      query: () => prisma.invoice.findFirst({
        include: { payments: true, items: { include: { product: true } } }
      }),
    },
    {
      name: 'Patient Query',
      query: () => prisma.patient.findFirst({ include: { documents: true } }),
    },
    {
      name: 'Payment Query',
      query: () => prisma.payment.findFirst({ include: { invoice: true } }),
    },
    {
      name: 'Subscription Query',
      query: () => prisma.subscription.findFirst({ include: { patient: true } }),
    },
    {
      name: 'SOAP Note Query',
      query: () => prisma.sOAPNote.findFirst(),
    },
  ];

  let allPassed = true;
  const failedQueries: string[] = [];

  for (const q of queries) {
    try {
      await q.query();
      console.log(`  ${GREEN}✓${RESET} ${q.name}`);
    } catch (error: any) {
      allPassed = false;
      failedQueries.push(`${q.name}: ${error.message}`);
      console.log(`  ${RED}✗${RESET} ${q.name}: ${error.message}`);
    }
  }

  results.push({
    name: 'Critical Data Queries',
    passed: allPassed,
    critical: true,
    message: allPassed ? 'All critical queries execute successfully' : `${failedQueries.length} queries failed`,
    details: failedQueries.length > 0 ? failedQueries : undefined,
  });
}

async function checkDataIntegrity(prisma: PrismaClient) {
  console.log(`${BLUE}[5/6]${RESET} Checking data integrity...`);

  const issues: string[] = [];

  try {
    // Check for invoices without patients
    const orphanedInvoices = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "Invoice" i
      LEFT JOIN "Patient" p ON i."patientId" = p.id
      WHERE p.id IS NULL AND i."patientId" IS NOT NULL
    `;
    
    if (Number(orphanedInvoices[0]?.count || 0) > 0) {
      issues.push(`${orphanedInvoices[0].count} invoices without valid patient reference`);
    }

    // Check for payments without invoices (when invoiceId is set)
    const orphanedPayments = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "Payment" pay
      LEFT JOIN "Invoice" i ON pay."invoiceId" = i.id
      WHERE i.id IS NULL AND pay."invoiceId" IS NOT NULL
    `;
    
    if (Number(orphanedPayments[0]?.count || 0) > 0) {
      issues.push(`${orphanedPayments[0].count} payments without valid invoice reference`);
    }

    // Check for duplicate active subscriptions per patient
    const duplicateSubs = await prisma.$queryRaw<Array<{ patientId: number; count: bigint }>>`
      SELECT "patientId", COUNT(*) as count 
      FROM "Subscription" 
      WHERE status = 'ACTIVE'
      GROUP BY "patientId" 
      HAVING COUNT(*) > 1
    `;
    
    if (duplicateSubs.length > 0) {
      issues.push(`${duplicateSubs.length} patients with multiple active subscriptions`);
    }

    if (issues.length > 0) {
      results.push({
        name: 'Data Integrity',
        passed: false,
        critical: false, // Warning, not blocking
        message: `${issues.length} data integrity issue(s) found`,
        details: issues,
      });
      console.log(`  ${YELLOW}⚠${RESET} Data integrity issues found:`);
      issues.forEach(issue => console.log(`    ${YELLOW}-${RESET} ${issue}`));
    } else {
      results.push({
        name: 'Data Integrity',
        passed: true,
        critical: false,
        message: 'No data integrity issues detected',
      });
      console.log(`  ${GREEN}✓${RESET} Data integrity verified`);
    }
  } catch (error: any) {
    results.push({
      name: 'Data Integrity',
      passed: false,
      critical: false,
      message: `Failed to check data integrity: ${error.message}`,
    });
    console.log(`  ${YELLOW}⚠${RESET} Data integrity check failed`);
  }
}

async function checkCriticalEndpoints() {
  console.log(`${BLUE}[6/6]${RESET} Checking critical API endpoints...`);

  // Only run if we have an API URL
  const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_APP_URL;
  
  if (!apiUrl) {
    results.push({
      name: 'API Endpoints',
      passed: true,
      critical: false,
      message: 'Skipped - No API_URL configured',
    });
    console.log(`  ${YELLOW}⚠${RESET} Skipped - No API_URL environment variable`);
    return;
  }

  try {
    const healthResponse = await fetch(`${apiUrl}/api/health`);
    
    if (healthResponse.ok) {
      results.push({
        name: 'API Endpoints',
        passed: true,
        critical: false,
        message: 'Health endpoint responding',
      });
      console.log(`  ${GREEN}✓${RESET} Health endpoint responding`);
    } else {
      results.push({
        name: 'API Endpoints',
        passed: false,
        critical: false,
        message: `Health endpoint returned ${healthResponse.status}`,
      });
      console.log(`  ${YELLOW}⚠${RESET} Health endpoint returned ${healthResponse.status}`);
    }
  } catch (error: any) {
    results.push({
      name: 'API Endpoints',
      passed: false,
      critical: false,
      message: `Could not reach API: ${error.message}`,
    });
    console.log(`  ${YELLOW}⚠${RESET} Could not reach API`);
  }
}

function printResults(startTime: number) {
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  console.log(`\n${BOLD}════════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}   VALIDATION RESULTS (${duration}s)${RESET}`);
  console.log(`${BOLD}════════════════════════════════════════════════════════════════${RESET}\n`);

  const passed = results.filter(r => r.passed);
  const failed = results.filter(r => !r.passed);

  console.log(`  ${GREEN}Passed:${RESET} ${passed.length}`);
  console.log(`  ${RED}Failed:${RESET} ${failed.length}`);
  console.log('');

  if (failed.length > 0) {
    console.log(`${BOLD}Failed Checks:${RESET}`);
    for (const result of failed) {
      const icon = result.critical ? `${RED}⛔${RESET}` : `${YELLOW}⚠${RESET}`;
      const severity = result.critical ? `${RED}[CRITICAL]${RESET}` : `${YELLOW}[WARNING]${RESET}`;
      console.log(`  ${icon} ${severity} ${result.name}: ${result.message}`);
      if (result.details) {
        result.details.forEach(d => console.log(`      - ${d}`));
      }
    }
  }
}

main().catch(console.error);
