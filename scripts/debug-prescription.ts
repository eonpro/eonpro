import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function debugPrescription() {
  console.log('\n=== Debugging Prescription Issue ===\n');

  // 1. Find the order by Lifefile Order ID
  console.log('1. Searching for order with lifefileOrderId 100719360...');
  const orderByLifefileId = await prisma.order.findFirst({
    where: { lifefileOrderId: '100719360' },
    include: {
      patient: true,
      provider: true,
      clinic: true,
      rxs: true,
    },
  });

  if (orderByLifefileId) {
    console.log('\n✅ FOUND Order:', {
      id: orderByLifefileId.id,
      lifefileOrderId: orderByLifefileId.lifefileOrderId,
      clinicId: orderByLifefileId.clinicId,
      clinicName: orderByLifefileId.clinic?.name,
      status: orderByLifefileId.status,
      createdAt: orderByLifefileId.createdAt,
      patientId: orderByLifefileId.patientId,
      patientName: `${orderByLifefileId.patient?.firstName} ${orderByLifefileId.patient?.lastName}`,
      patientClinicId: orderByLifefileId.patient?.clinicId,
      providerId: orderByLifefileId.providerId,
      providerName: `${orderByLifefileId.provider?.firstName} ${orderByLifefileId.provider?.lastName}`,
      providerClinicId: orderByLifefileId.provider?.clinicId,
      rxCount: orderByLifefileId.rxs?.length,
    });
  } else {
    console.log('\n❌ Order NOT FOUND by lifefileOrderId');
  }

  // 2. Find patient by ID 658
  console.log('\n2. Searching for patient with id 658...');
  const patient658 = await prisma.patient.findUnique({
    where: { id: 658 },
    include: {
      clinic: true,
      orders: {
        include: {
          rxs: true,
          provider: true,
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (patient658) {
    console.log('\n✅ FOUND Patient:', {
      id: patient658.id,
      name: `${patient658.firstName} ${patient658.lastName}`,
      dob: patient658.dob,
      clinicId: patient658.clinicId,
      clinicName: patient658.clinic?.name,
      orderCount: patient658.orders?.length,
    });
    
    if (patient658.orders && patient658.orders.length > 0) {
      console.log('\nPatient Orders:');
      patient658.orders.forEach((order, i) => {
        console.log(`  Order ${i + 1}:`, {
          id: order.id,
          lifefileOrderId: order.lifefileOrderId,
          clinicId: order.clinicId,
          status: order.status,
          createdAt: order.createdAt,
        });
      });
    } else {
      console.log('\n❌ Patient has NO orders in database');
    }
  } else {
    console.log('\n❌ Patient 658 NOT FOUND');
  }

  // 3. Find all orders for "Pine" patients
  console.log('\n3. Searching for all orders for patients with lastName "Pine"...');
  const pineOrders = await prisma.order.findMany({
    where: {
      patient: {
        lastName: { contains: 'Pine', mode: 'insensitive' },
      },
    },
    include: {
      patient: true,
      clinic: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  console.log(`\nFound ${pineOrders.length} orders for Pine patients:`);
  pineOrders.forEach((order, i) => {
    console.log(`  ${i + 1}.`, {
      orderId: order.id,
      lifefileOrderId: order.lifefileOrderId,
      orderClinicId: order.clinicId,
      orderClinicName: order.clinic?.name,
      patientId: order.patientId,
      patientName: `${order.patient?.firstName} ${order.patient?.lastName}`,
      patientClinicId: order.patient?.clinicId,
      status: order.status,
      createdAt: order.createdAt,
    });
  });

  // 4. Find all patients named "Jeannie Pine"
  console.log('\n4. Searching for all patients named "Jeannie Pine"...');
  const jeanniePinePatients = await prisma.patient.findMany({
    where: {
      firstName: { contains: 'Jeannie', mode: 'insensitive' },
      lastName: { contains: 'Pine', mode: 'insensitive' },
    },
    include: {
      clinic: true,
      orders: {
        include: { rxs: true },
      },
    },
  });

  console.log(`\nFound ${jeanniePinePatients.length} patients named Jeannie Pine:`);
  jeanniePinePatients.forEach((p, i) => {
    console.log(`  ${i + 1}.`, {
      id: p.id,
      name: `${p.firstName} ${p.lastName}`,
      dob: p.dob,
      clinicId: p.clinicId,
      clinicName: p.clinic?.name,
      orderCount: p.orders?.length,
    });
  });

  // 5. Check most recent orders in system
  console.log('\n5. Most recent 5 orders in the system...');
  const recentOrders = await prisma.order.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: {
      patient: true,
      clinic: true,
      provider: true,
    },
  });

  recentOrders.forEach((order, i) => {
    console.log(`  ${i + 1}.`, {
      orderId: order.id,
      lifefileOrderId: order.lifefileOrderId,
      clinicId: order.clinicId,
      clinicName: order.clinic?.name,
      patientName: `${order.patient?.firstName} ${order.patient?.lastName}`,
      providerName: `${order.provider?.firstName} ${order.provider?.lastName}`,
      status: order.status,
      createdAt: order.createdAt,
    });
  });

  // 6. Check all clinics
  console.log('\n6. All clinics in the system...');
  const clinics = await prisma.clinic.findMany({
    select: {
      id: true,
      name: true,
      subdomain: true,
    },
  });
  clinics.forEach((c) => {
    console.log(`  - ID ${c.id}: ${c.name} (${c.subdomain})`);
  });

  await prisma.$disconnect();
}

debugPrescription().catch(console.error);
