/**
 * COMPREHENSIVE DATA CLEANUP SCRIPT
 * ================================
 * Removes ALL test/dummy data from production
 * 
 * Run with:
 *   DATABASE_URL="your-production-url" NEW_ADMIN_PASSWORD="YourSecure123!" npm run prod:cleanup
 * 
 * Or with Vercel:
 *   npx vercel env pull .env.production.local
 *   NEW_ADMIN_PASSWORD="YourSecure123!" npx tsx scripts/cleanup-all-data.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Test data patterns to identify
const TEST_PATTERNS = {
  emails: [
    'test', 'demo', 'sample', 'example', 'fake', 'dummy',
    '@test.', '@demo.', '@example.', '@fake.', '@dummy.',
    'lifefile.com', 'tempmail', 'mailinator', 'guerrilla'
  ],
  names: [
    'test', 'demo', 'sample', 'example', 'fake', 'dummy',
    'john doe', 'jane doe', 'patient one', 'patient two',
    'test patient', 'demo patient', 'sample patient'
  ]
};

interface CleanupStats {
  patients: number;
  orders: number;
  invoices: number;
  payments: number;
  soapNotes: number;
  prescriptions: number;
  intakeSubmissions: number;
  appointments: number;
  tickets: number;
  providers: number;
  users: number;
  influencers: number;
}

async function identifyTestData(): Promise<{
  patientIds: number[];
  providerIds: number[];
  userIds: number[];
}> {
  console.log('🔍 Identifying test data...\n');
  
  // Find test patients
  const testPatients = await prisma.patient.findMany({
    where: {
      OR: [
        // Email patterns
        ...TEST_PATTERNS.emails.map(p => ({ email: { contains: p, mode: 'insensitive' as const } })),
        // Name patterns
        ...TEST_PATTERNS.names.map(p => ({ firstName: { contains: p, mode: 'insensitive' as const } })),
        ...TEST_PATTERNS.names.map(p => ({ lastName: { contains: p, mode: 'insensitive' as const } })),
        // IDs that look like test data (sequential from seed)
        { patientId: { startsWith: 'PT-TEST' } },
        { patientId: { startsWith: 'PT-DEMO' } },
      ]
    },
    select: { id: true, firstName: true, lastName: true, email: true }
  });
  
  console.log(`   Found ${testPatients.length} test patients`);
  testPatients.slice(0, 5).forEach(p => 
    console.log(`      - ${p.firstName} ${p.lastName} (${p.email})`)
  );
  if (testPatients.length > 5) console.log(`      ... and ${testPatients.length - 5} more`);
  
  // Find test providers
  const testProviders = await prisma.provider.findMany({
    where: {
      OR: [
        ...TEST_PATTERNS.emails.map(p => ({ email: { contains: p, mode: 'insensitive' as const } })),
        ...TEST_PATTERNS.names.map(p => ({ firstName: { contains: p, mode: 'insensitive' as const } })),
        ...TEST_PATTERNS.names.map(p => ({ lastName: { contains: p, mode: 'insensitive' as const } })),
        { npi: { startsWith: '1234567890' } },
      ]
    },
    select: { id: true }
  });
  console.log(`   Found ${testProviders.length} test providers`);
  
  // Find test users (excluding the admin we'll keep/create)
  const testUsers = await prisma.user.findMany({
    where: {
      AND: [
        {
          OR: [
            ...TEST_PATTERNS.emails.map(p => ({ email: { contains: p, mode: 'insensitive' as const } })),
            ...TEST_PATTERNS.names.map(p => ({ firstName: { contains: p, mode: 'insensitive' as const } })),
          ]
        },
        { email: { not: 'admin@eonpro.io' } },
        { role: { not: 'SUPER_ADMIN' } }
      ]
    },
    select: { id: true }
  });
  console.log(`   Found ${testUsers.length} test users`);
  
  return {
    patientIds: testPatients.map(p => p.id),
    providerIds: testProviders.map(p => p.id),
    userIds: testUsers.map(u => u.id),
  };
}

async function deleteTestData(stats: CleanupStats): Promise<void> {
  console.log('\n🗑️  Deleting test data (in safe order to respect foreign keys)...\n');
  
  // Step 1: Delete child records first
  
  // Delete intake form responses
  const intakeResponses = await prisma.intakeFormResponse.deleteMany({
    where: {
      submission: {
        OR: [
          { patient: { email: { contains: 'test', mode: 'insensitive' } } },
          { patient: { email: { contains: 'demo', mode: 'insensitive' } } },
        ]
      }
    }
  });
  console.log(`   ✓ Deleted ${intakeResponses.count} intake responses`);
  
  // Delete intake form submissions
  const intakes = await prisma.intakeFormSubmission.deleteMany({
    where: {
      OR: [
        { patient: { email: { contains: 'test', mode: 'insensitive' } } },
        { patient: { email: { contains: 'demo', mode: 'insensitive' } } },
        { patient: { email: { contains: 'example', mode: 'insensitive' } } },
      ]
    }
  });
  stats.intakeSubmissions = intakes.count;
  console.log(`   ✓ Deleted ${intakes.count} intake submissions`);
  
  // Delete SOAP notes
  const soapNotes = await prisma.sOAPNote.deleteMany({
    where: {
      patient: {
        OR: [
          { email: { contains: 'test', mode: 'insensitive' } },
          { email: { contains: 'demo', mode: 'insensitive' } },
          { email: { contains: 'example', mode: 'insensitive' } },
        ]
      }
    }
  });
  stats.soapNotes = soapNotes.count;
  console.log(`   ✓ Deleted ${soapNotes.count} SOAP notes`);
  
  // Delete appointments
  const appointments = await prisma.appointment.deleteMany({
    where: {
      patient: {
        OR: [
          { email: { contains: 'test', mode: 'insensitive' } },
          { email: { contains: 'demo', mode: 'insensitive' } },
        ]
      }
    }
  });
  stats.appointments = appointments.count;
  console.log(`   ✓ Deleted ${appointments.count} appointments`);
  
  // Delete tickets
  const tickets = await prisma.ticket.deleteMany({
    where: {
      patient: {
        OR: [
          { email: { contains: 'test', mode: 'insensitive' } },
          { email: { contains: 'demo', mode: 'insensitive' } },
        ]
      }
    }
  });
  stats.tickets = tickets.count;
  console.log(`   ✓ Deleted ${tickets.count} tickets`);
  
  // Delete order events first
  const orderEvents = await prisma.orderEvent.deleteMany({
    where: {
      order: {
        patient: {
          OR: [
            { email: { contains: 'test', mode: 'insensitive' } },
            { email: { contains: 'demo', mode: 'insensitive' } },
          ]
        }
      }
    }
  });
  console.log(`   ✓ Deleted ${orderEvents.count} order events`);
  
  // Delete prescriptions (Rx)
  const prescriptions = await prisma.rx.deleteMany({
    where: {
      order: {
        patient: {
          OR: [
            { email: { contains: 'test', mode: 'insensitive' } },
            { email: { contains: 'demo', mode: 'insensitive' } },
          ]
        }
      }
    }
  });
  stats.prescriptions = prescriptions.count;
  console.log(`   ✓ Deleted ${prescriptions.count} prescriptions`);
  
  // Delete payments
  const payments = await prisma.payment.deleteMany({
    where: {
      patient: {
        OR: [
          { email: { contains: 'test', mode: 'insensitive' } },
          { email: { contains: 'demo', mode: 'insensitive' } },
        ]
      }
    }
  });
  stats.payments = payments.count;
  console.log(`   ✓ Deleted ${payments.count} payments`);
  
  // Delete invoices
  const invoices = await prisma.invoice.deleteMany({
    where: {
      patient: {
        OR: [
          { email: { contains: 'test', mode: 'insensitive' } },
          { email: { contains: 'demo', mode: 'insensitive' } },
        ]
      }
    }
  });
  stats.invoices = invoices.count;
  console.log(`   ✓ Deleted ${invoices.count} invoices`);
  
  // Delete orders
  const orders = await prisma.order.deleteMany({
    where: {
      patient: {
        OR: [
          { email: { contains: 'test', mode: 'insensitive' } },
          { email: { contains: 'demo', mode: 'insensitive' } },
          { email: { contains: 'example', mode: 'insensitive' } },
        ]
      }
    }
  });
  stats.orders = orders.count;
  console.log(`   ✓ Deleted ${orders.count} orders`);
  
  // Delete patient documents
  const patientDocs = await prisma.patientDocument.deleteMany({
    where: {
      patient: {
        OR: [
          { email: { contains: 'test', mode: 'insensitive' } },
          { email: { contains: 'demo', mode: 'insensitive' } },
        ]
      }
    }
  });
  console.log(`   ✓ Deleted ${patientDocs.count} patient documents`);
  
  // Delete patient audit logs
  const patientAudits = await prisma.patientAudit.deleteMany({
    where: {
      patient: {
        OR: [
          { email: { contains: 'test', mode: 'insensitive' } },
          { email: { contains: 'demo', mode: 'insensitive' } },
        ]
      }
    }
  });
  console.log(`   ✓ Deleted ${patientAudits.count} patient audit logs`);
  
  // Delete payment methods
  const paymentMethods = await prisma.paymentMethod.deleteMany({
    where: {
      patient: {
        OR: [
          { email: { contains: 'test', mode: 'insensitive' } },
          { email: { contains: 'demo', mode: 'insensitive' } },
        ]
      }
    }
  });
  console.log(`   ✓ Deleted ${paymentMethods.count} payment methods`);
  
  // Delete subscriptions
  const subscriptions = await prisma.subscription.deleteMany({
    where: {
      patient: {
        OR: [
          { email: { contains: 'test', mode: 'insensitive' } },
          { email: { contains: 'demo', mode: 'insensitive' } },
        ]
      }
    }
  });
  console.log(`   ✓ Deleted ${subscriptions.count} subscriptions`);
  
  // Delete weight logs
  const weightLogs = await prisma.patientWeightLog.deleteMany({
    where: {
      patient: {
        OR: [
          { email: { contains: 'test', mode: 'insensitive' } },
          { email: { contains: 'demo', mode: 'insensitive' } },
        ]
      }
    }
  });
  console.log(`   ✓ Deleted ${weightLogs.count} weight logs`);
  
  // Delete medication reminders
  const medReminders = await prisma.patientMedicationReminder.deleteMany({
    where: {
      patient: {
        OR: [
          { email: { contains: 'test', mode: 'insensitive' } },
          { email: { contains: 'demo', mode: 'insensitive' } },
        ]
      }
    }
  });
  console.log(`   ✓ Deleted ${medReminders.count} medication reminders`);
  
  // Delete referral tracking
  const referrals = await prisma.referralTracking.deleteMany({
    where: {
      patient: {
        OR: [
          { email: { contains: 'test', mode: 'insensitive' } },
          { email: { contains: 'demo', mode: 'insensitive' } },
        ]
      }
    }
  });
  console.log(`   ✓ Deleted ${referrals.count} referral trackings`);
  
  // Delete AI conversations
  const aiConversations = await prisma.aIConversation.deleteMany({
    where: {
      patient: {
        OR: [
          { email: { contains: 'test', mode: 'insensitive' } },
          { email: { contains: 'demo', mode: 'insensitive' } },
        ]
      }
    }
  });
  console.log(`   ✓ Deleted ${aiConversations.count} AI conversations`);
  
  // Now delete the patients themselves
  const patients = await prisma.patient.deleteMany({
    where: {
      OR: [
        { email: { contains: 'test', mode: 'insensitive' } },
        { email: { contains: 'demo', mode: 'insensitive' } },
        { email: { contains: 'example', mode: 'insensitive' } },
        { email: { contains: 'fake', mode: 'insensitive' } },
        { email: { contains: 'dummy', mode: 'insensitive' } },
        { email: { contains: 'sample', mode: 'insensitive' } },
        { firstName: { contains: 'test', mode: 'insensitive' } },
        { firstName: { contains: 'demo', mode: 'insensitive' } },
        { lastName: { contains: 'test', mode: 'insensitive' } },
        { lastName: { contains: 'demo', mode: 'insensitive' } },
      ]
    }
  });
  stats.patients = patients.count;
  console.log(`   ✓ Deleted ${patients.count} test patients`);
  
  // Delete test influencers
  const influencers = await prisma.influencer.deleteMany({
    where: {
      OR: [
        { email: { contains: 'test', mode: 'insensitive' } },
        { email: { contains: 'demo', mode: 'insensitive' } },
      ]
    }
  });
  stats.influencers = influencers.count;
  console.log(`   ✓ Deleted ${influencers.count} test influencers`);
  
  // Delete provider audit logs for test providers
  const providerAudits = await prisma.providerAudit.deleteMany({
    where: {
      provider: {
        OR: [
          { email: { contains: 'test', mode: 'insensitive' } },
          { email: { contains: 'demo', mode: 'insensitive' } },
        ]
      }
    }
  });
  console.log(`   ✓ Deleted ${providerAudits.count} provider audit logs`);
  
  // Delete test providers
  const providers = await prisma.provider.deleteMany({
    where: {
      OR: [
        { email: { contains: 'test', mode: 'insensitive' } },
        { email: { contains: 'demo', mode: 'insensitive' } },
        { firstName: { contains: 'test', mode: 'insensitive' } },
        { firstName: { contains: 'demo', mode: 'insensitive' } },
      ]
    }
  });
  stats.providers = providers.count;
  console.log(`   ✓ Deleted ${providers.count} test providers`);
  
  // Delete test users (be careful here!)
  const users = await prisma.user.deleteMany({
    where: {
      AND: [
        {
          OR: [
            { email: { contains: 'test', mode: 'insensitive' } },
            { email: { contains: 'demo', mode: 'insensitive' } },
            { email: { contains: 'example', mode: 'insensitive' } },
            { email: { contains: 'lifefile', mode: 'insensitive' } },
          ]
        },
        { role: { not: 'SUPER_ADMIN' } }
      ]
    }
  });
  stats.users = users.count;
  console.log(`   ✓ Deleted ${users.count} test users`);
}

async function setupSuperAdmin(password: string, email: string): Promise<void> {
  console.log('\n🔐 Setting up Super Admin...\n');
  
  const hashedPassword = await bcrypt.hash(password, 12);
  
  // Ensure there's at least one clinic
  let clinic = await prisma.clinic.findFirst({
    where: { status: 'ACTIVE' }
  });
  
  if (!clinic) {
    clinic = await prisma.clinic.create({
      data: {
        name: 'EONPRO Medical',
        subdomain: 'main',
        status: 'ACTIVE',
        adminEmail: email,
        settings: {},
        features: {},
        integrations: {},
      }
    });
    console.log(`   ✓ Created default clinic: ${clinic.name}`);
  }
  
  // Upsert super admin
  const admin = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash: hashedPassword,
      firstName: 'System',
      lastName: 'Administrator',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      clinicId: clinic.id,
      lastPasswordChange: new Date(),
    },
    update: {
      passwordHash: hashedPassword,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      failedLoginAttempts: 0,
      lockedUntil: null,
      twoFactorEnabled: false,
      lastPasswordChange: new Date(),
    }
  });
  
  console.log(`   ✓ Super Admin configured: ${admin.email}`);
  console.log(`   ✓ Role: ${admin.role}`);
  console.log(`   ✓ Clinic: ${clinic.name} (ID: ${clinic.id})`);
}

async function printSummary(stats: CleanupStats): Promise<void> {
  // Get final counts
  const finalCounts = {
    patients: await prisma.patient.count(),
    providers: await prisma.provider.count(),
    orders: await prisma.order.count(),
    users: await prisma.user.count(),
    clinics: await prisma.clinic.count(),
  };
  
  console.log('\n' + '═'.repeat(55));
  console.log('📊 CLEANUP SUMMARY');
  console.log('═'.repeat(55));
  console.log('\n🗑️  Records Deleted:');
  console.log(`   • Patients:          ${stats.patients}`);
  console.log(`   • Orders:            ${stats.orders}`);
  console.log(`   • Invoices:          ${stats.invoices}`);
  console.log(`   • Payments:          ${stats.payments}`);
  console.log(`   • SOAP Notes:        ${stats.soapNotes}`);
  console.log(`   • Prescriptions:     ${stats.prescriptions}`);
  console.log(`   • Intake Forms:      ${stats.intakeSubmissions}`);
  console.log(`   • Appointments:      ${stats.appointments}`);
  console.log(`   • Tickets:           ${stats.tickets}`);
  console.log(`   • Providers:         ${stats.providers}`);
  console.log(`   • Users:             ${stats.users}`);
  console.log(`   • Influencers:       ${stats.influencers}`);
  
  console.log('\n📈 Remaining Records:');
  console.log(`   • Patients:          ${finalCounts.patients}`);
  console.log(`   • Providers:         ${finalCounts.providers}`);
  console.log(`   • Orders:            ${finalCounts.orders}`);
  console.log(`   • Users:             ${finalCounts.users}`);
  console.log(`   • Clinics:           ${finalCounts.clinics}`);
}

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║     EONPRO PRODUCTION DATA CLEANUP                   ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');
  
  // Validate password
  const password = process.env.NEW_ADMIN_PASSWORD;
  const email = process.env.NEW_ADMIN_EMAIL || 'admin@eonpro.io';
  
  if (!password) {
    console.error('❌ ERROR: NEW_ADMIN_PASSWORD is required\n');
    console.log('Usage:');
    console.log('  NEW_ADMIN_PASSWORD="YourSecure123!" npm run prod:cleanup\n');
    console.log('Requirements:');
    console.log('  - At least 12 characters');
    console.log('  - Contains uppercase, lowercase, number, and special character\n');
    process.exit(1);
  }
  
  if (password.length < 12) {
    console.error('❌ Password must be at least 12 characters');
    process.exit(1);
  }
  
  // Validate password strength
  const checks = {
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
  
  if (!checks.upper || !checks.lower || !checks.number || !checks.special) {
    console.error('❌ Password must contain uppercase, lowercase, number, and special character');
    process.exit(1);
  }
  
  console.log('🔗 Connecting to database...');
  await prisma.$connect();
  console.log('   ✓ Connected\n');
  
  // Initialize stats
  const stats: CleanupStats = {
    patients: 0,
    orders: 0,
    invoices: 0,
    payments: 0,
    soapNotes: 0,
    prescriptions: 0,
    intakeSubmissions: 0,
    appointments: 0,
    tickets: 0,
    providers: 0,
    users: 0,
    influencers: 0,
  };
  
  try {
    // Step 1: Identify test data
    await identifyTestData();
    
    // Step 2: Delete test data
    await deleteTestData(stats);
    
    // Step 3: Setup super admin
    await setupSuperAdmin(password, email);
    
    // Step 4: Print summary
    await printSummary(stats);
    
    console.log('\n═'.repeat(55));
    console.log('✅ CLEANUP COMPLETE!');
    console.log('═'.repeat(55));
    console.log(`\n🔑 Super Admin Credentials:`);
    console.log(`   Email:    ${email}`);
    console.log(`   Password: [as provided]`);
    console.log(`   URL:      https://eonpro-kappa.vercel.app/login\n`);
    console.log('⚠️  NEXT STEPS:');
    console.log('   1. Log in with the new credentials');
    console.log('   2. Enable Two-Factor Authentication');
    console.log('   3. Verify dashboard shows clean data');
    console.log('   4. Add real patients/providers as needed\n');
    
  } catch (error) {
    console.error('\n❌ Error during cleanup:', error);
    process.exit(1);
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
