/**
 * Redis Cache — Upstash REST Client
 * ===================================
 *
 * Uses @upstash/redis (HTTP/REST) which is fully compatible with
 * serverless environments (Vercel, Lambda). No persistent TCP connections.
 *
 * Falls back gracefully to a no-op cache when Upstash env vars are missing
 * (local dev without Redis).
 *
 * Includes a per-call timeout (REDIS_CALL_TIMEOUT_MS) and a circuit breaker
 * that trips after consecutive failures, preventing cascading 504s when
 * Upstash latency spikes (see incident: 2026-03-26 17:15-17:55 UTC).
 *
 * @module cache/redis
 */

import { Redis } from '@upstash/redis';
import { logger } from '@/lib/logger';

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  namespace?: string;
}

interface GuardrailLabelStats {
  calls: number;
  successes: number;
  fallbacks: number;
  failures: number;
  timeouts: number;
  circuitOpenFallbacks: number;
  unavailableFallbacks: number;
}

interface GuardrailStatsSnapshot {
  totals: GuardrailLabelStats;
  byLabel: Record<string, GuardrailLabelStats>;
}

// ---------------------------------------------------------------------------
// Timeout + Circuit Breaker Configuration
// ---------------------------------------------------------------------------

const REDIS_CALL_TIMEOUT_MS = 2_000;
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_COOLDOWN_MS = 30_000;
/** SCAN COUNT hint — balances round-trips vs payload size (avoids KEYS O(N) blocking). */
const SCAN_KEY_BATCH = 500;
const SCAN_MAX_KEYS = parseInt(process.env.REDIS_SCAN_MAX_KEYS ?? '10000', 10);
const CACHE_NAMESPACE_TTL_HINTS = ['cache', 'query'];

class CircuitBreaker {
  private failures = 0;
  private trippedAt = 0;

  isOpen(): boolean {
    if (this.failures < CIRCUIT_BREAKER_THRESHOLD) return false;
    if (Date.now() - this.trippedAt > CIRCUIT_BREAKER_COOLDOWN_MS) {
      this.halfOpen();
      return false;
    }
    return true;
  }

  recordSuccess(): void {
    if (this.failures > 0) {
      this.failures = 0;
      this.trippedAt = 0;
    }
  }

  recordFailure(): void {
    this.failures++;
    if (this.failures >= CIRCUIT_BREAKER_THRESHOLD && this.trippedAt === 0) {
      this.trippedAt = Date.now();
      logger.warn('[RedisCache] Circuit breaker OPEN — skipping Redis for cooldown', {
        failures: this.failures,
        cooldownMs: CIRCUIT_BREAKER_COOLDOWN_MS,
      });
    }
  }

