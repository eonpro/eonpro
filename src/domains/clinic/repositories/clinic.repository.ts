/**
 * Clinic Repository
 * =================
 *
 * Data access layer for clinic operations.
 * Encapsulates all Prisma queries for clinics with:
 * - Type-safe field selections (prevents schema drift errors)
 * - Explicit select patterns for backwards compatibility
 * - Centralized query definitions
 *
 * IMPORTANT: When adding new columns to the Clinic model:
 * 1. Add them to the appropriate SELECT constant below
 * 2. Update the type definitions
 * 3. Run migrations BEFORE deploying code that uses new columns
 *
 * @module domains/clinic/repositories
 */

import { Prisma } from '@prisma/client';
import { basePrisma } from '@/lib/db';
import { logger } from '@/lib/logger';

// ============================================================================
// Select Patterns - Define exactly which fields to fetch
// ============================================================================

/**
 * Basic clinic fields - use for existence checks and simple lookups
 */
export const CLINIC_BASIC_SELECT = {
  id: true,
  name: true,
  subdomain: true,
  customDomain: true,
  status: true,
} satisfies Prisma.ClinicSelect;

/**
 * Branding fields - use for UI/theming
 */
export const CLINIC_BRANDING_SELECT = {
  ...CLINIC_BASIC_SELECT,
  primaryColor: true,
  secondaryColor: true,
  accentColor: true,
  logoUrl: true,
  iconUrl: true,
  faviconUrl: true,
  customCss: true,
  // NOTE: buttonTextColor added 2026-01-24
  // Uncomment after migration is deployed to all environments
  // buttonTextColor: true,
} satisfies Prisma.ClinicSelect;

/**
 * Contact information fields
 */
export const CLINIC_CONTACT_SELECT = {
  adminEmail: true,
  supportEmail: true,
  phone: true,
  timezone: true,
  address: true,
} satisfies Prisma.ClinicSelect;

/**
 * Billing and limits fields
 */
export const CLINIC_BILLING_SELECT = {
  billingPlan: true,
  patientLimit: true,
  providerLimit: true,
  storageLimit: true,
} satisfies Prisma.ClinicSelect;

/**
 * Settings and features fields
 */
export const CLINIC_SETTINGS_SELECT = {
  settings: true,
  features: true,
  integrations: true,
} satisfies Prisma.ClinicSelect;

/**
 * Lifefile integration fields
 */
export const CLINIC_LIFEFILE_SELECT = {
  lifefileEnabled: true,
  lifefileBaseUrl: true,
  lifefileUsername: true,
  lifefilePassword: true,
  lifefileVendorId: true,
  lifefilePracticeId: true,
  lifefileLocationId: true,
  lifefileNetworkId: true,
  lifefilePracticeName: true,
  lifefilePracticeAddress: true,
  lifefilePracticePhone: true,
  lifefilePracticeFax: true,
  lifefileWebhookSecret: true,
  lifefileDatapushUsername: true,
  lifefileDatapushPassword: true,
} satisfies Prisma.ClinicSelect;

/**
 * Full clinic fields - use for admin views and detailed pages
 * Combines all select patterns
 */
