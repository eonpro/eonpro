/**
 * Fix NULL clinicId on Patient records using raw SQL
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Find patients with NULL clinicId using raw SQL
  const patientsWithNullClinic = await prisma.$queryRaw`
    SELECT id, "firstName", "lastName", "clinicId" 
    FROM "Patient" 
    WHERE "clinicId" IS NULL
  `;

  console.log('Patients with NULL clinicId:', patientsWithNullClinic);

  if (!Array.isArray(patientsWithNullClinic) || patientsWithNullClinic.length === 0) {
    console.log('No patients with NULL clinicId found');
    return;
  }

  // Get the first available clinic
  const clinic = await prisma.clinic.findFirst({
    select: { id: true, name: true }
  });

  if (!clinic) {
    console.error('No clinic found!');
    return;
  }

  console.log('Will assign to clinic:', clinic);

  // Update patients using raw SQL
  const result = await prisma.$executeRaw`
    UPDATE "Patient" 
    SET "clinicId" = ${clinic.id} 
    WHERE "clinicId" IS NULL
  `;

  console.log('Updated', result, 'patients');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
