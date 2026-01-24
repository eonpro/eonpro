/**
 * INTELLIGENT DATA PRELOADER
 * ==========================
 * 
 * Predictive data loading based on common access patterns:
 * - Preloads related data to prevent N+1 queries
 * - Smart prefetching based on user navigation patterns
 * - Request-scoped data batching
 * - Automatic cache warming
 * 
 * @module DataPreloader
 */

import { PrismaClient } from '@prisma/client';
import { basePrisma } from '@/lib/db';
import { queryOptimizer, createDataLoader, type CacheConfig } from './query-optimizer';
import { logger } from '@/lib/logger';

// =============================================================================
// TYPES
// =============================================================================

interface PreloadConfig {
  /** Entity type to preload */
  entity: EntityType;
  /** IDs to preload */
  ids: number[];
  /** Relations to include */
  include?: string[];
  /** Cache configuration override */
  cache?: Partial<CacheConfig>;
}

type EntityType = 
  | 'patient'
  | 'provider'
  | 'invoice'
  | 'order'
  | 'appointment';

interface PatientPreloadData {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  clinicId: number;
  // Commonly accessed relations
  orders?: { id: number; status: string }[];
  invoices?: { id: number; status: string; amount: number }[];
  appointments?: { id: number; scheduledAt: Date; status: string }[];
}

interface PreloadResult {
  loaded: number;
  cached: number;
  duration: number;
}

// =============================================================================
// ENTITY LOADERS
// =============================================================================

/**
 * Create optimized batch loaders for each entity type
 */
const createEntityLoaders = (prisma: PrismaClient) => ({
  patient: createDataLoader<number, PatientPreloadData>(
    async (ids) => {
      const patients = await prisma.patient.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          clinicId: true,
        },
      });
      return new Map(patients.map(p => [p.id, p as PatientPreloadData]));
    },
    { maxBatchSize: 50, batchDelayMs: 5 }
  ),

  provider: createDataLoader<number, unknown>(
    async (ids) => {
      const providers = await prisma.provider.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          npi: true,
          clinicId: true,
          titleLine: true,
        },
      });
      return new Map(providers.map(p => [p.id, p]));
    },
    { maxBatchSize: 50 }
  ),

  invoice: createDataLoader<number, unknown>(
    async (ids) => {
      const invoices = await prisma.invoice.findMany({
        where: { id: { in: ids } },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true } },
          payments: { select: { id: true, amount: true, status: true } },
        },
      });
      return new Map(invoices.map(i => [i.id, i]));
    },
    { maxBatchSize: 30 }
  ),

  order: createDataLoader<number, unknown>(
    async (ids) => {
      const orders = await prisma.order.findMany({
        where: { id: { in: ids } },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true } },
        },
      });
      return new Map(orders.map(o => [o.id, o]));
    },
    { maxBatchSize: 30 }
  ),

  appointment: createDataLoader<number, unknown>(
    async (ids) => {
      const appointments = await prisma.appointment.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          startTime: true,
          endTime: true,
          status: true,
          patientId: true,
          providerId: true,
          patient: { select: { id: true, firstName: true, lastName: true } },
          provider: { select: { id: true, firstName: true, lastName: true } },
        },
      });
      return new Map(appointments.map(a => [a.id, a]));
    },
    { maxBatchSize: 50 }
  ),
});

// =============================================================================
// DATA PRELOADER CLASS
// =============================================================================

class DataPreloader {
  private loaders: ReturnType<typeof createEntityLoaders> | null = null;
  private requestCache = new Map<string, Promise<unknown>>();
  private accessPatterns = new Map<string, number>();

  /**
   * Initialize loaders (lazy initialization)
   */
  private getLoaders() {
    if (!this.loaders) {
      this.loaders = createEntityLoaders(basePrisma as unknown as PrismaClient);
    }
    return this.loaders;
  }

  /**
   * Preload multiple entities in parallel
   */
  async preload(configs: PreloadConfig[]): Promise<PreloadResult[]> {
    const startTime = Date.now();
    const results: PreloadResult[] = [];

    // Group by entity type for batch loading
    const grouped = new Map<EntityType, number[]>();
    for (const config of configs) {
      const existing = grouped.get(config.entity) || [];
      grouped.set(config.entity, [...existing, ...config.ids]);
    }

    // Load in parallel
    const promises = Array.from(grouped.entries()).map(async ([entity, ids]) => {
      const uniqueIds = [...new Set(ids)];
      const result = await this.preloadEntity(entity, uniqueIds);
      results.push(result);
    });

    await Promise.all(promises);

    const totalDuration = Date.now() - startTime;
    logger.debug('[DataPreloader] Preload complete', {
      entities: configs.length,
      totalDuration,
    });

    return results;
  }

  /**
   * Preload a single entity type
   */
  async preloadEntity(
    entity: EntityType,
    ids: number[]
  ): Promise<PreloadResult> {
    const startTime = Date.now();
    const loaders = this.getLoaders();
    const loader = loaders[entity as keyof typeof loaders];

    if (!loader) {
      logger.warn(`[DataPreloader] Unknown entity type: ${entity}`);
      return { loaded: 0, cached: 0, duration: 0 };
    }

    // Track access pattern
    this.trackAccessPattern(entity, ids.length);

    try {
      const results = await loader.loadMany(ids);
      const loaded = results.filter((r: unknown) => !(r instanceof Error)).length;
      
      return {
        loaded,
        cached: ids.length - loaded, // Assume rest were cached
        duration: Date.now() - startTime,
      };
    } catch (error) {
      logger.error(`[DataPreloader] Failed to preload ${entity}`, { error });
      return { loaded: 0, cached: 0, duration: Date.now() - startTime };
    }
  }

