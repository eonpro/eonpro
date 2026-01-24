/**
 * Affiliate Portal Demo Seed Script
 * 
 * Creates demo data for testing the affiliate portal:
 * - A clinic (if not exists)
 * - An affiliate user with login credentials
 * - Ref codes
 * - A commission plan
 * - Simulated commission events
 * 
 * Usage:
 *   npx ts-node scripts/seed-affiliate-demo.ts
 *   # or
 *   npx tsx scripts/seed-affiliate-demo.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting Affiliate Portal Demo Seed...\n');

  // ============================================================================
  // 1. Create or find a clinic
  // ============================================================================
  let clinic = await prisma.clinic.findFirst({
    where: { subdomain: 'demo-clinic' }
  });

  if (!clinic) {
    console.log('📍 Creating demo clinic...');
    clinic = await prisma.clinic.create({
      data: {
        name: 'Demo Clinic',
        subdomain: 'demo-clinic',
        status: 'ACTIVE',
        adminEmail: 'admin@demo-clinic.com',
        primaryColor: '#8B5CF6',
        secondaryColor: '#7C3AED',
        settings: {
          affiliatePortal: {
            showPerformanceChart: true,
            showRefCodeManager: true,
            showPayoutHistory: true,
            showResources: true,
          }
        },
        features: {},
        integrations: {},
        billingPlan: 'starter',
        patientLimit: 1000,
        providerLimit: 10,
        storageLimit: 10000,
      }
    });
    console.log(`   ✅ Created clinic: ${clinic.name} (ID: ${clinic.id})`);
  } else {
    console.log(`   ℹ️  Using existing clinic: ${clinic.name} (ID: ${clinic.id})`);
  }

  // ============================================================================
  // 2. Create affiliate user
  // ============================================================================
  const affiliateEmail = 'affiliate@demo.com';
  const affiliatePassword = 'affiliate123'; // For demo only!

  let affiliateUser = await prisma.user.findUnique({
    where: { email: affiliateEmail }
  });

  if (!affiliateUser) {
    console.log('\n👤 Creating affiliate user...');
    const passwordHash = await bcrypt.hash(affiliatePassword, 12);
    
    affiliateUser = await prisma.user.create({
      data: {
        email: affiliateEmail,
        passwordHash,
        firstName: 'Demo',
        lastName: 'Affiliate',
        role: 'AFFILIATE',
        clinicId: clinic.id,
        status: 'ACTIVE',
      }
    });
    console.log(`   ✅ Created user: ${affiliateEmail}`);
    console.log(`   🔑 Password: ${affiliatePassword}`);
  } else {
    console.log(`   ℹ️  Using existing user: ${affiliateEmail}`);
  }

  // ============================================================================
  // 3. Create affiliate profile
  // ============================================================================
  let affiliate = await prisma.affiliate.findUnique({
    where: { userId: affiliateUser.id }
  });

  if (!affiliate) {
    console.log('\n🤝 Creating affiliate profile...');
    affiliate = await prisma.affiliate.create({
      data: {
        clinicId: clinic.id,
        userId: affiliateUser.id,
        displayName: 'Demo Partner',
        status: 'ACTIVE',
        metadata: {
          company: 'Demo Marketing Inc',
          website: 'https://demo-partner.com',
        }
      }
    });
    console.log(`   ✅ Created affiliate: ${affiliate.displayName} (ID: ${affiliate.id})`);
  } else {
    console.log(`   ℹ️  Using existing affiliate: ${affiliate.displayName} (ID: ${affiliate.id})`);
  }

  // ============================================================================
  // 4. Create ref codes
  // ============================================================================
  const refCodes = ['DEMOPARTNER', 'SUMMER2026', 'INFL_DEMO'];
  
  console.log('\n🔗 Creating ref codes...');
  for (const code of refCodes) {
    const existing = await prisma.affiliateRefCode.findUnique({
      where: {
        clinicId_refCode: {
          clinicId: clinic.id,
          refCode: code,
        }
      }
    });

    if (!existing) {
      await prisma.affiliateRefCode.create({
        data: {
          clinicId: clinic.id,
          affiliateId: affiliate.id,
          refCode: code,
          description: `Demo ref code: ${code}`,
          isActive: true,
        }
      });
      console.log(`   ✅ Created ref code: ${code}`);
    } else {
      console.log(`   ℹ️  Ref code exists: ${code}`);
    }
  }

  // ============================================================================
  // 5. Create commission plan
  // ============================================================================
  let commissionPlan = await prisma.affiliateCommissionPlan.findFirst({
    where: {
      clinicId: clinic.id,
      name: 'Standard 10%',
    }
  });

  if (!commissionPlan) {
    console.log('\n💰 Creating commission plan...');
    commissionPlan = await prisma.affiliateCommissionPlan.create({
      data: {
        clinicId: clinic.id,
        name: 'Standard 10%',
        description: 'Standard affiliate commission: 10% of first payment',
        planType: 'PERCENT',
        percentBps: 1000, // 10%
        appliesTo: 'FIRST_PAYMENT_ONLY',
        holdDays: 7,
        clawbackEnabled: true,
        isActive: true,
      }
    });
    console.log(`   ✅ Created plan: ${commissionPlan.name} (ID: ${commissionPlan.id})`);
  } else {
    console.log(`   ℹ️  Using existing plan: ${commissionPlan.name} (ID: ${commissionPlan.id})`);
  }

  // ============================================================================
  // 6. Assign commission plan to affiliate
  // ============================================================================
  const existingAssignment = await prisma.affiliatePlanAssignment.findFirst({
    where: {
      affiliateId: affiliate.id,
      commissionPlanId: commissionPlan.id,
      effectiveTo: null,
    }
  });

  if (!existingAssignment) {
    console.log('\n📋 Assigning commission plan to affiliate...');
    await prisma.affiliatePlanAssignment.create({
      data: {
        clinicId: clinic.id,
        affiliateId: affiliate.id,
        commissionPlanId: commissionPlan.id,
        effectiveFrom: new Date(),
        effectiveTo: null,
      }
    });
    console.log(`   ✅ Assigned plan: ${commissionPlan.name}`);
  } else {
    console.log(`   ℹ️  Plan already assigned`);
  }

  // ============================================================================
  // 7. Create simulated commission events
  // ============================================================================
  console.log('\n📊 Creating simulated commission events...');

  // Generate events for the last 60 days
  const now = new Date();
  const eventData = [];
  let eventCount = 0;

  for (let daysAgo = 60; daysAgo >= 0; daysAgo--) {
    // Random number of events per day (0-5)
    const eventsThisDay = Math.floor(Math.random() * 6);
    
    for (let i = 0; i < eventsThisDay; i++) {
      const occurredAt = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
      occurredAt.setHours(Math.floor(Math.random() * 24));
      
      const eventAmount = Math.floor(Math.random() * 30000) + 5000; // $50 - $350
      const commission = Math.round(eventAmount * 0.10); // 10%
      
      // Determine status based on age
      let status: 'PENDING' | 'APPROVED' | 'PAID' | 'REVERSED';
      if (daysAgo > 30) {
        status = Math.random() > 0.1 ? 'PAID' : 'REVERSED';
      } else if (daysAgo > 7) {
        status = Math.random() > 0.05 ? 'APPROVED' : 'REVERSED';
      } else {
        status = 'PENDING';
      }

      const stripeEventId = `evt_demo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      eventData.push({
        clinicId: clinic.id,
        affiliateId: affiliate.id,
        stripeEventId,
        stripeObjectId: `pi_demo_${Math.random().toString(36).substr(2, 9)}`,
        stripeEventType: 'payment_intent.succeeded',
        eventAmountCents: eventAmount,
        commissionAmountCents: commission,
        commissionPlanId: commissionPlan.id,
        status,
        occurredAt,
        holdUntil: new Date(occurredAt.getTime() + 7 * 24 * 60 * 60 * 1000),
        approvedAt: status === 'APPROVED' || status === 'PAID' 
          ? new Date(occurredAt.getTime() + 7 * 24 * 60 * 60 * 1000)
          : null,
        paidAt: status === 'PAID'
          ? new Date(occurredAt.getTime() + 30 * 24 * 60 * 60 * 1000)
          : null,
        reversedAt: status === 'REVERSED'
          ? new Date(occurredAt.getTime() + 14 * 24 * 60 * 60 * 1000)
          : null,
        reversalReason: status === 'REVERSED' ? 'refund' : null,
        metadata: {
          refCode: refCodes[Math.floor(Math.random() * refCodes.length)],
          planName: commissionPlan.name,
          planType: commissionPlan.planType,
          // Note: NO patient data stored here for HIPAA compliance
        }
      });
      eventCount++;
    }
  }

  // Bulk create events (skip duplicates)
  for (const event of eventData) {
    try {
      await prisma.affiliateCommissionEvent.create({ data: event });
    } catch (e) {
      // Skip if duplicate (idempotency constraint)
    }
  }
  console.log(`   ✅ Created ${eventCount} commission events`);

  // ============================================================================
  // Summary
  // ============================================================================
  console.log('\n' + '='.repeat(60));
  console.log('✅ AFFILIATE PORTAL DEMO SEED COMPLETE');
  console.log('='.repeat(60));
  console.log('\n📋 Summary:');
  console.log(`   Clinic ID:     ${clinic.id}`);
  console.log(`   Clinic Name:   ${clinic.name}`);
  console.log(`   Affiliate ID:  ${affiliate.id}`);
  console.log(`   Affiliate:     ${affiliate.displayName}`);
  console.log('\n🔑 Login Credentials:');
  console.log(`   Email:    ${affiliateEmail}`);
  console.log(`   Password: ${affiliatePassword}`);
  console.log('\n🔗 Ref Codes:');
  refCodes.forEach(code => console.log(`   - ${code}`));
  console.log('\n📍 Portal URL: /portal/affiliate');
  console.log('📍 Admin URL:  /admin/affiliates');
  console.log('\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
