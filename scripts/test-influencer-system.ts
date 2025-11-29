#!/usr/bin/env npx tsx
import { PrismaClient } from '@prisma/client';
import { logger } from '../src/lib/logger';

import bcrypt from 'bcryptjs';
import { processCommission, getInfluencerStats } from '../src/services/influencerService';

const prisma = new PrismaClient();

async function main() {
  logger.info('\n=== Testing Influencer Referral System ===\n');

  try {
    // 1. Create a test influencer
    logger.info('1. Creating test influencer...');
    const passwordHash = await bcrypt.hash('test123', 10);
    
    let influencer = await prisma.influencer.findUnique({
      where: { email: 'test.influencer@example.com' }
    });

    if (!influencer) {
      influencer = await prisma.influencer.create({
        data: {
          name: 'Test Influencer',
          email: 'test.influencer@example.com',
          promoCode: 'TEST2024',
          commissionRate: 0.10,
          passwordHash,
          status: 'ACTIVE',
        },
      });
      logger.info('   ✅ Created test influencer:', influencer.promoCode);
    } else {
      logger.info('   ℹ️ Test influencer already exists:', influencer.promoCode);
    }

    // 2. Simulate a patient referred by influencer
    logger.info('\n2. Creating referred patient...');
    const patient = await prisma.patient.create({
      data: {
        firstName: 'John',
        lastName: 'Referred',
        email: `john.referred.${Date.now()}@example.com`,
        phone: '5555551234',
        dob: '1990-01-01',
        gender: 'M',
        address1: '123 Test St',
        city: 'Test City',
        state: 'TX',
        zip: '12345',
        tags: ['influencer:TEST2024'],
      },
    });
    logger.info('   ✅ Created patient:', patient.firstName, patient.lastName);

    // 3. Create referral tracking
    logger.info('\n3. Creating referral tracking...');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);
    
    const referral = await prisma.referralTracking.create({
      data: {
        patientId: patient.id,
        influencerId: influencer.id,
        promoCode: influencer.promoCode,
        referralSource: 'test-script',
        referralExpiresAt: expiresAt,
        metadata: {
          testRun: true,
          createdBy: 'test-script'
        }
      },
    });
    logger.info('   ✅ Created referral tracking, expires:', expiresAt.toLocaleDateString());

    // 4. Create a paid invoice for the patient
    logger.info('\n4. Creating paid invoice...');
    const invoice = await prisma.invoice.create({
      data: {
        patientId: patient.id,
        stripeInvoiceId: `test_inv_${Date.now()}`,
        stripeInvoiceNumber: `TEST-${Date.now()}`,
        description: 'Test Weight Loss Program',
        amountDue: 29900, // $299.00
        amountPaid: 29900,
        status: 'PAID',
        paidAt: new Date(),
      },
    });
    logger.info('   ✅ Created paid invoice for $299.00');

    // 5. Process commission
    logger.info('\n5. Processing commission...');
    const commission = await processCommission(invoice.id);
    
    if (commission) {
      logger.info('   ✅ Commission created:');
      logger.info('      Amount: $' + (commission.commissionAmount / 100).toFixed(2));
      logger.info('      Status:', commission.status);
    } else {
      logger.info('   ⚠️ No commission created (might already exist)');
    }

    // 6. Fetch influencer stats
    logger.info('\n6. Fetching influencer statistics...');
    const stats = await getInfluencerStats(influencer.id);
    
    logger.info('   📊 Influencer Stats:');
    logger.info('      Total Referrals:', stats.totalReferrals);
    logger.info('      Converted:', stats.convertedReferrals);
    logger.info('      Conversion Rate:', stats.conversionRate.toFixed(1) + '%');
    logger.info('      Pending Earnings: $' + (stats.pendingCommissions.amount / 100).toFixed(2));
    logger.info('      Total Earnings: $' + (stats.totalEarnings / 100).toFixed(2));

    logger.info('\n✅ Test completed successfully!');
    logger.info('\n📱 Test the dashboard:');
    logger.info('   URL: http://localhost:3005/influencer/login');
    logger.info('   Email: test.influencer@example.com');
    logger.info('   Password: test123');

  } catch (error: any) {
    logger.error('\n❌ Test failed:', error.message);
    logger.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