export const CLINIC_FULL_SELECT = {
  ...CLINIC_BASIC_SELECT,
  ...CLINIC_BRANDING_SELECT,
  ...CLINIC_CONTACT_SELECT,
  ...CLINIC_BILLING_SELECT,
  ...CLINIC_SETTINGS_SELECT,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ClinicSelect;

/**
 * Clinic with counts - for list views showing statistics
 */
export const CLINIC_WITH_COUNTS_SELECT = {
  ...CLINIC_FULL_SELECT,
  _count: {
    select: {
      patients: true,
      users: true,
      providers: true,
      orders: true,
      invoices: true,
    },
  },
} satisfies Prisma.ClinicSelect;

// ============================================================================
// Type Definitions
// ============================================================================

export type ClinicBasic = Prisma.ClinicGetPayload<{ select: typeof CLINIC_BASIC_SELECT }>;
export type ClinicBranding = Prisma.ClinicGetPayload<{ select: typeof CLINIC_BRANDING_SELECT }>;
export type ClinicFull = Prisma.ClinicGetPayload<{ select: typeof CLINIC_FULL_SELECT }>;
export type ClinicWithCounts = Prisma.ClinicGetPayload<{ select: typeof CLINIC_WITH_COUNTS_SELECT }>;

// ============================================================================
// Repository Interface
// ============================================================================

export interface IClinicRepository {
  findById(id: number): Promise<ClinicFull | null>;
  findByIdBasic(id: number): Promise<ClinicBasic | null>;
  findBySubdomain(subdomain: string): Promise<ClinicBasic | null>;
  findByCustomDomain(domain: string): Promise<ClinicBasic | null>;
  findForBranding(id: number): Promise<ClinicBranding | null>;
  exists(id: number): Promise<boolean>;
  existsBySubdomain(subdomain: string): Promise<boolean>;
  listAll(): Promise<ClinicWithCounts[]>;
  listActive(): Promise<ClinicBasic[]>;
}

// ============================================================================
// Repository Implementation
// ============================================================================

/**
 * Clinic Repository Implementation
 * 
 * Uses basePrisma (without clinic filtering) since this is for
 * super-admin and system-level operations.
 */
class ClinicRepositoryImpl implements IClinicRepository {
  private prisma = basePrisma;

  /**
   * Find clinic by ID with full details
   */
  async findById(id: number): Promise<ClinicFull | null> {
    try {
      return await this.prisma.clinic.findUnique({
        where: { id },
        select: CLINIC_FULL_SELECT,
      });
    } catch (error) {
      logger.error('[ClinicRepository] Error finding clinic by ID', { id, error });
      throw error;
    }
  }

  /**
   * Find clinic by ID with basic fields only
   */
  async findByIdBasic(id: number): Promise<ClinicBasic | null> {
    try {
      return await this.prisma.clinic.findUnique({
        where: { id },
        select: CLINIC_BASIC_SELECT,
      });
    } catch (error) {
      logger.error('[ClinicRepository] Error finding clinic by ID (basic)', { id, error });
      throw error;
    }
  }

  /**
   * Find clinic by subdomain (case-insensitive)
   */
  async findBySubdomain(subdomain: string): Promise<ClinicBasic | null> {
    try {
      return await this.prisma.clinic.findFirst({
        where: { subdomain: { equals: subdomain, mode: 'insensitive' } },
        select: CLINIC_BASIC_SELECT,
      });
    } catch (error) {
      logger.error('[ClinicRepository] Error finding clinic by subdomain', { subdomain, error });
      throw error;
    }
  }

  /**
   * Find clinic by custom domain
   */
  async findByCustomDomain(domain: string): Promise<ClinicBasic | null> {
    try {
      return await this.prisma.clinic.findUnique({
        where: { customDomain: domain },
        select: CLINIC_BASIC_SELECT,
      });
    } catch (error) {
      logger.error('[ClinicRepository] Error finding clinic by custom domain', { domain, error });
      throw error;
    }
  }

  /**
   * Find clinic for branding (UI theming)
   */
  async findForBranding(id: number): Promise<ClinicBranding | null> {
    try {
      return await this.prisma.clinic.findUnique({
        where: { id },
        select: CLINIC_BRANDING_SELECT,
      });
    } catch (error) {
      logger.error('[ClinicRepository] Error finding clinic for branding', { id, error });
      throw error;
    }
  }

  /**
   * Check if clinic exists by ID
   */
  async exists(id: number): Promise<boolean> {
    try {
      const clinic = await this.prisma.clinic.findUnique({
        where: { id },
        select: { id: true },
      });
      return !!clinic;
    } catch (error) {
      logger.error('[ClinicRepository] Error checking clinic existence', { id, error });
      throw error;
    }
  }

  /**
   * Check if clinic exists by subdomain (case-insensitive)
   */
  async existsBySubdomain(subdomain: string): Promise<boolean> {
    try {
      const clinic = await this.prisma.clinic.findFirst({
        where: { subdomain: { equals: subdomain, mode: 'insensitive' } },
        select: { id: true },
      });
      return !!clinic;
    } catch (error) {
      logger.error('[ClinicRepository] Error checking clinic existence by subdomain', { subdomain, error });
      throw error;
    }
  }

  /**
   * List all clinics with counts (for admin dashboards)
   */
  async listAll(): Promise<ClinicWithCounts[]> {
    try {
      return await this.prisma.clinic.findMany({
        select: CLINIC_WITH_COUNTS_SELECT,
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      logger.error('[ClinicRepository] Error listing all clinics', { error });
      throw error;
    }
  }

  /**
   * List active clinics only
   */
  async listActive(): Promise<ClinicBasic[]> {
    try {
      return await this.prisma.clinic.findMany({
        where: { status: 'ACTIVE' },
        select: CLINIC_BASIC_SELECT,
        orderBy: { name: 'asc' },
      });
    } catch (error) {
      logger.error('[ClinicRepository] Error listing active clinics', { error });
      throw error;
    }
  }

  /**
   * Find clinic for EONMEDS (common pattern in webhooks)
   */
  async findEonmeds(): Promise<ClinicBasic | null> {
    try {
      return await this.prisma.clinic.findFirst({
        where: {
          OR: [
            { subdomain: 'eonmeds' },
            { name: { contains: 'EONMEDS', mode: 'insensitive' } },
          ],
        },
        select: CLINIC_BASIC_SELECT,
      });
    } catch (error) {
      logger.error('[ClinicRepository] Error finding EONMEDS clinic', { error });
      throw error;
    }
  }

  /**
   * Find clinic for Wellmedr (common pattern in webhooks)
   */
  async findWellmedr(): Promise<ClinicBasic | null> {
    try {
      return await this.prisma.clinic.findFirst({
        where: {
          OR: [
            { subdomain: 'wellmedr' },
            { subdomain: { contains: 'wellmedr', mode: 'insensitive' } },
            { name: { contains: 'Wellmedr', mode: 'insensitive' } },
          ],
        },
        select: CLINIC_BASIC_SELECT,
      });
    } catch (error) {
      logger.error('[ClinicRepository] Error finding Wellmedr clinic', { error });
      throw error;
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const clinicRepository = new ClinicRepositoryImpl();

// Also export the class for testing
export { ClinicRepositoryImpl };
