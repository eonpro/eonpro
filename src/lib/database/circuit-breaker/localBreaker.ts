/**
 * LOCAL (IN-MEMORY) CIRCUIT BREAKER
 * ==================================
 *
 * Per-serverless-instance breaker that tracks failure counts in memory.
 * Cheap and zero-latency — no external I/O.
 *
 * States:
 *   CLOSED   → normal operation; failures counted.
 *   OPEN     → all requests fail-fast (except Tier 0 probes).
 *   HALF_OPEN → limited probe requests allowed; success → CLOSED, failure → OPEN.
 *
 * Configuration is tuned for `connection_limit = 1` on Vercel serverless:
 *   - Low failure threshold (3 failures within the window trip the breaker)
 *   - Short open duration (12 s) to recover quickly
 *   - Small probe cap (2 concurrent probes in HALF_OPEN)
 *
 * @module database/circuit-breaker/localBreaker
 */

import { logger } from '@/lib/logger';
import type { TripReason } from './tripSignals';

// =============================================================================
// TYPES
// =============================================================================

export type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface LocalBreakerConfig {
  /** Failures within `windowMs` to trip the breaker */
  failureThreshold: number;
  /** Rolling window for failure counting (ms) */
  windowMs: number;
  /** How long the breaker stays OPEN before transitioning to HALF_OPEN (ms) */
  openDurationMs: number;
  /** Max concurrent probe requests in HALF_OPEN */
  halfOpenProbeLimit: number;
}

export interface LocalBreakerSnapshot {
  state: BreakerState;
  failureCount: number;
  lastTripReason: TripReason | null;
  lastTripAt: number | null;
  probesInFlight: number;
}

// =============================================================================
// DEFAULTS
// =============================================================================

const DEFAULT_CONFIG: LocalBreakerConfig = {
  failureThreshold: 3,
  windowMs: 30_000,
  openDurationMs: 12_000,
  halfOpenProbeLimit: 2,
};

// =============================================================================
// LOCAL BREAKER
// =============================================================================

export class LocalBreaker {
  private state: BreakerState = 'CLOSED';
  private failures: number[] = [];
  private openedAt: number | null = null;
  private probesInFlight = 0;
  private lastTripReason: TripReason | null = null;
  private readonly config: LocalBreakerConfig;

  constructor(config?: Partial<LocalBreakerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ---------------------------------------------------------------------------
  // READ
  // ---------------------------------------------------------------------------

  getState(): BreakerState {
    this.maybeTransition();
    return this.state;
  }

  getSnapshot(): LocalBreakerSnapshot {
    this.maybeTransition();
    return {
      state: this.state,
      failureCount: this.failures.length,
      lastTripReason: this.lastTripReason,
      lastTripAt: this.openedAt,
      probesInFlight: this.probesInFlight,
    };
  }

  // ---------------------------------------------------------------------------
  // WRITE
  // ---------------------------------------------------------------------------

  /**
   * Record a trip-worthy failure. May transition CLOSED → OPEN.
   */
  recordFailure(reason: TripReason): void {
    const now = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.trip(reason, now);
      return;
    }

    if (this.state === 'OPEN') {
      return;
    }

    // CLOSED: add failure and prune window
    this.failures.push(now);
    this.pruneWindow(now);

    if (this.failures.length >= this.config.failureThreshold) {
      this.trip(reason, now);
    }
  }

  /**
   * Record a successful query execution.
   * In HALF_OPEN this transitions back to CLOSED.
   */
  recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.close();
    }
    // In CLOSED state, success is a no-op (we only track failures).
  }

  /**
   * Acquire a probe slot in HALF_OPEN. Returns true if granted.
   */
  acquireProbe(): boolean {
    this.maybeTransition();

    if (this.state !== 'HALF_OPEN') {
      return false;
    }

    if (this.probesInFlight >= this.config.halfOpenProbeLimit) {
      return false;
    }

    this.probesInFlight++;
    return true;
  }

  /**
   * Release a probe slot (call in finally-block after probe completes).
   */
  releaseProbe(): void {
    if (this.probesInFlight > 0) {
      this.probesInFlight--;
    }
  }

  /**
   * Force the breaker OPEN (e.g. global breaker signalled).
   */
  forceOpen(reason: TripReason): void {
    if (this.state !== 'OPEN') {
      this.trip(reason, Date.now());
    }
  }

  /**
   * Force the breaker CLOSED (e.g. manual recovery or global signal).
   */
  forceClose(): void {
    this.close();
  }

  // ---------------------------------------------------------------------------
  // INTERNAL
  // ---------------------------------------------------------------------------

  private trip(reason: TripReason, now: number): void {
    const previous = this.state;
    this.state = 'OPEN';
    this.openedAt = now;
    this.lastTripReason = reason;
    this.probesInFlight = 0;
    this.failures = [];

    logger.warn('[CircuitBreaker:Local] OPEN', {
      reason,
      previousState: previous,
      openDurationMs: this.config.openDurationMs,
    });
  }

  private close(): void {
    const previous = this.state;
    this.state = 'CLOSED';
    this.openedAt = null;
    this.probesInFlight = 0;
    this.failures = [];

    if (previous !== 'CLOSED') {
      logger.info('[CircuitBreaker:Local] CLOSED', {
        previousState: previous,
      });
    }
  }

  private maybeTransition(): void {
    if (this.state === 'OPEN' && this.openedAt != null) {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed >= this.config.openDurationMs) {
        this.state = 'HALF_OPEN';
        this.probesInFlight = 0;

        logger.info('[CircuitBreaker:Local] HALF_OPEN — probes allowed', {
          probeLimit: this.config.halfOpenProbeLimit,
        });
      }
    }
  }

  private pruneWindow(now: number): void {
    const cutoff = now - this.config.windowMs;
    this.failures = this.failures.filter((ts) => ts > cutoff);
  }
}
