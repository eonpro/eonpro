/**
 * Seed a test affiliate account for demo purposes
 * Run with: npx tsx scripts/seed-test-affiliate.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const phone = '+15551234567';
  
  // Check if affiliate already exists
  let affiliate = await prisma.affiliate.findUnique({
    where: { phone }
  });

  if (affiliate) {
    console.log('Test affiliate already exists:');
    console.log(`  Phone: ${affiliate.phone}`);
    console.log(`  Name: ${affiliate.displayName}`);
    console.log(`  Code: ${affiliate.referralCode}`);
    return;
  }

  // Create the affiliate
  affiliate = await prisma.affiliate.create({
    data: {
      phone,
      displayName: 'Test Partner',
      email: 'testpartner@example.com',
      referralCode: 'TESTPARTNER',
      commissionRate: 10.0,
      tier: 'GOLD',
      status: 'ACTIVE',
    }
  });

  console.log('✅ Test affiliate created successfully!');
  console.log('');
  console.log('Login with this phone number:');
  console.log(`  Phone: ${phone.replace('+1', '')} (or just 5551234567)`);
  console.log('');
  console.log('Affiliate details:');
  console.log(`  Name: ${affiliate.displayName}`);
  console.log(`  Referral Code: ${affiliate.referralCode}`);
  console.log(`  Commission Rate: ${affiliate.commissionRate}%`);
  console.log(`  Tier: ${affiliate.tier}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
