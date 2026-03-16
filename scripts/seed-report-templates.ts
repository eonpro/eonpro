/**
 * Seed System Report Templates
 *
 * Creates the pre-built report templates that appear in the Report Center
 * under "System Reports". These are read-only templates available to all users.
 *
 * Usage: npx tsx scripts/seed-report-templates.ts
 *        npx tsx scripts/seed-report-templates.ts --force  (recreate even if they exist)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SYSTEM_TEMPLATES = [
  {
    name: 'Payroll Summary',
    description: 'Sales rep commission summary for payroll processing. Includes direct commissions, override commissions, base salary, and combined totals grouped by rep.',
    dataSource: 'commissions',
    config: {
      columns: ['salesRepName', 'clinicName', 'revenue', 'commission', 'baseCommission', 'status', 'isRecurring', 'type'],
      groupBy: 'salesRepName',
      sortBy: 'commission',
      sortDir: 'desc',
      chartType: 'bar',
      datePreset: '30d',
    },
    accessRoles: ['super_admin', 'admin'],
  },
  {
    name: 'Revenue by Period',
    description: 'Payment revenue trends over time. Track gross revenue, refunds, and payment success rates by month, week, or custom period.',
    dataSource: 'revenue',
    config: {
      columns: ['date', 'clinicName', 'amount', 'status', 'paymentMethod', 'refundedAmount', 'hasSubscription'],
      groupBy: 'month',
      sortBy: 'amount',
      sortDir: 'desc',
      chartType: 'line',
      datePreset: '90d',
    },
    accessRoles: ['super_admin', 'admin'],
  },
  {
    name: 'Patient Acquisition Funnel',
    description: 'Patient intake sources and conversion rates. See which referral channels, sales reps, and clinics drive the most paying patients.',
    dataSource: 'patients',
    config: {
      columns: ['date', 'clinicName', 'source', 'profileStatus', 'salesRepName', 'hasPayment'],
      groupBy: 'source',
      sortBy: 'date',
      sortDir: 'desc',
      chartType: 'pie',
      datePreset: '30d',
    },
    accessRoles: ['super_admin', 'admin'],
  },
  {
    name: 'Shipping Status Report',
    description: 'Shipment tracking and delivery performance. Monitor in-transit packages, delivery rates, exceptions, and carrier performance.',
    dataSource: 'fulfillment',
    config: {
      columns: ['date', 'clinicName', 'trackingNumber', 'carrier', 'status', 'source', 'daysInTransit'],
      groupBy: 'status',
      sortBy: 'date',
      sortDir: 'desc',
      chartType: 'bar',
      datePreset: '30d',
    },
    accessRoles: ['super_admin', 'admin'],
  },
  {
    name: 'Provider Utilization',
    description: 'Appointment completion rates, no-show tracking, telehealth usage, and SOAP note completion by provider.',
    dataSource: 'provider',
    config: {
      columns: ['providerName', 'clinicName', 'appointmentType', 'appointmentStatus', 'duration', 'hasSoapNote', 'isTelehealth'],
      groupBy: 'providerName',
      sortBy: 'date',
      sortDir: 'desc',
      chartType: 'bar',
      datePreset: '30d',
    },
    accessRoles: ['super_admin', 'admin', 'provider'],
  },
  {
    name: 'Subscription Health',
    description: 'Active subscriptions, churn rate, MRR, and billing cycle health. Track subscription lifecycle and identify at-risk patients.',
    dataSource: 'subscriptions',
    config: {
      columns: ['clinicName', 'status', 'amount', 'interval', 'currentPeriodEnd', 'failedAttempts', 'daysSinceStart'],
      groupBy: 'status',
      sortBy: 'amount',
      sortDir: 'desc',
      chartType: 'pie',
      datePreset: '',
    },
    accessRoles: ['super_admin', 'admin'],
  },
  {
    name: 'Affiliate Performance',
    description: 'Affiliate commission events and revenue contribution. Track which affiliates drive the most revenue and their commission earnings.',
    dataSource: 'affiliates',
    config: {
      columns: ['date', 'affiliateId', 'clinicName', 'revenue', 'commission', 'status', 'isRecurring'],
      groupBy: 'affiliateId',
      sortBy: 'commission',
      sortDir: 'desc',
      chartType: 'bar',
      datePreset: '30d',
    },
    accessRoles: ['super_admin', 'admin'],
  },
];

async function main() {
  const force = process.argv.includes('--force');

  console.log('=== Seeding System Report Templates ===\n');

  // Need a system user to create templates — use the first super_admin
  const systemUser = await prisma.user.findFirst({
    where: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
    select: { id: true },
  });

  if (!systemUser) {
    console.error('Error: No active super_admin user found. Create one first.');
    process.exit(1);
  }

  console.log(`Using system user ID: ${systemUser.id}\n`);

  let created = 0;
  let skipped = 0;

  for (const tmpl of SYSTEM_TEMPLATES) {
    const existing = await prisma.reportTemplate.findFirst({
      where: { name: tmpl.name, isSystemTemplate: true },
    });

    if (existing && !force) {
      console.log(`  SKIP: "${tmpl.name}" (already exists, ID: ${existing.id})`);
      skipped++;
      continue;
    }

    if (existing && force) {
      await prisma.reportTemplate.delete({ where: { id: existing.id } });
      console.log(`  DELETE: "${tmpl.name}" (ID: ${existing.id}) — will recreate`);
    }

    const template = await prisma.reportTemplate.create({
      data: {
        name: tmpl.name,
        description: tmpl.description,
        dataSource: tmpl.dataSource,
        config: tmpl.config,
        isSystemTemplate: true,
        isShared: true,
        accessRoles: tmpl.accessRoles,
        createdById: systemUser.id,
        clinicId: null,
      },
    });

    console.log(`  CREATE: "${tmpl.name}" (ID: ${template.id})`);
    created++;
  }

  console.log(`\n=== Done ===`);
  console.log(`  Created: ${created}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Total:   ${SYSTEM_TEMPLATES.length}\n`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  prisma.$disconnect();
  process.exit(1);
});
