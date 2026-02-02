#!/usr/bin/env npx ts-node
/**
 * Overtime Men's Clinic Integration Verification Script
 *
 * Checks:
 * 1. OT Mens clinic exists in database
 * 2. Required environment variables are set
 * 3. Airtable connection works
 * 4. Webhook endpoint is accessible
 *
 * Usage:
 *   npx ts-node scripts/verify-overtime-setup.ts
 *   npm run verify:overtime
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: Record<string, unknown>;
}

const results: CheckResult[] = [];

function log(result: CheckResult) {
  const icon = result.status === 'pass' ? '✅' : result.status === 'warn' ? '⚠️' : '❌';
  console.log(`${icon} ${result.name}: ${result.message}`);
  if (result.details) {
    console.log(`   Details:`, JSON.stringify(result.details, null, 2));
  }
  results.push(result);
}

async function checkClinic() {
  console.log('\n📋 Checking OT Mens Clinic...\n');

  try {
    const clinic = await prisma.clinic.findFirst({
      where: {
        OR: [
          { subdomain: 'ot' },
          { subdomain: { contains: 'ot', mode: 'insensitive' } },
          { name: { contains: 'Overtime', mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        name: true,
        subdomain: true,
        status: true,
        _count: {
          select: {
            patients: true,
          },
        },
      },
    });

    if (!clinic) {
      log({
        name: 'OT Mens Clinic',
        status: 'fail',
        message: 'Clinic not found in database!',
        details: {
          action: 'Create clinic with subdomain "ot" in the database',
          sql: `INSERT INTO "Clinic" (name, subdomain, "isActive") VALUES ('Overtime Men''s Clinic', 'ot', true);`,
        },
      });
      return null;
    }

    if (clinic.subdomain !== 'ot') {
      log({
        name: 'OT Mens Clinic Subdomain',
        status: 'warn',
        message: `Subdomain is "${clinic.subdomain}" - expected "ot"`,
        details: {
          clinicId: clinic.id,
          clinicName: clinic.name,
          currentSubdomain: clinic.subdomain,
          action: `UPDATE "Clinic" SET subdomain = 'ot' WHERE id = ${clinic.id};`,
        },
      });
    } else {
      log({
        name: 'OT Mens Clinic',
        status: 'pass',
        message: `Found: "${clinic.name}" (ID: ${clinic.id})`,
        details: {
          id: clinic.id,
          name: clinic.name,
          subdomain: clinic.subdomain,
          status: clinic.status,
          patientCount: clinic._count.patients,
        },
      });
    }

    if (clinic.status !== 'ACTIVE') {
      log({
        name: 'Clinic Status',
        status: 'warn',
        message: `Clinic status is "${clinic.status}" - expected "ACTIVE"`,
        details: {
          action: `UPDATE "Clinic" SET "status" = 'ACTIVE' WHERE id = ${clinic.id};`,
        },
      });
    }

    return clinic;
  } catch (error) {
    log({
      name: 'Database Connection',
      status: 'fail',
      message: `Failed to connect to database: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
    return null;
  }
}

function checkEnvVars(clinicId: number | null) {
  console.log('\n🔐 Checking Environment Variables...\n');

  const required = [
    { key: 'DATABASE_URL', description: 'PostgreSQL connection string' },
    { key: 'AIRTABLE_API_KEY', description: 'Airtable Personal Access Token' },
    { key: 'OVERTIME_AIRTABLE_BASE_ID', description: 'Airtable Base ID (appXXX...)' },
    { key: 'OVERTIME_INTAKE_WEBHOOK_SECRET', description: 'Webhook authentication secret' },
  ];

  const recommended = [
    { key: 'OVERTIME_SYNC_API_KEY', description: 'API key for sync endpoints' },
    { key: 'OVERTIME_CLINIC_ID', description: 'Clinic ID for security validation', expectedValue: clinicId?.toString() },
    { key: 'CRON_SECRET', description: 'Secret for cron job authentication' },
    { key: 'AWS_S3_BUCKET', description: 'S3 bucket for PDF storage' },
    { key: 'AWS_REGION', description: 'AWS region' },
  ];

  // Check required vars
  for (const { key, description } of required) {
    const value = process.env[key];
    if (!value) {
      log({
        name: `ENV: ${key}`,
        status: 'fail',
        message: `Missing required variable - ${description}`,
      });
    } else {
      const masked = key.includes('SECRET') || key.includes('KEY') || key.includes('URL')
        ? `${value.substring(0, 8)}...${value.substring(value.length - 4)}`
        : value;
      log({
        name: `ENV: ${key}`,
        status: 'pass',
        message: `Set (${masked})`,
      });
    }
  }

  // Check recommended vars
  for (const { key, description, expectedValue } of recommended) {
    const value = process.env[key];
    if (!value) {
      log({
        name: `ENV: ${key}`,
        status: 'warn',
        message: `Not set - ${description}`,
        details: expectedValue ? { recommendedValue: expectedValue } : undefined,
      });
    } else {
      if (expectedValue && value !== expectedValue) {
        log({
          name: `ENV: ${key}`,
          status: 'warn',
          message: `Value mismatch - expected ${expectedValue}, got ${value}`,
        });
      } else {
        log({
          name: `ENV: ${key}`,
          status: 'pass',
          message: 'Set',
        });
      }
    }
  }
}

async function checkAirtableConnection() {
  console.log('\n📊 Checking Airtable Connection...\n');

  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.OVERTIME_AIRTABLE_BASE_ID;

  if (!apiKey || !baseId) {
    log({
      name: 'Airtable Connection',
      status: 'fail',
      message: 'Missing AIRTABLE_API_KEY or OVERTIME_AIRTABLE_BASE_ID',
    });
    return;
  }

  // Test tables
  const tables = [
    { id: 'tblnznnhTgy5Li66k', name: 'OT Mens - Weight Loss' },
    { id: 'tblwZg0EuVlmz0I01', name: 'OT Mens - Better Sex' },
  ];

  for (const table of tables) {
    try {
      const response = await fetch(
        `https://api.airtable.com/v0/${baseId}/${table.id}?maxRecords=1`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        log({
          name: `Airtable: ${table.name}`,
          status: 'pass',
          message: `Connected (${data.records?.length ?? 0} sample records)`,
        });
      } else {
        const error = await response.text();
        log({
          name: `Airtable: ${table.name}`,
          status: 'fail',
          message: `HTTP ${response.status}: ${error.substring(0, 100)}`,
        });
      }
    } catch (error) {
      log({
        name: `Airtable: ${table.name}`,
        status: 'fail',
        message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }
}

async function checkWebhookEndpoint() {
  console.log('\n🔗 Checking Webhook Endpoint...\n');

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://eonpro-kappa.vercel.app';
  const webhookSecret = process.env.OVERTIME_INTAKE_WEBHOOK_SECRET;

  const url = `${baseUrl}/api/webhooks/overtime-intake`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: webhookSecret ? { 'x-webhook-secret': webhookSecret } : {},
    });

    if (response.ok) {
      const data = await response.json();
      log({
        name: 'Webhook Endpoint',
        status: 'pass',
        message: `Accessible at ${url}`,
        details: {
          status: data.status,
          treatmentTypes: data.treatmentTypes,
          clinicIsolation: data.clinicIsolation,
        },
      });
    } else {
      log({
        name: 'Webhook Endpoint',
        status: 'warn',
        message: `HTTP ${response.status} - may need authentication`,
      });
    }
  } catch (error) {
    log({
      name: 'Webhook Endpoint',
      status: 'warn',
      message: `Could not reach ${url} - ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: {
        note: 'This is expected in local development without the server running',
      },
    });
  }
}

async function checkRecentIntakes(clinicId: number | null) {
  if (!clinicId) return;

  console.log('\n📈 Recent Intake Stats...\n');

  try {
    const recentPatients = await prisma.patient.count({
      where: {
        clinicId,
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        },
      },
    });

    const totalPatients = await prisma.patient.count({
      where: { clinicId },
    });

    const recentDocs = await prisma.patientDocument.count({
      where: {
        clinicId,
        category: 'MEDICAL_INTAKE_FORM',
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
    });

    log({
      name: 'Recent Activity',
      status: 'pass',
      message: `${recentPatients} new patients in last 7 days`,
      details: {
        totalPatients,
        recentPatients,
        recentIntakeForms: recentDocs,
      },
    });
  } catch (error) {
    log({
      name: 'Recent Activity',
      status: 'warn',
      message: `Could not fetch stats: ${error instanceof Error ? error.message : 'Unknown'}`,
    });
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('       OVERTIME MEN\'S CLINIC INTEGRATION VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════════');

  const clinic = await checkClinic();
  checkEnvVars(clinic?.id ?? null);
  await checkAirtableConnection();
  await checkWebhookEndpoint();
  await checkRecentIntakes(clinic?.id ?? null);

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                         SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const passed = results.filter((r) => r.status === 'pass').length;
  const warnings = results.filter((r) => r.status === 'warn').length;
  const failed = results.filter((r) => r.status === 'fail').length;

  console.log(`✅ Passed:   ${passed}`);
  console.log(`⚠️  Warnings: ${warnings}`);
  console.log(`❌ Failed:   ${failed}`);

  if (failed > 0) {
    console.log('\n🔴 CRITICAL ISSUES FOUND - Integration may not work correctly!\n');
    results
      .filter((r) => r.status === 'fail')
      .forEach((r) => {
        console.log(`   - ${r.name}: ${r.message}`);
      });
    process.exit(1);
  } else if (warnings > 0) {
    console.log('\n🟡 Setup is functional but has warnings.\n');
    process.exit(0);
  } else {
    console.log('\n🟢 All checks passed! Integration is ready.\n');
    process.exit(0);
  }
}

main()
  .catch((e) => {
    console.error('Verification script failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
