/**
 * Setup EONMEDS Production Credentials
 * 
 * This script configures the EONMEDS clinic with Lifefile pharmacy credentials.
 * Run with: npx ts-node scripts/setup-eonmeds-production.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function setupEonmedsProduction() {
  console.log('🔧 Setting up EONMEDS production credentials...\n');

  // Find EONMEDS clinic
  const eonmeds = await prisma.clinic.findFirst({
    where: {
      OR: [
        { subdomain: 'eonmeds' },
        { name: { contains: 'EONMEDS', mode: 'insensitive' } },
      ],
    },
  });

  if (!eonmeds) {
    console.error('❌ EONMEDS clinic not found! Creating it...');
    
    // Create EONMEDS clinic if it doesn't exist
    const newClinic = await prisma.clinic.create({
      data: {
        name: 'EONMEDS',
        subdomain: 'eonmeds',
        adminEmail: 'italo@eonmeds.com',
        status: 'ACTIVE',
        settings: {},
        features: {},
        integrations: {},
        lifefileEnabled: true,
        lifefileBaseUrl: process.env.EONMEDS_LIFEFILE_BASE_URL,
        lifefileUsername: process.env.EONMEDS_LIFEFILE_USERNAME,
        lifefilePassword: process.env.EONMEDS_LIFEFILE_PASSWORD,
        lifefileVendorId: process.env.EONMEDS_LIFEFILE_VENDOR_ID,
        lifefilePracticeId: process.env.EONMEDS_LIFEFILE_PRACTICE_ID,
        lifefileLocationId: process.env.EONMEDS_LIFEFILE_LOCATION_ID,
        lifefileNetworkId: process.env.EONMEDS_LIFEFILE_NETWORK_ID,
        lifefilePracticeName: process.env.EONMEDS_LIFEFILE_PRACTICE_NAME || 'APOLLO BASED HEALTH LLC',
      },
    });
    
    console.log(`✅ Created EONMEDS clinic with ID: ${newClinic.id}`);
    return;
  }

  console.log(`✅ Found EONMEDS clinic: ID ${eonmeds.id}, Name: ${eonmeds.name}\n`);

  // SECURITY: Load credentials from environment variables
  const credentials = {
    lifefileBaseUrl: process.env.EONMEDS_LIFEFILE_BASE_URL,
    lifefileUsername: process.env.EONMEDS_LIFEFILE_USERNAME,
    lifefilePassword: process.env.EONMEDS_LIFEFILE_PASSWORD,
    lifefileVendorId: process.env.EONMEDS_LIFEFILE_VENDOR_ID,
    lifefilePracticeId: process.env.EONMEDS_LIFEFILE_PRACTICE_ID,
    lifefileLocationId: process.env.EONMEDS_LIFEFILE_LOCATION_ID,
    lifefileNetworkId: process.env.EONMEDS_LIFEFILE_NETWORK_ID,
    lifefilePracticeName: process.env.EONMEDS_LIFEFILE_PRACTICE_NAME || 'APOLLO BASED HEALTH LLC',
  };

  // Validate required credentials
  const requiredVars = ['lifefileBaseUrl', 'lifefileUsername', 'lifefilePassword', 'lifefileVendorId', 'lifefilePracticeId'];
  const missing = requiredVars.filter(v => !credentials[v as keyof typeof credentials]);
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables for EONMEDS:');
    missing.forEach(v => console.error(`  - EONMEDS_${v.toUpperCase().replace(/([A-Z])/g, '_$1')}`));
    console.error('\nPlease set these environment variables and try again.');
    process.exit(1);
  }

  // Update EONMEDS clinic with Lifefile credentials from environment
  const updated = await prisma.clinic.update({
    where: { id: eonmeds.id },
    data: {
      lifefileEnabled: true,
      ...credentials,
      lifefilePracticeAddress: null,
      lifefilePracticePhone: null,
      lifefilePracticeFax: null,
    },
  });

  console.log('✅ EONMEDS clinic updated with Lifefile credentials!');
  console.log(`   Lifefile Enabled: ${updated.lifefileEnabled}`);
  console.log(`   Base URL: ${updated.lifefileBaseUrl}`);
  console.log(`   Practice Name: ${updated.lifefilePracticeName}`);
  console.log(`   Location ID: ${updated.lifefileLocationId}`);
  console.log('');
  console.log('🎉 Done! EONMEDS can now send prescriptions to Lifefile.');
}

setupEonmedsProduction()
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
