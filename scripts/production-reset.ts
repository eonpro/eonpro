/**
 * Production Reset Script
 * - Removes all test/dummy data
 * - Resets super admin credentials
 * 
 * Run with: npx tsx scripts/production-reset.ts
 * 
 * REQUIRED ENV VARS:
 * - DATABASE_URL: PostgreSQL connection string
 * - NEW_ADMIN_PASSWORD: New password for super admin (min 12 chars)
 * - NEW_ADMIN_EMAIL: (optional) New email for super admin
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

// Test data patterns to remove
const TEST_EMAIL_PATTERNS = [
  '%test%',
  '%demo%',
  '%example.com',
  '%fake%',
  '%dummy%',
  '%sample%',
  'admin@lifefile.com',
  'provider@lifefile.com',
];

const TEST_NAME_PATTERNS = [
  'Test %',
  'Demo %',
  'Sample %',
  'Dummy %',
  'Fake %',
  '% Test',
  '% Demo',
];

async function main() {
  console.log('🚀 EONPRO Production Reset Script');
  console.log('================================\n');

  // Validate environment
  const newPassword = process.env.NEW_ADMIN_PASSWORD;
  const newEmail = process.env.NEW_ADMIN_EMAIL || 'admin@eonpro.com';

  if (!newPassword) {
    console.error('❌ ERROR: NEW_ADMIN_PASSWORD environment variable is required');
    console.log('\nUsage:');
    console.log('  NEW_ADMIN_PASSWORD="YourSecurePassword123!" npx tsx scripts/production-reset.ts');
    process.exit(1);
  }

  if (newPassword.length < 12) {
    console.error('❌ ERROR: Password must be at least 12 characters');
    process.exit(1);
  }

  // Password strength check
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasLower = /[a-z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);

  if (!hasUpper || !hasLower || !hasNumber || !hasSpecial) {
    console.error('❌ ERROR: Password must contain uppercase, lowercase, number, and special character');
    process.exit(1);
  }

  console.log('🔗 Connecting to database...\n');
  await prisma.$connect();

  // ============================================
  // STEP 1: Remove Test/Dummy Data
  // ============================================
  console.log('🧹 STEP 1: Removing test/dummy data...\n');

  // Count before cleanup
  const beforeCounts = {
    patients: await prisma.patient.count(),
    providers: await prisma.provider.count(),
    orders: await prisma.order.count(),
    users: await prisma.user.count(),
  };

  console.log('📊 Current record counts:');
  console.log(`   Patients: ${beforeCounts.patients}`);
  console.log(`   Providers: ${beforeCounts.providers}`);
  console.log(`   Orders: ${beforeCounts.orders}`);
  console.log(`   Users: ${beforeCounts.users}\n`);

  // Delete test patients (and cascading data)
  let deletedPatients = 0;
  for (const pattern of TEST_EMAIL_PATTERNS) {
    const result = await prisma.patient.deleteMany({
      where: {
        OR: [
          { email: { contains: pattern.replace(/%/g, ''), mode: 'insensitive' } },
        ],
      },
    });
    deletedPatients += result.count;
  }

  for (const pattern of TEST_NAME_PATTERNS) {
    const searchTerm = pattern.replace(/%/g, '').trim();
    const result = await prisma.patient.deleteMany({
      where: {
        OR: [
          { firstName: { contains: searchTerm, mode: 'insensitive' } },
          { lastName: { contains: searchTerm, mode: 'insensitive' } },
        ],
      },
    });
    deletedPatients += result.count;
  }
  console.log(`   ✓ Deleted ${deletedPatients} test patients`);

  // Delete test providers
  let deletedProviders = 0;
  for (const pattern of TEST_EMAIL_PATTERNS) {
    const result = await prisma.provider.deleteMany({
      where: {
        email: { contains: pattern.replace(/%/g, ''), mode: 'insensitive' },
      },
    });
    deletedProviders += result.count;
  }
  console.log(`   ✓ Deleted ${deletedProviders} test providers`);

  // Delete test users (except main admin)
  let deletedUsers = 0;
  for (const pattern of TEST_EMAIL_PATTERNS) {
    const result = await prisma.user.deleteMany({
      where: {
        AND: [
          { email: { contains: pattern.replace(/%/g, ''), mode: 'insensitive' } },
          { email: { not: newEmail } },
        ],
      },
    });
    deletedUsers += result.count;
  }
  console.log(`   ✓ Deleted ${deletedUsers} test users`);

  // Delete orphaned orders (no valid patient)
  const orphanedOrders = await prisma.order.deleteMany({
    where: {
      patient: null,
    },
  });
  console.log(`   ✓ Deleted ${orphanedOrders.count} orphaned orders`);

  // Delete old intake form submissions from test data
  const oldIntakes = await prisma.intakeFormSubmission.deleteMany({
    where: {
      OR: [
        { patientEmail: { contains: 'test', mode: 'insensitive' } },
        { patientEmail: { contains: 'demo', mode: 'insensitive' } },
        { patientEmail: { contains: 'example.com', mode: 'insensitive' } },
      ],
    },
  });
  console.log(`   ✓ Deleted ${oldIntakes.count} test intake submissions`);

  // ============================================
  // STEP 2: Reset Super Admin Credentials
  // ============================================
  console.log('\n🔐 STEP 2: Resetting super admin credentials...\n');

  const hashedPassword = await bcrypt.hash(newPassword, 12);

  // Find or create super admin
  const existingAdmin = await prisma.user.findFirst({
    where: {
      OR: [
        { role: 'SUPER_ADMIN' },
        { role: 'ADMIN' },
        { email: 'admin@eonpro.com' },
      ],
    },
  });

  if (existingAdmin) {
    // Update existing admin
    await prisma.user.update({
      where: { id: existingAdmin.id },
      data: {
        email: newEmail,
        passwordHash: hashedPassword,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        firstName: 'System',
        lastName: 'Administrator',
        twoFactorEnabled: false,
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastPasswordChange: new Date(),
      },
    });
    console.log(`   ✓ Updated existing admin (ID: ${existingAdmin.id})`);
  } else {
    // Get or create default clinic
    let clinic = await prisma.clinic.findFirst({
      where: { status: 'ACTIVE' },
    });

    if (!clinic) {
      clinic = await prisma.clinic.create({
        data: {
          name: 'EONPRO Medical',
          subdomain: 'eonpro',
          status: 'ACTIVE',
          adminEmail: newEmail,
          timezone: 'America/New_York',
        },
      });
      console.log(`   ✓ Created default clinic (ID: ${clinic.id})`);
    }

    // Create new super admin
    const newAdmin = await prisma.user.create({
      data: {
        email: newEmail,
        passwordHash: hashedPassword,
        firstName: 'System',
        lastName: 'Administrator',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        clinicId: clinic.id,
        twoFactorEnabled: false,
        lastPasswordChange: new Date(),
      },
    });
    console.log(`   ✓ Created new super admin (ID: ${newAdmin.id})`);
  }

  // ============================================
  // STEP 3: Cleanup & Verification
  // ============================================
  console.log('\n✅ STEP 3: Verification...\n');

  const afterCounts = {
    patients: await prisma.patient.count(),
    providers: await prisma.provider.count(),
    orders: await prisma.order.count(),
    users: await prisma.user.count(),
  };

  console.log('📊 Final record counts:');
  console.log(`   Patients: ${afterCounts.patients} (removed ${beforeCounts.patients - afterCounts.patients})`);
  console.log(`   Providers: ${afterCounts.providers} (removed ${beforeCounts.providers - afterCounts.providers})`);
  console.log(`   Orders: ${afterCounts.orders} (removed ${beforeCounts.orders - afterCounts.orders})`);
  console.log(`   Users: ${afterCounts.users} (removed ${beforeCounts.users - afterCounts.users})`);

  // ============================================
  // FINAL OUTPUT
  // ============================================
  console.log('\n' + '='.repeat(50));
  console.log('🎉 PRODUCTION RESET COMPLETE!');
  console.log('='.repeat(50));
  console.log('\n📋 Super Admin Credentials:');
  console.log(`   Email:    ${newEmail}`);
  console.log(`   Password: ${'*'.repeat(newPassword.length)} (as provided)`);
  console.log(`   Role:     SUPER_ADMIN`);
  console.log('\n⚠️  IMPORTANT:');
  console.log('   1. Save these credentials securely');
  console.log('   2. Enable 2FA after first login');
  console.log('   3. Consider rotating this password in 90 days');
  console.log('   4. Delete this script output from terminal history\n');
}

main()
  .catch((error) => {
    console.error('\n❌ Error during production reset:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
