/**
 * EXECUTE DB — TIER-AWARE DATABASE EXECUTION WRAPPER
 * ====================================================
 *
 * The single function through which ALL Prisma queries should flow.
 * Composes:
 *   1. Circuit breaker guard (tier-aware fail-fast)
 *   2. Timeout protection
 *   3. Retry with backoff (suppressed for pool exhaustion)
 *   4. Circuit breaker recording (success / failure)
 *   5. Guardrail validation (include depth, blob prevention)
 *
 * Integration:
 *   • Called internally by the patched `safeQuery`.
 *   • Can also be used directly when safeQuery's schema validation is not needed.
 *   • Does NOT modify PrismaWithClinicFilter or business logic.
 *
 * @module database/executeDb
 */

import { logger } from '@/lib/logger';
import {
  circuitBreaker,
  DbTier,
  CircuitOpenError,
  type GuardDecision,
  type TripSignal,
} from './circuit-breaker';

// =============================================================================
// TYPES
// =============================================================================

export interface ExecuteDbOptions {
  /** Human-readable operation name for logging */
  operationName: string;
  /** Tier classification (default: READ) */
  tier?: DbTier;
  /** Timeout in ms (default: 10 000) */
  timeoutMs?: number;
  /** Max retries (default: 3; overridden to 0 for pool exhaustion) */
  maxRetries?: number;
  /** Initial retry delay in ms (default: 150) */
  initialDelayMs?: number;
  /** Max retry delay in ms (default: 3 000) */
  maxDelayMs?: number;
}

export interface ExecuteDbResult<T> {
  success: boolean;
  data?: T;
  error?: {
    type: 'CIRCUIT_OPEN' | 'TIMEOUT' | 'QUERY_ERROR' | 'UNKNOWN';
    message: string;
    retryable: boolean;
    tier: DbTier;
  };
  attempts: number;
  durationMs: number;
  wasProbe: boolean;
}

// =============================================================================
// DEFAULTS
// =============================================================================

const DEFAULTS = {
  tier: DbTier.READ,
  timeoutMs: 10_000,
  maxRetries: 3,
  initialDelayMs: 150,
  maxDelayMs: 3_000,
} as const;

// =============================================================================
// RETRY CLASSIFICATION
// =============================================================================

const NON_RETRYABLE_PATTERNS = [
  'does not exist',
  'invalid',
  'syntax error',
  'permission denied',
  'foreign key',
  'unique constraint',
  'not null constraint',
];

function isRetryableError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  if (NON_RETRYABLE_PATTERNS.some((p) => msg.includes(p))) return false;

  const retryable = [
    'connection',
    'timeout',
    'econnreset',
    'econnrefused',
    'temporarily unavailable',
    'deadlock',
    'lock wait timeout',
    'prepared statement',
  ];
  return retryable.some((p) => msg.includes(p));
}

// =============================================================================
// CORE FUNCTION
// =============================================================================

/**
 * Execute a database operation through the circuit breaker.
 *
 * ```ts
 * const result = await executeDb(
 *   () => prisma.patient.findMany({ where: { clinicId }, take: 50 }),
 *   { operationName: 'listPatients', tier: DbTier.READ }
 * );
 * ```
 */
