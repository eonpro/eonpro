/**
 * Provider Service
 * ================
 *
 * Business logic layer for provider operations.
 * Handles validation, authorization, NPI verification, and orchestrates repository calls.
 *
 * @module domains/provider/services
 */

import bcrypt from 'bcryptjs';
import { logger } from '@/lib/logger';
import { lookupNpi } from '@/lib/npi';
import { prisma } from '@/lib/db';
import { providerRepository } from '../repositories';
import {
  createProviderSchema,
  updateProviderSchema,
  verifyNpiSchema,
  setPasswordSchema,
} from '../validation';
import type {
  Provider,
  ProviderWithClinic,
  CreateProviderInput,
  UpdateProviderInput,
  NpiVerificationResult,
} from '../types';
import {
  AppError,
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError,
  type ValidationErrorDetail,
} from '../../shared/errors';
import type { UserContext } from '../../shared/types';
import type { ZodIssue } from 'zod';

/**
 * Convert Zod issues to ValidationErrorDetail format
 */
function zodIssuesToValidationErrors(issues: ZodIssue[]): ValidationErrorDetail[] {
  return issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

/**
 * List providers result
 */
export interface ListProvidersResult {
  providers: ProviderWithClinic[];
  count: number;
}

export const providerService = {
  /**
   * Get provider by ID
   *
   * @throws NotFoundError if provider doesn't exist
   */
  async getById(id: number, userContext?: UserContext): Promise<ProviderWithClinic> {
    const provider = await providerRepository.findByIdWithClinic(id);

    if (!provider) {
      throw new NotFoundError('Provider', id);
    }

    // Check access if user context provided
    if (userContext && userContext.role !== 'super_admin') {
      const hasAccess =
        // User's linked provider
        userContext.providerId === provider.id ||
        // Provider from user's clinic
        (userContext.clinicId && provider.clinicId === userContext.clinicId) ||
        // Shared provider
        provider.clinicId === null;

      if (!hasAccess) {
        throw new ForbiddenError('You do not have access to this provider');
      }
    }

    return provider;
  },

  /**
   * Get provider by NPI
   */
  async getByNpi(npi: string): Promise<Provider | null> {
    return providerRepository.findByNpi(npi);
  },

  /**
   * List providers based on user context
   *
   * - Super admin sees all providers
   * - Other users see: their linked provider, clinic providers (ALL clinics they belong to), shared providers
   */
  async listProviders(userContext: UserContext): Promise<ListProvidersResult> {
    logger.info('[ProviderService] listProviders', {
      userId: userContext.id,
      role: userContext.role,
      clinicId: userContext.clinicId,
      providerId: userContext.providerId,
    });

    let providers: ProviderWithClinic[];

    if (userContext.role === 'super_admin') {
      providers = await providerRepository.listAll();
    } else {
      // ENTERPRISE: Fetch ALL clinics the user belongs to (not just active clinic)
      // This ensures providers working across multiple clinics can see all their providers
      let allClinicIds: number[] = [];

      // Include user's primary/active clinic
      if (userContext.clinicId) {
        allClinicIds.push(userContext.clinicId);
      }

      // Fetch additional clinics from UserClinic table
      try {
        const userClinics = await prisma.userClinic.findMany({
          where: {
            userId: userContext.id,
            isActive: true
          },
          select: { clinicId: true },
        });

        for (const uc of userClinics) {
          if (!allClinicIds.includes(uc.clinicId)) {
            allClinicIds.push(uc.clinicId);
          }
        }
      } catch (error) {
        // UserClinic table might not have data for this user
        logger.debug('[ProviderService] No UserClinic entries found', { userId: userContext.id });
      }

      logger.info('[ProviderService] Querying providers for clinics', {
        userId: userContext.id,
        clinicIds: allClinicIds,
        activeClinicId: userContext.clinicId,
      });

      providers = await providerRepository.list({
        clinicIds: allClinicIds.length > 0 ? allClinicIds : undefined,
        // Keep legacy clinicId for backward compatibility
        clinicId: allClinicIds.length === 0 ? (userContext.clinicId ?? undefined) : undefined,
        userProviderId: userContext.providerId ?? undefined,
        userEmail: userContext.email,
        includeShared: true,
      });
    }

    logger.info('[ProviderService] listProviders result', {
      count: providers.length,
      userId: userContext.id,
    });

    return {
      providers,
      count: providers.length,
    };
  },

  /**
   * Create a new provider
   *
   * - Validates input
   * - Verifies NPI with registry
   * - Creates provider record with audit
   *
   * @throws ValidationError for invalid input
   * @throws ConflictError if NPI already registered
   */
  async createProvider(
    input: unknown,
    userContext: UserContext
  ): Promise<ProviderWithClinic> {
    // Validate input
    const parsed = createProviderSchema.safeParse(input);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      throw new ValidationError(
        firstIssue?.message ?? 'Invalid provider data',
        zodIssuesToValidationErrors(parsed.error.issues)
      );
    }

    const data = parsed.data;

    // Check if NPI already exists
    if (await providerRepository.npiExists(data.npi)) {
      throw new ConflictError('This NPI is already registered', { field: 'npi', value: data.npi });
    }

    // Verify NPI with national registry
    let npiRegistry: NpiVerificationResult | null = null;
    try {
      const lookupResult = await lookupNpi(data.npi);
      // Map NpiLookupResult to NpiVerificationResult
      npiRegistry = {
        valid: !!lookupResult.number,
        basic: lookupResult.basic,
        addresses: lookupResult.addresses?.map(addr => ({
          addressPurpose: addr.addressPurpose ?? '',
          addressType: addr.addressType ?? '',
          city: addr.city,
          state: addr.state,
          postalCode: addr.postalCode,
        })),
      };
    } catch (error) {
      logger.warn('[ProviderService] NPI verification failed', {
        npi: data.npi,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Continue without NPI verification - can be verified later
    }

    // Determine clinic ID
    let clinicId: number | null = null;
    if (userContext.role === 'super_admin') {
      // Super admin can specify any clinic
      clinicId = data.clinicId ?? null;
    } else if (userContext.clinicId) {
      // Non-super-admin users assign to their clinic
      clinicId = userContext.clinicId;
    }

    // Build title line from NPI registry if not provided
    let titleLine = data.titleLine;
    if (!titleLine && npiRegistry?.basic) {
      const parts = [npiRegistry.basic.credential, npiRegistry.basic.lastName].filter(
        Boolean
      );
      titleLine = parts.length > 0 ? parts.join(' ') : undefined;
    }

    // Create provider
    const provider = await providerRepository.create(
      {
        ...data,
        titleLine,
        clinicId,
        npiVerifiedAt: npiRegistry ? new Date() : undefined,
        npiRawResponse: npiRegistry ?? undefined,
      },
      userContext.email
    );

    logger.info('[ProviderService] created provider', {
      providerId: provider.id,
      npi: provider.npi,
      clinicId: provider.clinicId,
      createdBy: userContext.email,
    });

    return provider;
  },

  /**
   * Update an existing provider
   *
   * @throws NotFoundError if provider doesn't exist
   * @throws ValidationError for invalid input
   * @throws ConflictError if updating to existing NPI
   * @throws ForbiddenError if user doesn't have access
   */
  async updateProvider(
    id: number,
    input: unknown,
    userContext: UserContext
  ): Promise<ProviderWithClinic> {
    // Check provider exists and user has access
    const existing = await this.getById(id, userContext);

    // Validate input
    const parsed = updateProviderSchema.safeParse(input);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      throw new ValidationError(
        firstIssue?.message ?? 'Invalid provider data',
        zodIssuesToValidationErrors(parsed.error.issues)
      );
    }

    const data = parsed.data;

    // If changing NPI, check it's not already taken
    if (data.npi && data.npi !== existing.npi) {
      if (await providerRepository.npiExists(data.npi, id)) {
        throw new ConflictError('This NPI is already registered', { field: 'npi', value: data.npi });
      }
    }

    // Non-super-admin cannot change clinic assignment
    if (
      userContext.role !== 'super_admin' &&
      data.clinicId !== undefined &&
      data.clinicId !== existing.clinicId
    ) {
      throw new ForbiddenError('Only super admins can change provider clinic assignment');
    }

    const provider = await providerRepository.update(id, data, userContext.email);

    logger.info('[ProviderService] updated provider', {
      providerId: id,
      updatedBy: userContext.email,
    });

    return provider;
  },

  /**
   * Delete a provider
   *
   * @throws NotFoundError if provider doesn't exist
   * @throws ForbiddenError if user doesn't have access
   */
  async deleteProvider(id: number, userContext: UserContext): Promise<void> {
    // Check provider exists and user has access
    await this.getById(id, userContext);

    // Only admin/super_admin can delete
    if (!['admin', 'super_admin'].includes(userContext.role)) {
      throw new ForbiddenError('Only administrators can delete providers');
    }

    await providerRepository.delete(id, userContext.email);

    logger.info('[ProviderService] deleted provider', {
      providerId: id,
      deletedBy: userContext.email,
    });
  },

  /**
   * Verify NPI with national registry
   */
  async verifyNpi(npi: string): Promise<NpiVerificationResult> {
    // Validate NPI format
    const parsed = verifyNpiSchema.safeParse({ npi });
    if (!parsed.success) {
      throw new ValidationError('Invalid NPI format', zodIssuesToValidationErrors(parsed.error.issues));
    }

    try {
      const lookupResult = await lookupNpi(npi);
      // Map NpiLookupResult to NpiVerificationResult
      return {
        valid: !!lookupResult.number,
        basic: lookupResult.basic,
        addresses: lookupResult.addresses?.map(addr => ({
          addressPurpose: addr.addressPurpose ?? '',
          addressType: addr.addressType ?? '',
          city: addr.city,
          state: addr.state,
          postalCode: addr.postalCode,
        })),
      };
    } catch (error) {
      throw new AppError(
        'NPI_LOOKUP_FAILED',
        error instanceof Error ? error.message : 'NPI lookup failed',
        400
      );
    }
  },

  /**
   * Set or update provider password
   *
   * @throws NotFoundError if provider doesn't exist
   * @throws ValidationError for invalid password
   */
  async setPassword(
    providerId: number,
    input: unknown,
    actorEmail: string
  ): Promise<{ success: boolean; providerId: number }> {
    // Validate input
    const parsed = setPasswordSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError('Invalid password input', zodIssuesToValidationErrors(parsed.error.issues));
    }

    // Check provider exists
    const provider = await providerRepository.findById(providerId);
    if (!provider) {
      throw new NotFoundError('Provider', providerId);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);

    // Update provider password
    await providerRepository.setPassword(providerId, passwordHash, actorEmail);

    logger.info('[ProviderService] password set', {
      providerId,
      actor: actorEmail,
    });

    return {
      success: true,
      providerId,
    };
  },

  /**
   * Update last login for provider
   */
  async recordLogin(providerId: number): Promise<void> {
    await providerRepository.updateLastLogin(providerId);
  },

  // ============================================================================
  // ENTERPRISE: Provider-Clinic Management
  // ============================================================================

  /**
   * Assign provider to a clinic
   *
   * @throws NotFoundError if provider doesn't exist
   * @throws ForbiddenError if user doesn't have permission
   */
  async assignToClinic(
    providerId: number,
    clinicId: number,
    metadata: {
      isPrimary?: boolean;
      titleLine?: string;
      deaNumber?: string;
      licenseNumber?: string;
      licenseState?: string;
    },
    userContext: UserContext
  ) {
    // Check provider exists and user has access
    await this.getById(providerId, userContext);

    // Only admin/super_admin can assign providers to clinics
    if (!['admin', 'super_admin'].includes(userContext.role)) {
      throw new ForbiddenError('Only administrators can manage provider clinic assignments');
    }

    const result = await providerRepository.assignToClinic(
      providerId,
      clinicId,
      metadata,
      userContext.email
    );

    logger.info('[ProviderService] assigned provider to clinic', {
      providerId,
      clinicId,
      actor: userContext.email,
    });

    return result;
  },

  /**
   * Remove provider from a clinic
   *
   * @throws NotFoundError if provider doesn't exist
   * @throws ForbiddenError if user doesn't have permission
   */
  async removeFromClinic(
    providerId: number,
    clinicId: number,
    userContext: UserContext
  ): Promise<void> {
    // Check provider exists and user has access
    await this.getById(providerId, userContext);

    // Only admin/super_admin can remove providers from clinics
    if (!['admin', 'super_admin'].includes(userContext.role)) {
      throw new ForbiddenError('Only administrators can manage provider clinic assignments');
    }

    await providerRepository.removeFromClinic(providerId, clinicId, userContext.email);

    logger.info('[ProviderService] removed provider from clinic', {
      providerId,
      clinicId,
      actor: userContext.email,
    });
  },

  /**
   * Get all clinics a provider is assigned to
   */
  async getProviderClinics(providerId: number, userContext?: UserContext) {
    // Verify provider exists (and access if context provided)
    if (userContext) {
      await this.getById(providerId, userContext);
    }

    return providerRepository.getProviderClinics(providerId);
  },

  /**
   * Check if provider has access to a specific clinic
   */
  async hasClinicAccess(providerId: number, clinicId: number): Promise<boolean> {
    return providerRepository.hasClinicAccess(providerId, clinicId);
  },

  /**
   * Set a clinic as the provider's primary clinic
   *
   * @throws NotFoundError if provider doesn't exist
   * @throws ForbiddenError if user doesn't have permission
   */
  async setPrimaryClinic(
    providerId: number,
    clinicId: number,
    userContext: UserContext
  ): Promise<void> {
    // Check provider exists and user has access
    await this.getById(providerId, userContext);

    // Only admin/super_admin or the provider themselves can set primary clinic
    const isOwnProfile = userContext.providerId === providerId;
    if (!isOwnProfile && !['admin', 'super_admin'].includes(userContext.role)) {
      throw new ForbiddenError('Not authorized to change provider primary clinic');
    }

    // Verify provider has access to this clinic
    const hasAccess = await providerRepository.hasClinicAccess(providerId, clinicId);
    if (!hasAccess) {
      throw new ForbiddenError('Provider is not assigned to this clinic');
    }

    await providerRepository.setPrimaryClinic(providerId, clinicId, userContext.email);

    logger.info('[ProviderService] set primary clinic', {
      providerId,
      clinicId,
      actor: userContext.email,
    });
  },

  /**
   * Switch provider's active clinic (for session switching)
   *
   * @throws NotFoundError if provider doesn't exist
   * @throws ForbiddenError if provider doesn't have access to clinic
   */
  async switchActiveClinic(
    providerId: number,
    clinicId: number,
    userContext: UserContext
  ): Promise<void> {
    // Only the provider themselves or super_admin can switch active clinic
    const isOwnProfile = userContext.providerId === providerId;
    if (!isOwnProfile && userContext.role !== 'super_admin') {
      throw new ForbiddenError('Not authorized to switch provider active clinic');
    }

    // Verify provider has access to this clinic
    const hasAccess = await providerRepository.hasClinicAccess(providerId, clinicId);
    if (!hasAccess) {
      throw new ForbiddenError('Provider is not assigned to this clinic');
    }

    await providerRepository.setActiveClinic(providerId, clinicId);

    logger.info('[ProviderService] switched active clinic', {
      providerId,
      clinicId,
      actor: userContext.email,
    });
  },

  // ============================================================================
  // SUPER ADMIN: Global Provider Operations
  // ============================================================================

  /**
   * List all providers with clinic counts (for super admin)
   * Returns providers with statistics useful for global management
   */
  async listAllProvidersWithStats(): Promise<{
    providers: ProviderWithClinic[];
    count: number;
    assignedCount: number;
    unassignedCount: number;
  }> {
    const providers = await providerRepository.listAll();

    // Calculate assigned vs unassigned
    let assignedCount = 0;
    let unassignedCount = 0;

    for (const provider of providers) {
      const hasClinic = 
        provider.clinicId !== null || 
        (provider.providerClinics && provider.providerClinics.length > 0);
      
      if (hasClinic) {
        assignedCount++;
      } else {
        unassignedCount++;
      }
    }

    return {
      providers,
      count: providers.length,
      assignedCount,
      unassignedCount,
    };
  },

  /**
   * Create a global provider (without clinic assignment)
   * Only super admin can create global providers
   */
  async createGlobalProvider(
    input: unknown,
    userContext: UserContext
  ): Promise<ProviderWithClinic> {
    // Ensure only super admin can create global providers
    if (userContext.role !== 'super_admin') {
      throw new ForbiddenError('Only super admins can create global providers');
    }

    // Force clinicId to null for global provider
    const globalInput = {
      ...(input as Record<string, unknown>),
      clinicId: null,
    };

    return this.createProvider(globalInput, {
      ...userContext,
      clinicId: null, // Ensure context has no clinic
    });
  },
};

export type ProviderService = typeof providerService;
