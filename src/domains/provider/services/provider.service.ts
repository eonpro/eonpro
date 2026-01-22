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
} from '../../shared/errors';
import type { UserContext } from '../../shared/types';

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
   * - Other users see: their linked provider, clinic providers, shared providers
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
      providers = await providerRepository.list({
        clinicId: userContext.clinicId ?? undefined,
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
        parsed.error.issues
      );
    }

    const data = parsed.data;

    // Check if NPI already exists
    if (await providerRepository.npiExists(data.npi)) {
      throw new ConflictError('NPI', data.npi, 'This NPI is already registered');
    }

    // Verify NPI with national registry
    let npiRegistry: NpiVerificationResult | null = null;
    try {
      npiRegistry = await lookupNpi(data.npi);
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
        parsed.error.issues
      );
    }

    const data = parsed.data;

    // If changing NPI, check it's not already taken
    if (data.npi && data.npi !== existing.npi) {
      if (await providerRepository.npiExists(data.npi, id)) {
        throw new ConflictError('NPI', data.npi, 'This NPI is already registered');
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
      throw new ValidationError('Invalid NPI format', parsed.error.issues);
    }

    try {
      const result = await lookupNpi(npi);
      return result;
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
      throw new ValidationError('Invalid password input', parsed.error.issues);
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
};

export type ProviderService = typeof providerService;
