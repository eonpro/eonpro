/**
 * AUTH FAILURE RATE LIMITER
 * =========================
 *
 * Redis-backed rate limiter for failed authentication attempts.
 * Protects against brute force attacks on JWT-authenticated endpoints.
 *
 * Unlike the login rate limiter (which protects /api/auth/login),
 * this protects ALL authenticated API routes by tracking IPs that
 * repeatedly send invalid/expired tokens.
 *
 * Design:
 *   - Tracks failed auth attempts per IP using Redis counters
 *   - Blocks IP after 15 failures in 5 minutes (more lenient than login)
 *   - Exponential backoff: block duration doubles each consecutive block
 *   - Auto-expires after TTL — no manual cleanup needed
 *
 * @module auth/auth-rate-limiter
 */

import cache from '@/lib/cache/redis';
import { logger } from '@/lib/logger';

// ============================================================================
// Configuration
// ============================================================================

/** Max failed auth attempts before blocking */
const MAX_FAILURES = 15;

/** Window for counting failures (seconds) */
const FAILURE_WINDOW_SECONDS = 300; // 5 minutes

/** Base block duration (seconds) — doubles each consecutive block */
const BASE_BLOCK_SECONDS = 300; // 5 minutes

/** Max block duration (seconds) */
const MAX_BLOCK_SECONDS = 3600; // 1 hour

const NAMESPACE = 'auth-ratelimit';

// ============================================================================
// Core
// ============================================================================

/**
 * Record a failed authentication attempt for an IP address.
 * Returns whether the IP is now blocked.
 */
export async function recordAuthFailure(
  ip: string
): Promise<{ blocked: boolean; attemptsRemaining: number }> {
  if (!cache.isReady()) {
    // If Redis is unavailable, allow the request (fail-open)
    return { blocked: false, attemptsRemaining: MAX_FAILURES };
  }

  try {
    const failKey = `${ip}:failures`;
    const count = await cache.increment(failKey, 1, {
      namespace: NAMESPACE,
      ttl: FAILURE_WINDOW_SECONDS,
    });

    const attempts = count ?? 1;
    const remaining = Math.max(0, MAX_FAILURES - attempts);

    if (attempts >= MAX_FAILURES) {
      // Block the IP
      const blockKey = `${ip}:blocked`;
      const blockCountKey = `${ip}:block-count`;

      // Track consecutive blocks for exponential backoff
      const blockCount = (await cache.increment(blockCountKey, 1, {
        namespace: NAMESPACE,
        ttl: MAX_BLOCK_SECONDS * 2,
      })) ?? 1;

      const blockDuration = Math.min(
        BASE_BLOCK_SECONDS * Math.pow(2, blockCount - 1),
        MAX_BLOCK_SECONDS
      );

      await cache.set(blockKey, Date.now(), {
        namespace: NAMESPACE,
        ttl: blockDuration,
      });

      logger.security('[AuthRateLimit] IP blocked for repeated auth failures', {
        ip: ip.substring(0, 8) + '***', // Partial IP for log safety
        attempts,
        blockDurationSeconds: blockDuration,
        consecutiveBlocks: blockCount,
      });

      return { blocked: true, attemptsRemaining: 0 };
    }

    return { blocked: false, attemptsRemaining: remaining };
  } catch (error) {
    // Fail open — don't block legitimate users if Redis has issues
    logger.warn('[AuthRateLimit] Redis error, failing open', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return { blocked: false, attemptsRemaining: MAX_FAILURES };
  }
}

/**
 * Check if an IP is currently blocked from auth attempts.
 */
export async function isAuthBlocked(ip: string): Promise<boolean> {
  if (!cache.isReady()) {
    return false; // Fail open
  }

  try {
    const blockKey = `${ip}:blocked`;
    return await cache.exists(blockKey, { namespace: NAMESPACE });
  } catch {
    return false; // Fail open
  }
}

/**
 * Clear auth failure records for an IP (e.g., after successful auth).
 */
export async function clearAuthFailures(ip: string): Promise<void> {
  if (!cache.isReady()) return;

  try {
    const failKey = `${ip}:failures`;
    const blockKey = `${ip}:blocked`;
    const blockCountKey = `${ip}:block-count`;

    await Promise.all([
      cache.delete(failKey, { namespace: NAMESPACE }),
      cache.delete(blockKey, { namespace: NAMESPACE }),
      cache.delete(blockCountKey, { namespace: NAMESPACE }),
    ]);
  } catch {
    // Non-critical — keys will expire naturally
  }
}
