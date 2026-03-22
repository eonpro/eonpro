/**
 * Clinic Context Management
 * =========================
 *
 * Provides request-scoped clinic context using AsyncLocalStorage.
 * This is the thread-safe mechanism for multi-tenant isolation in
 * serverless environments where global state would cause race conditions.
 *
 * Extracted from db.ts to isolate context management from data access.
 *
 * @module lib/db/clinic-context
 */

import { AsyncLocalStorage } from 'node:async_hooks';

interface ClinicContextStore {
  clinicId?: number;
  /** When true, clinic-isolated queries are allowed without a clinicId (super-admin / cross-tenant operations). */
  bypassFilter?: boolean;
}

export const clinicContextStorage = new AsyncLocalStorage<ClinicContextStore>();

/**
 * DEPRECATED global fallback for clinic context.
 * Maintained for backwards compatibility with code that hasn't migrated to AsyncLocalStorage.
 * Will be removed in a future release.
 */
const globalForClinicContext = global as unknown as {
  currentClinicId?: number;
};

/**
 * Get the current clinic context.
 * Reads from AsyncLocalStorage first (thread-safe), falls back to deprecated global.
 */
export function getClinicContext(): number | undefined {
  const store = clinicContextStorage.getStore();
  if (store !== undefined) {
    return store.clinicId;
  }
  return globalForClinicContext.currentClinicId;
}

/**
 * @deprecated Use runWithClinicContext instead. This global setter is a race condition
 * vector in serverless environments where concurrent requests share warm containers.
 * All production callers have been migrated to AsyncLocalStorage via runWithClinicContext.
 * Kept only for backwards compatibility — will be removed in a future release.
 */
export function setClinicContext(clinicId: number | undefined): void {
  globalForClinicContext.currentClinicId = clinicId;
}

/**
 * Run a function within a clinic context (thread-safe).
 * This is the preferred method for setting clinic context in serverless environments.
 *
 * @param clinicId - The clinic ID to use for all queries within the callback
 * @param callback - The function to execute within the clinic context
 * @returns The result of the callback
 */
export function runWithClinicContext<T>(clinicId: number | undefined, callback: () => T): T {
  return clinicContextStorage.run({ clinicId }, callback);
}

/**
 * Execute async queries with a specific clinic context (thread-safe).
 * Useful for admin operations that need to access specific clinic data.
 */
export async function withClinicContext<T>(
  clinicId: number,
  callback: () => Promise<T>
): Promise<T> {
  return clinicContextStorage.run({ clinicId }, callback);
}

/**
 * Execute queries without clinic filtering (thread-safe).
 * DANGEROUS: Only use for super admin operations.
 *
 * Sets an explicit bypassFilter flag so the tenant enforcement layer
 * allows clinic-isolated queries without a clinicId.
 */
export async function withoutClinicFilter<T>(callback: () => Promise<T>): Promise<T> {
  return clinicContextStorage.run({ clinicId: undefined, bypassFilter: true }, callback);
}