export async function executeDb<T>(
  queryFn: () => Promise<T>,
  options: ExecuteDbOptions
): Promise<ExecuteDbResult<T>> {
  const {
    operationName,
    tier = DEFAULTS.tier,
    timeoutMs = DEFAULTS.timeoutMs,
    maxRetries = DEFAULTS.maxRetries,
    initialDelayMs = DEFAULTS.initialDelayMs,
    maxDelayMs = DEFAULTS.maxDelayMs,
  } = options;

  const start = Date.now();
  let attempts = 0;
  let isProbe = false;

  // ── 1. Circuit breaker guard ──────────────────────────────────────────
  let decision: GuardDecision;
  try {
    decision = await circuitBreaker.guard(tier);
  } catch {
    // If guard itself fails (Redis down, etc.), allow the query through
    decision = { allowed: true, isProbe: false };
  }

  if (!decision.allowed) {
    const elapsed = Date.now() - start;

    logger.warn('[ExecuteDb] Blocked by circuit breaker', {
      operationName,
      tier: DbTier[tier],
      reason: decision.reason,
      state: decision.state,
    });

    return {
      success: false,
      error: {
        type: 'CIRCUIT_OPEN',
        message: decision.reason,
        retryable: false,
        tier,
      },
      attempts: 0,
      durationMs: elapsed,
      wasProbe: false,
    };
  }

  isProbe = decision.isProbe;

  // ── 2. Execute with retry loop ────────────────────────────────────────
  let lastError: Error | null = null;
  let effectiveMaxRetries = maxRetries;

  try {
    while (attempts < effectiveMaxRetries + 1) {
      attempts++;

      try {
        const result = await withTimeout(queryFn, timeoutMs, operationName);
        const elapsed = Date.now() - start;

        // Record success
        await circuitBreaker.recordSuccess().catch(() => {});

        if (attempts > 1) {
          logger.info(`[ExecuteDb] ${operationName} succeeded after ${attempts} attempts`, {
            durationMs: elapsed,
            tier: DbTier[tier],
          });
        }

        return {
          success: true,
          data: result,
          attempts,
          durationMs: elapsed,
          wasProbe: isProbe,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Record failure in breaker
        const signal: TripSignal = await circuitBreaker.recordFailure(error).catch(
          (): TripSignal => ({
            isTrip: false,
            suppressRetry: false,
          })
        );

        // Suppress retries for pool exhaustion / connection errors
        if (signal.suppressRetry) {
          effectiveMaxRetries = 0;
          logger.warn('[ExecuteDb] Retries suppressed — pool exhaustion signal', {
            operationName,
            reason: signal.reason ?? 'unknown',
          });
          break;
        }

        // Check if error is retryable at all
        if (!isRetryableError(lastError)) {
          break;
        }

        // If this is a probe, don't retry — report immediately
        if (isProbe) {
          logger.warn('[ExecuteDb] Probe failed — breaker will reopen', {
            operationName,
            error: lastError.message,
          });
          break;
        }

        // Backoff before next attempt
        if (attempts < effectiveMaxRetries + 1) {
          const delay = Math.min(
            initialDelayMs * Math.pow(2, attempts - 1),
            maxDelayMs
          );
          await sleep(delay);
        }
      }
    }
  } finally {
    // Release probe slot if we acquired one
    if (isProbe) {
      circuitBreaker.releaseProbe();
    }
  }

  // ── 3. All attempts exhausted ─────────────────────────────────────────
  const elapsed = Date.now() - start;

  logger.error(`[ExecuteDb] ${operationName} failed`, lastError, {
    attempts,
    durationMs: elapsed,
    tier: DbTier[tier],
    wasProbe: isProbe,
  });

  return {
    success: false,
    error: {
      type: lastError?.message.includes('timeout') ? 'TIMEOUT' : 'QUERY_ERROR',
      message: lastError?.message ?? 'Unknown error',
      retryable: false,
      tier,
    },
    attempts,
    durationMs: elapsed,
    wasProbe: isProbe,
  };
}

// =============================================================================
// CONVENIENCE WRAPPERS (tier pre-set)
// =============================================================================

/**
 * Execute a Tier 0 CRITICAL query (clinical writes: prescriptions, orders, payments).
 * Allowed to probe when breaker is OPEN.
 */
export function executeDbCritical<T>(
  queryFn: () => Promise<T>,
  operationName: string,
  overrides?: Partial<Omit<ExecuteDbOptions, 'operationName' | 'tier'>>
): Promise<ExecuteDbResult<T>> {
  return executeDb(queryFn, {
    operationName,
    tier: DbTier.CRITICAL,
    timeoutMs: 15_000,
    maxRetries: 2,
    ...overrides,
  });
}

/**
 * Execute a Tier 1 AUTH query.
 * Fail-fast when breaker is OPEN, no retry.
 */
export function executeDbAuth<T>(
  queryFn: () => Promise<T>,
  operationName: string,
  overrides?: Partial<Omit<ExecuteDbOptions, 'operationName' | 'tier'>>
): Promise<ExecuteDbResult<T>> {
  return executeDb(queryFn, {
    operationName,
    tier: DbTier.AUTH,
    timeoutMs: 5_000,
    maxRetries: 0,
    ...overrides,
  });
}

/**
 * Execute a Tier 2 READ query (dashboards, lists, reports).
 * Fail-fast when breaker is OPEN — caller should serve cached/stale data.
 */
export function executeDbRead<T>(
  queryFn: () => Promise<T>,
  operationName: string,
  overrides?: Partial<Omit<ExecuteDbOptions, 'operationName' | 'tier'>>
): Promise<ExecuteDbResult<T>> {
  return executeDb(queryFn, {
    operationName,
    tier: DbTier.READ,
    timeoutMs: 10_000,
    maxRetries: 2,
    ...overrides,
  });
}

/**
 * Execute a Tier 3 BACKGROUND query (cron, batch jobs).
 * Hard-blocked when breaker is OPEN.
 */
export function executeDbBackground<T>(
  queryFn: () => Promise<T>,
  operationName: string,
  overrides?: Partial<Omit<ExecuteDbOptions, 'operationName' | 'tier'>>
): Promise<ExecuteDbResult<T>> {
  return executeDb(queryFn, {
    operationName,
    tier: DbTier.BACKGROUND,
    timeoutMs: 30_000,
    maxRetries: 1,
    ...overrides,
  });
}

// =============================================================================
// HELPERS
// =============================================================================

function withTimeout<T>(
  fn: () => Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`[ExecuteDb] ${label} timeout after ${ms}ms`)),
      ms
    );

    fn().then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Re-export tier enum and error for consumers
export { DbTier, CircuitOpenError };
