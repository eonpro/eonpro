/**
 * Enterprise Multi-Clinic Provider Architecture Tests
 * =====================================================
 *
 * Comprehensive test suite for the ProviderClinic junction table
 * and multi-clinic provider support.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { basePrisma as prisma } from '../src/lib/db';

// Test data
let testClinic1: { id: number; name: string };
let testClinic2: { id: number; name: string };
let testClinic3: { id: number; name: string };
let testProvider: { id: number; firstName: string; lastName: string; npi: string };
let testUser: { id: number; email: string };

describe('Enterprise Multi-Clinic Provider Architecture', () => {
  beforeAll(async () => {
    // Clean up any existing test data
    await prisma.providerClinic.deleteMany({
      where: {
        provider: { npi: { startsWith: 'TEST' } }
      }
    });
    await prisma.providerAudit.deleteMany({
      where: {
        provider: { npi: { startsWith: 'TEST' } }
      }
    });
    await prisma.userClinic.deleteMany({
      where: {
        user: { email: { contains: 'test-multiclinic' } }
      }
    });
    await prisma.user.deleteMany({
      where: { email: { contains: 'test-multiclinic' } }
    });
    await prisma.provider.deleteMany({
      where: { npi: { startsWith: 'TEST' } }
    });
    await prisma.clinic.deleteMany({
      where: { subdomain: { startsWith: 'test-multiclinic' } }
    });

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

    console.log('Test setup complete:', {
      clinics: [testClinic1.id, testClinic2.id, testClinic3.id],
      provider: testProvider.id,
      user: testUser.id,
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.providerClinic.deleteMany({
      where: { providerId: testProvider.id }
    });
    await prisma.providerAudit.deleteMany({
      where: { providerId: testProvider.id }
    });
    await prisma.userClinic.deleteMany({
      where: { userId: testUser.id }
    });
    await prisma.user.deleteMany({
      where: { id: testUser.id }
    });
    await prisma.provider.deleteMany({
      where: { id: testProvider.id }
    });
    await prisma.clinic.deleteMany({
      where: { id: { in: [testClinic1.id, testClinic2.id, testClinic3.id] } }
    });
    await prisma.$disconnect();
  });

  // ==========================================================================
  // ProviderClinic Junction Table Tests
  // ==========================================================================

  describe('ProviderClinic Junction Table', () => {
    beforeEach(async () => {
      // Clear ProviderClinic entries before each test
      await prisma.providerClinic.deleteMany({
        where: { providerId: testProvider.id }
      });
    });

    it('should create a provider-clinic assignment', async () => {
      const assignment = await prisma.providerClinic.create({
        data: {
          providerId: testProvider.id,
          clinicId: testClinic1.id,
          isPrimary: true,
          isActive: true,
        },
      });

      expect(assignment).toBeDefined();
      expect(assignment.providerId).toBe(testProvider.id);
      expect(assignment.clinicId).toBe(testClinic1.id);
      expect(assignment.isPrimary).toBe(true);
      expect(assignment.isActive).toBe(true);
    });

    it('should enforce unique constraint on provider-clinic pair', async () => {
      await prisma.providerClinic.create({
        data: {
          providerId: testProvider.id,
          clinicId: testClinic1.id,
          isPrimary: true,
        },
      });

      await expect(
        prisma.providerClinic.create({
          data: {
            providerId: testProvider.id,
            clinicId: testClinic1.id,
            isPrimary: false,
          },
        })
      ).rejects.toThrow();
    });

    it('should allow provider to be assigned to multiple clinics', async () => {
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

      expect(assignments).toHaveLength(3);
    });

    it('should store clinic-specific metadata', async () => {
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

      expect(assignment.titleLine).toBe('Medical Director');
      expect(assignment.deaNumber).toBe('DEA-CLINIC2-123');
      expect(assignment.licenseNumber).toBe('LIC-STATE-456');
      expect(assignment.licenseState).toBe('CA');
    });

    it('should soft delete by setting isActive to false', async () => {
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

      expect(updated?.isActive).toBe(false);

      // Should not appear in active queries
      const activeAssignments = await prisma.providerClinic.findMany({
        where: { providerId: testProvider.id, isActive: true },
      });

      expect(activeAssignments).toHaveLength(0);
    });

    it('should cascade delete when provider is deleted', async () => {
      // Create a temporary provider
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

      // Delete provider
      await prisma.provider.delete({
        where: { id: tempProvider.id },
      });

      // ProviderClinic should be deleted too
      const orphanedAssignments = await prisma.providerClinic.findMany({
        where: { providerId: tempProvider.id },
      });

      expect(orphanedAssignments).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Provider Repository Tests
  // ==========================================================================

  describe('Provider Repository - Multi-Clinic Queries', () => {
    beforeEach(async () => {
      // Set up provider clinic assignments
      await prisma.providerClinic.deleteMany({
        where: { providerId: testProvider.id }
      });
      await prisma.providerClinic.createMany({
        data: [
          { providerId: testProvider.id, clinicId: testClinic1.id, isPrimary: true },
          { providerId: testProvider.id, clinicId: testClinic2.id, isPrimary: false },
        ],
      });
    });

    it('should include providerClinics in provider queries', async () => {
      const provider = await prisma.provider.findUnique({
        where: { id: testProvider.id },
        include: {
          providerClinics: {
            where: { isActive: true },
            include: { clinic: true },
          },
        },
      });

      expect(provider).toBeDefined();
      expect(provider?.providerClinics).toHaveLength(2);
      expect(provider?.providerClinics.map(pc => pc.clinicId)).toContain(testClinic1.id);
      expect(provider?.providerClinics.map(pc => pc.clinicId)).toContain(testClinic2.id);
    });

    it('should find providers by clinic via ProviderClinic', async () => {
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

      expect(providersInClinic2).toHaveLength(1);
      expect(providersInClinic2[0].id).toBe(testProvider.id);
    });

    it('should find providers across multiple clinics', async () => {
      const clinicIds = [testClinic1.id, testClinic2.id, testClinic3.id];

      const providers = await prisma.provider.findMany({
        where: {
          OR: [
            // Via ProviderClinic
            {
              providerClinics: {
                some: {
                  clinicId: { in: clinicIds },
                  isActive: true,
                },
              },
            },
            // Legacy: direct clinicId
            { clinicId: { in: clinicIds } },
          ],
        },
      });

      expect(providers.length).toBeGreaterThanOrEqual(1);
      expect(providers.map(p => p.id)).toContain(testProvider.id);
    });

    it('should not find provider in unassigned clinic', async () => {
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

      // testProvider is not assigned to testClinic3
      expect(providersInClinic3.map(p => p.id)).not.toContain(testProvider.id);
    });
  });

  // ==========================================================================
  // Provider Service Tests (via Repository methods)
  // ==========================================================================

  describe('Provider-Clinic Management Operations', () => {
    beforeEach(async () => {
      await prisma.providerClinic.deleteMany({
        where: { providerId: testProvider.id }
      });
    });

    it('should upsert provider-clinic assignment', async () => {
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

      expect(created.isPrimary).toBe(true);

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

      expect(updated.id).toBe(created.id);
      expect(updated.titleLine).toBe('Senior Physician');
    });

    it('should set primary clinic correctly', async () => {
      // Create assignments for multiple clinics
      await prisma.providerClinic.createMany({
        data: [
          { providerId: testProvider.id, clinicId: testClinic1.id, isPrimary: true },
          { providerId: testProvider.id, clinicId: testClinic2.id, isPrimary: false },
        ],
      });

      // Change primary to clinic 2
      await prisma.$transaction(async (tx) => {
        // Remove primary from all
        await tx.providerClinic.updateMany({
          where: { providerId: testProvider.id, isPrimary: true },
          data: { isPrimary: false },
        });

        // Set new primary
        await tx.providerClinic.update({
          where: {
            providerId_clinicId: {
              providerId: testProvider.id,
              clinicId: testClinic2.id,
            },
          },
          data: { isPrimary: true },
        });

        // Update provider's primaryClinicId
        await tx.provider.update({
          where: { id: testProvider.id },
          data: { primaryClinicId: testClinic2.id },
        });
      });

      // Verify
      const assignments = await prisma.providerClinic.findMany({
        where: { providerId: testProvider.id },
        orderBy: { isPrimary: 'desc' },
      });

      expect(assignments[0].clinicId).toBe(testClinic2.id);
      expect(assignments[0].isPrimary).toBe(true);
      expect(assignments[1].isPrimary).toBe(false);

      const provider = await prisma.provider.findUnique({
        where: { id: testProvider.id },
      });
      expect(provider?.primaryClinicId).toBe(testClinic2.id);
    });

    it('should check clinic access correctly', async () => {
      await prisma.providerClinic.create({
        data: {
          providerId: testProvider.id,
          clinicId: testClinic1.id,
          isActive: true,
        },
      });

      // Has access to clinic 1
      const hasAccess1 = await prisma.providerClinic.findFirst({
        where: {
          providerId: testProvider.id,
          clinicId: testClinic1.id,
          isActive: true,
        },
      });
      expect(hasAccess1).not.toBeNull();

      // No access to clinic 3
      const hasAccess3 = await prisma.providerClinic.findFirst({
        where: {
          providerId: testProvider.id,
          clinicId: testClinic3.id,
          isActive: true,
        },
      });
      expect(hasAccess3).toBeNull();
    });
  });

  // ==========================================================================
  // Provider Audit Tests
  // ==========================================================================

  describe('Provider-Clinic Audit Trail', () => {
    it('should create audit entry for clinic assignment', async () => {
      const assignment = await prisma.providerClinic.create({
        data: {
          providerId: testProvider.id,
          clinicId: testClinic1.id,
          isPrimary: true,
        },
      });

      await prisma.providerAudit.create({
        data: {
          providerId: testProvider.id,
          actorEmail: 'admin@test.com',
          action: 'CLINIC_ASSIGNMENT',
          diff: {
            clinicId: testClinic1.id,
            action: 'assigned',
            isPrimary: true,
          },
        },
      });

      const audits = await prisma.providerAudit.findMany({
        where: {
          providerId: testProvider.id,
          action: 'CLINIC_ASSIGNMENT',
        },
      });

      expect(audits.length).toBeGreaterThanOrEqual(1);
      expect(audits[0].diff).toHaveProperty('clinicId', testClinic1.id);
    });
  });

  // ==========================================================================
  // UserClinic Integration Tests
  // ==========================================================================

  describe('UserClinic + ProviderClinic Integration', () => {
    beforeEach(async () => {
      await prisma.userClinic.deleteMany({
        where: { userId: testUser.id }
      });
      await prisma.providerClinic.deleteMany({
        where: { providerId: testProvider.id }
      });
    });

    it('should sync user and provider clinic assignments', async () => {
      // User has access to clinics 1 and 2
      await prisma.userClinic.createMany({
        data: [
          { userId: testUser.id, clinicId: testClinic1.id, role: 'PROVIDER', isPrimary: true },
          { userId: testUser.id, clinicId: testClinic2.id, role: 'PROVIDER', isPrimary: false },
        ],
      });

      // Provider should also be assigned to same clinics
      await prisma.providerClinic.createMany({
        data: [
          { providerId: testProvider.id, clinicId: testClinic1.id, isPrimary: true },
          { providerId: testProvider.id, clinicId: testClinic2.id, isPrimary: false },
        ],
      });

      // Query user with all clinic info
      const userWithClinics = await prisma.user.findUnique({
        where: { id: testUser.id },
        include: {
          userClinics: { include: { clinic: true } },
          provider: {
            include: {
              providerClinics: { include: { clinic: true } },
            },
          },
        },
      });

      expect(userWithClinics?.userClinics).toHaveLength(2);
      expect(userWithClinics?.provider?.providerClinics).toHaveLength(2);

      // Same clinics
      const userClinicIds = userWithClinics?.userClinics.map(uc => uc.clinicId).sort();
      const providerClinicIds = userWithClinics?.provider?.providerClinics.map(pc => pc.clinicId).sort();
      expect(userClinicIds).toEqual(providerClinicIds);
    });

    it('should find provider via UserClinic fallback', async () => {
      // Provider has no ProviderClinic entries
      // But user has UserClinic access

      await prisma.userClinic.create({
        data: {
          userId: testUser.id,
          clinicId: testClinic2.id,
          role: 'PROVIDER',
        },
      });

      // Query providers for clinic 2 via user's UserClinic
      const providers = await prisma.provider.findMany({
        where: {
          user: {
            userClinics: {
              some: {
                clinicId: testClinic2.id,
                isActive: true,
                role: 'PROVIDER',
              },
            },
          },
        },
      });

      expect(providers.map(p => p.id)).toContain(testProvider.id);
    });
  });

  // ==========================================================================
  // Provider Fields Tests
  // ==========================================================================

  describe('Provider Model - New Fields', () => {
    it('should have primaryClinicId and activeClinicId fields', async () => {
      const provider = await prisma.provider.findUnique({
        where: { id: testProvider.id },
      });

      expect(provider).toHaveProperty('primaryClinicId');
      expect(provider).toHaveProperty('activeClinicId');
    });

    it('should update activeClinicId for session switching', async () => {
      await prisma.provider.update({
        where: { id: testProvider.id },
        data: { activeClinicId: testClinic2.id },
      });

      const provider = await prisma.provider.findUnique({
        where: { id: testProvider.id },
      });

      expect(provider?.activeClinicId).toBe(testClinic2.id);

      // Reset
      await prisma.provider.update({
        where: { id: testProvider.id },
        data: { activeClinicId: testClinic1.id },
      });
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle provider with no clinic assignments (shared provider)', async () => {
      const sharedProvider = await prisma.provider.create({
        data: {
          firstName: 'Shared',
          lastName: 'Provider',
          npi: 'TEST0000001',
          clinicId: null,
          primaryClinicId: null,
        },
      });

      // Shared provider has no ProviderClinic entries
      const assignments = await prisma.providerClinic.findMany({
        where: { providerId: sharedProvider.id },
      });
      expect(assignments).toHaveLength(0);

      // Should still be findable via clinicId: null
      const sharedProviders = await prisma.provider.findMany({
        where: { clinicId: null },
      });
      expect(sharedProviders.map(p => p.id)).toContain(sharedProvider.id);

      // Cleanup
      await prisma.provider.delete({ where: { id: sharedProvider.id } });
    });

    it('should handle inactive clinic assignments correctly', async () => {
      await prisma.providerClinic.create({
        data: {
          providerId: testProvider.id,
          clinicId: testClinic3.id,
          isActive: false, // Inactive
        },
      });

      // Should not appear in active queries
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

      expect(activeProviders.map(p => p.id)).not.toContain(testProvider.id);

      // But should appear if we include inactive
      const allProviders = await prisma.provider.findMany({
        where: {
          providerClinics: {
            some: {
              clinicId: testClinic3.id,
            },
          },
        },
      });

      expect(allProviders.map(p => p.id)).toContain(testProvider.id);
    });
  });
});
