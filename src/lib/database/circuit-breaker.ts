/**
 * Database Circuit Breaker — Tier-Aware Fail-Fast Protection
 *
 * Prevents cascading database failures by tracking error rates and
 * short-circuiting requests when the database is unhealthy.
 *
 * Tiers (lowest number = highest priority):
 *   0 CRITICAL — clinical writes (orders, Rx, payments) — allowed to probe
 *   1 AUTH     — login/token refresh — fail-fast when open
 *   2 READ     — dashboards, lists — fail-fast when open
 *   3 BACKGROUND — cron, batch — hard-blocked when open
 *
 * @module database/circuit-breaker
 */

import { logger } from '@/lib/logger';

// =============================================================================
// ENUMS & TYPES
// =============================================================================

export enum DbTier {
  CRITICAL = 0,
  AUTH = 1,
  READ = 2,
  BACKGROUND = 3,
}

export type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export type TripReason = 'failure_threshold' | 'pool_exhaustion' | 'timeout_surge';

export interface GuardDecision {
  allowed: boolean;
  isProbe: boolean;
  reason?: string;
  state?: string;
}

export interface TripSignal {
  isTrip: boolean;
  suppressRetry: boolean;
  reason?: string;
}

export class CircuitOpenError extends Error {
  constructor(
    message: string,
    public readonly tier: DbTier,
    public readonly state: BreakerState,
  ) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
  failureThreshold: 5,
  cooldownMs: 30_000,
  halfOpenMaxProbes: 1,
  poolExhaustionPatterns: [
    'connection pool',
    'too many connections',
    'pool timeout',
    'prepared statement',
    'econnrefused',
  ],
} as const;

// =============================================================================
// IMPLEMENTATION
// =============================================================================

class DatabaseCircuitBreaker {
  private state: BreakerState = 'CLOSED';
  private failures = 0;
  private lastFailureAt = 0;
  private openedAt = 0;
  private activeProbes = 0;
  private tripReason: TripReason | null = null;

  async guard(tier: DbTier): Promise<GuardDecision> {
    if (this.state === 'CLOSED') {
      return { allowed: true, isProbe: false };
    }

    if (this.state === 'OPEN') {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed >= CONFIG.cooldownMs) {
        this.state = 'HALF_OPEN';
        logger.info('[CircuitBreaker] Transitioning to HALF_OPEN', {
          cooldownMs: CONFIG.cooldownMs,
          failures: this.failures,
        });
      }
    }

    if (this.state === 'OPEN') {
      if (tier === DbTier.CRITICAL && this.activeProbes < CONFIG.halfOpenMaxProbes) {
        this.activeProbes++;
        return { allowed: true, isProbe: true, state: 'OPEN' };
      }

      return {
        allowed: false,
        isProbe: false,
        reason: `Circuit OPEN (${this.tripReason || 'failures'}): ${this.failures} failures`,
        state: 'OPEN',
      };
    }

    // HALF_OPEN — allow one probe at a time
    if (this.activeProbes < CONFIG.halfOpenMaxProbes) {
      this.activeProbes++;
      return { allowed: true, isProbe: true, state: 'HALF_OPEN' };
    }

    if (tier <= DbTier.AUTH) {
      return { allowed: true, isProbe: false, state: 'HALF_OPEN' };
    }

    return {
      allowed: false,
      isProbe: false,
      reason: `Circuit HALF_OPEN — probe in progress`,
      state: 'HALF_OPEN',
    };
  }

  async recordSuccess(): Promise<void> {
    if (this.state !== 'CLOSED') {
      logger.info('[CircuitBreaker] Closing circuit after successful request', {
        previousState: this.state,
        failureCount: this.failures,
      });
    }
    this.state = 'CLOSED';
    this.failures = 0;
    this.activeProbes = 0;
    this.tripReason = null;
  }

  async recordFailure(error: unknown): Promise<TripSignal> {
    this.failures++;
    this.lastFailureAt = Date.now();

    const errorMsg = error instanceof Error ? error.message.toLowerCase() : '';
    const isPoolExhaustion = CONFIG.poolExhaustionPatterns.some((p) => errorMsg.includes(p));

    if (isPoolExhaustion) {
      this.trip('pool_exhaustion');
      return { isTrip: true, suppressRetry: true, reason: 'pool_exhaustion' };
    }

    if (this.failures >= CONFIG.failureThreshold) {
      this.trip('failure_threshold');
      return { isTrip: true, suppressRetry: false, reason: 'failure_threshold' };
    }

    return { isTrip: false, suppressRetry: false };
  }

  releaseProbe(): void {
    this.activeProbes = Math.max(0, this.activeProbes - 1);
  }

  getState(): { state: BreakerState; failures: number; tripReason: TripReason | null } {
    return { state: this.state, failures: this.failures, tripReason: this.tripReason };
  }

  private trip(reason: TripReason): void {
    if (this.state === 'CLOSED') {
      logger.warn('[CircuitBreaker] Opening circuit', {
        reason,
        failures: this.failures,
      });
    }
    this.state = 'OPEN';
    this.openedAt = Date.now();
    this.tripReason = reason;
    this.activeProbes = 0;
  }
}

// Singleton — shared across all routes in this process
export const circuitBreaker = new DatabaseCircuitBreaker();
