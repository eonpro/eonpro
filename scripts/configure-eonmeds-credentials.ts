/**
 * Configure EONMEDS Clinic Credentials
 * 
 * This script sets up Lifefile pharmacy integration credentials for the EONMEDS clinic.
 * 
 * Usage:
 *   npx ts-node scripts/configure-eonmeds-credentials.ts
 * 
 * Required environment variables (add to .env.local or Vercel):
 *   LIFEFILE_BASE_URL
 *   LIFEFILE_USERNAME
 *   LIFEFILE_PASSWORD
 *   LIFEFILE_VENDOR_ID
 *   LIFEFILE_PRACTICE_ID
 *   LIFEFILE_LOCATION_ID
 *   LIFEFILE_NETWORK_ID
 *   LIFEFILE_PRACTICE_NAME (optional)
 *   LIFEFILE_PRACTICE_ADDRESS (optional)
 *   LIFEFILE_PRACTICE_PHONE (optional)
 *   LIFEFILE_PRACTICE_FAX (optional)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function configureEonmedsCredentials() {
  console.log('🔧 Configuring EONMEDS clinic credentials...\n');

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
    console.error('❌ EONMEDS clinic not found!');
    process.exit(1);
  }

  console.log(`✅ Found EONMEDS clinic: ID ${eonmeds.id}, Name: ${eonmeds.name}\n`);

  // Check for Lifefile credentials in environment
  const lifefileCredentials = {
    lifefileBaseUrl: process.env.LIFEFILE_BASE_URL,
    lifefileUsername: process.env.LIFEFILE_USERNAME,
    lifefilePassword: process.env.LIFEFILE_PASSWORD,
    lifefileVendorId: process.env.LIFEFILE_VENDOR_ID,
    lifefilePracticeId: process.env.LIFEFILE_PRACTICE_ID,
    lifefileLocationId: process.env.LIFEFILE_LOCATION_ID,
    lifefileNetworkId: process.env.LIFEFILE_NETWORK_ID,
    lifefilePracticeName: process.env.LIFEFILE_PRACTICE_NAME || 'EONMEDS',
    lifefilePracticeAddress: process.env.LIFEFILE_PRACTICE_ADDRESS,
    lifefilePracticePhone: process.env.LIFEFILE_PRACTICE_PHONE,
    lifefilePracticeFax: process.env.LIFEFILE_PRACTICE_FAX,
  };

  // Check required credentials
  const required = [
    'lifefileBaseUrl',
    'lifefileUsername',
    'lifefilePassword',
    'lifefileVendorId',
    'lifefilePracticeId',
    'lifefileLocationId',
    'lifefileNetworkId',
  ];

  const missing = required.filter(
    (key) => !lifefileCredentials[key as keyof typeof lifefileCredentials]
  );

  if (missing.length > 0) {
    console.error('❌ Missing required Lifefile credentials:');
    missing.forEach((key) => {
      const envKey = key.replace('lifefile', 'LIFEFILE_').toUpperCase();
      console.error(`   - ${envKey}`);
    });
    console.log('\n📝 Please add these environment variables to .env.local or Vercel.');
    process.exit(1);
  }

  console.log('📋 Credentials to configure:');
  console.log(`   Base URL: ${lifefileCredentials.lifefileBaseUrl}`);
  console.log(`   Username: ${lifefileCredentials.lifefileUsername}`);
  console.log(`   Vendor ID: ${lifefileCredentials.lifefileVendorId}`);
  console.log(`   Practice ID: ${lifefileCredentials.lifefilePracticeId}`);
  console.log(`   Location ID: ${lifefileCredentials.lifefileLocationId}`);
  console.log(`   Network ID: ${lifefileCredentials.lifefileNetworkId}`);
  console.log(`   Practice Name: ${lifefileCredentials.lifefilePracticeName}`);
  console.log('');

  // Update EONMEDS clinic with credentials
  const updated = await prisma.clinic.update({
    where: { id: eonmeds.id },
    data: {
      ...lifefileCredentials,
      lifefileEnabled: true,
    },
  });

  console.log('✅ EONMEDS clinic updated successfully!');
  console.log(`   Lifefile Enabled: ${updated.lifefileEnabled}`);
  console.log('');
  console.log('🎉 Done! EONMEDS clinic is now configured with Lifefile credentials.');
}

configureEonmedsCredentials()
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
