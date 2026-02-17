/**
 * CIRCUIT BREAKER — TIER-AWARE FACADE
 * =====================================
 *
 * Single entry-point that composes:
 *   • LocalBreaker  (per-instance, in-memory)
 *   • GlobalBreaker (cross-instance, Redis-backed)
 *   • TripSignals   (error classification)
 *
 * Exposes a tier-aware `guard()` method consumed by `executeDb`.
 *
 * Tier Definitions (bulkhead isolation):
 *   Tier 0 — Clinical critical writes (prescriptions, orders, payments)
 *            → allowed to probe even when OPEN
 *   Tier 1 — Auth middleware
 *            → fail-fast when OPEN, no retry
 *   Tier 2 — Non-critical reads (dashboards, geo, affiliates, reports)
 *            → fail-fast when OPEN, route should serve cached/stale
 *   Tier 3 — Cron / background jobs
 *            → hard-blocked when OPEN
 *
 * @module database/circuit-breaker
 */

import { logger } from '@/lib/logger';
import { LocalBreaker, type BreakerState, type LocalBreakerConfig } from './localBreaker';
import { GlobalBreaker, type GlobalBreakerConfig } from './globalBreaker';
import { classifyError, type TripReason, type TripSignal } from './tripSignals';

// Re-export for consumers
export { classifyError, checkTimeBudget, checkAcquisitionDelay } from './tripSignals';
export type { TripReason, TripSignal } from './tripSignals';
export type { BreakerState } from './localBreaker';

// =============================================================================
// TIER ENUM
// =============================================================================

export enum DbTier {
  /** Clinical critical writes — probes allowed when OPEN */
  CRITICAL = 0,
  /** Authentication — fail-fast, no retry */
  AUTH = 1,
  /** Non-critical reads — fail-fast, serve stale */
  READ = 2,
  /** Cron / background — hard-blocked */
  BACKGROUND = 3,
}

// =============================================================================
// GUARD RESULT
// =============================================================================

export type GuardDecision =
  | { allowed: true; isProbe: boolean }
  | { allowed: false; reason: string; state: BreakerState | 'GLOBAL_OPEN' };

// =============================================================================
// ERRORS
// =============================================================================

export class CircuitOpenError extends Error {
  public readonly tier: DbTier;
  public readonly breakerState: BreakerState | 'GLOBAL_OPEN';

  constructor(tier: DbTier, state: BreakerState | 'GLOBAL_OPEN', reason: string) {
    super(`[CircuitBreaker] Request blocked — ${reason}`);
    this.name = 'CircuitOpenError';
    this.tier = tier;
    this.breakerState = state;
  }
}

// =============================================================================
// CIRCUIT BREAKER MANAGER (SINGLETON)
// =============================================================================

export interface CircuitBreakerManagerConfig {
  local?: Partial<LocalBreakerConfig>;
  global?: Partial<GlobalBreakerConfig>;
  /** Feature flag: set false to disable the breaker entirely (passthrough) */
  enabled?: boolean;
}

class CircuitBreakerManager {
  private readonly local: LocalBreaker;
  private readonly global: GlobalBreaker;
  private enabled: boolean;

  constructor(config?: CircuitBreakerManagerConfig) {
    this.local = new LocalBreaker(config?.local);
    this.global = new GlobalBreaker(config?.global);
    this.enabled = config?.enabled ?? (process.env.DB_CIRCUIT_BREAKER_ENABLED !== 'false');
  }

  // ---------------------------------------------------------------------------
  // GUARD — called BEFORE executing a query
  // ---------------------------------------------------------------------------

  /**
   * Decide whether the query should proceed.
   *
   * Check order:
   *   1. Breaker disabled → allow
   *   2. Local CLOSED → allow
   *   3. Local OPEN / HALF_OPEN → apply tier rules
   *   4. Global OPEN → apply tier rules (and sync local state)
   */
  async guard(tier: DbTier): Promise<GuardDecision> {
    if (!this.enabled) {
      return { allowed: true, isProbe: false };
    }

    const localState = this.local.getState();

    // ── CLOSED → allow ──────────────────────────────────────────────────
    if (localState === 'CLOSED') {
      // Lazy global check: if global is OPEN, sync local state
      const globalOpen = await this.global.isOpen();
      if (globalOpen) {
        this.local.forceOpen('P2024_POOL_TIMEOUT');
        return this.decideTier(tier, 'GLOBAL_OPEN');
      }
      return { allowed: true, isProbe: false };
    }

    // ── HALF_OPEN → probe logic ─────────────────────────────────────────
    if (localState === 'HALF_OPEN') {
      return this.decideHalfOpen(tier);
    }

    // ── OPEN → tier-based fast-fail ─────────────────────────────────────
    return this.decideTier(tier, 'OPEN');
  }

