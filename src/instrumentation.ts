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

  // Production: run database schema validation at startup so bad state is caught before serving traffic
  if (process.env.NODE_ENV === 'production') {
    try {
      const { runStartupValidation } = await import('@/lib/database/schema-validator');
      await runStartupValidation();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[instrumentation] Startup validation failed', err, { message });
      throw err; // Fail fast in production
    }
  }
}
