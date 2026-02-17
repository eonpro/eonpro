/**
 * CIRCUIT BREAKER — TRIP SIGNAL DETECTION
 * ========================================
 *
 * Centralised classification of database errors into trip signals.
 * Determines whether an error should trip the circuit breaker and
 * whether retries should be suppressed for that error class.
 *
 * @module database/circuit-breaker/tripSignals
 */

// =============================================================================
// TYPES
// =============================================================================

export type TripReason =
  | 'P2024_POOL_TIMEOUT'
  | 'TOO_MANY_CONNECTIONS'
  | 'QUERY_TIMEOUT'
  | 'CONNECTION_REFUSED'
  | 'CONNECTION_RESET'
  | 'DB_TIME_BUDGET_EXCEEDED'
  | 'ACQUISITION_DELAY';

export interface TripSignal {
  /** Whether this error should count toward tripping the breaker */
  isTrip: boolean;
  /** The classified reason (undefined when isTrip is false) */
  reason?: TripReason;
  /** Whether retries should be suppressed for this error */
  suppressRetry: boolean;
}

// =============================================================================
// DETECTION PATTERNS
// =============================================================================

interface PatternEntry {
  test: (message: string, code?: string) => boolean;
  reason: TripReason;
  suppressRetry: boolean;
}

const PATTERNS: PatternEntry[] = [
  {
    test: (_msg, code) => code === 'P2024',
    reason: 'P2024_POOL_TIMEOUT',
    suppressRetry: true,
  },
  {
    test: (msg) => msg.includes('timed out fetching a new connection from the connection pool'),
    reason: 'P2024_POOL_TIMEOUT',
    suppressRetry: true,
  },
  {
    test: (msg) => msg.includes('too many connections') || msg.includes('too many clients'),
    reason: 'TOO_MANY_CONNECTIONS',
    suppressRetry: true,
  },
  {
    test: (msg) =>
      msg.includes('query timeout') ||
      msg.includes('statement timeout') ||
      msg.includes('canceling statement due to statement timeout'),
    reason: 'QUERY_TIMEOUT',
    suppressRetry: false,
  },
  {
    test: (msg) => msg.includes('econnrefused') || msg.includes('connection refused'),
    reason: 'CONNECTION_REFUSED',
    suppressRetry: true,
  },
  {
    test: (msg) => msg.includes('econnreset') || msg.includes('connection reset'),
    reason: 'CONNECTION_RESET',
    suppressRetry: false,
  },
];

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Classify an error to determine if it should trip the circuit breaker.
 *
 * Prisma errors carry a `.code` property (e.g. "P2024").
 * Generic errors are matched via lowercased `.message`.
 */
export function classifyError(error: unknown): TripSignal {
  if (!(error instanceof Error)) {
    return { isTrip: false, suppressRetry: false };
  }

  const message = error.message.toLowerCase();
  const code: string | undefined = (error as any).code;

  for (const pattern of PATTERNS) {
    if (pattern.test(message, code)) {
      return {
        isTrip: true,
        reason: pattern.reason,
        suppressRetry: pattern.suppressRetry,
      };
    }
  }

  return { isTrip: false, suppressRetry: false };
}

/**
 * Check if cumulative DB time in the current request has exceeded budget.
 * Used by the Prisma middleware to trip the breaker proactively.
 */
export function checkTimeBudget(
  cumulativeMs: number,
  thresholdMs: number = 5000
): TripSignal {
  if (cumulativeMs >= thresholdMs) {
    return {
      isTrip: true,
      reason: 'DB_TIME_BUDGET_EXCEEDED',
      suppressRetry: true,
    };
  }
  return { isTrip: false, suppressRetry: false };
}

/**
 * Check if connection acquisition took too long (pre-emptive trip signal).
 */
export function checkAcquisitionDelay(
  acquireMs: number,
  thresholdMs: number = 10000
): TripSignal {
  if (acquireMs >= thresholdMs) {
    return {
      isTrip: true,
      reason: 'ACQUISITION_DELAY',
      suppressRetry: true,
    };
  }
  return { isTrip: false, suppressRetry: false };
}
