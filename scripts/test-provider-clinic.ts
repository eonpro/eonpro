/**
 * Enterprise Multi-Clinic Provider Architecture Tests
 * Standalone test script using tsx
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Test data
let testClinic1: { id: number; name: string };
let testClinic2: { id: number; name: string };
let testClinic3: { id: number; name: string };
let testProvider: { id: number; firstName: string; lastName: string; npi: string };
let testUser: { id: number; email: string };

// Test results tracker
let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => Promise<void>) {
  return async () => {
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (error: any) {
      failed++;
      failures.push(`${name}: ${error.message}`);
      console.log(`  ✗ ${name}`);
      console.log(`    Error: ${error.message}`);
    }
  };
}

async function setup() {
  console.log('\n🔧 Setting up test data...\n');

  // Clean up any existing test data
  await prisma.providerClinic.deleteMany({
    where: {
      provider: { npi: { startsWith: 'TEST' } }
    }
  }).catch(() => {});

  await prisma.providerAudit.deleteMany({
    where: {
      provider: { npi: { startsWith: 'TEST' } }
    }
  }).catch(() => {});

  await prisma.userClinic.deleteMany({
    where: {
      user: { email: { contains: 'test-multiclinic' } }
    }
  }).catch(() => {});

  await prisma.user.deleteMany({
    where: { email: { contains: 'test-multiclinic' } }
  }).catch(() => {});

  await prisma.provider.deleteMany({
    where: { npi: { startsWith: 'TEST' } }
  }).catch(() => {});

  await prisma.clinic.deleteMany({
    where: { subdomain: { startsWith: 'test-multiclinic' } }
  }).catch(() => {});

  // Create test clinics
  testClinic1 = await prisma.clinic.create({
    data: {
      name: 'Test Clinic Alpha',
      subdomain: 'test-multiclinic-alpha',
      adminEmail: 'admin@test-alpha.com',
      settings: {},
      features: {},
      integrations: {},
    },
  });

  testClinic2 = await prisma.clinic.create({
    data: {
      name: 'Test Clinic Beta',
      subdomain: 'test-multiclinic-beta',
      adminEmail: 'admin@test-beta.com',
      settings: {},
      features: {},
      integrations: {},
    },
  });

  testClinic3 = await prisma.clinic.create({
    data: {
      name: 'Test Clinic Gamma',
      subdomain: 'test-multiclinic-gamma',
      adminEmail: 'admin@test-gamma.com',
      settings: {},
      features: {},
      integrations: {},
    },
  });

  // Create test provider
  testProvider = await prisma.provider.create({
    data: {
      firstName: 'Test',
      lastName: 'Provider',
      npi: 'TEST1234567',
      email: 'test-multiclinic-provider@example.com',
      clinicId: testClinic1.id,
      primaryClinicId: testClinic1.id,
    },
  });

  // Create test user linked to provider
  testUser = await prisma.user.create({
    data: {
      email: 'test-multiclinic-user@example.com',
      passwordHash: 'test-hash',
      firstName: 'Test',
      lastName: 'User',
      role: 'PROVIDER',
      clinicId: testClinic1.id,
      activeClinicId: testClinic1.id,
      providerId: testProvider.id,
    },
  });

  console.log('Test data created:', {
    clinics: [testClinic1.id, testClinic2.id, testClinic3.id],
    provider: testProvider.id,
    user: testUser.id,
  });
}

async function cleanup() {
  console.log('\n🧹 Cleaning up test data...\n');

  await prisma.providerClinic.deleteMany({
    where: { providerId: testProvider?.id }
  }).catch(() => {});

  await prisma.providerAudit.deleteMany({
    where: { providerId: testProvider?.id }
  }).catch(() => {});

  await prisma.userClinic.deleteMany({
    where: { userId: testUser?.id }
  }).catch(() => {});

  await prisma.user.deleteMany({
    where: { id: testUser?.id }
  }).catch(() => {});

  await prisma.provider.deleteMany({
    where: { id: testProvider?.id }
  }).catch(() => {});

  await prisma.clinic.deleteMany({
    where: { id: { in: [testClinic1?.id, testClinic2?.id, testClinic3?.id].filter(Boolean) } }
  }).catch(() => {});

  await prisma.$disconnect();
}

// ==========================================================================
// Tests
// ==========================================================================

async function runTests() {
  console.log('\n📋 ProviderClinic Junction Table Tests\n');

  // Clear assignments before each test section
  await prisma.providerClinic.deleteMany({
    where: { providerId: testProvider.id }
  }).catch(() => {});

  await test('should create a provider-clinic assignment', async () => {
    const assignment = await prisma.providerClinic.create({
      data: {
        providerId: testProvider.id,
        clinicId: testClinic1.id,
        isPrimary: true,
        isActive: true,
      },
    });

    if (!assignment) throw new Error('Assignment not created');
    if (assignment.providerId !== testProvider.id) throw new Error('Wrong providerId');
    if (assignment.clinicId !== testClinic1.id) throw new Error('Wrong clinicId');
    if (assignment.isPrimary !== true) throw new Error('isPrimary should be true');
    if (assignment.isActive !== true) throw new Error('isActive should be true');
  })();

  await prisma.providerClinic.deleteMany({ where: { providerId: testProvider.id } });

  await test('should enforce unique constraint on provider-clinic pair', async () => {
    await prisma.providerClinic.create({
      data: {
        providerId: testProvider.id,
        clinicId: testClinic1.id,
        isPrimary: true,
      },
    });

    let threw = false;
    try {
      await prisma.providerClinic.create({
        data: {
          providerId: testProvider.id,
          clinicId: testClinic1.id,
          isPrimary: false,
        },
      });
    } catch {
      threw = true;
    }

    if (!threw) throw new Error('Should have thrown on duplicate');
  })();

  await prisma.providerClinic.deleteMany({ where: { providerId: testProvider.id } });

  await test('should allow provider to be assigned to multiple clinics', async () => {
    await prisma.providerClinic.createMany({
      data: [
        { providerId: testProvider.id, clinicId: testClinic1.id, isPrimary: true },
        { providerId: testProvider.id, clinicId: testClinic2.id, isPrimary: false },
        { providerId: testProvider.id, clinicId: testClinic3.id, isPrimary: false },
      ],
    });

    const assignments = await prisma.providerClinic.findMany({
      where: { providerId: testProvider.id },
    });

    if (assignments.length !== 3) throw new Error(`Expected 3 assignments, got ${assignments.length}`);
  })();

  await prisma.providerClinic.deleteMany({ where: { providerId: testProvider.id } });

  await test('should store clinic-specific metadata', async () => {
    const assignment = await prisma.providerClinic.create({
      data: {
        providerId: testProvider.id,
        clinicId: testClinic2.id,
        isPrimary: false,
        titleLine: 'Medical Director',
        deaNumber: 'DEA-CLINIC2-123',
        licenseNumber: 'LIC-STATE-456',
        licenseState: 'CA',
      },
    });

    if (assignment.titleLine !== 'Medical Director') throw new Error('Wrong titleLine');
    if (assignment.deaNumber !== 'DEA-CLINIC2-123') throw new Error('Wrong deaNumber');
    if (assignment.licenseNumber !== 'LIC-STATE-456') throw new Error('Wrong licenseNumber');
    if (assignment.licenseState !== 'CA') throw new Error('Wrong licenseState');
  })();

  await prisma.providerClinic.deleteMany({ where: { providerId: testProvider.id } });

  await test('should soft delete by setting isActive to false', async () => {
    const assignment = await prisma.providerClinic.create({
      data: {
        providerId: testProvider.id,
        clinicId: testClinic1.id,
        isPrimary: true,
        isActive: true,
      },
    });

    await prisma.providerClinic.update({
      where: { id: assignment.id },
      data: { isActive: false },
    });

    const updated = await prisma.providerClinic.findUnique({
      where: { id: assignment.id },
    });

    if (updated?.isActive !== false) throw new Error('isActive should be false');

    const activeAssignments = await prisma.providerClinic.findMany({
      where: { providerId: testProvider.id, isActive: true },
    });

    if (activeAssignments.length !== 0) throw new Error('Should have no active assignments');
  })();

  console.log('\n📋 Provider Repository - Multi-Clinic Queries\n');

  await prisma.providerClinic.deleteMany({ where: { providerId: testProvider.id } });
  await prisma.providerClinic.createMany({
    data: [
      { providerId: testProvider.id, clinicId: testClinic1.id, isPrimary: true },
      { providerId: testProvider.id, clinicId: testClinic2.id, isPrimary: false },
    ],
  });

  await test('should include providerClinics in provider queries', async () => {
    const provider = await prisma.provider.findUnique({
      where: { id: testProvider.id },
      include: {
        providerClinics: {
          where: { isActive: true },
          include: { clinic: true },
        },
      },
    });

    if (!provider) throw new Error('Provider not found');
    if (provider.providerClinics.length !== 2) throw new Error(`Expected 2 clinics, got ${provider.providerClinics.length}`);

    const clinicIds = provider.providerClinics.map(pc => pc.clinicId);
    if (!clinicIds.includes(testClinic1.id)) throw new Error('Missing clinic1');
    if (!clinicIds.includes(testClinic2.id)) throw new Error('Missing clinic2');
  })();

  await test('should find providers by clinic via ProviderClinic', async () => {
    const providersInClinic2 = await prisma.provider.findMany({
      where: {
        providerClinics: {
          some: {
            clinicId: testClinic2.id,
            isActive: true,
          },
        },
      },
    });

    if (providersInClinic2.length !== 1) throw new Error(`Expected 1 provider, got ${providersInClinic2.length}`);
    if (providersInClinic2[0].id !== testProvider.id) throw new Error('Wrong provider');
  })();

  await test('should find providers across multiple clinics', async () => {
    const clinicIds = [testClinic1.id, testClinic2.id, testClinic3.id];

    const providers = await prisma.provider.findMany({
      where: {
        OR: [
          {
            providerClinics: {
              some: {
                clinicId: { in: clinicIds },
                isActive: true,
              },
            },
          },
          { clinicId: { in: clinicIds } },
        ],
      },
    });

    if (providers.length < 1) throw new Error('Expected at least 1 provider');
    if (!providers.map(p => p.id).includes(testProvider.id)) throw new Error('Test provider not found');
  })();

  await test('should not find provider in unassigned clinic', async () => {
    const providersInClinic3 = await prisma.provider.findMany({
      where: {
        providerClinics: {
          some: {
            clinicId: testClinic3.id,
            isActive: true,
          },
        },
      },
    });

    if (providersInClinic3.map(p => p.id).includes(testProvider.id)) {
      throw new Error('Provider should not be found in clinic3');
    }
  })();

  console.log('\n📋 Provider-Clinic Management Operations\n');

  await prisma.providerClinic.deleteMany({ where: { providerId: testProvider.id } });

  await test('should upsert provider-clinic assignment', async () => {
    // First create
    const created = await prisma.providerClinic.upsert({
      where: {
        providerId_clinicId: {
          providerId: testProvider.id,
          clinicId: testClinic1.id,
        },
      },
      create: {
        providerId: testProvider.id,
        clinicId: testClinic1.id,
        isPrimary: true,
      },
      update: {
        isActive: true,
        isPrimary: true,
      },
    });

    if (created.isPrimary !== true) throw new Error('isPrimary should be true');

    // Then update
    const updated = await prisma.providerClinic.upsert({
      where: {
        providerId_clinicId: {
          providerId: testProvider.id,
          clinicId: testClinic1.id,
        },
      },
      create: {
        providerId: testProvider.id,
        clinicId: testClinic1.id,
        isPrimary: false,
      },
      update: {
        titleLine: 'Senior Physician',
      },
    });

    if (updated.id !== created.id) throw new Error('Should be same record');
    if (updated.titleLine !== 'Senior Physician') throw new Error('titleLine not updated');
  })();

  await prisma.providerClinic.deleteMany({ where: { providerId: testProvider.id } });

  await test('should set primary clinic correctly', async () => {
    await prisma.providerClinic.createMany({
      data: [
        { providerId: testProvider.id, clinicId: testClinic1.id, isPrimary: true },
        { providerId: testProvider.id, clinicId: testClinic2.id, isPrimary: false },
      ],
    });

    // Change primary to clinic 2
    await prisma.$transaction(async (tx) => {
      await tx.providerClinic.updateMany({
        where: { providerId: testProvider.id, isPrimary: true },
        data: { isPrimary: false },
      });

      await tx.providerClinic.update({
        where: {
          providerId_clinicId: {
            providerId: testProvider.id,
            clinicId: testClinic2.id,
          },
        },
        data: { isPrimary: true },
      });

      await tx.provider.update({
        where: { id: testProvider.id },
        data: { primaryClinicId: testClinic2.id },
      });
    });

    const assignments = await prisma.providerClinic.findMany({
      where: { providerId: testProvider.id },
      orderBy: { isPrimary: 'desc' },
    });

    if (assignments[0].clinicId !== testClinic2.id) throw new Error('Primary should be clinic2');
    if (assignments[0].isPrimary !== true) throw new Error('First should be primary');
    if (assignments[1].isPrimary !== false) throw new Error('Second should not be primary');

    const provider = await prisma.provider.findUnique({
      where: { id: testProvider.id },
    });
    if (provider?.primaryClinicId !== testClinic2.id) throw new Error('primaryClinicId not updated');
  })();

  await test('should check clinic access correctly', async () => {
    const hasAccess1 = await prisma.providerClinic.findFirst({
      where: {
        providerId: testProvider.id,
        clinicId: testClinic1.id,
        isActive: true,
      },
    });
    if (!hasAccess1) throw new Error('Should have access to clinic1');

    const hasAccess3 = await prisma.providerClinic.findFirst({
      where: {
        providerId: testProvider.id,
        clinicId: testClinic3.id,
        isActive: true,
      },
    });
    if (hasAccess3) throw new Error('Should not have access to clinic3');
  })();

  console.log('\n📋 Provider Model - New Fields\n');

  await test('should have primaryClinicId and activeClinicId fields', async () => {
    const provider = await prisma.provider.findUnique({
      where: { id: testProvider.id },
    });

    if (!('primaryClinicId' in provider!)) throw new Error('Missing primaryClinicId');
    if (!('activeClinicId' in provider!)) throw new Error('Missing activeClinicId');
  })();

  await test('should update activeClinicId for session switching', async () => {
    await prisma.provider.update({
      where: { id: testProvider.id },
      data: { activeClinicId: testClinic2.id },
    });

    const provider = await prisma.provider.findUnique({
      where: { id: testProvider.id },
    });

    if (provider?.activeClinicId !== testClinic2.id) throw new Error('activeClinicId not updated');

    // Reset
    await prisma.provider.update({
      where: { id: testProvider.id },
      data: { activeClinicId: testClinic1.id },
    });
  })();

  console.log('\n📋 Edge Cases\n');

  await test('should handle provider with no clinic assignments (shared provider)', async () => {
    const sharedProvider = await prisma.provider.create({
      data: {
        firstName: 'Shared',
        lastName: 'Provider',
        npi: 'TEST0000001',
        clinicId: null,
        primaryClinicId: null,
      },
    });

    const assignments = await prisma.providerClinic.findMany({
      where: { providerId: sharedProvider.id },
    });
    if (assignments.length !== 0) throw new Error('Should have no assignments');

    const sharedProviders = await prisma.provider.findMany({
      where: { clinicId: null },
    });
    if (!sharedProviders.map(p => p.id).includes(sharedProvider.id)) {
      throw new Error('Shared provider not found');
    }

    await prisma.provider.delete({ where: { id: sharedProvider.id } });
  })();

  await prisma.providerClinic.deleteMany({ where: { providerId: testProvider.id } });

  await test('should handle inactive clinic assignments correctly', async () => {
    await prisma.providerClinic.create({
      data: {
        providerId: testProvider.id,
        clinicId: testClinic3.id,
        isActive: false,
      },
    });

    const activeProviders = await prisma.provider.findMany({
      where: {
        providerClinics: {
          some: {
            clinicId: testClinic3.id,
            isActive: true,
          },
        },
      },
    });

    if (activeProviders.map(p => p.id).includes(testProvider.id)) {
      throw new Error('Provider should not be in active query');
    }

    const allProviders = await prisma.provider.findMany({
      where: {
        providerClinics: {
          some: {
            clinicId: testClinic3.id,
          },
        },
      },
    });

    if (!allProviders.map(p => p.id).includes(testProvider.id)) {
      throw new Error('Provider should be in all query');
    }
  })();

  console.log('\n📋 Cascade Delete Test\n');

  await test('should cascade delete when provider is deleted', async () => {
    const tempProvider = await prisma.provider.create({
      data: {
        firstName: 'Temp',
        lastName: 'Provider',
        npi: 'TEST9999999',
      },
    });

    await prisma.providerClinic.create({
      data: {
        providerId: tempProvider.id,
        clinicId: testClinic1.id,
      },
    });

    await prisma.provider.delete({
      where: { id: tempProvider.id },
    });

    const orphanedAssignments = await prisma.providerClinic.findMany({
      where: { providerId: tempProvider.id },
    });

    if (orphanedAssignments.length !== 0) throw new Error('Assignments should be cascade deleted');
  })();
}

async function main() {
  console.log('\n========================================');
  console.log('Enterprise Multi-Clinic Provider Tests');
  console.log('========================================');

  try {
    await setup();
    await runTests();
  } catch (error: any) {
    console.error('\n❌ Test setup/execution error:', error.message);
    failed++;
  } finally {
    await cleanup();
  }

  console.log('\n========================================');
  console.log('Test Results');
  console.log('========================================');
  console.log(`✓ Passed: ${passed}`);
  console.log(`✗ Failed: ${failed}`);

  if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(`  - ${f}`));
  }

  console.log('\n');

  process.exit(failed > 0 ? 1 : 0);
}

main();
