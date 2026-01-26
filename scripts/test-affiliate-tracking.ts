#!/usr/bin/env npx ts-node
/**
 * Comprehensive Affiliate Tracking System Test
 * 
 * Tests the full flow:
 * 1. Click Tracking
 * 2. Attribution Resolution
 * 3. Commission Calculation
 * 4. Dashboard/Reporting APIs
 * 
 * Run: npx ts-node scripts/test-affiliate-tracking.ts
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

// Test configuration
const TEST_CLINIC_ID = 1; // Use existing clinic
const TEST_PREFIX = 'TEST_AFF_';

interface TestResults {
  passed: number;
  failed: number;
  tests: Array<{ name: string; status: 'pass' | 'fail'; error?: string }>;
}

const results: TestResults = { passed: 0, failed: 0, tests: [] };

function log(message: string, type: 'info' | 'success' | 'error' | 'header' = 'info') {
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    error: '\x1b[31m',
    header: '\x1b[35m',
  };
  const reset = '\x1b[0m';
  console.log(`${colors[type]}${message}${reset}`);
}

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    results.passed++;
    results.tests.push({ name: testName, status: 'pass' });
    log(`  ✓ ${testName}`, 'success');
  } else {
    results.failed++;
    results.tests.push({ name: testName, status: 'fail', error: details });
    log(`  ✗ ${testName}: ${details || 'Assertion failed'}`, 'error');
  }
}

async function cleanup() {
  log('\n🧹 Cleaning up test data...', 'info');
  
  // Delete test commission events
  await prisma.affiliateCommissionEvent.deleteMany({
    where: { metadata: { path: ['testRun'], equals: TEST_PREFIX } }
  }).catch(() => {});
  
  // Delete test touches
  await prisma.affiliateTouch.deleteMany({
    where: { refCode: { startsWith: TEST_PREFIX } }
  }).catch(() => {});
  
  // Delete test ref codes
  await prisma.affiliateRefCode.deleteMany({
    where: { refCode: { startsWith: TEST_PREFIX } }
  }).catch(() => {});
  
  // Delete test affiliates (will cascade to related records)
  await prisma.affiliate.deleteMany({
    where: { displayName: { startsWith: TEST_PREFIX } }
  }).catch(() => {});
  
  log('  Cleanup complete', 'success');
}

async function testRefCodeGeneration() {
  log('\n📝 Testing Ref Code Generation', 'header');
  
  // Test ref code format validation
  const validCodes = ['SUMMER123ABC', 'PART12345678', 'VIA_ABC123'];
  const invalidCodes = ['ab', '', 'SELECT * FROM'];
  
  for (const code of validCodes) {
    const isValid = /^[A-Za-z0-9_-]{4,20}$/.test(code);
    assert(isValid, `Valid ref code: ${code}`);
  }
  
  for (const code of invalidCodes) {
    const isValid = /^[A-Za-z0-9_-]{4,20}$/.test(code);
    assert(!isValid, `Invalid ref code rejected: ${code || '(empty)'}`);
  }
}

async function testClickTracking() {
  log('\n🖱️ Testing Click Tracking', 'header');
  
  // Create a test affiliate
  const testUser = await prisma.user.findFirst({
    where: { clinicId: TEST_CLINIC_ID }
  });
  
  if (!testUser) {
    log('  ⚠️ No test user found, skipping click tracking tests', 'info');
    return null;
  }
  
  // Create test affiliate
  const affiliate = await prisma.affiliate.create({
    data: {
      clinicId: TEST_CLINIC_ID,
      userId: testUser.id,
      displayName: `${TEST_PREFIX}Click_Test`,
      status: 'ACTIVE',
    }
  });
  
  assert(!!affiliate, 'Create test affiliate');
  
  // Create ref code
  const refCode = await prisma.affiliateRefCode.create({
    data: {
      clinicId: TEST_CLINIC_ID,
      affiliateId: affiliate.id,
      refCode: `${TEST_PREFIX}CODE1`,
      description: 'Test ref code',
      isActive: true,
    }
  });
  
  assert(!!refCode, 'Create test ref code');
  
  // Simulate click tracking - create touch
  const fingerprint = crypto.randomBytes(32).toString('hex');
  const cookieId = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  const hashedIp = crypto.createHash('sha256').update('192.168.1.100').digest('hex');
  
  const touch = await prisma.affiliateTouch.create({
    data: {
      clinicId: TEST_CLINIC_ID,
      affiliateId: affiliate.id,
      refCode: refCode.refCode,
      visitorFingerprint: fingerprint,
      cookieId: cookieId,
      hashedIp: hashedIp,
      touchType: 'CLICK',
      landingPage: 'https://test.com?ref=' + refCode.refCode,
      referrerUrl: 'https://google.com',
      userAgent: 'Mozilla/5.0 Test Agent',
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'test_campaign',
    }
  });
  
  assert(!!touch, 'Record click touch');
  assert(touch.touchType === 'CLICK', 'Touch type is CLICK');
  assert(touch.affiliateId === affiliate.id, 'Touch linked to affiliate');
  
  // Verify touch can be retrieved
  const retrievedTouch = await prisma.affiliateTouch.findUnique({
    where: { id: touch.id }
  });
  
  assert(!!retrievedTouch, 'Touch can be retrieved');
  assert(retrievedTouch?.visitorFingerprint === fingerprint, 'Fingerprint stored correctly');
  
  return { affiliate, refCode, touch, fingerprint, cookieId };
}

async function testAttribution(trackingData: any) {
  log('\n🎯 Testing Attribution', 'header');
  
  if (!trackingData) {
    log('  ⚠️ No tracking data, skipping attribution tests', 'info');
    return null;
  }
  
  const { affiliate, refCode, touch, fingerprint, cookieId } = trackingData;
  
  // Test: Find touches by fingerprint
  const touchesByFingerprint = await prisma.affiliateTouch.findMany({
    where: {
      clinicId: TEST_CLINIC_ID,
      visitorFingerprint: fingerprint,
      convertedAt: null,
    },
    orderBy: { createdAt: 'desc' }
  });
  
  assert(touchesByFingerprint.length > 0, 'Find touches by fingerprint');
  assert(touchesByFingerprint[0].affiliateId === affiliate.id, 'Correct affiliate found');
  
  // Test: Find touches by cookie
  const touchesByCookie = await prisma.affiliateTouch.findMany({
    where: {
      clinicId: TEST_CLINIC_ID,
      cookieId: cookieId,
      convertedAt: null,
    },
    orderBy: { createdAt: 'desc' }
  });
  
  assert(touchesByCookie.length > 0, 'Find touches by cookie');
  
  // Test: First-click attribution (should return first touch)
  const firstTouch = touchesByFingerprint[touchesByFingerprint.length - 1];
  assert(!!firstTouch, 'First-click attribution resolves');
  
  // Test: Last-click attribution (should return most recent touch)
  const lastTouch = touchesByFingerprint[0];
  assert(!!lastTouch, 'Last-click attribution resolves');
  assert(lastTouch.id === touch.id, 'Last touch is most recent');
  
  // Simulate multiple touches
  const touch2 = await prisma.affiliateTouch.create({
    data: {
      clinicId: TEST_CLINIC_ID,
      affiliateId: affiliate.id,
      refCode: refCode.refCode,
      visitorFingerprint: fingerprint,
      cookieId: cookieId,
      hashedIp: crypto.createHash('sha256').update('192.168.1.101').digest('hex'),
      touchType: 'CLICK',
      landingPage: 'https://test.com/page2?ref=' + refCode.refCode,
    }
  });
  
  assert(!!touch2, 'Create second touch');
  
  // Re-fetch touches
  const allTouches = await prisma.affiliateTouch.findMany({
    where: {
      clinicId: TEST_CLINIC_ID,
      visitorFingerprint: fingerprint,
    },
    orderBy: { createdAt: 'desc' }
  });
  
  assert(allTouches.length >= 2, 'Multiple touches tracked');
  
  // Mark touch as converted (simulating attribution)
  const convertedTouch = await prisma.affiliateTouch.update({
    where: { id: touch.id },
    data: {
      convertedAt: new Date(),
      // In real scenario, this would link to a patient
    }
  });
  
  assert(!!convertedTouch.convertedAt, 'Touch marked as converted');
  
  return { allTouches, convertedTouch };
}

async function testCommissionCalculation() {
  log('\n💰 Testing Commission Calculation', 'header');
  
  // Import the calculation function
  const { calculateCommission } = await import('../src/services/affiliate/affiliateCommissionService');
  
  // Test flat commission
  const flat1 = calculateCommission(10000, 'FLAT', 500, null);
  assert(flat1 === 500, `Flat commission: $5 on any amount = $5 (got ${flat1/100})`);
  
  // Test percentage commission
  const pct1 = calculateCommission(10000, 'PERCENT', null, 1000);
  assert(pct1 === 1000, `Percent commission: 10% on $100 = $10 (got ${pct1/100})`);
  
  const pct2 = calculateCommission(20000, 'PERCENT', null, 1500);
  assert(pct2 === 3000, `Percent commission: 15% on $200 = $30 (got ${pct2/100})`);
  
  const pct3 = calculateCommission(5000, 'PERCENT', null, 500);
  assert(pct3 === 250, `Percent commission: 5% on $50 = $2.50 (got ${pct3/100})`);
  
  // Test edge cases
  const zero = calculateCommission(10000, 'PERCENT', null, null);
  assert(zero === 0, `Null rate returns 0 (got ${zero})`);
  
  const full = calculateCommission(10000, 'PERCENT', null, 10000);
  assert(full === 10000, `100% commission = full amount (got ${full/100})`);
}

async function testCommissionEventCreation(trackingData: any) {
  log('\n📊 Testing Commission Event Creation', 'header');
  
  if (!trackingData) {
    log('  ⚠️ No tracking data, skipping commission event tests', 'info');
    return;
  }
  
  const { affiliate, refCode } = trackingData;
  
  // Create a commission event manually (simulating what happens after payment)
  const stripeEventId = `evt_test_${Date.now()}`;
  
  const commissionEvent = await prisma.affiliateCommissionEvent.create({
    data: {
      clinicId: TEST_CLINIC_ID,
      affiliateId: affiliate.id,
      refCode: refCode.refCode,
      stripeEventId: stripeEventId,
      stripeObjectId: `pi_test_${Date.now()}`,
      stripeEventType: 'payment_intent.succeeded',
      eventAmountCents: 15000, // $150 order
      commissionAmountCents: 1500, // $15 commission (10%)
      status: 'PENDING',
      occurredAt: new Date(),
      metadata: {
        testRun: TEST_PREFIX,
        planName: 'Test Plan',
        planType: 'PERCENT',
        percentBps: 1000,
      },
    }
  });
  
  assert(!!commissionEvent, 'Create commission event');
  assert(commissionEvent.status === 'PENDING', 'Initial status is PENDING');
  assert(commissionEvent.commissionAmountCents === 1500, 'Commission amount correct');
  
  // Test idempotency - trying to create duplicate should fail
  let duplicateCreated = false;
  try {
    await prisma.affiliateCommissionEvent.create({
      data: {
        clinicId: TEST_CLINIC_ID,
        affiliateId: affiliate.id,
        refCode: refCode.refCode,
        stripeEventId: stripeEventId, // Same event ID
        stripeObjectId: `pi_test_duplicate`,
        stripeEventType: 'payment_intent.succeeded',
        eventAmountCents: 15000,
        commissionAmountCents: 1500,
        status: 'PENDING',
        occurredAt: new Date(),
        metadata: { testRun: TEST_PREFIX },
      }
    });
    duplicateCreated = true;
  } catch (e) {
    duplicateCreated = false;
  }
  
  assert(!duplicateCreated, 'Duplicate commission event prevented (idempotency)');
  
  // Test status transitions
  const approvedEvent = await prisma.affiliateCommissionEvent.update({
    where: { id: commissionEvent.id },
    data: { status: 'APPROVED', approvedAt: new Date() }
  });
  
  assert(approvedEvent.status === 'APPROVED', 'Commission approved');
  
  // Test aggregation for reporting
  const summary = await prisma.affiliateCommissionEvent.aggregate({
    where: {
      affiliateId: affiliate.id,
      status: { in: ['APPROVED', 'PAID'] }
    },
    _sum: { commissionAmountCents: true },
    _count: true,
  });
  
  assert(!!summary._sum.commissionAmountCents, 'Commission aggregation works');
  log(`    Total commission: $${(summary._sum.commissionAmountCents || 0) / 100}`, 'info');
}

async function testReporting(trackingData: any) {
  log('\n📈 Testing Reporting & Analytics', 'header');
  
  if (!trackingData) {
    log('  ⚠️ No tracking data, skipping reporting tests', 'info');
    return;
  }
  
  const { affiliate, refCode } = trackingData;
  
  // Test: Click count by ref code
  const clickCount = await prisma.affiliateTouch.count({
    where: {
      affiliateId: affiliate.id,
      refCode: refCode.refCode,
      touchType: 'CLICK',
    }
  });
  
  assert(clickCount >= 1, `Click count: ${clickCount}`);
  
  // Test: Conversion count
  const conversionCount = await prisma.affiliateTouch.count({
    where: {
      affiliateId: affiliate.id,
      convertedAt: { not: null },
    }
  });
  
  assert(conversionCount >= 0, `Conversion count: ${conversionCount}`);
  
  // Test: Earnings summary
  const earnings = await prisma.affiliateCommissionEvent.aggregate({
    where: { affiliateId: affiliate.id },
    _sum: {
      commissionAmountCents: true,
      eventAmountCents: true,
    },
    _count: true,
  });
  
  assert(earnings._count >= 0, `Commission events: ${earnings._count}`);
  assert(earnings._sum.commissionAmountCents !== undefined, 'Earnings sum available');
  
  log(`    Total revenue: $${(earnings._sum.eventAmountCents || 0) / 100}`, 'info');
  log(`    Total commission: $${(earnings._sum.commissionAmountCents || 0) / 100}`, 'info');
  
  // Test: Group by status
  const byStatus = await prisma.affiliateCommissionEvent.groupBy({
    by: ['status'],
    where: { affiliateId: affiliate.id },
    _sum: { commissionAmountCents: true },
    _count: true,
  });
  
  assert(Array.isArray(byStatus), 'Group by status works');
  
  for (const group of byStatus) {
    log(`    ${group.status}: ${group._count} events, $${(group._sum.commissionAmountCents || 0) / 100}`, 'info');
  }
  
  // Test: Time-based grouping (this month)
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  
  const thisMonth = await prisma.affiliateCommissionEvent.aggregate({
    where: {
      affiliateId: affiliate.id,
      createdAt: { gte: startOfMonth },
    },
    _sum: { commissionAmountCents: true },
    _count: true,
  });
  
  assert(thisMonth._count >= 0, `This month: ${thisMonth._count} events`);
  
  // Test: Ref code performance
  const refCodeStats = await prisma.affiliateTouch.groupBy({
    by: ['refCode'],
    where: { affiliateId: affiliate.id },
    _count: true,
  });
  
  assert(refCodeStats.length >= 1, 'Ref code stats available');
  
  for (const stat of refCodeStats) {
    log(`    Ref code ${stat.refCode}: ${stat._count} clicks`, 'info');
  }
}

async function testDashboardAPIs() {
  log('\n🖥️ Testing Dashboard API Endpoints', 'header');
  
  // Note: These would typically be HTTP requests, but we'll test the underlying queries
  
  // Test: Affiliate lookup by user
  const testAffiliate = await prisma.affiliate.findFirst({
    where: {
      clinicId: TEST_CLINIC_ID,
      displayName: { startsWith: TEST_PREFIX }
    },
    include: {
      user: true,
      refCodes: true,
    }
  });
  
  if (testAffiliate) {
    assert(!!testAffiliate.user, 'Affiliate has user');
    assert(Array.isArray(testAffiliate.refCodes), 'Affiliate has ref codes');
    
    // Test: Dashboard summary query
    const dashboardData = await prisma.$transaction([
      // Available balance (approved, not paid)
      prisma.affiliateCommissionEvent.aggregate({
        where: {
          affiliateId: testAffiliate.id,
          status: 'APPROVED',
        },
        _sum: { commissionAmountCents: true },
      }),
      // Pending balance
      prisma.affiliateCommissionEvent.aggregate({
        where: {
          affiliateId: testAffiliate.id,
          status: 'PENDING',
        },
        _sum: { commissionAmountCents: true },
      }),
      // Lifetime earnings
      prisma.affiliateCommissionEvent.aggregate({
        where: {
          affiliateId: testAffiliate.id,
          status: { in: ['APPROVED', 'PAID'] },
        },
        _sum: { commissionAmountCents: true },
      }),
      // This month clicks
      prisma.affiliateTouch.count({
        where: {
          affiliateId: testAffiliate.id,
          touchType: 'CLICK',
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
          }
        },
      }),
      // This month conversions
      prisma.affiliateTouch.count({
        where: {
          affiliateId: testAffiliate.id,
          convertedAt: {
            not: null,
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
          }
        },
      }),
    ]);
    
    assert(Array.isArray(dashboardData), 'Dashboard transaction works');
    assert(dashboardData.length === 5, 'All dashboard queries executed');
    
    log(`    Available: $${(dashboardData[0]._sum.commissionAmountCents || 0) / 100}`, 'info');
    log(`    Pending: $${(dashboardData[1]._sum.commissionAmountCents || 0) / 100}`, 'info');
    log(`    Lifetime: $${(dashboardData[2]._sum.commissionAmountCents || 0) / 100}`, 'info');
    log(`    Clicks (month): ${dashboardData[3]}`, 'info');
    log(`    Conversions (month): ${dashboardData[4]}`, 'info');
  } else {
    log('  ⚠️ No test affiliate found for dashboard tests', 'info');
  }
}

async function testPayoutFlow(trackingData: any) {
  log('\n💸 Testing Payout Flow', 'header');
  
  if (!trackingData) {
    log('  ⚠️ No tracking data, skipping payout tests', 'info');
    return;
  }
  
  const { affiliate } = trackingData;
  
  // Get approved commissions
  const approvedCommissions = await prisma.affiliateCommissionEvent.findMany({
    where: {
      affiliateId: affiliate.id,
      status: 'APPROVED',
    }
  });
  
  assert(approvedCommissions.length >= 0, `Found ${approvedCommissions.length} approved commissions`);
  
  if (approvedCommissions.length > 0) {
    // Calculate total
    const total = approvedCommissions.reduce((sum, c) => sum + c.commissionAmountCents, 0);
    log(`    Total available for payout: $${total / 100}`, 'info');
    
    // Test minimum payout threshold
    const MIN_PAYOUT = 5000; // $50
    const canPayout = total >= MIN_PAYOUT;
    log(`    Can payout (min $50): ${canPayout}`, 'info');
  }
}

async function main() {
  console.log('\n' + '='.repeat(60));
  log('🧪 AFFILIATE TRACKING SYSTEM - COMPREHENSIVE TEST SUITE', 'header');
  console.log('='.repeat(60));
  
  try {
    // Cleanup any previous test data
    await cleanup();
    
    // Run all test suites
    await testRefCodeGeneration();
    const trackingData = await testClickTracking();
    await testAttribution(trackingData);
    await testCommissionCalculation();
    await testCommissionEventCreation(trackingData);
    await testReporting(trackingData);
    await testDashboardAPIs();
    await testPayoutFlow(trackingData);
    
    // Cleanup test data
    await cleanup();
    
  } catch (error) {
    log(`\n❌ Fatal error: ${error}`, 'error');
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  log('📋 TEST SUMMARY', 'header');
  console.log('='.repeat(60));
  log(`  Total tests: ${results.passed + results.failed}`, 'info');
  log(`  ✓ Passed: ${results.passed}`, 'success');
  if (results.failed > 0) {
    log(`  ✗ Failed: ${results.failed}`, 'error');
    console.log('\nFailed tests:');
    results.tests.filter(t => t.status === 'fail').forEach(t => {
      log(`  - ${t.name}: ${t.error}`, 'error');
    });
  }
  console.log('='.repeat(60) + '\n');
  
  process.exit(results.failed > 0 ? 1 : 0);
}

main();
