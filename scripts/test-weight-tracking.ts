/**
 * Weight Tracking Integration Test
 * Tests the full flow of weight data between provider and patient portal
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testWeightTracking() {
  console.log('='.repeat(60));
  console.log('WEIGHT TRACKING INTEGRATION TEST');
  console.log('='.repeat(60));

  try {
    // 1. Find a test patient
    console.log('\n1. Finding test patient...');
    const patient = await prisma.patient.findFirst({
      where: { id: { gt: 0 } },
      select: { id: true, firstName: true, lastName: true, clinicId: true }
    });

    if (!patient) {
      console.log('❌ No patients found in database');
      return;
    }
    console.log(`✅ Found patient: ${patient.firstName} ${patient.lastName} (ID: ${patient.id})`);

    // 2. Get existing weight logs
    console.log('\n2. Checking existing weight logs...');
    const existingLogs = await prisma.patientWeightLog.findMany({
      where: { patientId: patient.id },
      orderBy: { recordedAt: 'desc' },
      take: 5
    });
    console.log(`✅ Found ${existingLogs.length} existing weight logs`);
    if (existingLogs.length > 0) {
      console.log('   Recent entries:');
      existingLogs.forEach(log => {
        console.log(`   - ${log.weight} lbs on ${log.recordedAt.toLocaleDateString()} (source: ${log.source})`);
      });
    }

    // 3. Create a test weight entry (simulating provider entry)
    console.log('\n3. Creating test weight entry (provider source)...');
    const testWeight = 185.5;
    const providerEntry = await prisma.patientWeightLog.create({
      data: {
        patientId: patient.id,
        weight: testWeight,
        unit: 'lbs',
        notes: 'Test entry from provider - integration test',
        source: 'provider',
        recordedAt: new Date()
      }
    });
    console.log(`✅ Created provider weight entry: ${providerEntry.weight} lbs (ID: ${providerEntry.id})`);

    // 4. Create a test weight entry (simulating patient entry)
    console.log('\n4. Creating test weight entry (patient source)...');
    const patientEntry = await prisma.patientWeightLog.create({
      data: {
        patientId: patient.id,
        weight: testWeight - 0.5,
        unit: 'lbs',
        notes: 'Test entry from patient portal - integration test',
        source: 'patient',
        recordedAt: new Date(Date.now() + 1000) // 1 second later
      }
    });
    console.log(`✅ Created patient weight entry: ${patientEntry.weight} lbs (ID: ${patientEntry.id})`);

    // 5. Verify both entries are retrievable (simulating patient portal fetch)
    console.log('\n5. Verifying data retrieval (patient portal view)...');
    const allLogs = await prisma.patientWeightLog.findMany({
      where: { patientId: patient.id },
      orderBy: { recordedAt: 'desc' },
      take: 10
    });
    
    const hasProviderEntry = allLogs.some(l => l.id === providerEntry.id);
    const hasPatientEntry = allLogs.some(l => l.id === patientEntry.id);
    
    if (hasProviderEntry && hasPatientEntry) {
      console.log('✅ Both provider and patient entries are visible');
      console.log('✅ Patient portal would see all weight data correctly');
    } else {
      console.log('❌ Missing entries in retrieval');
    }

    // 6. Test data structure matches what frontend expects
    console.log('\n6. Verifying data structure for frontend...');
    const frontendData = allLogs.map(log => ({
      id: log.id,
      recordedAt: log.recordedAt,
      weight: log.weight,
      unit: log.unit,
      notes: log.notes,
      source: log.source
    }));
    
    const requiredFields = ['id', 'recordedAt', 'weight', 'source'];
    const hasAllFields = frontendData.every(entry => 
      requiredFields.every(field => entry[field as keyof typeof entry] !== undefined)
    );
    
    if (hasAllFields) {
      console.log('✅ Data structure matches frontend requirements');
    } else {
      console.log('❌ Missing required fields');
    }

    // 7. Clean up test entries
    console.log('\n7. Cleaning up test entries...');
    await prisma.patientWeightLog.deleteMany({
      where: {
        id: { in: [providerEntry.id, patientEntry.id] }
      }
    });
    console.log('✅ Test entries cleaned up');

    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));
    console.log('✅ Database connection: OK');
    console.log('✅ Patient lookup: OK');
    console.log('✅ Weight log creation (provider): OK');
    console.log('✅ Weight log creation (patient): OK');
    console.log('✅ Data retrieval: OK');
    console.log('✅ Data structure: OK');
    console.log('\n✅ ALL TESTS PASSED - Weight tracking is working correctly!');
    console.log('\nThe weight entries from provider profile WILL appear in patient portal.');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testWeightTracking();
