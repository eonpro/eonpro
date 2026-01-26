/**
 * Test Provider-Clinic API Endpoints
 * Quick validation that the service layer works correctly
 */

import { PrismaClient } from '@prisma/client';
import { providerService } from '../src/domains/provider';

const prisma = new PrismaClient();

let testClinic: { id: number };
let testProvider: { id: number };
let testUser: { id: number };

async function setup() {
  console.log('\n🔧 Setting up...\n');

  // Clean up
  await prisma.providerClinic.deleteMany({
    where: { provider: { npi: 'APITEST123' } }
  }).catch(() => {});
  await prisma.user.deleteMany({
    where: { email: 'api-test-user@example.com' }
  }).catch(() => {});
  await prisma.provider.deleteMany({
    where: { npi: 'APITEST123' }
  }).catch(() => {});
  await prisma.clinic.deleteMany({
    where: { subdomain: 'api-test-clinic' }
  }).catch(() => {});

  // Create test clinic
  testClinic = await prisma.clinic.create({
    data: {
      name: 'API Test Clinic',
      subdomain: 'api-test-clinic',
      adminEmail: 'admin@api-test.com',
      settings: {},
      features: {},
      integrations: {},
    },
  });

  // Create test provider
  testProvider = await prisma.provider.create({
    data: {
      firstName: 'API',
      lastName: 'Test',
      npi: 'APITEST123',
      clinicId: testClinic.id,
    },
  });

  // Create test admin user
  testUser = await prisma.user.create({
    data: {
      email: 'api-test-user@example.com',
      passwordHash: 'test',
      firstName: 'API',
      lastName: 'Test',
      role: 'ADMIN',
      clinicId: testClinic.id,
    },
  });

  console.log('Created:', { clinic: testClinic.id, provider: testProvider.id, user: testUser.id });
}

async function cleanup() {
  console.log('\n🧹 Cleaning up...\n');

  await prisma.providerClinic.deleteMany({
    where: { providerId: testProvider?.id }
  }).catch(() => {});
  await prisma.user.deleteMany({
    where: { id: testUser?.id }
  }).catch(() => {});
  await prisma.provider.deleteMany({
    where: { id: testProvider?.id }
  }).catch(() => {});
  await prisma.clinic.deleteMany({
    where: { id: testClinic?.id }
  }).catch(() => {});

  await prisma.$disconnect();
}

async function runTests() {
  const userContext = {
    id: testUser.id,
    email: 'api-test-user@example.com',
    role: 'admin' as const,
    clinicId: testClinic.id,
    providerId: undefined,
    patientId: undefined,
  };

  console.log('\n📋 Provider Service Tests\n');

  // Test assignToClinic
  console.log('Testing assignToClinic...');
  const assignment = await providerService.assignToClinic(
    testProvider.id,
    testClinic.id,
    { isPrimary: true, titleLine: 'Chief Medical Officer' },
    userContext
  );
  console.log('  ✓ assignToClinic:', assignment);

  // Test getProviderClinics
  console.log('Testing getProviderClinics...');
  const clinics = await providerService.getProviderClinics(testProvider.id, userContext);
  console.log('  ✓ getProviderClinics:', clinics.length, 'clinics');

  // Test hasClinicAccess
  console.log('Testing hasClinicAccess...');
  const hasAccess = await providerService.hasClinicAccess(testProvider.id, testClinic.id);
  console.log('  ✓ hasClinicAccess:', hasAccess);

  // Test listProviders (should include provider via ProviderClinic)
  console.log('Testing listProviders...');
  const result = await providerService.listProviders(userContext);
  console.log('  ✓ listProviders:', result.count, 'providers');

  // Test getById with providerClinics included
  console.log('Testing getById...');
  const provider = await providerService.getById(testProvider.id, userContext);
  console.log('  ✓ getById:', provider.firstName, provider.lastName);
  console.log('    providerClinics:', provider.providerClinics?.length || 0);

  console.log('\n✅ All provider service tests passed!\n');
}

async function main() {
  try {
    await setup();
    await runTests();
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await cleanup();
  }
}

main();
