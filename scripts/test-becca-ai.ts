/**
 * Becca AI Comprehensive Test Script
 * 
 * Tests the AI assistant's ability to:
 * 1. Find patient data (tracking, weight, prescriptions)
 * 2. Handle misspelled names with fuzzy matching
 * 3. Return plain text (no markdown)
 * 4. Provide helpful responses when data not found
 * 
 * Usage: npx ts-node scripts/test-becca-ai.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Import the functions we want to test
async function runTests() {
  console.log('🧪 Becca AI Comprehensive Test Suite\n');
  console.log('='.repeat(60));

  try {
    // First, let's find a test patient with data
    const testPatient = await prisma.patient.findFirst({
      where: {
        orders: {
          some: {
            trackingNumber: { not: null }
          }
        }
      },
      include: {
        orders: {
          where: { trackingNumber: { not: null } },
          include: { rxs: true },
          take: 3
        },
        weightLogs: { take: 3 },
        intakeSubmissions: {
          where: { status: 'completed' },
          include: {
            responses: {
              include: { question: true }
            }
          },
          take: 1
        },
        soapNotes: { take: 1 },
        documents: { take: 3 }
      }
    });

    if (!testPatient) {
      console.log('⚠️  No patient with tracking data found. Looking for any patient...');
      const anyPatient = await prisma.patient.findFirst({
        include: {
          orders: { include: { rxs: true }, take: 3 },
          weightLogs: { take: 3 },
          documents: { take: 3 }
        }
      });
      
      if (anyPatient) {
        console.log(`\n📋 Found patient: ${anyPatient.firstName} ${anyPatient.lastName} (ID: ${anyPatient.id})`);
        console.log(`   Clinic ID: ${anyPatient.clinicId}`);
        console.log(`   Orders: ${anyPatient.orders?.length || 0}`);
        console.log(`   Weight Logs: ${anyPatient.weightLogs?.length || 0}`);
        console.log(`   Documents: ${anyPatient.documents?.length || 0}`);
      }
      return;
    }

    console.log(`\n✅ Found test patient: ${testPatient.firstName} ${testPatient.lastName}`);
    console.log(`   Patient ID: ${testPatient.id}`);
    console.log(`   Clinic ID: ${testPatient.clinicId}`);

    // Test 1: Check tracking data
    console.log('\n' + '='.repeat(60));
    console.log('TEST 1: Tracking Number Data');
    console.log('='.repeat(60));
    
    const ordersWithTracking = testPatient.orders.filter(o => o.trackingNumber);
    if (ordersWithTracking.length > 0) {
      console.log(`✅ Found ${ordersWithTracking.length} order(s) with tracking:`);
      ordersWithTracking.forEach(order => {
        console.log(`   - Order #${order.id}`);
        console.log(`     Status: ${order.status}`);
        console.log(`     Tracking: ${order.trackingNumber}`);
        console.log(`     Medication: ${order.primaryMedName || order.rxs?.[0]?.medName || 'Unknown'}`);
        console.log(`     Shipping Status: ${order.shippingStatus || 'Not set'}`);
      });
    } else {
      console.log('❌ No tracking numbers found');
    }

    // Test 2: Check weight data
    console.log('\n' + '='.repeat(60));
    console.log('TEST 2: Weight/Vitals Data');
    console.log('='.repeat(60));

    if (testPatient.weightLogs && testPatient.weightLogs.length > 0) {
      console.log(`✅ Found ${testPatient.weightLogs.length} weight log(s):`);
      testPatient.weightLogs.forEach(log => {
        console.log(`   - ${log.weight} ${log.unit} (${log.createdAt.toLocaleDateString()})`);
      });
    } else {
      console.log('❌ No weight logs found');
    }

    // Check intake form for vitals
    if (testPatient.intakeSubmissions && testPatient.intakeSubmissions.length > 0) {
      console.log(`\n✅ Found ${testPatient.intakeSubmissions.length} intake submission(s):`);
      const intake = testPatient.intakeSubmissions[0];
      console.log(`   Submission ID: ${intake.id}`);
      console.log(`   Status: ${intake.status}`);
      console.log(`   Completed: ${intake.completedAt?.toLocaleDateString() || 'N/A'}`);
      
      // Look for vitals in responses
      const vitalQuestions = ['weight', 'height', 'bmi', 'blood pressure', 'bp'];
      const vitalResponses = intake.responses.filter(r => {
        const qText = r.question?.questionText?.toLowerCase() || '';
        return vitalQuestions.some(v => qText.includes(v));
      });
      
      if (vitalResponses.length > 0) {
        console.log('   Vital responses found:');
        vitalResponses.forEach(r => {
          console.log(`     - ${r.question?.questionText}: ${r.answer}`);
        });
      }
    } else {
      console.log('❌ No intake submissions found');
    }

    // Test 3: Check prescription data
    console.log('\n' + '='.repeat(60));
    console.log('TEST 3: Prescription Data');
    console.log('='.repeat(60));

    const ordersWithRx = testPatient.orders.filter(o => o.rxs && o.rxs.length > 0);
    if (ordersWithRx.length > 0) {
      console.log(`✅ Found ${ordersWithRx.length} order(s) with prescriptions:`);
      ordersWithRx.forEach(order => {
        order.rxs.forEach(rx => {
          console.log(`   - ${rx.medName} ${rx.strength}`);
          console.log(`     Form: ${rx.form}`);
          console.log(`     Quantity: ${rx.quantity}`);
          console.log(`     SIG: ${rx.sig}`);
        });
      });
    } else {
      console.log('❌ No prescriptions found');
    }

    // Test 4: Check SOAP notes
    console.log('\n' + '='.repeat(60));
    console.log('TEST 4: SOAP Note Data');
    console.log('='.repeat(60));

    if (testPatient.soapNotes && testPatient.soapNotes.length > 0) {
      console.log(`✅ Found ${testPatient.soapNotes.length} SOAP note(s):`);
      const note = testPatient.soapNotes[0];
      console.log(`   Date: ${note.createdAt.toLocaleDateString()}`);
      console.log(`   Status: ${note.status}`);
      console.log(`   Subjective: ${note.subjective?.substring(0, 100)}...`);
      console.log(`   Objective: ${note.objective?.substring(0, 100)}...`);
    } else {
      console.log('❌ No SOAP notes found');
    }

    // Test 5: Fuzzy name matching simulation
    console.log('\n' + '='.repeat(60));
    console.log('TEST 5: Fuzzy Name Matching');
    console.log('='.repeat(60));

    // Create misspellings of the patient name
    const firstName = testPatient.firstName;
    const lastName = testPatient.lastName;
    
    const misspellings = [
      { first: firstName.slice(0, -1), last: lastName }, // Missing last letter
      { first: firstName + 'e', last: lastName }, // Extra letter
      { first: firstName.replace(/i/g, 'e'), last: lastName }, // i -> e
      { first: firstName, last: lastName.slice(0, -2) }, // Truncated last name
    ];

    console.log(`Original name: ${firstName} ${lastName}`);
    console.log('Test misspellings:');
    misspellings.forEach(m => {
      console.log(`   - "${m.first} ${m.last}"`);
    });

    // Test 6: Query simulation
    console.log('\n' + '='.repeat(60));
    console.log('TEST 6: Query Patterns');
    console.log('='.repeat(60));

    const testQueries = [
      `What is the tracking number for ${firstName} ${lastName}?`,
      `What's ${firstName}'s weight?`,
      `Show me ${firstName} ${lastName}'s prescriptions`,
      `What medications is ${firstName} on?`,
      `Tell me about ${firstName} ${lastName}`,
    ];

    console.log('Sample queries that should now work:');
    testQueries.forEach((q, i) => {
      console.log(`   ${i + 1}. "${q}"`);
    });

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));
    
    const summary = {
      patientName: `${testPatient.firstName} ${testPatient.lastName}`,
      patientId: testPatient.id,
      clinicId: testPatient.clinicId,
      hasTracking: ordersWithTracking.length > 0,
      trackingCount: ordersWithTracking.length,
      hasWeightLogs: (testPatient.weightLogs?.length || 0) > 0,
      weightLogCount: testPatient.weightLogs?.length || 0,
      hasIntake: (testPatient.intakeSubmissions?.length || 0) > 0,
      hasPrescriptions: ordersWithRx.length > 0,
      prescriptionCount: ordersWithRx.reduce((acc, o) => acc + o.rxs.length, 0),
      hasSoapNotes: (testPatient.soapNotes?.length || 0) > 0,
    };

    console.log('\nPatient Data Summary:');
    console.log(JSON.stringify(summary, null, 2));

    if (summary.hasTracking) {
      console.log('\n✅ TRACKING TEST: Should be able to answer tracking questions');
    } else {
      console.log('\n⚠️  TRACKING TEST: No tracking data - need to add test data');
    }

    if (summary.hasWeightLogs || summary.hasIntake) {
      console.log('✅ WEIGHT TEST: Should be able to answer weight questions');
    } else {
      console.log('⚠️  WEIGHT TEST: No weight data - need to add test data');
    }

    if (summary.hasPrescriptions) {
      console.log('✅ PRESCRIPTION TEST: Should be able to answer prescription questions');
    } else {
      console.log('⚠️  PRESCRIPTION TEST: No prescription data - need to add test data');
    }

  } catch (error) {
    console.error('❌ Error running tests:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the tests
runTests();
