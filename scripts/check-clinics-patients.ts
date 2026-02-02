import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('=== Checking Clinics and Patients ===\n');

  // Check all clinics
  const clinics = await prisma.clinic.findMany({
    select: { id: true, name: true, subdomain: true },
  });
  console.log(`Clinics (${clinics.length}):`);
  clinics.forEach(c => console.log(`  - ID ${c.id}: ${c.name} (${c.subdomain})`));

  // Count patients per clinic
  for (const clinic of clinics) {
    const count = await prisma.patient.count({ where: { clinicId: clinic.id } });
    console.log(`  -> ${clinic.name}: ${count} patients`);
  }

  // Find patient by email (from screenshot: tester@tear.com)
  const patientByEmail = await prisma.patient.findFirst({
    where: { email: 'tester@tear.com' },
    select: { id: true, firstName: true, lastName: true, clinicId: true, email: true },
  });
  console.log(`\nPatient with email tester@tear.com:`, patientByEmail);

  // Find patients with "Testee" name
  const testeePatients = await prisma.patient.findMany({
    where: { firstName: { contains: 'Testee', mode: 'insensitive' } },
    select: { id: true, firstName: true, lastName: true, clinicId: true, email: true },
  });
  console.log(`\nPatients named "Testee" (${testeePatients.length}):`);
  testeePatients.forEach(p => console.log(`  - ID ${p.id}: ${p.firstName} ${p.lastName} (clinic ${p.clinicId}) - ${p.email}`));

  // Check high patient IDs (in case 1021 is from a specific clinic range)
  const highIdPatients = await prisma.patient.findMany({
    where: { id: { gte: 1000, lte: 1030 } },
    select: { id: true, firstName: true, lastName: true, clinicId: true, email: true },
    orderBy: { id: 'asc' },
  });
  console.log(`\nPatients with ID 1000-1030 (${highIdPatients.length}):`);
  highIdPatients.forEach(p => console.log(`  - ID ${p.id}: ${p.firstName} ${p.lastName} (clinic ${p.clinicId})`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
