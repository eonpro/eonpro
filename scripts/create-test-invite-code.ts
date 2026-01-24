/**
 * Create a test clinic invite code for patient self-registration
 * Usage: npx tsx scripts/create-test-invite-code.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Find first active clinic
  const clinic = await prisma.clinic.findFirst({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true },
  });

  if (!clinic) {
    console.error('No active clinic found. Please create a clinic first.');
    process.exit(1);
  }

  console.log(`Found clinic: ${clinic.name} (ID: ${clinic.id})`);

  // Create invite code
  const code = 'WELCOME2024';
  
  const existingCode = await prisma.clinicInviteCode.findUnique({
    where: { code },
  });

  if (existingCode) {
    console.log(`Invite code '${code}' already exists.`);
    return;
  }

  const inviteCode = await prisma.clinicInviteCode.create({
    data: {
      clinicId: clinic.id,
      code,
      description: 'Test registration code',
      isActive: true,
      usageLimit: null, // unlimited
    },
  });

  console.log('');
  console.log('='.repeat(50));
  console.log('Test Clinic Invite Code Created!');
  console.log('='.repeat(50));
  console.log(`Code: ${inviteCode.code}`);
  console.log(`Clinic: ${clinic.name}`);
  console.log(`Status: Active`);
  console.log('='.repeat(50));
  console.log('');
  console.log('You can now use this code at /register to create a test patient account.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
