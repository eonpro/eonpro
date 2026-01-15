import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding production database...');

  // Create the main clinic
  const clinic = await prisma.clinic.upsert({
    where: { subdomain: 'eonpro' },
    update: {},
    create: {
      name: 'EONPRO Medical',
      subdomain: 'eonpro',
      status: 'ACTIVE',
      adminEmail: 'admin@eonpro.com',
      phone: '305-555-0100',
      timezone: 'America/New_York',
      primaryColor: '#14b8a6',
      secondaryColor: '#0d9488',
      billingPlan: 'enterprise',
      patientLimit: 10000,
      providerLimit: 100,
      storageLimit: 50000,
      settings: {
        currency: 'USD',
      },
      features: {
        prescriptions: true,
        telehealth: true,
        messaging: true,
        scheduling: true,
        billing: true,
        intakeForms: true,
        aiScribe: true,
      },
      integrations: {
        lifefile: false,
        stripe: false,
      },
      address: {
        address1: '123 Medical Center Dr',
        city: 'Miami',
        state: 'FL',
        zip: '33101',
        country: 'USA',
      },
    },
  });
  console.log(`✅ Created clinic: ${clinic.name} (ID: ${clinic.id})`);

  // Create admin user
  const hashedPassword = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@eonpro.com' },
    update: {},
    create: {
      email: 'admin@eonpro.com',
      passwordHash: hashedPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
      status: 'ACTIVE',
      clinicId: clinic.id,
    },
  });
  console.log(`✅ Created admin user: ${admin.email} (ID: ${admin.id})`);

  console.log('\n🎉 Production database seeded successfully!');
  console.log('\n📋 Login credentials:');
  console.log('   Email: admin@eonpro.com');
  console.log('   Password: admin123');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
