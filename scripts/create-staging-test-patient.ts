/**
 * CREATE STAGING TEST PATIENT
 * ===========================
 * Creates a test patient with login credentials for staging / E2E (e.g. Playwright smoke test).
 * Use this to add patient@example.com / YourPatientPassword123! (or custom credentials) to staging.
 *
 * Usage (against staging DB – set DATABASE_URL to staging):
 *
 *   # Default: patient@example.com / YourPatientPassword123!, first clinic in DB
 *   npx tsx scripts/create-staging-test-patient.ts
 *
 *   # Custom email/password
 *   TEST_EMAIL=patient@example.com TEST_PASSWORD=YourPatientPassword123! npx tsx scripts/create-staging-test-patient.ts
 *
 *   # Target a specific clinic by name or subdomain
 *   CLINIC_NAME=EONPRO npx tsx scripts/create-staging-test-patient.ts
 *   CLINIC_SUBDOMAIN=staging npx tsx scripts/create-staging-test-patient.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEFAULT_EMAIL = 'patient@example.com';
const DEFAULT_PASSWORD = 'YourPatientPassword123!';
const PATIENT_ID_PREFIX = 'STG';

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║       STAGING TEST PATIENT (Portal / E2E)                 ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const email = (process.env.TEST_EMAIL || process.env.TEST_PATIENT_EMAIL || DEFAULT_EMAIL).toLowerCase();
  const password = process.env.TEST_PASSWORD || process.env.TEST_PATIENT_PASSWORD || DEFAULT_PASSWORD;
  const clinicName = process.env.CLINIC_NAME;
  const clinicSubdomain = process.env.CLINIC_SUBDOMAIN;

  // Resolve clinic
  let clinic = null;
  if (clinicName || clinicSubdomain) {
    clinic = await prisma.clinic.findFirst({
      where: {
        OR: [
          clinicName ? { name: { contains: clinicName, mode: 'insensitive' } } : {},
          clinicSubdomain ? { subdomain: { contains: clinicSubdomain, mode: 'insensitive' } } : {},
        ].filter(Boolean),
      },
      select: { id: true, name: true, subdomain: true },
    });
  }
  if (!clinic) {
    clinic = await prisma.clinic.findFirst({
      orderBy: { id: 'asc' },
      select: { id: true, name: true, subdomain: true },
    });
  }
  if (!clinic) {
    console.error('❌ No clinic found in database. Create a clinic first.');
    process.exit(1);
  }
  console.log(`   ✓ Clinic: ${clinic.name} (ID: ${clinic.id}, subdomain: ${clinic.subdomain})`);

  // Existing patient by email in this clinic
  let patient = await prisma.patient.findFirst({
    where: { email, clinicId: clinic.id },
    select: { id: true, patientId: true, firstName: true, lastName: true },
  });

  let patientId: number;
  let patientIdStr: string;

  if (patient) {
    console.log(`   ✓ Patient exists: ${patient.firstName} ${patient.lastName} (${patient.patientId})`);
    patientId = patient.id;
    patientIdStr = patient.patientId || String(patient.id);
  } else {
    let counter = await prisma.patientCounter.findFirst({ where: { clinicId: clinic.id } });
    if (!counter) {
      counter = await prisma.patientCounter.create({
        data: { clinicId: clinic.id, current: 0 },
      });
    }
    const updated = await prisma.patientCounter.update({
      where: { id: counter.id },
      data: { current: { increment: 1 } },
    });
    patientIdStr = `${PATIENT_ID_PREFIX}-${String(updated.current).padStart(6, '0')}`;

    const created = await prisma.patient.create({
      data: {
        patientId: patientIdStr,
        firstName: 'Staging',
        lastName: 'Test Patient',
        email,
        phone: '5551234567',
        dob: '1990-01-15',
        gender: 'Other',
        address1: '123 Test St',
        city: 'Miami',
        state: 'FL',
        zip: '33139',
        clinicId: clinic.id,
        source: 'test-script',
        tags: ['test-patient', 'staging'],
      },
    });
    patient = { id: created.id, patientId: created.patientId, firstName: created.firstName, lastName: created.lastName };
    patientId = created.id;
    console.log(`   ✓ Created patient: ${created.firstName} ${created.lastName} (${patientIdStr})`);
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const existingUser = await prisma.user.findFirst({
    where: { email, patientId },
  });

  if (existingUser) {
    await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        passwordHash: hashedPassword,
        status: 'ACTIVE',
        emailVerified: true,
        lastPasswordChange: new Date(),
      },
    });
    console.log('   ✓ Updated login password for existing user');
  } else {
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: hashedPassword,
        firstName: 'Staging',
        lastName: 'Test Patient',
        role: 'PATIENT',
        status: 'ACTIVE',
        clinicId: clinic.id,
        patientId,
        emailVerified: true,
        lastPasswordChange: new Date(),
      },
    });
    await prisma.userClinic.create({
      data: {
        userId: user.id,
        clinicId: clinic.id,
        role: 'PATIENT',
        isPrimary: true,
        isActive: true,
      },
    });
    console.log('   ✓ Created login account (PATIENT)');
  }

  console.log('\n' + '═'.repeat(60));
  console.log('✅ Staging test patient ready');
  console.log('═'.repeat(60));
  console.log('\n📋 Use these in Playwright / env:\n');
  console.log(`   TEST_PATIENT_EMAIL=${email}`);
  console.log(`   TEST_PATIENT_PASSWORD=<your password>`);
  console.log('\n   Log in at your staging URL (e.g. https://staging.eonpro.io/login) with the above.\n');
}

main()
  .catch((e) => {
    console.error('\n❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
