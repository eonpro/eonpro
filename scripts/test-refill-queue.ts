/**
 * Refill Queue System Test Script
 * 
 * Tests the complete prescription refill queue workflow:
 * 1. Create test data (clinic, patient, subscription)
 * 2. Schedule a refill
 * 3. Process due refills
 * 4. Verify payment
 * 5. Admin approval
 * 6. Provider queue integration
 * 7. Mark as prescribed
 * 
 * Usage: npx tsx scripts/test-refill-queue.ts
 */

import { PrismaClient } from '@prisma/client';
import {
  scheduleRefill,
  scheduleRefillFromSubscription,
  processDueRefills,
  verifyPayment,
  approveRefill,
  rejectRefill,
  getRefillById,
  getPatientRefillHistory,
  getAdminRefillQueue,
  getRefillQueueStats,
  holdRefill,
  resumeRefill,
  cancelRefill,
  markPrescribed,
} from '../src/services/refill';

const prisma = new PrismaClient();

// Test helpers
function log(message: string, data?: unknown) {
  console.log(`\n✅ ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

function logError(message: string, error?: unknown) {
  console.error(`\n❌ ${message}`);
  if (error) {
    console.error(error);
  }
}

function logSection(title: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📋 ${title}`);
  console.log('='.repeat(60));
}

async function cleanup(patientId: number, userId: number | null) {
  // Clean up in order (respecting foreign keys)
  await prisma.refillQueue.deleteMany({ where: { patientId } });
  await prisma.subscription.deleteMany({ where: { patientId } });
  await prisma.patient.deleteMany({ where: { id: patientId } });
  if (userId) {
    await prisma.user.deleteMany({ where: { id: userId } });
  }
  // Don't delete clinic since it's an existing one
}

