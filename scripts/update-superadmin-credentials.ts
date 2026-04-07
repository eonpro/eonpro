/**
 * Update Super Admin Credentials
 *
 * Changes the superadmin email and password in the database.
 *
 * Usage:
 *   NEW_ADMIN_EMAIL="admin@eonpro.io" NEW_ADMIN_PASSWORD="YourPassword" npx tsx scripts/update-superadmin-credentials.ts
 *
 * If no env vars are provided, defaults to admin@eonpro.io for email (password is always required).
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const newEmail = process.env.NEW_ADMIN_EMAIL || 'admin@eonpro.io';
  const newPassword = process.env.NEW_ADMIN_PASSWORD;

  if (!newPassword) {
    console.error('❌ NEW_ADMIN_PASSWORD environment variable is required.');
    console.log(
      '\nUsage:\n  NEW_ADMIN_PASSWORD="YourPassword" npx tsx scripts/update-superadmin-credentials.ts'
    );
    process.exit(1);
  }

  console.log('🔍 Looking for existing super admin user...\n');

  const existingAdmin = await prisma.user.findFirst({
    where: {
      OR: [
        { role: 'SUPER_ADMIN' },
        { email: 'admin@eonmedical.com' },
        { email: 'admin@eonpro.com' },
        { email: 'admin@eonpro.io' },
      ],
    },
    select: { id: true, email: true, role: true, clinicId: true },
  });

  if (!existingAdmin) {
    console.error('❌ No super admin user found in the database.');
    process.exit(1);
  }

  console.log(`   Found: ID=${existingAdmin.id}, email=${existingAdmin.email}, role=${existingAdmin.role}`);

  const hashedPassword = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id: existingAdmin.id },
    data: {
      email: newEmail,
      passwordHash: hashedPassword,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastPasswordChange: new Date(),
    },
  });

  console.log(`\n✅ Super admin credentials updated successfully!`);
  console.log(`   Email:    ${newEmail}`);
  console.log(`   Password: ${'*'.repeat(newPassword.length)}`);
  console.log(`   Role:     SUPER_ADMIN`);
}

main()
  .catch((err) => {
    console.error('\n❌ Error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