  private halfOpen(): void {
    this.failures = CIRCUIT_BREAKER_THRESHOLD - 1;
    logger.info('[RedisCache] Circuit breaker HALF-OPEN — allowing one probe request');
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Redis call timed out after ${ms}ms`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

class RedisCache {
  private client: Redis | null = null;
  private ready = false;
  private breaker = new CircuitBreaker();
  private missingTtlWarnedNamespaces = new Set<string>();
  private guardrailStats = new Map<string, GuardrailLabelStats>();

  constructor() {
    this.initializeClient();
  }

  private initializeClient(): void {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      if (process.env.REDIS_URL) {
        logger.warn(
          '[RedisCache] REDIS_URL is set but UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are missing. ' +
          'TCP-based redis connections are unreliable in serverless. Please set the Upstash REST env vars.'
        );
      }
      logger.info('[RedisCache] Upstash credentials not configured — running without Redis cache');
      return;
    }

    try {
      this.client = new Redis({ url, token });
      this.ready = true;
      logger.info('[RedisCache] Upstash REST client initialized');
    } catch (error) {
      logger.error('[RedisCache] Failed to initialize Upstash client', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.client = null;
      this.ready = false;
    }
  }

  /**
   * Execute a Redis operation with timeout and circuit breaker protection.
   * Returns `fallback` when Redis is unavailable, slow, or the circuit is open.
   */
  private async guardedCall<T>(op: () => Promise<T>, fallback: T, label: string): Promise<T> {
    this.markGuardrailCall(label);
    if (!this.ready || !this.client) {
      this.markGuardrailFallback(label, 'unavailable');
      return fallback;
    }
    if (this.breaker.isOpen()) {
      this.markGuardrailFallback(label, 'circuit_open');
      return fallback;
    }

    try {
      const result = await withTimeout(op(), REDIS_CALL_TIMEOUT_MS);
      this.breaker.recordSuccess();
      this.markGuardrailSuccess(label);
      return result;
    } catch (error) {
      this.breaker.recordFailure();
      const isTimeout = error instanceof Error && error.message.includes('timed out');
      this.markGuardrailFallback(label, isTimeout ? 'timeout' : 'failure');
      logger.error(`[RedisCache] ${label} failed`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return fallback;
    }
  }

  private getKey(key: string, namespace?: string): string {
    const prefix = namespace || 'lifefile';
    return `${prefix}:${key}`;
  }

  private getTenantKey(clinicId: number, key: string, namespace?: string): string {
    const prefix = namespace || 'lifefile';
    return `${prefix}:t${clinicId}:${key}`;
  }

  private isCacheLikeNamespace(namespace?: string): boolean {
    if (!namespace) return false;
    const normalized = namespace.toLowerCase();
    return CACHE_NAMESPACE_TTL_HINTS.some((hint) => normalized.includes(hint));
  }

  private warnMissingTtl(namespace: string | undefined, label: string): void {
    if (!this.isCacheLikeNamespace(namespace)) return;
    const marker = `${namespace ?? 'none'}:${label}`;
    if (this.missingTtlWarnedNamespaces.has(marker)) return;
    this.missingTtlWarnedNamespaces.add(marker);
    logger.warn('[RedisCache] Cache-like namespace write without TTL', {
      namespace: namespace ?? 'none',
      label,
    });
  }

  private getOrCreateGuardrailStats(label: string): GuardrailLabelStats {
    const existing = this.guardrailStats.get(label);
    if (existing) return existing;
    const initial: GuardrailLabelStats = {
      calls: 0,
      successes: 0,
      fallbacks: 0,
      failures: 0,
      timeouts: 0,
      circuitOpenFallbacks: 0,
      unavailableFallbacks: 0,
    };
    this.guardrailStats.set(label, initial);
    return initial;
  }

  private markGuardrailCall(label: string): void {
    this.getOrCreateGuardrailStats(label).calls += 1;
  }

  private markGuardrailSuccess(label: string): void {
    this.getOrCreateGuardrailStats(label).successes += 1;
  }

  private markGuardrailFallback(
    label: string,
    reason: 'failure' | 'timeout' | 'circuit_open' | 'unavailable'
  ): void {
    const stats = this.getOrCreateGuardrailStats(label);
    stats.fallbacks += 1;
    if (reason === 'timeout') stats.timeouts += 1;
    if (reason === 'circuit_open') stats.circuitOpenFallbacks += 1;
    if (reason === 'unavailable') stats.unavailableFallbacks += 1;
    if (reason === 'failure' || reason === 'timeout') stats.failures += 1;
  }

  /**
   * Collect keys matching a pattern using SCAN (incremental), not KEYS.
   * Same eventual key set as KEYS for a stable database; duplicates are rare and harmless for DEL.
   */
  private async scanKeysMatching(matchPattern: string): Promise<string[]> {
    const collected: string[] = [];
    let cursor: string | number = 0;
    do {
      const [nextCursor, batch]: [string | number, string[]] = await this.client!.scan(cursor, {
        match: matchPattern,
        count: SCAN_KEY_BATCH,
      });
      if (batch.length > 0) {
        for (const k of batch) {
          collected.push(String(k));
          if (collected.length >= SCAN_MAX_KEYS) {
            logger.warn('[RedisCache] SCAN key cap reached; truncating result set', {
              matchPattern,
              scanMaxKeys: SCAN_MAX_KEYS,
            });
            return collected;
          }
        }
      }
      cursor = nextCursor;
    } while (String(cursor) !== '0');
    return collected;
  }

  async tenantGet<T = unknown>(clinicId: number, key: string, options?: CacheOptions): Promise<T | null> {
    const fullKey = this.getTenantKey(clinicId, key, options?.namespace);
    return this.guardedCall(
      async () => (await this.client!.get<T>(fullKey)) ?? null,
      null,
      'tenantGet',
    );
  }

  async tenantSet(clinicId: number, key: string, value: unknown, options?: CacheOptions): Promise<boolean> {
    const fullKey = this.getTenantKey(clinicId, key, options?.namespace);
    if (!options?.ttl) {
      this.warnMissingTtl(options?.namespace, 'tenantSet');
    }
    return this.guardedCall(
      async () => {
        if (options?.ttl) {
          await this.client!.set(fullKey, JSON.stringify(value), { ex: options.ttl });
        } else {
          await this.client!.set(fullKey, JSON.stringify(value));
        }
        return true;
      },
      false,
      'tenantSet',
    );
  }

  async tenantDelete(clinicId: number, key: string, options?: CacheOptions): Promise<boolean> {
    const fullKey = this.getTenantKey(clinicId, key, options?.namespace);
    return this.guardedCall(
      async () => (await this.client!.del(fullKey)) === 1,
      false,
      'tenantDelete',
    );
  }

  async get<T = unknown>(key: string, options?: CacheOptions): Promise<T | null> {
    const fullKey = this.getKey(key, options?.namespace);
    return this.guardedCall(
      async () => (await this.client!.get<T>(fullKey)) ?? null,
      null,
      'get',
    );
  }

  async set(key: string, value: unknown, options?: CacheOptions): Promise<boolean> {
    const fullKey = this.getKey(key, options?.namespace);
    if (!options?.ttl) {
      this.warnMissingTtl(options?.namespace, 'set');
    }
    return this.guardedCall(
      async () => {
        if (options?.ttl) {
          await this.client!.set(fullKey, JSON.stringify(value), { ex: options.ttl });
        } else {
          await this.client!.set(fullKey, JSON.stringify(value));
        }
        return true;
      },
      false,
      'set',
    );
  }

  async delete(key: string, options?: CacheOptions): Promise<boolean> {
    const fullKey = this.getKey(key, options?.namespace);
    return this.guardedCall(
      async () => (await this.client!.del(fullKey)) === 1,
      false,
      'delete',
    );
  }

  async flush(namespace?: string): Promise<boolean> {
    return this.guardedCall(
      async () => {
        const pattern = this.getKey('*', namespace);
        const keys = await this.scanKeysMatching(pattern);
        if (keys.length > 0) {
          const pipeline = this.client!.pipeline();
          for (const k of keys) {
            pipeline.del(k);
          }
          await pipeline.exec();
        }
        return true;
      },
      false,
      'flush',
    );
  }

  async increment(key: string, amount = 1, options?: CacheOptions): Promise<number | null> {
    const fullKey = this.getKey(key, options?.namespace);
    return this.guardedCall(
      async () => {
        const result = await this.client!.incrby(fullKey, amount);
        if (options?.ttl) {
          await this.client!.expire(fullKey, options.ttl);
        }
        return result;
      },
      null,
      'increment',
    );
  }

  async mget<T = unknown>(keys: string[], options?: CacheOptions): Promise<(T | null)[]> {
    if (keys.length === 0) return [];
    const fullKeys = keys.map((k) => this.getKey(k, options?.namespace));
    return this.guardedCall(
      async () => (await this.client!.mget<(T | null)[]>(...fullKeys)) ?? keys.map(() => null),
      keys.map(() => null),
      'mget',
    );
  }

  async exists(key: string, options?: CacheOptions): Promise<boolean> {
    const fullKey = this.getKey(key, options?.namespace);
    return this.guardedCall(
      async () => (await this.client!.exists(fullKey)) === 1,
      false,
      'exists',
    );
  }

  async ttl(key: string, options?: CacheOptions): Promise<number | null> {
    const fullKey = this.getKey(key, options?.namespace);
    return this.guardedCall(
      async () => this.client!.ttl(fullKey),
      null,
      'ttl',
    );
  }

  async disconnect(): Promise<void> {
    // @upstash/redis is HTTP-based — no persistent connection to close
    this.ready = false;
    this.client = null;
  }

  isReady(): boolean {
    return this.ready && this.client !== null;
  }

  /**
   * Access the underlying @upstash/redis client for operations not exposed
   * by RedisCache (pipeline, hash, scan, etc.). Returns null when Redis is
   * not configured. Callers MUST handle the null case gracefully.
   */
  getClient(): Redis | null {
    return this.ready ? this.client : null;
  }

  /**
   * Execute a custom Redis operation with the same timeout + breaker guardrails
   * as standard RedisCache methods. Returns fallback on failure/unavailable.
   */
  async withClient<T>(
    label: string,
    fallback: T,
    operation: (client: Redis) => Promise<T>
  ): Promise<T> {
    return this.guardedCall(
      async () => operation(this.client!),
      fallback,
      label,
    );
  }

  /**
   * Get all keys matching a pattern.
   * Warning: Use sparingly — many matches still mean many SCAN round-trips.
   */
  async keys(pattern: string): Promise<string[]> {
    return this.guardedCall(
      async () => this.scanKeysMatching(pattern),
      [],
      'keys',
    );
  }

  /**
   * Snapshot guardrail performance to support Redis SLO monitoring.
   */
  getGuardrailStats(): GuardrailStatsSnapshot {
    const totals: GuardrailLabelStats = {
      calls: 0,
      successes: 0,
      fallbacks: 0,
      failures: 0,
      timeouts: 0,
      circuitOpenFallbacks: 0,
      unavailableFallbacks: 0,
    };
    const byLabel: Record<string, GuardrailLabelStats> = {};

    for (const [label, stats] of this.guardrailStats.entries()) {
      byLabel[label] = { ...stats };
      totals.calls += stats.calls;
      totals.successes += stats.successes;
      totals.fallbacks += stats.fallbacks;
      totals.failures += stats.failures;
      totals.timeouts += stats.timeouts;
      totals.circuitOpenFallbacks += stats.circuitOpenFallbacks;
      totals.unavailableFallbacks += stats.unavailableFallbacks;
    }

    return { totals, byLabel };
  }
}

// Singleton instance
const cache = new RedisCache();

export default cache;

export type { CacheOptions, GuardrailLabelStats, GuardrailStatsSnapshot };
