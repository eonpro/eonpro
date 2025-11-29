/**
 * Seed script to create test users for development
 * Run with: npx tsx scripts/seed-test-user.ts
 */

import { prisma } from '@/lib/db';
import { logger } from '../src/lib/logger';

import bcrypt from 'bcryptjs';

async function seedTestUsers() {
  logger.info('🌱 Seeding test users...');

  try {
    // Create Admin user
    const adminUser = await prisma.user.upsert({
      where: { email: 'admin@lifefile.com' },
      update: {},
      create: {
        email: 'admin@lifefile.com',
        passwordHash: await bcrypt.hash('admin123', 10),
        firstName: 'Test',
        lastName: 'Admin',
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });
    logger.info('✅ Created/Updated Admin user:', adminUser.email, 'ID:', adminUser.id);

    // Create Provider user
    const provider = await prisma.provider.upsert({
      where: { npi: '1234567890' },
      update: {},
      create: {
        npi: '1234567890',
        firstName: 'Test',
        lastName: 'Provider',
        email: 'provider@lifefile.com',
        phone: '555-0001',
      },
    });
    
    const providerUser = await prisma.user.upsert({
      where: { email: 'provider@lifefile.com' },
      update: {},
      create: {
        email: 'provider@lifefile.com',
        passwordHash: await bcrypt.hash('provider123', 10),
        firstName: 'Test',
        lastName: 'Provider',
        role: 'PROVIDER',
        status: 'ACTIVE',
        providerId: provider.id,
      },
    });
    logger.info('✅ Created/Updated Provider user:', providerUser.email, 'ID:', providerUser.id);

    logger.info('✅ Seeding completed successfully!');
  } catch (error) {
    logger.error('❌ Error seeding users:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedTestUsers()
  .catch((error) => {
    logger.error('Failed to seed database:', error);
    process.exit(1);
  });
