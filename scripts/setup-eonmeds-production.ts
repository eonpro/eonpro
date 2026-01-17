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
        lifefileBaseUrl: 'https://host47a.lifefile.net:10165/lfapi/v1',
        lifefileUsername: 'api11596-1',
        lifefilePassword: 'L3FW7KCK:6BE2QCVXZ31',
        lifefileVendorId: '11596',
        lifefilePracticeId: '1266794',
        lifefileLocationId: '110396',
        lifefileNetworkId: '1373',
        lifefilePracticeName: 'APOLLO BASED HEALTH LLC',
      },
    });
    
    console.log(`✅ Created EONMEDS clinic with ID: ${newClinic.id}`);
    return;
  }

  console.log(`✅ Found EONMEDS clinic: ID ${eonmeds.id}, Name: ${eonmeds.name}\n`);

  // Update EONMEDS clinic with Lifefile credentials
  const updated = await prisma.clinic.update({
    where: { id: eonmeds.id },
    data: {
      lifefileEnabled: true,
      lifefileBaseUrl: 'https://host47a.lifefile.net:10165/lfapi/v1',
      lifefileUsername: 'api11596-1',
      lifefilePassword: 'L3FW7KCK:6BE2QCVXZ31',
      lifefileVendorId: '11596',
      lifefilePracticeId: '1266794',
      lifefileLocationId: '110396',
      lifefileNetworkId: '1373',
      lifefilePracticeName: 'APOLLO BASED HEALTH LLC',
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