async function main() {
  console.log('🧪 Starting Refill Queue System Tests\n');
  
  let testClinicId: number | null = null;
  let testPatientId: number | null = null;
  let testUserId: number | null = null;
  let testSubscriptionId: number | null = null;
  let testRefillId: number | null = null;

  try {
    // ==========================================
    // Setup Test Data
    // ==========================================
    logSection('Setting Up Test Data');

    // Find an existing clinic to use for testing
    const clinic = await prisma.clinic.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { id: 'asc' },
    });

    if (!clinic) {
      throw new Error('No active clinic found for testing. Please create a clinic first.');
    }
    log('Using existing clinic for tests', { id: clinic.id, name: clinic.name });
    testClinicId = clinic.id;

    // Find an existing admin user or create one
    let testUser = await prisma.user.findFirst({
      where: { 
        clinicId: clinic.id,
        role: 'ADMIN',
        status: 'ACTIVE'
      },
    });

    if (!testUser) {
      testUser = await prisma.user.create({
        data: {
          email: `test-admin-${Date.now()}@test.com`,
          firstName: 'Test',
          lastName: 'Admin',
          passwordHash: 'test-hash-not-real',
          role: 'ADMIN',
          clinicId: clinic.id,
          status: 'ACTIVE',
        },
      });
      testUserId = testUser.id;
      log('Created test admin user', { id: testUser.id, email: testUser.email });
    } else {
      log('Using existing admin user', { id: testUser.id, email: testUser.email });
    }

    // Create test patient
    const testPatient = await prisma.patient.create({
      data: {
        clinicId: clinic.id,
        firstName: 'Test',
        lastName: 'Patient',
        email: `test-patient-${Date.now()}@test.com`,
        dob: '1990-01-01',
        gender: 'other',
        phone: '555-0101',
        address1: '123 Test St',
        city: 'Test City',
        state: 'TX',
        zip: '12345',
      },
    });
    testPatientId = testPatient.id;
    log('Created test patient', { id: testPatient.id, name: `${testPatient.firstName} ${testPatient.lastName}` });

    // Create test subscription
    const testSubscription = await prisma.subscription.create({
      data: {
        patientId: testPatient.id,
        clinicId: clinic.id,
        planId: 'test-plan-semaglutide-3mo',
        planName: 'Semaglutide 3-Month',
        planDescription: 'Semaglutide weight loss program - 3 month supply',
        status: 'ACTIVE',
        vialCount: 3,
        refillIntervalDays: 90,
        amount: 29900, // in cents
        currency: 'usd',
        interval: 'month',
        intervalCount: 3,
        startDate: new Date(),
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        nextBillingDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
    });
    testSubscriptionId = testSubscription.id;
    log('Created test subscription', {
      id: testSubscription.id,
      planName: testSubscription.planName,
      vialCount: testSubscription.vialCount,
      intervalDays: testSubscription.refillIntervalDays,
    });

    // ==========================================
    // Test 1: Schedule Refill Manually
    // ==========================================
    logSection('Test 1: Schedule Refill Manually');

    const scheduledDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday (due now)
    const refill = await scheduleRefill({
      clinicId: clinic.id,
      patientId: testPatient.id,
      subscriptionId: testSubscription.id,
      nextRefillDate: scheduledDate,
      vialCount: 3,
      refillIntervalDays: 90,
      medicationName: 'Semaglutide',
      medicationStrength: '2.5mg',
      medicationForm: 'Injectable',
      planName: 'Semaglutide 3-Month',
    });
    testRefillId = refill.id;
    log('Scheduled refill', {
      id: refill.id,
      status: refill.status,
      nextRefillDate: refill.nextRefillDate,
    });

    // ==========================================
    // Test 2: Get Refill By ID
    // ==========================================
    logSection('Test 2: Get Refill By ID');

    const fetchedRefill = await getRefillById(refill.id);
    log('Fetched refill details', {
      id: fetchedRefill?.id,
      status: fetchedRefill?.status,
      patientName: fetchedRefill?.patient ? `${fetchedRefill.patient.firstName} ${fetchedRefill.patient.lastName}` : null,
    });

    // ==========================================
    // Test 3: Process Due Refills
    // ==========================================
    logSection('Test 3: Process Due Refills');

    const processingResult = await processDueRefills(clinic.id);
    log('Processed due refills', processingResult);

    // Check refill status changed
    const afterProcessing = await getRefillById(refill.id);
    log('Refill status after processing', {
      id: afterProcessing?.id,
      status: afterProcessing?.status,
    });

    // ==========================================
    // Test 4: Get Queue Stats
    // ==========================================
    logSection('Test 4: Get Queue Stats');

    const stats = await getRefillQueueStats(clinic.id);
    log('Queue stats', stats);

    // ==========================================
    // Test 5: Admin Queue View
    // ==========================================
    logSection('Test 5: Admin Queue View');

    const adminQueue = await getAdminRefillQueue({
      clinicId: clinic.id,
      status: 'PENDING_PAYMENT',
    });
    log('Admin queue view', {
      count: adminQueue.length,
      firstRefillId: adminQueue[0]?.id,
    });

    // ==========================================
    // Test 6: Verify Payment
    // ==========================================
    logSection('Test 6: Verify Payment');

    const verifiedRefill = await verifyPayment({
      refillId: refill.id,
      method: 'MANUAL_VERIFIED',
      verifiedBy: testUser.id,
      paymentReference: 'TEST-REF-001',
    });
    log('Payment verified', {
      id: verifiedRefill.id,
      status: verifiedRefill.status,
      paymentVerified: verifiedRefill.paymentVerified,
      paymentMethod: verifiedRefill.paymentMethod,
    });

    // ==========================================
    // Test 7: Admin Approval
    // ==========================================
    logSection('Test 7: Admin Approval');

    const approvedRefill = await approveRefill(
      refill.id,
      testUser.id,
      'Test approval notes'
    );
    log('Refill approved', {
      id: approvedRefill.id,
      status: approvedRefill.status,
      adminApproved: approvedRefill.adminApproved,
      adminApprovedBy: approvedRefill.adminApprovedBy,
    });

    // ==========================================
    // Test 8: Get Patient Refills
    // ==========================================
    logSection('Test 8: Get Patient Refills');

    const patientRefills = await getPatientRefillHistory(testPatient.id);
    log('Patient refills', {
      total: patientRefills.length,
      statuses: patientRefills.map((r: typeof patientRefills[number]) => ({ id: r.id, status: r.status })),
    });

    // ==========================================
    // Test 9: Mark as Prescribed
    // ==========================================
    logSection('Test 9: Mark as Prescribed');

    // Find or create a provider for the order
    let testProvider = await prisma.provider.findFirst({
      where: { clinicId: clinic.id },
    });

    if (!testProvider) {
      // Create a minimal provider for testing
      testProvider = await prisma.provider.create({
        data: {
          clinicId: clinic.id,
          firstName: 'Test',
          lastName: 'Provider',
          email: `test-provider-${Date.now()}@test.com`,
          npi: '1234567890',
          status: 'active',
        },
      });
    }

    // Create a test order first
    const testOrder = await prisma.order.create({
      data: {
        patientId: testPatient.id,
        clinicId: clinic.id,
        providerId: testProvider.id,
        messageId: `TEST-MSG-${Date.now()}`,
        referenceId: `TEST-REF-${Date.now()}`,
        shippingMethod: 1,
        status: 'pending',
      },
    });
    log('Created test order', { id: testOrder.id });

    const prescribedRefill = await markPrescribed(
      refill.id,
      testUser.id,
      testOrder.id
    );
    log('Refill marked as prescribed', {
      id: prescribedRefill.id,
      status: prescribedRefill.status,
      prescribedBy: prescribedRefill.prescribedBy,
      orderId: prescribedRefill.orderId,
    });

    // Check if next refill was scheduled
    const nextRefills = await prisma.refillQueue.findMany({
      where: {
        subscriptionId: testSubscription.id,
        status: 'SCHEDULED',
      },
    });
    log('Next scheduled refills', {
      count: nextRefills.length,
      nextRefillDate: nextRefills[0]?.nextRefillDate,
    });

    // ==========================================
    // Test 10: Hold/Resume Workflow
    // ==========================================
    logSection('Test 10: Hold/Resume Workflow');

    // Create another refill to test hold/resume
    const holdTestRefill = await scheduleRefill({
      clinicId: clinic.id,
      patientId: testPatient.id,
      subscriptionId: testSubscription.id,
      nextRefillDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      vialCount: 3,
      refillIntervalDays: 90,
    });
    log('Created refill for hold test', { id: holdTestRefill.id, status: holdTestRefill.status });

    const heldRefill = await holdRefill(holdTestRefill.id, 'Patient requested hold');
    log('Refill held', { id: heldRefill.id, status: heldRefill.status });

    const resumedRefill = await resumeRefill(holdTestRefill.id);
    log('Refill resumed', { id: resumedRefill.id, status: resumedRefill.status });

    // ==========================================
    // Test 11: Cancel Refill
    // ==========================================
    logSection('Test 11: Cancel Refill');

    // Create another refill to test cancellation
    const cancelTestRefill = await scheduleRefill({
      clinicId: clinic.id,
      patientId: testPatient.id,
      subscriptionId: testSubscription.id,
      nextRefillDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      vialCount: 3,
      refillIntervalDays: 90,
    });
    log('Created refill for cancel test', { id: cancelTestRefill.id });

    const cancelledRefill = await cancelRefill(cancelTestRefill.id, 'Test cancellation');
    log('Refill cancelled', { id: cancelledRefill.id, status: cancelledRefill.status });

    // ==========================================
    // Test 12: Schedule from Subscription
    // ==========================================
    logSection('Test 12: Schedule from Subscription');

    const fromSubRefill = await scheduleRefillFromSubscription(testSubscription.id);
    log('Refill scheduled from subscription', {
      id: fromSubRefill?.id,
      status: fromSubRefill?.status,
      nextRefillDate: fromSubRefill?.nextRefillDate,
    });

    // ==========================================
    // Test 13: Rejection Workflow
    // ==========================================
    logSection('Test 13: Rejection Workflow');

    // Create and process a refill to test rejection
    const rejectTestRefill = await scheduleRefill({
      clinicId: clinic.id,
      patientId: testPatient.id,
      subscriptionId: testSubscription.id,
      nextRefillDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Due yesterday
      vialCount: 3,
      refillIntervalDays: 90,
    });

    // Process to move to PENDING_PAYMENT
    await processDueRefills(clinic.id);
    
    // Verify payment to move to PENDING_ADMIN
    await verifyPayment({
      refillId: rejectTestRefill.id,
      method: 'MANUAL_VERIFIED',
      verifiedBy: testUser.id,
    });

    // Now reject it
    const rejectedRefill = await rejectRefill(
      rejectTestRefill.id,
      testUser.id,
      'Test rejection reason'
    );
    log('Refill rejected', {
      id: rejectedRefill.id,
      status: rejectedRefill.status,
      adminApproved: rejectedRefill.adminApproved,
      adminNotes: rejectedRefill.adminNotes,
    });

    // ==========================================
    // Final Stats
    // ==========================================
    logSection('Final Stats');

    const finalStats = await getRefillQueueStats(clinic.id);
    log('Final queue stats', finalStats);

    // Clean up test order
    await prisma.order.delete({ where: { id: testOrder.id } });

    console.log('\n' + '='.repeat(60));
    console.log('🎉 All Tests Passed!');
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    logError('Test failed', error);
    throw error;
  } finally {
    // Cleanup
    if (testPatientId && testUserId) {
      console.log('\n🧹 Cleaning up test data...');
      try {
        await cleanup(testPatientId, testUserId);
        console.log('✅ Cleanup complete');
      } catch (cleanupError) {
        console.log('⚠️  Cleanup encountered issues (may be ok):', cleanupError);
      }
    }
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
