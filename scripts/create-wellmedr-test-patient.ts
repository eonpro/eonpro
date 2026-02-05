/**
 * CREATE WELLMEDR TEST PATIENT
 * ============================
 * Creates a test patient for WellMedR clinic with login credentials.
 * 
 * Usage:
 *   npx tsx scripts/create-wellmedr-test-patient.ts
 * 
 * Or with custom credentials:
 *   TEST_EMAIL=mytest@email.com TEST_PASSWORD=MyPassword123! npx tsx scripts/create-wellmedr-test-patient.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Default test patient configuration
const DEFAULT_EMAIL = 'testpatient@wellmedr.com';
const DEFAULT_PASSWORD = 'WellMedR2026!';

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║       WELLMEDR TEST PATIENT SETUP                        ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // Get credentials from env or use defaults
  const email = process.env.TEST_EMAIL || DEFAULT_EMAIL;
  const password = process.env.TEST_PASSWORD || DEFAULT_PASSWORD;

  // Step 1: Find WellMedR clinic
  console.log('🔍 Finding WellMedR clinic...');
  const clinic = await prisma.clinic.findFirst({
    where: {
      OR: [
        { subdomain: 'wellmedr' },
        { subdomain: { contains: 'wellmedr', mode: 'insensitive' } },
        { name: { contains: 'Wellmedr', mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, subdomain: true },
  });

  if (!clinic) {
    console.error('❌ WellMedR clinic not found in database!');
    console.log('\n📝 To create the WellMedR clinic, run:');
    console.log('   npx tsx scripts/create-wellmedr-clinic.ts');
    console.log('   OR');
    console.log('   npx tsx scripts/setup-wellmedr-lifefile.ts');
    process.exit(1);
  }

  console.log(`   ✓ Found clinic: ${clinic.name} (ID: ${clinic.id}, Subdomain: ${clinic.subdomain})`);

  // Step 2: Check if test patient already exists
  console.log(`\n🔍 Checking for existing patient with email: ${email}...`);
  const existingPatient = await prisma.patient.findFirst({
    where: { email, clinicId: clinic.id },
    select: { id: true, patientId: true, firstName: true, lastName: true },
  });

  let patientId: number;
  let patientIdStr: string;

  if (existingPatient) {
    console.log(`   ✓ Patient already exists: ${existingPatient.firstName} ${existingPatient.lastName} (${existingPatient.patientId})`);
    patientId = existingPatient.id;
    patientIdStr = existingPatient.patientId;
  } else {
    // Step 3: Generate unique patient ID
    console.log('\n📝 Creating new test patient...');
    
    // Get or create patient counter for this clinic
    let counter = await prisma.patientCounter.findFirst({
      where: { clinicId: clinic.id },
    });

    if (!counter) {
      counter = await prisma.patientCounter.create({
        data: { clinicId: clinic.id, current: 0 },
      });
    }

    // Increment counter
    const newCounter = await prisma.patientCounter.update({
      where: { id: counter.id },
      data: { current: { increment: 1 } },
    });

    patientIdStr = `WM-${String(newCounter.current).padStart(6, '0')}`;

    // Create patient
    const patient = await prisma.patient.create({
      data: {
        patientId: patientIdStr,
        firstName: 'Test',
        lastName: 'Patient',
        email: email,
        phone: '5551234567',
        dob: '1990-01-15',
        gender: 'Female',
        address1: '123 Test Street',
        city: 'Miami',
        state: 'FL',
        zip: '33139',
        clinicId: clinic.id,
        source: 'test-script',
        tags: ['test-patient', 'wellmedr'],
      },
    });

    patientId = patient.id;
    console.log(`   ✓ Created patient: ${patient.firstName} ${patient.lastName} (${patientIdStr})`);
  }

  // Step 4: Create or update User account for patient login
  console.log('\n👤 Setting up login credentials...');
  const hashedPassword = await bcrypt.hash(password, 12);

  const existingUser = await prisma.user.findFirst({
    where: { email, patientId },
  });

  if (existingUser) {
    // Update existing user's password
    await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        passwordHash: hashedPassword,
        status: 'ACTIVE',
        emailVerified: true,
        lastPasswordChange: new Date(),
      },
    });
    console.log(`   ✓ Updated login credentials for existing user`);
  } else {
    // Create new user account
    const user = await prisma.user.create({
      data: {
        email: email,
        passwordHash: hashedPassword,
        firstName: 'Test',
        lastName: 'Patient',
        role: 'PATIENT',
        status: 'ACTIVE',
        clinicId: clinic.id,
        patientId: patientId,
        emailVerified: true,
        lastPasswordChange: new Date(),
      },
    });

    // Create UserClinic relationship
    await prisma.userClinic.create({
      data: {
        userId: user.id,
        clinicId: clinic.id,
        role: 'PATIENT',
        isPrimary: true,
        isActive: true,
      },
    });

    console.log(`   ✓ Created login account`);
  }

  // Step 5: Create some sample data for the portal
  console.log('\n📊 Setting up sample portal data...');

  // Add weight logs for progress tracking
  const existingWeightLogs = await prisma.patientWeightLog.count({
    where: { patientId },
  });

  if (existingWeightLogs === 0) {
    const weights = [210, 208, 205, 202, 200, 198, 195];
    const baseDate = new Date();
    
    for (let i = 0; i < weights.length; i++) {
      const logDate = new Date(baseDate);
      logDate.setDate(logDate.getDate() - (i * 7)); // Weekly entries going back

      await prisma.patientWeightLog.create({
        data: {
          patientId,
          weight: weights[i],
          recordedAt: logDate,
          source: 'patient_portal',
        },
      });
    }
    console.log(`   ✓ Added ${weights.length} weight log entries`);
  } else {
    console.log(`   ✓ Weight logs already exist (${existingWeightLogs} entries)`);
  }

  // Summary
  console.log('\n');
  console.log('═'.repeat(60));
  console.log('✅ WELLMEDR TEST PATIENT READY!');
  console.log('═'.repeat(60));
  console.log('\n📋 LOGIN CREDENTIALS:\n');
  console.log('   🔗 URL:      https://app.eonpro.io/login');
  console.log(`   📧 Email:    ${email}`);
  console.log(`   🔑 Password: ${password}`);
  console.log('\n📊 PATIENT INFO:\n');
  console.log(`   🆔 Patient ID: ${patientIdStr}`);
  console.log(`   🏥 Clinic:     ${clinic.name}`);
  console.log(`   📍 Subdomain:  ${clinic.subdomain}`);
  console.log('\n🎯 NEXT STEPS:\n');
  console.log('   1. Go to https://app.eonpro.io/login');
  console.log(`   2. Enter email: ${email}`);
  console.log(`   3. Enter password: ${password}`);
  console.log('   4. You\'ll be redirected to the Patient Portal');
  console.log('\n💡 TIP: Patient Portal features include:');
  console.log('   • Progress tracking (weight logs)');
  console.log('   • Medication reminders');
  console.log('   • Document uploads');
  console.log('   • Chat with care team');
  console.log('   • Appointment scheduling');
  console.log('   • Shipment tracking');
  console.log('');
}

main()
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
