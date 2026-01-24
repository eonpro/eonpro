/**
 * Create Wellmedr Clinic in the database
 * Run with: npx ts-node scripts/create-wellmedr-clinic.ts
 * Or via Vercel: Add to a one-time API endpoint
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Checking for Wellmedr clinic...');
  
  // Check if clinic already exists
  const existing = await prisma.clinic.findFirst({
    where: {
      OR: [
        { subdomain: 'wellmedr' },
        { subdomain: { contains: 'wellmedr', mode: 'insensitive' } },
        { name: { contains: 'Wellmedr', mode: 'insensitive' } },
      ],
    },
  });

  if (existing) {
    console.log('✅ Wellmedr clinic already exists:');
    console.log(`   ID: ${existing.id}`);
    console.log(`   Name: ${existing.name}`);
    console.log(`   Subdomain: ${existing.subdomain}`);
    console.log(`   Email: ${existing.email}`);
    return existing;
  }

  console.log('Creating Wellmedr clinic...');
  
  const clinic = await prisma.clinic.create({
    data: {
      name: 'Wellmedr',
      subdomain: 'wellmedr',
      email: 'admin@wellmedr.com',
      phone: '0000000000',
      address1: '',
      city: '',
      state: '',
      zip: '',
      settings: {
        intakeUrl: 'https://intake.wellmedr.com',
        specialty: 'GLP-1 Weight Loss',
        webhookEnabled: true,
      },
    },
  });

  console.log('✅ Wellmedr clinic created:');
  console.log(`   ID: ${clinic.id}`);
  console.log(`   Name: ${clinic.name}`);
  console.log(`   Subdomain: ${clinic.subdomain}`);
  
  // Also create the patient counter for this clinic
  console.log('Creating patient counter for Wellmedr...');
  await prisma.patientCounter.create({
    data: {
      clinicId: clinic.id,
      current: 0,
    },
  });
  console.log('✅ Patient counter created');

  return clinic;
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
