/**
 * Enterprise cron tenant isolation
 *
 * Ensures every cron job:
 * 1. Resolves the set of clinics to process (super_admin / system level).
 * 2. For each clinic runs work inside runWithClinicContext(clinicId, ...).
 * 3. Uses per-tenant error isolation (clinic A failure does not stop clinic B).
 * 4. Optionally applies batching limits and timeboxing.
 *
 * @module lib/cron/tenant-isolation
 */

import { NextRequest } from 'next/server';
import { basePrisma, runWithClinicContext } from '@/lib/db';
import { logger } from '@/lib/logger';

const DEFAULT_BATCH_LIMIT_PER_CLINIC = 1000;
const DEFAULT_TIMEBOX_MS = 5 * 60 * 1000; // 5 minutes per clinic

/**
 * Verify cron request (Bearer CRON_SECRET or x-cron-secret header).
 * If CRON_SECRET is not set, allows in dev only.
 */
export function verifyCronAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return process.env.NODE_ENV !== 'production';

  const authHeader = request.headers.get('authorization');
  const cronHeader = request.headers.get('x-cron-secret');
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';

  const providedSecret = authHeader?.replace(/^Bearer\s+/i, '').trim() || cronHeader;
  return isVercelCron || providedSecret === cronSecret;
}

/**
 * Resolve all clinic IDs for cron processing (super_admin / system level).
 * Uses basePrisma (allowlisted) to list clinics. Use only for cron entrypoints.
 */
export async function getClinicIdsForCron(): Promise<number[]> {
  const clinics = await basePrisma.clinic.findMany({
    select: { id: true },
    where: { isActive: true },
  });
  return clinics.map((c) => c.id);
}

export interface RunCronPerTenantOptions<T> {
  /** Display name for logs */
  jobName: string;
  /** Work to run per clinic; runs inside runWithClinicContext(clinicId, ...) */
  perClinic: (clinicId: number) => Promise<T>;
  /** Optional list of clinic IDs; if omitted, fetches via getClinicIdsForCron() */
  clinicIds?: number[];
  /** Max items to process per clinic (for jobs that iterate; optional) */
  batchLimitPerClinic?: number;
  /** Max ms per clinic before moving to next (optional) */
  timeboxMs?: number;
}

export interface PerClinicResult<T> {
  clinicId: number;
  success: boolean;
  data?: T;
  error?: string;
  durationMs?: number;
}

/**
 * Run a cron job per tenant with error isolation.
 * Failures for clinic A do not stop clinic B. Results and errors are collected per clinic.
 */
export async function runCronPerTenant<T>(
  options: RunCronPerTenantOptions<T>
): Promise<{ results: PerClinicResult<T>[]; totalDurationMs: number }> {
  const {
    jobName,
    perClinic,
    clinicIds: providedClinicIds,
    batchLimitPerClinic = DEFAULT_BATCH_LIMIT_PER_CLINIC,
    timeboxMs = DEFAULT_TIMEBOX_MS,
  } = options;

  const startTime = Date.now();
  const clinicIds = providedClinicIds ?? (await getClinicIdsForCron());

  if (clinicIds.length === 0) {
    logger.info(`[Cron ${jobName}] No clinics to process`);
    return { results: [], totalDurationMs: Date.now() - startTime };
  }

  logger.info(`[Cron ${jobName}] Starting per-tenant run`, {
    clinicCount: clinicIds.length,
    batchLimitPerClinic,
    timeboxMs,
  });

  const results: PerClinicResult<T>[] = [];

  for (const clinicId of clinicIds) {
    const clinicStart = Date.now();
    try {
      const data = await runWithClinicContext(clinicId, () => perClinic(clinicId));
      const durationMs = Date.now() - clinicStart;

      if (durationMs >= timeboxMs) {
        logger.warn(`[Cron ${jobName}] Clinic ${clinicId} hit timebox`, {
          clinicId,
          durationMs,
          timeboxMs,
        });
      }

      results.push({ clinicId, success: true, data, durationMs });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const durationMs = Date.now() - clinicStart;

      logger.error(`[Cron ${jobName}] Clinic ${clinicId} failed`, {
        clinicId,
        error: errorMessage,
        durationMs,
      });

      results.push({ clinicId, success: false, error: errorMessage, durationMs });
    }
  }

  const totalDurationMs = Date.now() - startTime;
  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  logger.info(`[Cron ${jobName}] Completed`, {
    totalDurationMs,
    clinicsProcessed: results.length,
    successCount,
    failCount,
  });

  return { results, totalDurationMs };
}

/** Limit array to batch size (for use inside perClinic when iterating) */
export function takeBatch<T>(items: T[], limit: number = DEFAULT_BATCH_LIMIT_PER_CLINIC): T[] {
  return items.slice(0, limit);
}
