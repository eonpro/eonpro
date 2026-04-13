/**
 * Next.js Instrumentation
 * Runs once when the Node.js server starts (not during build or in Edge).
 * Use for startup validation and one-time setup.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

import { logger } from '@/lib/logger';

export async function register(): Promise<void> {
  // Only run server-side in Node (not Edge, not during build)
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  if (process.env.NODE_ENV === 'production') {
    try {
      const { runStartupValidation } = await import('@/lib/database/schema-validator');
      await runStartupValidation();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const fullStr = String(err);
      const combined = `${message} ${fullStr}`;
      logger.error('[instrumentation] Startup validation failed', err, { message });

      const transientPatterns = [
        'connection pool',
        'Timed out fetching',
        "Can't reach database server",
        'Can\u2019t reach database server',
        'Connection refused',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'P1001',
        'P1002',
        'Database connection/query failed',
      ];

      const isTransient = transientPatterns.some((p) => combined.includes(p));

      if (isTransient) {
        logger.warn('[instrumentation] Allowing startup despite transient DB error — schema will be validated on first request');
      } else {
        throw err;
      }
    }
  }
}
