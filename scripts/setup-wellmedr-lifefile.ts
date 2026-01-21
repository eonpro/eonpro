/**
 * Setup Wellmedr Lifefile Credentials
 * Run with: npx ts-node scripts/setup-wellmedr-lifefile.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Setting up Wellmedr Lifefile credentials...\n');

  // Find Wellmedr clinic
  const wellmedr = await prisma.clinic.findFirst({
    where: {
      OR: [
        { name: { contains: 'Wellmedr', mode: 'insensitive' } },
        { name: { contains: 'WELLMEDR', mode: 'insensitive' } },
        { subdomain: { contains: 'wellmedr', mode: 'insensitive' } },
      ]
    }
  });

  if (!wellmedr) {
    console.log('❌ Wellmedr clinic not found!');
    console.log('Please create it first in Super Admin → Clinics → New Clinic');
    console.log('Then run this script again.\n');
    
    // List existing clinics
    const clinics = await prisma.clinic.findMany({
      select: { id: true, name: true, subdomain: true }
    });
    console.log('Existing clinics:');
    clinics.forEach(c => console.log(`  - ID: ${c.id}, Name: ${c.name}, Subdomain: ${c.subdomain}`));
    return;
  }

  console.log(`Found Wellmedr clinic: ID=${wellmedr.id}, Name="${wellmedr.name}"\n`);

  // Update with Lifefile credentials
  const updated = await prisma.clinic.update({
    where: { id: wellmedr.id },
    data: {
      lifefileEnabled: true,
      lifefileBaseUrl: 'https://host47a.lifefile.net:10165/lfapi/v1',
      lifefileUsername: 'api11596-4',
      lifefilePassword: '8+?QEFGWA(,TUP?[ZWZK',
      lifefileVendorId: '11596',
      lifefilePracticeId: '1270306',
      lifefileLocationId: '110396',
      lifefileNetworkId: '1594',
      lifefilePracticeName: 'WELLMEDR LLC',
      // Keep existing address/phone/fax if set, or leave empty for manual entry
    }
  });

  console.log('✅ Updated Wellmedr Lifefile credentials!\n');
  console.log('Configuration:');
  console.log('  - Lifefile Enabled:', updated.lifefileEnabled);
  console.log('  - Base URL:', updated.lifefileBaseUrl);
  console.log('  - Username:', updated.lifefileUsername);
  console.log('  - Practice ID:', updated.lifefilePracticeId);
  console.log('  - Practice Name:', updated.lifefilePracticeName);
  console.log('  - Vendor ID:', updated.lifefileVendorId);
  console.log('  - Location ID:', updated.lifefileLocationId);
  console.log('  - Network ID:', updated.lifefileNetworkId);
  
  console.log('\n⚠️  Remember to set Practice Address, Phone, and Fax in Super Admin if not already set!');
  console.log('\n✅ Wellmedr is now configured for Lifefile prescriptions!');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
