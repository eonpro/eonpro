/**
 * Script to add the missing prescription to patient 658
 * 
 * This creates the Order and Rx records for the prescription that was sent to Lifefile
 * but didn't save in the local database.
 * 
 * Run with production DATABASE_URL:
 * DATABASE_URL="your-prod-url" npx tsx scripts/add-missing-prescription.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addMissingPrescription() {
  console.log('\n=== Adding Missing Prescription ===\n');

  // Data from Lifefile (Order #100719360)
  const LIFEFILE_ORDER_ID = '100719360';
  const PATIENT_ID = 658;
  const PATIENT_INFO = {
    firstName: 'Jeannie',
    lastName: 'Pine',
    dob: '1952-03-08', // or '03/08/1952'
  };
  
  // Provider info from Lifefile screenshot
  const PROVIDER_NPI = '1497917561';
  const PROVIDER_NAME = { firstName: 'Gavin', lastName: 'Sigle' };
  
  // Medication info from Lifefile
  const MEDICATION = {
    name: 'TIRZEPATIDE/GLYCINE 10/20MG/ML (2ML VIAL)',
    strength: '10/20MG/ML',
    form: 'SOLUTION Injectable',
    quantity: '3',
  };

  // 1. First verify patient exists
  console.log('1. Verifying patient exists...');
  const patient = await prisma.patient.findUnique({
    where: { id: PATIENT_ID },
    include: { clinic: true },
  });

  if (!patient) {
    // Try to find by name
    console.log('   Patient ID not found, searching by name...');
    const patientsByName = await prisma.patient.findMany({
      where: {
        firstName: { contains: PATIENT_INFO.firstName, mode: 'insensitive' },
        lastName: { contains: PATIENT_INFO.lastName, mode: 'insensitive' },
      },
      include: { clinic: true },
    });
    
    if (patientsByName.length === 0) {
      console.error('   ❌ No patient found with name:', PATIENT_INFO);
      console.log('\n   Available patients (first 10):');
      const allPatients = await prisma.patient.findMany({ take: 10, include: { clinic: true } });
      allPatients.forEach(p => {
        console.log(`   - ID ${p.id}: ${p.firstName} ${p.lastName} (Clinic: ${p.clinic?.name})`);
      });
      await prisma.$disconnect();
      return;
    }
    
    console.log('   Found patients by name:');
    patientsByName.forEach(p => {
      console.log(`   - ID ${p.id}: ${p.firstName} ${p.lastName}, DOB: ${p.dob}, Clinic: ${p.clinic?.name}`);
    });
    console.log('\n   Please update PATIENT_ID in the script and re-run.');
    await prisma.$disconnect();
    return;
  }

  console.log('   ✅ Found patient:', {
    id: patient.id,
    name: `${patient.firstName} ${patient.lastName}`,
    clinicId: patient.clinicId,
    clinicName: patient.clinic?.name,
  });

  // 2. Find provider by NPI
  console.log('\n2. Finding provider...');
  let provider = await prisma.provider.findFirst({
    where: { npi: PROVIDER_NPI },
    include: { clinic: true },
  });

  if (!provider) {
    // Try by name
    provider = await prisma.provider.findFirst({
      where: {
        firstName: { contains: PROVIDER_NAME.firstName, mode: 'insensitive' },
        lastName: { contains: PROVIDER_NAME.lastName, mode: 'insensitive' },
      },
      include: { clinic: true },
    });
  }

  if (!provider) {
    console.error('   ❌ Provider not found. Available providers:');
    const allProviders = await prisma.provider.findMany({ take: 10, include: { clinic: true } });
    allProviders.forEach(p => {
      console.log(`   - ID ${p.id}: ${p.firstName} ${p.lastName}, NPI: ${p.npi}, Clinic: ${p.clinic?.name}`);
    });
    await prisma.$disconnect();
    return;
  }

  console.log('   ✅ Found provider:', {
    id: provider.id,
    name: `${provider.firstName} ${provider.lastName}`,
    npi: provider.npi,
    clinicId: provider.clinicId,
  });

  // 3. Check if order already exists
  console.log('\n3. Checking if order already exists...');
  const existingOrder = await prisma.order.findFirst({
    where: { lifefileOrderId: LIFEFILE_ORDER_ID },
  });

  if (existingOrder) {
    console.log('   ⚠️ Order already exists:', {
      id: existingOrder.id,
      patientId: existingOrder.patientId,
      status: existingOrder.status,
    });
    
    // Check if it's linked to wrong patient
    if (existingOrder.patientId !== PATIENT_ID) {
      console.log(`\n   Order is linked to patient ${existingOrder.patientId}, should be ${PATIENT_ID}`);
      console.log('   Updating patient link...');
      
      const updated = await prisma.order.update({
        where: { id: existingOrder.id },
        data: { 
          patientId: PATIENT_ID,
          clinicId: patient.clinicId,
        },
      });
      
      console.log('   ✅ Updated order to correct patient:', updated.id);
    } else {
      console.log('   Order is already linked to correct patient.');
    }
    
    await prisma.$disconnect();
    return;
  }

  // 4. Create the order
  console.log('\n4. Creating order...');
  const messageId = `eonpro-recovery-${Date.now()}`;
  const referenceId = `rx-recovery-${Date.now()}`;

  const order = await prisma.order.create({
    data: {
      messageId,
      referenceId,
      lifefileOrderId: LIFEFILE_ORDER_ID,
      patientId: PATIENT_ID,
      providerId: provider.id,
      clinicId: patient.clinicId, // Use patient's clinic
      shippingMethod: 8115, // Standard shipping
      primaryMedName: MEDICATION.name,
      primaryMedStrength: MEDICATION.strength,
      primaryMedForm: MEDICATION.form,
      status: 'sent',
      requestJson: JSON.stringify({
        recovered: true,
        lifefileOrderId: LIFEFILE_ORDER_ID,
        createdAt: new Date().toISOString(),
      }),
      responseJson: JSON.stringify({
        orderId: LIFEFILE_ORDER_ID,
        status: 'sent',
        recovered: true,
      }),
    },
  });

  console.log('   ✅ Created order:', {
    id: order.id,
    lifefileOrderId: order.lifefileOrderId,
    patientId: order.patientId,
    clinicId: order.clinicId,
  });

  // 5. Create Rx record
  console.log('\n5. Creating Rx record...');
  const rx = await prisma.rx.create({
    data: {
      orderId: order.id,
      medicationKey: 'TIRZEPATIDE_GLYCINE_10_20MG_2ML', // Approximate key
      medName: MEDICATION.name,
      strength: MEDICATION.strength,
      form: 'INJ',
      quantity: MEDICATION.quantity,
      refills: '0',
      sig: 'Inject as directed by physician',
    },
  });

  console.log('   ✅ Created Rx:', {
    id: rx.id,
    medName: rx.medName,
    quantity: rx.quantity,
  });

  // 6. Verify
  console.log('\n6. Verifying...');
  const verifyPatient = await prisma.patient.findUnique({
    where: { id: PATIENT_ID },
    include: {
      orders: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { rxs: true },
      },
    },
  });

  console.log('   Patient now has', verifyPatient?.orders?.length, 'orders');
  verifyPatient?.orders?.forEach((o, i) => {
    console.log(`   ${i + 1}. Order ${o.id}: lifefileId=${o.lifefileOrderId}, rxCount=${o.rxs?.length}`);
  });

  console.log('\n✅ DONE! Prescription has been added to patient profile.');
  console.log('   Refresh the patient page to see the prescription.');

  await prisma.$disconnect();
}

addMissingPrescription().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
