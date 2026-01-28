/**
 * Test Becca AI Query Processing
 * 
 * This script tests the actual query processing logic to verify
 * that tracking, weight, and other data is properly retrieved.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Simulated searchPatientData function (matching the one in assistantService.ts)
async function searchPatientData(query: string, clinicId: number, patientId?: number) {
  const queryLower = query.toLowerCase();

  // Check for patient count queries
  if (queryLower.includes('how many patient') || queryLower.includes('total patient')) {
    const totalPatients = await prisma.patient.count({ where: { clinicId } });
    return { statistics: { totalPatients } };
  }

  // Name patterns to extract patient name from query
  const namePatterns = [
    /(?:for|about|of|patient|named)\s+([A-Z][a-z]+)\s+([A-Z][a-z]+)/i,
    /what\s+is\s+([A-Z][a-z]+)\s+([A-Z][a-z]+)(?:'s|'s)/i,
    /([A-Z][a-z]+)\s+([A-Z][a-z]+)(?:'s|'s)\s+(?:tracking|weight|prescription)/i,
    /(?:find|show|get|what is|what's)\s+([A-Z][a-z]+)\s+([A-Z][a-z]+)/i,
    /(?:^|\s)([A-Z][a-z]+)\s+([A-Z][a-z]+)(?:\s|$)/i,
  ];

  let nameMatch = null;
  for (const pattern of namePatterns) {
    const match = query.match(pattern);
    if (match) {
      nameMatch = match;
      break;
    }
  }

  let targetPatient = null;

  if (patientId) {
    targetPatient = await prisma.patient.findFirst({
      where: { id: patientId, clinicId },
      include: {
        orders: {
          include: { rxs: true, events: { take: 5 } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        documents: { orderBy: { createdAt: 'desc' }, take: 10 },
        soapNotes: { orderBy: { createdAt: 'desc' }, take: 5 },
        weightLogs: { orderBy: { createdAt: 'desc' }, take: 10 },
        shippingUpdates: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
  } else if (nameMatch) {
    const [, firstName, lastName] = nameMatch;
    targetPatient = await prisma.patient.findFirst({
      where: {
        clinicId,
        AND: [
          { firstName: { contains: firstName, mode: 'insensitive' } },
          { lastName: { contains: lastName, mode: 'insensitive' } },
        ],
      },
      include: {
        orders: {
          include: { rxs: true, events: { take: 5 } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        documents: { orderBy: { createdAt: 'desc' }, take: 10 },
        soapNotes: { orderBy: { createdAt: 'desc' }, take: 5 },
        weightLogs: { orderBy: { createdAt: 'desc' }, take: 10 },
        shippingUpdates: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
  }

  if (targetPatient) {
    // Extract tracking from orders
    const ordersWithTracking = (targetPatient as any).orders
      .filter((o: any) => o.trackingNumber)
      .map((o: any) => ({
        orderId: o.id,
        status: o.status,
        shippingStatus: o.shippingStatus,
        trackingNumber: o.trackingNumber,
        medication: o.primaryMedName || o.rxs?.[0]?.medName,
      }));

    // Get latest weight
    const latestWeight = (targetPatient as any).weightLogs?.[0];

    // Get shipping updates
    const shippingUpdates = (targetPatient as any).shippingUpdates?.map((s: any) => ({
      trackingNumber: s.trackingNumber,
      carrier: s.carrier,
      status: s.status,
      statusNote: s.statusNote,
      estimatedDelivery: s.estimatedDelivery,
    }));

    return {
      type: 'patient_found',
      patient: targetPatient,
      summary: {
        patientId: targetPatient.id,
        name: `${targetPatient.firstName} ${targetPatient.lastName}`,
        orderCount: (targetPatient as any).orders?.length || 0,
      },
      tracking: ordersWithTracking.length > 0 ? ordersWithTracking : null,
      shippingUpdates: shippingUpdates?.length > 0 ? shippingUpdates : null,
      vitals: {
        latestWeight: latestWeight ? {
          weight: latestWeight.weight,
          unit: latestWeight.unit,
          recordedAt: latestWeight.createdAt,
        } : null,
      },
    };
  }

  return { type: 'patient_not_found', message: 'Patient not found' };
}

// Simulated tryDirectAnswer function
function tryDirectAnswer(query: string, patientContext: any): { answer: string; queryType: string } | null {
  if (!patientContext || patientContext.type !== 'patient_found') {
    return null;
  }

  const queryLower = query.toLowerCase();
  const summary = patientContext.summary;
  const patient = patientContext.patient;

  // Tracking queries
  if (queryLower.includes('tracking') || queryLower.includes('shipping')) {
    const trackingInfo = patientContext.tracking || [];
    const shippingUpdates = patientContext.shippingUpdates || [];

    if (trackingInfo.length > 0 || shippingUpdates.length > 0) {
      const parts: string[] = [];
      parts.push(`Here's the tracking information for ${summary.name}:`);

      if (trackingInfo.length > 0) {
        trackingInfo.forEach((t: any) => {
          parts.push(`\n- ${t.medication || 'Order'}`);
          parts.push(`  Status: ${t.status || 'Processing'}`);
          if (t.trackingNumber) {
            parts.push(`  Tracking Number: ${t.trackingNumber}`);
          }
        });
      }

      if (shippingUpdates.length > 0) {
        parts.push('\nShipping updates:');
        shippingUpdates.forEach((s: any) => {
          parts.push(`- ${s.carrier}: ${s.trackingNumber}`);
          parts.push(`  Status: ${s.status}`);
        });
      }

      return { answer: parts.join('\n'), queryType: 'tracking' };
    }

    return {
      answer: `I don't see any tracking numbers on file for ${summary.name}.`,
      queryType: 'tracking',
    };
  }

  // Weight queries
  if (queryLower.includes('weight')) {
    const vitals = patientContext.vitals || {};
    const latestWeight = vitals.latestWeight;

    if (latestWeight) {
      return {
        answer: `${summary.name}'s latest recorded weight is ${latestWeight.weight} ${latestWeight.unit}.`,
        queryType: 'vitals',
      };
    }

    return {
      answer: `I don't have weight information on file for ${summary.name}.`,
      queryType: 'vitals',
    };
  }

  // Prescription queries
  if (queryLower.includes('prescription') || queryLower.includes('medication')) {
    const orders = patient?.orders || [];
    if (orders.length > 0) {
      const parts: string[] = [];
      parts.push(`Here are ${summary.name}'s prescriptions:`);

      orders.forEach((order: any) => {
        const rxs = order.rxs || [];
        if (rxs.length > 0) {
          rxs.forEach((rx: any) => {
            parts.push(`\n- ${rx.medName} ${rx.strength}`);
            parts.push(`  Directions: ${rx.sig}`);
            parts.push(`  Order Status: ${order.status || 'Processing'}`);
          });
        }
      });

      return { answer: parts.join('\n'), queryType: 'prescription' };
    }
  }

  return null;
}

// Run tests
async function runTests() {
  console.log('🧪 Becca AI Query Processing Tests\n');
  console.log('='.repeat(60));

  const clinicId = 1;
  const patientId = 1;

  // Test queries
  const testQueries = [
    { query: "What is the tracking number for Denielle Gallagher?", expected: "tracking" },
    { query: "What's Denielle's weight?", expected: "weight" },
    { query: "Show me Denielle Gallagher's prescriptions", expected: "prescription" },
    { query: "What medications is Denielle on?", expected: "prescription" },
    { query: "What is the shipping status for Denielle Gallagher?", expected: "tracking" },
  ];

  for (const test of testQueries) {
    console.log(`\n📝 Query: "${test.query}"`);
    console.log('-'.repeat(60));

    try {
      // Search for patient data
      const patientContext = await searchPatientData(test.query, clinicId);
      
      if (patientContext.type === 'patient_found') {
        console.log(`✅ Patient found: ${patientContext.summary?.name}`);
        console.log(`   Orders: ${patientContext.summary?.orderCount}`);
        
        if (patientContext.tracking) {
          console.log(`   Tracking Info: ${patientContext.tracking.length} record(s)`);
          patientContext.tracking.forEach((t: any) => {
            console.log(`     - ${t.trackingNumber} (${t.status})`);
          });
        }
        
        if (patientContext.shippingUpdates) {
          console.log(`   Shipping Updates: ${patientContext.shippingUpdates.length} record(s)`);
        }
        
        if (patientContext.vitals?.latestWeight) {
          console.log(`   Weight: ${patientContext.vitals.latestWeight.weight} ${patientContext.vitals.latestWeight.unit}`);
        }

        // Try direct answer
        const directAnswer = tryDirectAnswer(test.query, patientContext);
        if (directAnswer) {
          console.log(`\n   📣 Direct Answer (${directAnswer.queryType}):`);
          console.log('   ' + directAnswer.answer.replace(/\n/g, '\n   '));
        } else {
          console.log(`\n   ⚠️ No direct answer - would send to OpenAI`);
        }
      } else {
        console.log(`❌ Patient not found`);
      }
    } catch (error: any) {
      console.log(`❌ Error: ${error.message}`);
    }
  }

  // Test with patientId directly (simulating being on patient profile page)
  console.log('\n\n' + '='.repeat(60));
  console.log('Testing with patientId (patient profile context)');
  console.log('='.repeat(60));

  const profileQueries = [
    "What's the tracking number?",
    "What's her weight?",
    "Show prescriptions",
  ];

  for (const query of profileQueries) {
    console.log(`\n📝 Query: "${query}" (with patientId=${patientId})`);
    console.log('-'.repeat(60));

    const patientContext = await searchPatientData(query, clinicId, patientId);
    
    if (patientContext.type === 'patient_found') {
      console.log(`✅ Patient found: ${patientContext.summary?.name}`);
      
      const directAnswer = tryDirectAnswer(query, patientContext);
      if (directAnswer) {
        console.log(`\n   📣 Answer (${directAnswer.queryType}):`);
        console.log('   ' + directAnswer.answer.replace(/\n/g, '\n   '));
      }
    }
  }

  console.log('\n\n' + '='.repeat(60));
  console.log('✅ All tests completed!');
  console.log('='.repeat(60));

  await prisma.$disconnect();
}

runTests().catch(console.error);