  // ---------------------------------------------------------------------------
  // RECORD — called AFTER query execution
  // ---------------------------------------------------------------------------

  /**
   * Record a successful query. May close HALF_OPEN → CLOSED.
   */
  async recordSuccess(): Promise<void> {
    if (!this.enabled) return;

    const prev = this.local.getState();
    this.local.recordSuccess();

    // If we transitioned from HALF_OPEN → CLOSED, also close global
    if (prev === 'HALF_OPEN' && this.local.getState() === 'CLOSED') {
      await this.global.close();
    }
  }

  /**
   * Record a query failure. Classifies the error and may trip the breaker.
   */
  async recordFailure(error: unknown): Promise<TripSignal> {
    if (!this.enabled) {
      return { isTrip: false, suppressRetry: false };
    }

    const signal = classifyError(error);

    if (signal.isTrip && signal.reason) {
      this.local.recordFailure(signal.reason);

      // If local just went OPEN, propagate to global
      if (this.local.getState() === 'OPEN') {
        await this.global.trip(signal.reason);
      }
    }

    return signal;
  }

  /**
   * Release a HALF_OPEN probe slot (always call in finally).
   */
  releaseProbe(): void {
    this.local.releaseProbe();
  }

  // ---------------------------------------------------------------------------
  // OBSERVABILITY
  // ---------------------------------------------------------------------------

  async getSnapshot() {
    const [localSnap, globalSnap] = await Promise.all([
      Promise.resolve(this.local.getSnapshot()),
      this.global.getSnapshot(),
    ]);
    return { local: localSnap, global: globalSnap, enabled: this.enabled };
  }

  // ---------------------------------------------------------------------------
  // ADMIN
  // ---------------------------------------------------------------------------

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    logger.info('[CircuitBreaker] Enabled state changed', { enabled });
  }

  forceOpen(reason: TripReason): void {
    this.local.forceOpen(reason);
    this.global.trip(reason).catch(() => {});
  }

  forceClose(): void {
    this.local.forceClose();
    this.global.close().catch(() => {});
  }

  // ---------------------------------------------------------------------------
  // INTERNAL
  // ---------------------------------------------------------------------------

  private decideTier(tier: DbTier, state: BreakerState | 'GLOBAL_OPEN'): GuardDecision {
    switch (tier) {
      case DbTier.CRITICAL:
        // Tier 0: allowed to probe even when OPEN
        if (state === 'OPEN' || state === 'GLOBAL_OPEN') {
          const probeGranted = this.local.acquireProbe();
          if (probeGranted) {
            logger.info('[CircuitBreaker] Tier 0 CRITICAL probe allowed', { state });
            return { allowed: true, isProbe: true };
          }
        }
        return {
          allowed: false,
          reason: `Tier 0 blocked: breaker ${state}, no probe slots`,
          state,
        };

      case DbTier.AUTH:
        return {
          allowed: false,
          reason: `Tier 1 AUTH fail-fast: breaker ${state}`,
          state,
        };

      case DbTier.READ:
        return {
          allowed: false,
          reason: `Tier 2 READ fail-fast: breaker ${state} — serve cached`,
          state,
        };

      case DbTier.BACKGROUND:
        return {
          allowed: false,
          reason: `Tier 3 BACKGROUND hard-blocked: breaker ${state}`,
          state,
        };
    }
  }

  private decideHalfOpen(tier: DbTier): GuardDecision {
    // In HALF_OPEN, only Tier 0 and Tier 1 can probe
    if (tier === DbTier.CRITICAL || tier === DbTier.AUTH) {
      const probeGranted = this.local.acquireProbe();
      if (probeGranted) {
        logger.info('[CircuitBreaker] HALF_OPEN probe granted', {
          tier: DbTier[tier],
        });
        return { allowed: true, isProbe: true };
      }
    }

    // Everyone else (or if probe limit hit): fail-fast
    return {
      allowed: false,
      reason: `HALF_OPEN: tier ${DbTier[tier]} ${tier <= DbTier.AUTH ? 'probe limit hit' : 'not eligible'}`,
      state: 'HALF_OPEN',
    };
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

const circuitBreaker = new CircuitBreakerManager();

export { circuitBreaker, CircuitBreakerManager };
export type { LocalBreakerConfig, GlobalBreakerConfig };