  /**
   * Preload patient with common relations (dashboard view)
   */
  async preloadPatientDashboard(patientId: number): Promise<PatientPreloadData | null> {
    const cacheKey = `patient:dashboard:${patientId}`;
    
    return queryOptimizer.query(
      async () => {
        const patient = await basePrisma.patient.findUnique({
          where: { id: patientId },
          include: {
            orders: {
              select: { id: true, status: true, createdAt: true },
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
            invoices: {
              select: { id: true, status: true, amount: true, createdAt: true },
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
            appointments: {
              select: { id: true, startTime: true, status: true },
              where: { startTime: { gte: new Date() } },
              orderBy: { startTime: 'asc' },
              take: 5,
            },
          },
        });

        return patient as PatientPreloadData | null;
      },
      {
        cacheKey,
        cache: {
          ttl: 60, // 1 minute
          prefix: 'patient',
          useL1Cache: true,
          l1Ttl: 15,
        },
      }
    );
  }

  /**
   * Preload clinic dashboard data
   */
  async preloadClinicDashboard(clinicId: number): Promise<{
    patientCount: number;
    todayAppointments: number;
    pendingOrders: number;
    outstandingBalance: number;
  }> {
    const cacheKey = `clinic:dashboard:${clinicId}`;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return queryOptimizer.query(
      async () => {
        const [patientCount, todayAppointments, pendingOrders, outstandingInvoices] = 
          await Promise.all([
            basePrisma.patient.count({ where: { clinicId } }),
            basePrisma.appointment.count({
              where: {
                clinicId,
                startTime: { gte: today, lt: tomorrow },
              },
            }),
            basePrisma.order.count({
              where: { clinicId, status: 'PENDING' },
            }),
            basePrisma.invoice.aggregate({
              where: { clinicId, status: 'OPEN' },
              _sum: { amountDue: true },
            }),
          ]);

        return {
          patientCount,
          todayAppointments,
          pendingOrders,
          outstandingBalance: outstandingInvoices._sum?.amountDue || 0,
        };
      },
      {
        cacheKey,
        cache: {
          ttl: 300, // 5 minutes
          prefix: 'clinic',
          useL1Cache: true,
          l1Ttl: 60,
        },
      }
    );
  }

  /**
   * Preload provider schedule data
   */
  async preloadProviderSchedule(
    providerId: number,
    startDate: Date,
    endDate: Date
  ): Promise<unknown[]> {
    const cacheKey = `provider:schedule:${providerId}:${startDate.toISOString().split('T')[0]}`;

    return queryOptimizer.query(
      async () => {
        const appointments = await basePrisma.appointment.findMany({
          where: {
            providerId,
            startTime: { gte: startDate, lte: endDate },
          },
          include: {
            patient: {
              select: { id: true, firstName: true, lastName: true, phone: true },
            },
          },
          orderBy: { startTime: 'asc' },
        });

        return appointments;
      },
      {
        cacheKey,
        cache: {
          ttl: 120, // 2 minutes
          prefix: 'provider',
          useL1Cache: true,
          l1Ttl: 30,
        },
      }
    );
  }

  /**
   * Warm cache for expected traffic (call on app startup or schedule)
   */
  async warmCache(clinicIds: number[]): Promise<void> {
    logger.info('[DataPreloader] Warming cache', { clinicCount: clinicIds.length });
    const startTime = Date.now();

    const promises = clinicIds.map(async (clinicId) => {
      try {
        await this.preloadClinicDashboard(clinicId);
      } catch (error) {
        logger.warn(`[DataPreloader] Failed to warm cache for clinic ${clinicId}`, { error });
      }
    });

    await Promise.all(promises);

    logger.info('[DataPreloader] Cache warming complete', {
      duration: Date.now() - startTime,
      clinics: clinicIds.length,
    });
  }

  /**
   * Track access patterns for predictive loading
   */
  private trackAccessPattern(entity: EntityType, count: number): void {
    const key = entity;
    const current = this.accessPatterns.get(key) || 0;
    this.accessPatterns.set(key, current + count);
  }

  /**
   * Get access pattern analytics
   */
  getAccessPatterns(): Record<string, number> {
    return Object.fromEntries(this.accessPatterns);
  }

  /**
   * Clear request-scoped cache (call at end of request)
   */
  clearRequestCache(): void {
    this.requestCache.clear();
  }

  /**
   * Clear all loaders (for testing)
   */
  clearLoaders(): void {
    if (this.loaders) {
      Object.values(this.loaders).forEach(loader => loader.clearAll());
    }
  }
}

// =============================================================================
// REQUEST-SCOPED PRELOADER FACTORY
// =============================================================================

/**
 * Create a request-scoped preloader
 * Use this to ensure data loaders are isolated per request
 */
export function createRequestPreloader(): DataPreloader {
  return new DataPreloader();
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const dataPreloader = new DataPreloader();
export type { PreloadConfig, PreloadResult, PatientPreloadData, EntityType };
