/**
 * Create EONMEDS Invite Code
 * 
 * Creates a default invite code for the EONMEDS clinic so patients can register.
 * 
 * Usage: npx ts-node scripts/create-eonmeds-invite-code.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Finding EONMEDS clinic...');
  
  // Find EONMEDS clinic
  const clinic = await prisma.clinic.findFirst({
    where: {
      OR: [
        { subdomain: 'eonmeds' },
        { name: { contains: 'EONMEDS', mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      name: true,
      subdomain: true,
    },
  });

  if (!clinic) {
    console.error('❌ EONMEDS clinic not found!');
    process.exit(1);
  }

  console.log(`✅ Found clinic: ${clinic.name} (ID: ${clinic.id}, subdomain: ${clinic.subdomain})`);

  // Check if invite code already exists
  const existingCode = await prisma.clinicInviteCode.findFirst({
    where: {
      clinicId: clinic.id,
      code: 'EONMEDS',
    },
  });

  if (existingCode) {
    console.log(`ℹ️  Invite code "EONMEDS" already exists for this clinic`);
    console.log(`   Active: ${existingCode.isActive}`);
    console.log(`   Usage: ${existingCode.usageCount}${existingCode.usageLimit ? `/${existingCode.usageLimit}` : ' (unlimited)'}`);
    
    // Ensure it's active
    if (!existingCode.isActive) {
      await prisma.clinicInviteCode.update({
        where: { id: existingCode.id },
        data: { isActive: true },
      });
      console.log('✅ Reactivated the invite code');
    }
    
    return;
  }

  // Create new invite code
  const inviteCode = await prisma.clinicInviteCode.create({
    data: {
      clinicId: clinic.id,
      code: 'EONMEDS',
      description: 'Default patient registration code',
      isActive: true,
      usageLimit: null, // Unlimited
    },
  });

  console.log(`✅ Created invite code "EONMEDS" (ID: ${inviteCode.id})`);
  console.log('');
  console.log('📋 Patients can now register using:');
  console.log('   URL: https://app.eonpro.io/register');
  console.log('   Clinic Code: EONMEDS');
}

main()
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
