/**
 * Provider Repository
 * ===================
 *
 * Data access layer for provider operations.
 * Handles database queries, audit logging, and clinic isolation.
 *
 * @module domains/provider/repositories
 */

import { type Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  Provider,
  ProviderWithClinic,
  CreateProviderInput,
  UpdateProviderInput,
  ListProvidersFilters,
  ProviderAuditEntry,
  PROVIDER_AUDIT_FIELDS,
} from '../types';

/**
 * Select fields for provider queries with clinic
 */
const PROVIDER_WITH_CLINIC_SELECT = {
  id: true,
  createdAt: true,
  updatedAt: true,
  clinicId: true,
  primaryClinicId: true,
  activeClinicId: true,
  firstName: true,
  lastName: true,
  titleLine: true,
  npi: true,
  licenseState: true,
  licenseNumber: true,
  dea: true,
  email: true,
  phone: true,
  signatureDataUrl: true,
  npiVerifiedAt: true,
  npiRawResponse: true,
  lastLogin: true,
  clinic: {
    select: {
      id: true,
      name: true,
      subdomain: true,
    },
  },
  // ENTERPRISE: Include multi-clinic assignments
  providerClinics: {
    where: { isActive: true },
    select: {
      id: true,
      clinicId: true,
      isPrimary: true,
      isActive: true,
      titleLine: true,
      deaNumber: true,
      licenseNumber: true,
      licenseState: true,
      clinic: {
        select: {
          id: true,
          name: true,
          subdomain: true,
        },
      },
    },
    orderBy: { isPrimary: 'desc' as const },
  },
} as const;

/**
 * Base select fields (without clinic)
 */
const PROVIDER_BASE_SELECT = {
  id: true,
  createdAt: true,
  updatedAt: true,
  clinicId: true,
  primaryClinicId: true,
  activeClinicId: true,
  firstName: true,
  lastName: true,
  titleLine: true,
  npi: true,
  licenseState: true,
  licenseNumber: true,
  dea: true,
  email: true,
  phone: true,
  signatureDataUrl: true,
  npiVerifiedAt: true,
  npiRawResponse: true,
  lastLogin: true,
} as const;

/**
 * Calculate diff between two provider objects for audit logging
 */
