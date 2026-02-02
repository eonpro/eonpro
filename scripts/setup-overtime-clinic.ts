#!/usr/bin/env npx ts-node
/**
 * Setup Overtime Men's Clinic in the Database
 *
 * Creates the clinic with subdomain "ot" if it doesn't exist
 *
 * Usage:
 *   npx tsx scripts/setup-overtime-clinic.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('       OVERTIME MEN\'S CLINIC SETUP');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Check if clinic already exists
  const existingClinic = await prisma.clinic.findFirst({
    where: {
      OR: [
        { subdomain: 'ot' },
        { name: { contains: 'Overtime', mode: 'insensitive' } },
      ],
    },
  });

  if (existingClinic) {
    console.log('✅ Clinic already exists!\n');
    console.log(`   ID:        ${existingClinic.id}`);
    console.log(`   Name:      ${existingClinic.name}`);
    console.log(`   Subdomain: ${existingClinic.subdomain}`);
    console.log(`   Status:    ${existingClinic.status}`);

    // Update subdomain if needed
    if (existingClinic.subdomain !== 'ot') {
      console.log('\n⚠️  Subdomain is not "ot" - updating...');
      await prisma.clinic.update({
        where: { id: existingClinic.id },
        data: { subdomain: 'ot' },
      });
      console.log('✅ Subdomain updated to "ot"');
    }

    console.log('\n📋 Add this to your .env file:');
    console.log(`   OVERTIME_CLINIC_ID=${existingClinic.id}`);
    return;
  }

  // Create new clinic
  console.log('🏗️  Creating Overtime Men\'s Clinic...\n');

  const clinic = await prisma.clinic.create({
    data: {
      name: "Overtime Men's Clinic",
      subdomain: 'ot',
      status: 'ACTIVE',
      adminEmail: 'admin@otmenshealth.com',
      supportEmail: 'support@otmenshealth.com',
      timezone: 'America/New_York',
      settings: {
        theme: 'dark',
        primaryColor: '#1a1a2e',
        accentColor: '#4fa77e',
        logoText: 'OT Mens',
      },
      features: {
        weightLoss: true,
        betterSex: true,
        peptides: true,
        trt: true,
        nadPlus: true,
        baseline: true,
        soapNotes: true,
        affiliateTracking: true,
      },
      integrations: {
        heyflow: {
          enabled: true,
          baseId: process.env.OVERTIME_AIRTABLE_BASE_ID || '',
        },
        airtable: {
          enabled: true,
          baseId: process.env.OVERTIME_AIRTABLE_BASE_ID || '',
        },
      },
    },
  });

  console.log('✅ Clinic created successfully!\n');
  console.log(`   ID:        ${clinic.id}`);
  console.log(`   Name:      ${clinic.name}`);
  console.log(`   Subdomain: ${clinic.subdomain}`);
  console.log(`   Status:    ${clinic.status}`);

  // Create patient counter
  await prisma.patientCounter.create({
    data: {
      clinicId: clinic.id,
      current: 0,
    },
  });
  console.log('\n✅ Patient counter initialized');

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                    NEXT STEPS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('1. Add these environment variables to .env and Vercel:\n');
  console.log(`   OVERTIME_CLINIC_ID=${clinic.id}`);
  console.log('   OVERTIME_AIRTABLE_BASE_ID=apppl0Heha1sOti59');
  console.log('   AIRTABLE_API_KEY=pat...your-airtable-personal-access-token');
  console.log('   OVERTIME_INTAKE_WEBHOOK_SECRET=your-secure-secret-here');
  console.log('   OVERTIME_SYNC_API_KEY=your-sync-api-key');
  console.log('\n2. Run verification again:');
  console.log('   npm run verify:overtime\n');
}

main()
  .catch((e) => {
    console.error('Setup failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
