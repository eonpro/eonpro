/**
 * Circuit Breaker Pattern
 *
 * Protects against cascading failures from external services (Stripe, PayPal, IP intelligence).
 *
 * States:
 * - CLOSED (normal): requests pass through
 * - OPEN (after N failures): requests fail fast without calling external service
 * - HALF_OPEN (after cooldown): allow one probe request to test recovery
 *
 * @module resilience/circuit-breaker
 */

import { logger } from '@/lib/logger';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerOptions {
  /** Name for logging */
  name: string;
  /** Number of failures before opening the circuit */
  failureThreshold: number;
  /** Time in ms to wait before transitioning from OPEN to HALF_OPEN */
  cooldownMs: number;
  /** Timeout in ms for individual calls */
  timeoutMs: number;
  /** Optional: custom function to determine if an error should count as a failure */
  isFailure?: (error: unknown) => boolean;
}

interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  lastFailureAt: number;
  lastSuccessAt: number;
  openedAt: number;
}

export class CircuitBreaker {
  private readonly options: CircuitBreakerOptions;
  private circuitState: CircuitBreakerState;

  constructor(options: CircuitBreakerOptions) {
    this.options = options;
    this.circuitState = {
      state: 'CLOSED',
      failures: 0,
      lastFailureAt: 0,
      lastSuccessAt: 0,
      openedAt: 0,
    };
  }

  /**
   * Execute a function through the circuit breaker.
   * If the circuit is OPEN, fails fast with a CircuitOpenError.
   * If HALF_OPEN, allows one probe call.
   */
  async call<T>(fn: () => Promise<T>): Promise<T> {
    // Check circuit state
    if (this.circuitState.state === 'OPEN') {
      const elapsed = Date.now() - this.circuitState.openedAt;
      if (elapsed >= this.options.cooldownMs) {
        // Transition to HALF_OPEN — allow one probe
        this.circuitState.state = 'HALF_OPEN';
        logger.info(`[CircuitBreaker:${this.options.name}] Transitioning to HALF_OPEN`, {
          elapsedMs: elapsed,
          cooldownMs: this.options.cooldownMs,
        });
      } else {
        // Still in cooldown — fail fast
        const retryAfterMs = this.options.cooldownMs - elapsed;
        logger.warn(`[CircuitBreaker:${this.options.name}] Circuit OPEN — failing fast`, {
          retryAfterMs,
          failures: this.circuitState.failures,
        });
        throw new CircuitOpenError(
          `Circuit breaker ${this.options.name} is OPEN. Retry after ${Math.ceil(retryAfterMs / 1000)}s.`,
          retryAfterMs
        );
      }
    }

    // Execute with timeout
    try {
      const result = await Promise.race([
        fn(),
        this.timeout(),
      ]);

      this.onSuccess();
      return result as T;
    } catch (error) {
      // Check if this error should count as a circuit-breaking failure
      const isFailure = this.options.isFailure
        ? this.options.isFailure(error)
        : true;

      if (isFailure) {
        this.onFailure(error);
      }
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.circuitState.state === 'HALF_OPEN') {
      logger.info(`[CircuitBreaker:${this.options.name}] Probe succeeded — closing circuit`, {
        previousFailures: this.circuitState.failures,
      });
    }
    // Reset on success
    this.circuitState = {
      state: 'CLOSED',
      failures: 0,
      lastFailureAt: this.circuitState.lastFailureAt,
      lastSuccessAt: Date.now(),
      openedAt: 0,
    };
  }

  private onFailure(error: unknown): void {
    this.circuitState.failures++;
    this.circuitState.lastFailureAt = Date.now();

    if (this.circuitState.state === 'HALF_OPEN') {
      // Probe failed — re-open circuit
      this.circuitState.state = 'OPEN';
      this.circuitState.openedAt = Date.now();
      logger.warn(`[CircuitBreaker:${this.options.name}] Probe failed — re-opening circuit`, {
        failures: this.circuitState.failures,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return;
    }

    if (this.circuitState.failures >= this.options.failureThreshold) {
      this.circuitState.state = 'OPEN';
      this.circuitState.openedAt = Date.now();
      logger.warn(`[CircuitBreaker:${this.options.name}] Failure threshold reached — opening circuit`, {
        failures: this.circuitState.failures,
        threshold: this.options.failureThreshold,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private timeout(): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new TimeoutError(
          `Circuit breaker ${this.options.name} call timed out after ${this.options.timeoutMs}ms`
        ));
      }, this.options.timeoutMs);
    });
  }

  /** Get current circuit state (for health checks and monitoring) */
  getState(): { state: CircuitState; failures: number; lastFailureAt: number } {
    return {
      state: this.circuitState.state,
      failures: this.circuitState.failures,
      lastFailureAt: this.circuitState.lastFailureAt,
    };
  }

  /** Force-reset the circuit (for admin/testing) */
  reset(): void {
    this.circuitState = {
      state: 'CLOSED',
      failures: 0,
      lastFailureAt: 0,
      lastSuccessAt: Date.now(),
      openedAt: 0,
    };
  }
}

// ============================================================================
// Error Types
// ============================================================================

export class CircuitOpenError extends Error {
  public readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = 'CircuitOpenError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

// ============================================================================
// Pre-configured Circuit Breakers
// ============================================================================

/** Stripe API circuit breaker: 5 failures → 60s cooldown, 10s timeout */
export const stripeCircuitBreaker = new CircuitBreaker({
  name: 'Stripe',
  failureThreshold: 5,
  cooldownMs: 60 * 1000,
  timeoutMs: 10 * 1000,
  isFailure: (error: unknown) => {
    // Don't count client errors (4xx) as circuit-breaking failures
    if (error && typeof error === 'object' && 'statusCode' in error) {
      const status = (error as { statusCode: number }).statusCode;
      return status >= 500; // Only server errors trip the circuit
    }
    return true;
  },
});

/** PayPal API circuit breaker: 3 failures → 120s cooldown, 15s timeout */
export const paypalCircuitBreaker = new CircuitBreaker({
  name: 'PayPal',
  failureThreshold: 3,
  cooldownMs: 120 * 1000,
  timeoutMs: 15 * 1000,
});

/** IP Intelligence API circuit breaker: 5 failures → 30s cooldown, 5s timeout */
export const ipIntelligenceCircuitBreaker = new CircuitBreaker({
  name: 'IPIntelligence',
  failureThreshold: 5,
  cooldownMs: 30 * 1000,
  timeoutMs: 5 * 1000,
});