function diffProviders(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Record<string, { before: unknown; after: unknown }> {
  const diff: Record<string, { before: unknown; after: unknown }> = {};

  for (const field of PROVIDER_AUDIT_FIELDS) {
    if (before[field] !== after[field]) {
      diff[field] = { before: before[field], after: after[field] };
    }
  }

  return diff;
}

export const providerRepository = {
  /**
   * Find provider by ID
   */
  async findById(id: number): Promise<Provider | null> {
    const provider = await prisma.provider.findUnique({
      where: { id },
      select: PROVIDER_BASE_SELECT,
    });

    return provider as Provider | null;
  },

  /**
   * Find provider by ID with clinic information
   */
  async findByIdWithClinic(id: number): Promise<ProviderWithClinic | null> {
    const provider = await prisma.provider.findUnique({
      where: { id },
      select: PROVIDER_WITH_CLINIC_SELECT,
    });

    return provider as ProviderWithClinic | null;
  },

  /**
   * Find provider by NPI
   */
  async findByNpi(npi: string): Promise<Provider | null> {
    const provider = await prisma.provider.findUnique({
      where: { npi },
      select: PROVIDER_BASE_SELECT,
    });

    return provider as Provider | null;
  },

  /**
   * Find provider by email
   */
  async findByEmail(email: string): Promise<Provider | null> {
    const provider = await prisma.provider.findFirst({
      where: { email: email.toLowerCase() },
      select: PROVIDER_BASE_SELECT,
    });

    return provider as Provider | null;
  },

  /**
   * List providers with filtering
   *
   * ENTERPRISE: Multi-clinic support via ProviderClinic junction table
   * For non-super-admin users:
   * - Include their linked provider (by ID)
   * - Include providers matching their email
   * - Include providers via ProviderClinic junction table (PRIMARY method)
   * - Include providers from their clinics (by Provider.clinicId) - legacy support
   * - Include providers whose linked User is in the clinics (via UserClinic) - fallback
   * - Include shared providers (clinicId null or no ProviderClinic entries)
   */
  async list(filters: ListProvidersFilters): Promise<ProviderWithClinic[]> {
    // Build OR conditions based on filters
    const orConditions: Array<Record<string, unknown>> = [];

    // If user has a linked provider, include it by ID (highest priority)
    if (filters.userProviderId) {
      orConditions.push({ id: filters.userProviderId });
    }

    // Also include provider matching user's email (in case not linked yet)
    if (filters.userEmail) {
      orConditions.push({ email: filters.userEmail.toLowerCase() });
    }

    // ENTERPRISE: Support multiple clinic IDs for multi-clinic users
    // Priority: clinicIds array > single clinicId (legacy)
    const clinicIds = filters.clinicIds?.length
      ? filters.clinicIds
      : (filters.clinicId ? [filters.clinicId] : []);

    if (clinicIds.length > 0) {
      // ENTERPRISE: Query via ProviderClinic junction table (PRIMARY method)
      orConditions.push({
        providerClinics: {
          some: {
            clinicId: { in: clinicIds },
            isActive: true,
          },
        },
      });

      // Legacy: Include providers directly assigned to any of these clinics
      orConditions.push({ clinicId: { in: clinicIds } });

      // Fallback: Also include providers whose linked User
      // is assigned to any of these clinics via UserClinic table
      orConditions.push({
        user: {
          userClinics: {
            some: {
              clinicId: { in: clinicIds },
              isActive: true,
              role: 'PROVIDER', // Only if they have provider role in this clinic
            },
          },
        },
      });
    }

    // Include shared providers (no clinic) if requested
    if (filters.includeShared !== false) {
      // Shared = clinicId null AND no active ProviderClinic entries
      // But also include clinicId null for backward compatibility
      orConditions.push({ clinicId: null });
    }

    const where = orConditions.length > 0 ? { OR: orConditions } : {};

    logger.debug('[ProviderRepository] list query', {
      filters,
      clinicIds,
      conditionCount: orConditions.length,
      usingProviderClinic: clinicIds.length > 0,
    });

    const providers = await prisma.provider.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: PROVIDER_WITH_CLINIC_SELECT,
    });

    // Remove duplicates (in case provider matches multiple conditions)
    const seen = new Set<number>();
    const deduped = providers.filter((p: { id: number }) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    logger.debug('[ProviderRepository] list result', {
      found: providers.length,
      afterDedup: deduped.length,
    });

    return deduped as ProviderWithClinic[];
  },

  /**
   * List all providers (for super admin)
   */
  async listAll(): Promise<ProviderWithClinic[]> {
    const providers = await prisma.provider.findMany({
      orderBy: { createdAt: 'desc' },
      select: PROVIDER_WITH_CLINIC_SELECT,
    });

    return providers as ProviderWithClinic[];
  },

  /**
   * Create a new provider with audit logging
   */
  async create(
    input: CreateProviderInput & {
      npiVerifiedAt?: Date;
      npiRawResponse?: unknown;
    },
    actorEmail: string
  ): Promise<ProviderWithClinic> {
    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const provider = await tx.provider.create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          titleLine: input.titleLine ?? null,
          npi: input.npi,
          licenseState: input.licenseState ?? null,
          licenseNumber: input.licenseNumber ?? null,
          dea: input.dea ?? null,
          email: input.email?.toLowerCase() ?? null,
          phone: input.phone ?? null,
          signatureDataUrl: input.signatureDataUrl ?? null,
          clinicId: input.clinicId ?? null,
          npiVerifiedAt: input.npiVerifiedAt ?? null,
          npiRawResponse: (input.npiRawResponse ?? null) as Prisma.InputJsonValue,
        },
        select: PROVIDER_WITH_CLINIC_SELECT,
      });

      // Create audit log
      await tx.providerAudit.create({
        data: {
          providerId: provider.id,
          actorEmail,
          action: 'CREATE',
          diff: {
            created: JSON.stringify(input),
            by: actorEmail,
          } as Prisma.InputJsonValue,
        },
      });

      logger.info('[ProviderRepository] created provider', {
        providerId: provider.id,
        npi: provider.npi,
        clinicId: provider.clinicId,
        actor: actorEmail,
      });

      return provider as ProviderWithClinic;
    });
  },

  /**
   * Update provider with audit logging
   */
  async update(
    id: number,
    input: UpdateProviderInput,
    actorEmail: string
  ): Promise<ProviderWithClinic> {
    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Get existing for diff
      const existing = await tx.provider.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new Error('Provider not found');
      }

      // Prepare update data - only include defined fields
      const updateData: Record<string, unknown> = {};
      if (input.firstName !== undefined) updateData.firstName = input.firstName;
      if (input.lastName !== undefined) updateData.lastName = input.lastName;
      if (input.titleLine !== undefined) updateData.titleLine = input.titleLine;
      if (input.npi !== undefined) updateData.npi = input.npi;
      if (input.licenseState !== undefined) updateData.licenseState = input.licenseState;
      if (input.licenseNumber !== undefined) updateData.licenseNumber = input.licenseNumber;
      if (input.dea !== undefined) updateData.dea = input.dea;
      if (input.email !== undefined) updateData.email = input.email?.toLowerCase() ?? null;
      if (input.phone !== undefined) updateData.phone = input.phone;
      if (input.signatureDataUrl !== undefined) updateData.signatureDataUrl = input.signatureDataUrl;
      if (input.clinicId !== undefined) updateData.clinicId = input.clinicId;

      const provider = await tx.provider.update({
        where: { id },
        data: updateData,
        select: PROVIDER_WITH_CLINIC_SELECT,
      });

      // Calculate and log diff
      const changeSet = diffProviders(existing as Record<string, unknown>, provider as Record<string, unknown>);

      if (Object.keys(changeSet).length > 0) {
        await tx.providerAudit.create({
          data: {
            providerId: id,
            actorEmail,
            action: 'UPDATE',
            diff: changeSet as Prisma.InputJsonValue,
          },
        });

        logger.info('[ProviderRepository] updated provider', {
          providerId: id,
          changes: Object.keys(changeSet),
          actor: actorEmail,
        });
      }

      return provider as ProviderWithClinic;
    });
  },

  /**
   * Delete provider (soft delete via audit trail)
   */
  async delete(id: number, actorEmail: string): Promise<void> {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.provider.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new Error('Provider not found');
      }

      // Create audit entry before delete
      await tx.providerAudit.create({
        data: {
          providerId: id,
          actorEmail,
          action: 'DELETE',
          diff: {
            deleted: {
              firstName: existing.firstName,
              lastName: existing.lastName,
              npi: existing.npi,
              clinicId: existing.clinicId,
            },
            by: actorEmail,
          },
        },
      });

      // Actually delete the provider
      await tx.provider.delete({
        where: { id },
      });

      logger.info('[ProviderRepository] deleted provider', {
        providerId: id,
        npi: existing.npi,
        actor: actorEmail,
      });
    });
  },

  /**
   * Set or update provider password
   */
  async setPassword(id: number, passwordHash: string, actorEmail: string): Promise<void> {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.provider.update({
        where: { id },
        data: {
          passwordHash,
          passwordResetToken: null,
          passwordResetExpires: null,
        },
      });

      await tx.providerAudit.create({
        data: {
          providerId: id,
          actorEmail,
          action: 'PASSWORD_SET',
          diff: { passwordUpdated: true },
        },
      });

      logger.info('[ProviderRepository] password set', {
        providerId: id,
        actor: actorEmail,
      });
    });
  },

  /**
   * Update last login timestamp
   */
  async updateLastLogin(id: number): Promise<void> {
    await prisma.provider.update({
      where: { id },
      data: { lastLogin: new Date() },
    });
  },

  /**
   * Check if NPI is already registered
   */
  async npiExists(npi: string, excludeId?: number): Promise<boolean> {
    const existing = await prisma.provider.findFirst({
      where: {
        npi,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });

    return existing !== null;
  },

  /**
   * Create audit entry directly
   */
  async createAuditEntry(entry: ProviderAuditEntry): Promise<void> {
    await prisma.providerAudit.create({
      data: {
        providerId: entry.providerId,
        actorEmail: entry.actorEmail,
        action: entry.action,
        diff: entry.diff ?? {},
      },
    });
  },

  // ============================================================================
  // ENTERPRISE: ProviderClinic Junction Table Operations
  // ============================================================================

  /**
   * Assign provider to a clinic
   * Creates or reactivates a ProviderClinic entry
   */
  async assignToClinic(
    providerId: number,
    clinicId: number,
    metadata?: {
      isPrimary?: boolean;
      titleLine?: string;
      deaNumber?: string;
      licenseNumber?: string;
      licenseState?: string;
    },
    actorEmail?: string
  ): Promise<{ id: number; providerId: number; clinicId: number; isPrimary: boolean }> {
    const result = await prisma.providerClinic.upsert({
      where: {
        providerId_clinicId: { providerId, clinicId },
      },
      create: {
        providerId,
        clinicId,
        isPrimary: metadata?.isPrimary ?? false,
        isActive: true,
        titleLine: metadata?.titleLine,
        deaNumber: metadata?.deaNumber,
        licenseNumber: metadata?.licenseNumber,
        licenseState: metadata?.licenseState,
      },
      update: {
        isActive: true,
        isPrimary: metadata?.isPrimary,
        titleLine: metadata?.titleLine,
        deaNumber: metadata?.deaNumber,
        licenseNumber: metadata?.licenseNumber,
        licenseState: metadata?.licenseState,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        providerId: true,
        clinicId: true,
        isPrimary: true,
      },
    });

    // Create audit entry
    if (actorEmail) {
      await prisma.providerAudit.create({
        data: {
          providerId,
          actorEmail,
          action: 'CLINIC_ASSIGNMENT',
          diff: { clinicId, action: 'assigned', metadata },
        },
      });
    }

    logger.info('[ProviderRepository] assigned provider to clinic', {
      providerId,
      clinicId,
      isPrimary: result.isPrimary,
      actor: actorEmail,
    });

    return result;
  },

  /**
   * Remove provider from a clinic (soft delete)
   */
  async removeFromClinic(
    providerId: number,
    clinicId: number,
    actorEmail?: string
  ): Promise<void> {
    await prisma.providerClinic.update({
      where: {
        providerId_clinicId: { providerId, clinicId },
      },
      data: {
        isActive: false,
        updatedAt: new Date(),
      },
    });

    // Create audit entry
    if (actorEmail) {
      await prisma.providerAudit.create({
        data: {
          providerId,
          actorEmail,
          action: 'CLINIC_REMOVAL',
          diff: { clinicId, action: 'removed' },
        },
      });
    }

    logger.info('[ProviderRepository] removed provider from clinic', {
      providerId,
      clinicId,
      actor: actorEmail,
    });
  },

  /**
   * Get all clinics a provider is assigned to
   */
  async getProviderClinics(providerId: number, includeInactive = false) {
    return prisma.providerClinic.findMany({
      where: {
        providerId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: {
        clinic: {
          select: {
            id: true,
            name: true,
            subdomain: true,
            status: true,
          },
        },
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  },

  /**
   * Check if provider has access to a specific clinic
   */
  async hasClinicAccess(providerId: number, clinicId: number): Promise<boolean> {
    const assignment = await prisma.providerClinic.findFirst({
      where: {
        providerId,
        clinicId,
        isActive: true,
      },
      select: { id: true },
    });

    return assignment !== null;
  },

  /**
   * Set a clinic as the provider's primary clinic
   */
  async setPrimaryClinic(
    providerId: number,
    clinicId: number,
    actorEmail?: string
  ): Promise<void> {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Remove primary flag from all other assignments
      await tx.providerClinic.updateMany({
        where: { providerId, isPrimary: true },
        data: { isPrimary: false },
      });

      // Set the new primary
      await tx.providerClinic.update({
        where: {
          providerId_clinicId: { providerId, clinicId },
        },
        data: { isPrimary: true },
      });

      // Update provider's primaryClinicId
      await tx.provider.update({
        where: { id: providerId },
        data: { primaryClinicId: clinicId },
      });

      // Create audit entry
      if (actorEmail) {
        await tx.providerAudit.create({
          data: {
            providerId,
            actorEmail,
            action: 'PRIMARY_CLINIC_CHANGE',
            diff: { clinicId, action: 'set_primary' },
          },
        });
      }
    });

    logger.info('[ProviderRepository] set primary clinic', {
      providerId,
      clinicId,
      actor: actorEmail,
    });
  },

  /**
   * Update provider's active clinic (for session switching)
   */
  async setActiveClinic(providerId: number, clinicId: number): Promise<void> {
    await prisma.provider.update({
      where: { id: providerId },
      data: { activeClinicId: clinicId },
    });
  },
};

export type ProviderRepository = typeof providerRepository;
