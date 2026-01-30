/**
 * PRODUCTION SETUP SCRIPT
 * =======================
 * 1. Cleans ALL dummy/test data
 * 2. Creates fresh clinic
 * 3. Creates provider with credentials
 * 4. Creates super admin
 * 5. Creates a test patient and order
 * 
 * Run with: npx dotenv -e .env.production.local -- npx tsx scripts/setup-production.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

// ============================================
// CONFIGURATION - EDIT THESE VALUES
// ============================================
const CONFIG = {
  // Clinic Details
  clinic: {
    name: 'EON Medical',
    subdomain: 'eonmedical',
    adminEmail: 'admin@eonmedical.com',
    phone: '(305) 555-0100',
    timezone: 'America/New_York',
  },
  
  // Super Admin Credentials - SECURITY: Load from environment
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@eonmedical.com',
    password: process.env.ADMIN_PASSWORD || (() => { 
      console.error('❌ ADMIN_PASSWORD environment variable is required');
      process.exit(1);
    })(),
    firstName: 'System',
    lastName: 'Administrator',
  },
  
  // Provider Details - SECURITY: Load from environment
  provider: {
    firstName: process.env.PROVIDER_FIRST_NAME || 'Dr. Maria',
    lastName: process.env.PROVIDER_LAST_NAME || 'Santos',
    email: process.env.PROVIDER_EMAIL || 'provider@eonmedical.com',
    password: process.env.PROVIDER_PASSWORD || (() => {
      console.error('❌ PROVIDER_PASSWORD environment variable is required');
      process.exit(1);
    })(),
    npi: process.env.PROVIDER_NPI || '1234567890',
    licenseState: process.env.PROVIDER_LICENSE_STATE || 'FL',
    licenseNumber: process.env.PROVIDER_LICENSE_NUMBER || 'ME123456',
    dea: process.env.PROVIDER_DEA || 'AS1234567',
    phone: process.env.PROVIDER_PHONE || '(305) 555-0101',
  },
  
  // Test Patient (for order testing)
  testPatient: {
    firstName: 'Maria',
    lastName: 'Garcia',
    email: 'maria.garcia@email.com',
    phone: '(305) 555-0200',
    dob: '1985-03-15',
    gender: 'Female',
    address1: '123 Ocean Drive',
    city: 'Miami',
    state: 'FL',
    zip: '33139',
  },
};

async function cleanAllData(): Promise<void> {
  console.log('\n🧹 STEP 1: Cleaning ALL existing data...\n');
  
  // Delete in order of dependencies (children first)
  const tables = [
    // Intake system
    { name: 'IntakeFormResponse', model: prisma.intakeFormResponse },
    { name: 'IntakeFormSubmission', model: prisma.intakeFormSubmission },
    { name: 'IntakeFormLink', model: prisma.intakeFormLink },
    { name: 'IntakeFormQuestion', model: prisma.intakeFormQuestion },
    { name: 'IntakeFormTemplate', model: prisma.intakeFormTemplate },
    
    // Care plans
    { name: 'CarePlanProgress', model: prisma.carePlanProgress },
    { name: 'CarePlanActivity', model: prisma.carePlanActivity },
    { name: 'CarePlanGoal', model: prisma.carePlanGoal },
    { name: 'CarePlan', model: prisma.carePlan },
    { name: 'CarePlanTemplate', model: prisma.carePlanTemplate },
    
    // Scheduling
    { name: 'AppointmentReminder', model: prisma.appointmentReminder },
    { name: 'Appointment', model: prisma.appointment },
    { name: 'ProviderTimeOff', model: prisma.providerTimeOff },
    { name: 'ProviderAvailability', model: prisma.providerAvailability },
    { name: 'AppointmentTypeConfig', model: prisma.appointmentTypeConfig },
    
    // Superbills
    { name: 'SuperbillItem', model: prisma.superbillItem },
    { name: 'Superbill', model: prisma.superbill },
    { name: 'BillingCode', model: prisma.billingCode },
    
    // Tickets
    { name: 'TicketSLA', model: prisma.ticketSLA },
    { name: 'TicketEscalation', model: prisma.ticketEscalation },
    { name: 'TicketWorkLog', model: prisma.ticketWorkLog },
    { name: 'TicketStatusHistory', model: prisma.ticketStatusHistory },
    { name: 'TicketComment', model: prisma.ticketComment },
    { name: 'TicketAssignment', model: prisma.ticketAssignment },
    { name: 'Ticket', model: prisma.ticket },
    
    // Messages
    { name: 'InternalMessage', model: prisma.internalMessage },
    
    // AI
    { name: 'AIMessage', model: prisma.aIMessage },
    { name: 'AIConversation', model: prisma.aIConversation },
    
    // SOAP Notes
    { name: 'SOAPNoteRevision', model: prisma.sOAPNoteRevision },
    { name: 'SOAPNote', model: prisma.sOAPNote },
    
    // Patient data
    { name: 'PatientWeightLog', model: prisma.patientWeightLog },
    { name: 'PatientMedicationReminder', model: prisma.patientMedicationReminder },
    { name: 'PatientDocument', model: prisma.patientDocument },
    { name: 'PatientAudit', model: prisma.patientAudit },
    
    // Influencer/Referral
    { name: 'Commission', model: prisma.commission },
    { name: 'CommissionPayout', model: prisma.commissionPayout },
    { name: 'ReferralTracking', model: prisma.referralTracking },
    { name: 'InfluencerBankAccount', model: prisma.influencerBankAccount },
    { name: 'Influencer', model: prisma.influencer },
    
    // Payments & Billing
    { name: 'Payment', model: prisma.payment },
    { name: 'Invoice', model: prisma.invoice },
    { name: 'Subscription', model: prisma.subscription },
    { name: 'PaymentMethod', model: prisma.paymentMethod },
    
    // Orders & Prescriptions
    { name: 'Rx', model: prisma.rx },
    { name: 'OrderEvent', model: prisma.orderEvent },
    { name: 'Order', model: prisma.order },
    
    // Provider
    { name: 'ProviderAudit', model: prisma.providerAudit },
    
    // API & Webhooks
    { name: 'ApiUsageLog', model: prisma.apiUsageLog },
    { name: 'ApiKey', model: prisma.apiKey },
    { name: 'WebhookDelivery', model: prisma.webhookDelivery },
    { name: 'WebhookConfig', model: prisma.webhookConfig },
    { name: 'IntegrationLog', model: prisma.integrationLog },
    { name: 'Integration', model: prisma.integration },
    { name: 'WebhookLog', model: prisma.webhookLog },
    
    // User system
    { name: 'PasswordResetToken', model: prisma.passwordResetToken },
    { name: 'UserSession', model: prisma.userSession },
    { name: 'UserAuditLog', model: prisma.userAuditLog },
    { name: 'AuditLog', model: prisma.auditLog },
    { name: 'UserClinic', model: prisma.userClinic },
    
    // Settings
    { name: 'SystemSettings', model: prisma.systemSettings },
    { name: 'DeveloperTool', model: prisma.developerTool },
    
    // Audit
    { name: 'ClinicAuditLog', model: prisma.clinicAuditLog },
    
    // Counter
    { name: 'PatientCounter', model: prisma.patientCounter },
  ];
  
  for (const table of tables) {
    try {
      const result = await (table.model as any).deleteMany({});
      if (result.count > 0) {
        console.log(`   ✓ Deleted ${result.count} from ${table.name}`);
      }
    } catch (error: any) {
      console.log(`   ⚠ Skipped ${table.name}: ${error.message?.slice(0, 50)}`);
    }
  }
  
  // Now delete Users (need to handle self-reference)
  await prisma.user.updateMany({
    data: { createdById: null }
  });
  const users = await prisma.user.deleteMany({});
  console.log(`   ✓ Deleted ${users.count} users`);
  
  // Delete Patients
  const patients = await prisma.patient.deleteMany({});
  console.log(`   ✓ Deleted ${patients.count} patients`);
  
  // Delete Providers
  const providers = await prisma.provider.deleteMany({});
  console.log(`   ✓ Deleted ${providers.count} providers`);
  
  // Delete Clinics
  const clinics = await prisma.clinic.deleteMany({});
  console.log(`   ✓ Deleted ${clinics.count} clinics`);
  
  console.log('\n   ✅ All data cleaned!\n');
}

async function createClinic(): Promise<number> {
  console.log('🏥 STEP 2: Creating Clinic...\n');
  
  const clinic = await prisma.clinic.create({
    data: {
      name: CONFIG.clinic.name,
      subdomain: CONFIG.clinic.subdomain,
      status: 'ACTIVE',
      adminEmail: CONFIG.clinic.adminEmail,
      phone: CONFIG.clinic.phone,
      timezone: CONFIG.clinic.timezone,
      settings: {
        theme: 'light',
        primaryColor: '#10B981',
        secondaryColor: '#3B82F6',
      },
      features: {
        scheduling: true,
        billing: true,
        telehealth: true,
        intakeForms: true,
        soapNotes: true,
        aiAssistant: true,
      },
      integrations: {},
      billingPlan: 'enterprise',
      patientLimit: 10000,
      providerLimit: 100,
      storageLimit: 50000,
    },
  });
  
  console.log(`   ✓ Created clinic: ${clinic.name}`);
  console.log(`   ✓ Subdomain: ${clinic.subdomain}`);
  console.log(`   ✓ ID: ${clinic.id}\n`);
  
  return clinic.id;
}

async function createSuperAdmin(clinicId: number): Promise<void> {
  console.log('👤 STEP 3: Creating Super Admin...\n');
  
  const hashedPassword = await bcrypt.hash(CONFIG.admin.password, 12);
  
  const admin = await prisma.user.create({
    data: {
      email: CONFIG.admin.email,
      passwordHash: hashedPassword,
      firstName: CONFIG.admin.firstName,
      lastName: CONFIG.admin.lastName,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      clinicId: clinicId,
      lastPasswordChange: new Date(),
    },
  });
  
  // Create UserClinic relationship
  await prisma.userClinic.create({
    data: {
      userId: admin.id,
      clinicId: clinicId,
      role: 'SUPER_ADMIN',
      isPrimary: true,
      isActive: true,
    },
  });
  
  console.log(`   ✓ Created super admin: ${admin.email}`);
  console.log(`   ✓ Role: SUPER_ADMIN`);
  console.log(`   ✓ Password: ${CONFIG.admin.password}\n`);
}

async function createProvider(clinicId: number): Promise<number> {
  console.log('⚕️ STEP 4: Creating Provider...\n');
  
  const hashedPassword = await bcrypt.hash(CONFIG.provider.password, 12);
  
  const provider = await prisma.provider.create({
    data: {
      firstName: CONFIG.provider.firstName,
      lastName: CONFIG.provider.lastName,
      email: CONFIG.provider.email,
      npi: CONFIG.provider.npi,
      licenseState: CONFIG.provider.licenseState,
      licenseNumber: CONFIG.provider.licenseNumber,
      dea: CONFIG.provider.dea,
      phone: CONFIG.provider.phone,
      clinicId: clinicId,
      passwordHash: hashedPassword,
    },
  });
  
  // Create user account for provider
  const providerUser = await prisma.user.create({
    data: {
      email: CONFIG.provider.email,
      passwordHash: hashedPassword,
      firstName: CONFIG.provider.firstName,
      lastName: CONFIG.provider.lastName,
      role: 'PROVIDER',
      status: 'ACTIVE',
      clinicId: clinicId,
      providerId: provider.id,
      lastPasswordChange: new Date(),
    },
  });
  
  // Create UserClinic relationship
  await prisma.userClinic.create({
    data: {
      userId: providerUser.id,
      clinicId: clinicId,
      role: 'PROVIDER',
      isPrimary: true,
      isActive: true,
    },
  });
  
  console.log(`   ✓ Created provider: ${provider.firstName} ${provider.lastName}`);
  console.log(`   ✓ NPI: ${provider.npi}`);
  console.log(`   ✓ Email: ${provider.email}`);
  console.log(`   ✓ Password: ${CONFIG.provider.password}\n`);
  
  return provider.id;
}

async function createTestPatient(clinicId: number): Promise<number> {
  console.log('🧑‍⚕️ STEP 5: Creating Test Patient...\n');
  
  // Create patient counter
  await prisma.patientCounter.create({
    data: { current: 1 },
  });
  
  const patient = await prisma.patient.create({
    data: {
      patientId: 'PT-000001',
      firstName: CONFIG.testPatient.firstName,
      lastName: CONFIG.testPatient.lastName,
      email: CONFIG.testPatient.email,
      phone: CONFIG.testPatient.phone,
      dob: CONFIG.testPatient.dob,
      gender: CONFIG.testPatient.gender,
      address1: CONFIG.testPatient.address1,
      city: CONFIG.testPatient.city,
      state: CONFIG.testPatient.state,
      zip: CONFIG.testPatient.zip,
      clinicId: clinicId,
      source: 'manual',
    },
  });
  
  console.log(`   ✓ Created patient: ${patient.firstName} ${patient.lastName}`);
  console.log(`   ✓ Patient ID: ${patient.patientId}`);
  console.log(`   ✓ Email: ${patient.email}\n`);
  
  return patient.id;
}

async function createTestOrder(clinicId: number, patientId: number, providerId: number): Promise<void> {
  console.log('📦 STEP 6: Creating Test Order...\n');
  
  const messageId = `MSG-${Date.now()}`;
  const referenceId = `REF-${Date.now()}`;
  
  const order = await prisma.order.create({
    data: {
      messageId,
      referenceId,
      status: 'PENDING',
      patientId,
      providerId,
      shippingMethod: 1,
      primaryMedName: 'Semaglutide',
      primaryMedStrength: '0.5mg',
      primaryMedForm: 'Injection',
      clinicId,
    },
  });
  
  // Add prescription
  await prisma.rx.create({
    data: {
      orderId: order.id,
      medicationKey: 'SEMA-0.5',
      medName: 'Semaglutide',
      strength: '0.5mg',
      form: 'Subcutaneous Injection',
      quantity: '4',
      refills: '2',
      sig: 'Inject 0.5mg subcutaneously once weekly',
    },
  });
  
  // Add order event
  await prisma.orderEvent.create({
    data: {
      orderId: order.id,
      eventType: 'ORDER_CREATED',
      note: 'Order created via production setup script',
    },
  });
  
  console.log(`   ✓ Created order: ${order.id}`);
  console.log(`   ✓ Reference: ${referenceId}`);
  console.log(`   ✓ Medication: Semaglutide 0.5mg`);
  console.log(`   ✓ Status: PENDING\n`);
}

async function main(): Promise<void> {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║          EONPRO PRODUCTION SETUP                         ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  
  console.log('🔗 Connecting to production database...');
  await prisma.$connect();
  console.log('   ✓ Connected!\n');
  
  try {
    // Step 1: Clean all data
    await cleanAllData();
    
    // Step 2: Create clinic
    const clinicId = await createClinic();
    
    // Step 3: Create super admin
    await createSuperAdmin(clinicId);
    
    // Step 4: Create provider
    const providerId = await createProvider(clinicId);
    
    // Step 5: Create test patient
    const patientId = await createTestPatient(clinicId);
    
    // Step 6: Create test order
    await createTestOrder(clinicId, patientId, providerId);
    
    // Summary
    console.log('═'.repeat(60));
    console.log('✅ PRODUCTION SETUP COMPLETE!');
    console.log('═'.repeat(60));
    console.log('\n📋 LOGIN CREDENTIALS:\n');
    console.log('   🔐 Super Admin:');
    console.log(`      Email:    ${CONFIG.admin.email}`);
    console.log(`      Password: ${CONFIG.admin.password}`);
    console.log(`      URL:      https://eonpro-kappa.vercel.app/login`);
    console.log('\n   ⚕️ Provider:');
    console.log(`      Email:    ${CONFIG.provider.email}`);
    console.log(`      Password: ${CONFIG.provider.password}`);
    console.log('\n📊 CREATED:');
    console.log(`   • 1 Clinic: ${CONFIG.clinic.name}`);
    console.log(`   • 1 Super Admin`);
    console.log(`   • 1 Provider: ${CONFIG.provider.firstName} ${CONFIG.provider.lastName}`);
    console.log(`   • 1 Patient: ${CONFIG.testPatient.firstName} ${CONFIG.testPatient.lastName}`);
    console.log(`   • 1 Test Order (Semaglutide 0.5mg)`);
    console.log('\n⚠️  NEXT STEPS:');
    console.log('   1. Log in at https://eonpro-kappa.vercel.app/login');
    console.log('   2. Enable Two-Factor Authentication');
    console.log('   3. Review the test order');
    console.log('   4. Add real patients when ready\n');
    
  } catch (error) {
    console.error('\n❌ Error during setup:', error);
    throw error;
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
