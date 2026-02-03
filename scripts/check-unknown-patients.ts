/**
 * Quick script to check for Unknown Customer patients
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.production.local' });
dotenv.config({ path: '.env.local' });

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
  // Check for any patients with 'Unknown' in firstName or lastName
  const unknownPatients = await prisma.patient.findMany({
    where: {
      OR: [
        { firstName: { contains: 'Unknown', mode: 'insensitive' } },
        { lastName: { contains: 'Customer', mode: 'insensitive' } },
        { lastName: { contains: 'Unknown', mode: 'insensitive' } },
      ]
    },
    select: {
      id: true,
      patientId: true,
      firstName: true,
      lastName: true,
      email: true,
      stripeCustomerId: true,
    },
    take: 20,
    orderBy: { createdAt: 'desc' }
  });
  
  console.log('Found', unknownPatients.length, 'patients with Unknown/Customer in name:');
  unknownPatients.forEach((p: any) => {
    console.log('  -', p.patientId, ':', p.firstName, p.lastName, '| email:', p.email?.substring(0, 30) || 'none', '| stripeId:', p.stripeCustomerId ? 'yes' : 'NO');
  });
  
  // Check total patients count
  const total = await prisma.patient.count();
  console.log('\nTotal patients in database:', total);
  
  // Check recent patients (last 10)
  console.log('\n--- Last 10 patients created ---');
  const recent = await prisma.patient.findMany({
    select: {
      patientId: true,
      firstName: true,
      lastName: true,
      email: true,
      createdAt: true,
    },
    take: 10,
    orderBy: { createdAt: 'desc' }
  });
  recent.forEach((p: any) => {
    console.log('  -', p.patientId, ':', p.firstName, p.lastName, '| email:', p.email?.substring(0, 25) || 'none');
  });
  
  await prisma.$disconnect();
}
check();
