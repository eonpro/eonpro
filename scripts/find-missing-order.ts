/**
 * Diagnostic script to find a missing prescription order
 * 
 * Run with: npx tsx scripts/find-missing-order.ts
 * 
 * This will search for:
 * 1. Orders with the Lifefile order ID
 * 2. All orders for the patient
 * 3. All patients with matching name
 * 4. Recent orders by the provider
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findMissingOrder() {
  const LIFEFILE_ORDER_ID = '100719360';
  const PATIENT_NAME = { firstName: 'Jeannie', lastName: 'Pine' };
  const PATIENT_DOB = '1952-03-08'; // Also try '03/08/1952'
  const PATIENT_ID = 658;
  const PROVIDER_NAME = 'Gavin Sigle';

  console.log('\n=== DIAGNOSTIC: Finding Missing Order ===\n');

  // 1. Search by Lifefile Order ID
  console.log('1. Searching for order with lifefileOrderId:', LIFEFILE_ORDER_ID);
  const orderByLifefileId = await prisma.order.findFirst({
    where: { lifefileOrderId: LIFEFILE_ORDER_ID },
    include: {
      patient: true,
      provider: true,
      clinic: true,
      rxs: true,
    },
  });

  if (orderByLifefileId) {
    console.log('   ✅ FOUND:', {
      orderId: orderByLifefileId.id,
      patientId: orderByLifefileId.patientId,
      patientName: `${orderByLifefileId.patient?.firstName} ${orderByLifefileId.patient?.lastName}`,
      patientClinicId: orderByLifefileId.patient?.clinicId,
      orderClinicId: orderByLifefileId.clinicId,
      orderClinicName: orderByLifefileId.clinic?.name,
      status: orderByLifefileId.status,
      createdAt: orderByLifefileId.createdAt,
    });
  } else {
    console.log('   ❌ NOT FOUND');
  }

  // 2. Search for patient by ID
  console.log('\n2. Searching for patient ID:', PATIENT_ID);
  const patientById = await prisma.patient.findUnique({
    where: { id: PATIENT_ID },
    include: {
      clinic: true,
      orders: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { rxs: true },
      },
    },
  });

  if (patientById) {
    console.log('   ✅ FOUND:', {
      id: patientById.id,
      name: `${patientById.firstName} ${patientById.lastName}`,
      dob: patientById.dob,
      clinicId: patientById.clinicId,
      clinicName: patientById.clinic?.name,
      orderCount: patientById.orders?.length,
    });
    if (patientById.orders?.length) {
      console.log('   Recent orders:');
      patientById.orders.forEach((o, i) => {
        console.log(`     ${i + 1}. Order ${o.id}: lifefileId=${o.lifefileOrderId}, status=${o.status}, clinicId=${o.clinicId}`);
      });
    }
  } else {
    console.log('   ❌ NOT FOUND');
  }

  // 3. Find ALL patients named Jeannie Pine
  console.log('\n3. Searching for all patients named:', PATIENT_NAME);
  const patientsByName = await prisma.patient.findMany({
    where: {
      firstName: { contains: PATIENT_NAME.firstName, mode: 'insensitive' },
      lastName: { contains: PATIENT_NAME.lastName, mode: 'insensitive' },
    },
    include: {
      clinic: true,
      orders: {
        orderBy: { createdAt: 'desc' },
        take: 3,
      },
    },
  });

  console.log(`   Found ${patientsByName.length} patients:`);
  patientsByName.forEach((p, i) => {
    console.log(`   ${i + 1}. Patient ${p.id}: ${p.firstName} ${p.lastName}, DOB: ${p.dob}`);
    console.log(`      Clinic: ${p.clinicId} (${p.clinic?.name})`);
    console.log(`      Orders: ${p.orders?.length || 0}`);
    p.orders?.forEach((o, j) => {
      console.log(`        ${j + 1}. Order ${o.id}: lifefileId=${o.lifefileOrderId}, clinicId=${o.clinicId}`);
    });
  });

  // 4. Find orders by messageId pattern (today's orders)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  console.log('\n4. Orders created today:');
  const todayOrders = await prisma.order.findMany({
    where: {
      createdAt: { gte: today },
    },
    include: {
      patient: true,
      provider: true,
      clinic: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  console.log(`   Found ${todayOrders.length} orders today:`);
  todayOrders.forEach((o, i) => {
    console.log(`   ${i + 1}. Order ${o.id}: lifefileId=${o.lifefileOrderId || 'null'}`);
    console.log(`      Patient: ${o.patient?.firstName} ${o.patient?.lastName} (ID: ${o.patientId})`);
    console.log(`      Provider: ${o.provider?.firstName} ${o.provider?.lastName}`);
    console.log(`      Clinic: ${o.clinicId} (${o.clinic?.name})`);
    console.log(`      Status: ${o.status}, Created: ${o.createdAt}`);
  });

  // 5. Find provider Gavin Sigle
  console.log('\n5. Searching for provider:', PROVIDER_NAME);
  const providers = await prisma.provider.findMany({
    where: {
      OR: [
        { firstName: { contains: 'Gavin', mode: 'insensitive' } },
        { lastName: { contains: 'Sigle', mode: 'insensitive' } },
      ],
    },
    include: {
      clinic: true,
    },
  });

  console.log(`   Found ${providers.length} matching providers:`);
  providers.forEach((p, i) => {
    console.log(`   ${i + 1}. Provider ${p.id}: ${p.firstName} ${p.lastName}`);
    console.log(`      NPI: ${p.npi}, Clinic: ${p.clinicId} (${p.clinic?.name || 'null'})`);
  });

  // 6. Check all clinics
  console.log('\n6. All clinics in system:');
  const clinics = await prisma.clinic.findMany({
    select: { id: true, name: true, subdomain: true },
  });
  clinics.forEach((c) => {
    console.log(`   - ID ${c.id}: ${c.name} (${c.subdomain})`);
  });

  // 7. Check for orders with messageId containing today's timestamp
  console.log('\n7. Checking for orders with recent messageId:');
  const recentMessageOrders = await prisma.order.findMany({
    where: {
      messageId: { contains: 'eonpro-' },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      patient: true,
      clinic: true,
    },
  });

  recentMessageOrders.forEach((o, i) => {
    console.log(`   ${i + 1}. messageId: ${o.messageId}`);
    console.log(`      Patient: ${o.patient?.firstName} ${o.patient?.lastName}, Clinic: ${o.clinic?.name}`);
  });

  await prisma.$disconnect();
}

findMissingOrder().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
