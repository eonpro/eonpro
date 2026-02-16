/**
 * FEATURE FLAG SERVICE
 * ====================
 *
 * Redis-backed feature flags for runtime feature toggling without deploys.
 * Designed for incident response — disable problematic features instantly.
 *
 * Usage in API routes:
 *   import { isFeatureEnabled, FeatureFlag } from '@/lib/feature-flags';
 *
 *   if (!(await isFeatureEnabled(FeatureFlag.AFFILIATE_ANALYTICS))) {
 *     return NextResponse.json(
 *       { error: 'Feature temporarily disabled', code: 'FEATURE_DISABLED' },
 *       { status: 503, headers: { 'Retry-After': '300' } }
 *     );
 *   }
 *
 * Admin API:
 *   POST /api/admin/feature-flags — toggle flags
 *   GET  /api/admin/feature-flags — list all flags with status
 *
 * @module feature-flags
 */

import cache from '@/lib/cache/redis';
import { logger } from '@/lib/logger';

// ============================================================================
// Feature Flag Registry
// ============================================================================

/**
 * All available feature flags.
 * Add new flags here — they default to ENABLED until explicitly disabled.
 */
export enum FeatureFlag {
  /** Heavy analytics routes (affiliate analytics, code performance) */
  AFFILIATE_ANALYTICS = 'affiliate-analytics',

  /** Report generation routes (10K-row exports) */
  REPORT_GENERATION = 'report-generation',

  /** Webhook processing (pause during incidents) */
  WEBHOOK_PROCESSING = 'webhook-processing',

  /** AI/OpenAI features (SOAP notes, chat, suggestions) */
  AI_FEATURES = 'ai-features',

  /** Stripe payment processing */
  STRIPE_PAYMENTS = 'stripe-payments',

  /** SMS notifications via Twilio */
  SMS_NOTIFICATIONS = 'sms-notifications',

  /** Email sending via SES */
  EMAIL_SENDING = 'email-sending',

  /** Patient portal access */
  PATIENT_PORTAL = 'patient-portal',

  /** Super admin dashboard analytics */
  SUPER_ADMIN_ANALYTICS = 'super-admin-analytics',

  /** Background job processing */
  BACKGROUND_JOBS = 'background-jobs',
}

/**
 * Metadata for each flag — descriptions shown in admin UI.
 */
export const FLAG_METADATA: Record<
  FeatureFlag,
  { description: string; category: string; impactLevel: 'low' | 'medium' | 'high' }
> = {
  [FeatureFlag.AFFILIATE_ANALYTICS]: {
    description: 'Affiliate analytics and reporting endpoints',
    category: 'Analytics',
    impactLevel: 'low',
  },
  [FeatureFlag.REPORT_GENERATION]: {
    description: 'Large data export and report generation',
    category: 'Analytics',
    impactLevel: 'low',
  },
  [FeatureFlag.WEBHOOK_PROCESSING]: {
    description: 'Incoming webhook handlers (Stripe, WellMedR, etc.)',
    category: 'Integrations',
    impactLevel: 'high',
  },
  [FeatureFlag.AI_FEATURES]: {
    description: 'OpenAI-powered features (SOAP notes, chat)',
    category: 'AI',
    impactLevel: 'medium',
  },
  [FeatureFlag.STRIPE_PAYMENTS]: {
    description: 'Stripe payment processing and invoicing',
    category: 'Billing',
    impactLevel: 'high',
  },
  [FeatureFlag.SMS_NOTIFICATIONS]: {
    description: 'Twilio SMS notifications',
    category: 'Communication',
    impactLevel: 'medium',
  },
  [FeatureFlag.EMAIL_SENDING]: {
    description: 'AWS SES email delivery',
    category: 'Communication',
    impactLevel: 'medium',
  },
  [FeatureFlag.PATIENT_PORTAL]: {
    description: 'Patient-facing portal routes',
    category: 'Portal',
    impactLevel: 'high',
  },
  [FeatureFlag.SUPER_ADMIN_ANALYTICS]: {
    description: 'Super admin analytics and dashboards',
    category: 'Analytics',
    impactLevel: 'low',
  },
  [FeatureFlag.BACKGROUND_JOBS]: {
    description: 'Cron jobs and background processing',
    category: 'System',
    impactLevel: 'medium',
  },
};

// ============================================================================
// Constants
// ============================================================================

const REDIS_PREFIX = 'feature-flag';
const CACHE_TTL_SECONDS = 30; // Local cache TTL — flags refresh every 30s

/**
 * In-memory cache to avoid Redis round-trip on every request.
 * Refreshed every CACHE_TTL_SECONDS.
 */
const localCache = new Map<string, { value: boolean; expiresAt: number }>();

// ============================================================================
// Core API
// ============================================================================

/**
 * Check if a feature flag is enabled.
 * Returns true (enabled) by default — flags must be explicitly disabled.
 *
 * Performance: Uses in-memory cache with 30s TTL to avoid Redis on hot paths.
 */
export async function isFeatureEnabled(flag: FeatureFlag): Promise<boolean> {
  // Check local cache first
  const cached = localCache.get(flag);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.value;
  }

  try {
    const redisValue = await cache.get<boolean>(`${REDIS_PREFIX}:${flag}`, {
      namespace: 'lifefile',
    });

    // Default to enabled if not set in Redis
    const enabled = redisValue !== false;

    // Update local cache
    localCache.set(flag, {
      value: enabled,
      expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000,
    });

    return enabled;
  } catch (error) {
    // If Redis is down, default to ENABLED — don't break features because Redis is unreachable
    logger.warn('[FeatureFlags] Redis read failed, defaulting to enabled', {
      flag,
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return true;
  }
}

/**
 * Set a feature flag value.
 * Used by admin API to enable/disable features.
 */
export async function setFeatureFlag(
  flag: FeatureFlag,
  enabled: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const success = await cache.set(`${REDIS_PREFIX}:${flag}`, enabled, {
      namespace: 'lifefile',
    });

    if (success) {
      // Update local cache immediately
      localCache.set(flag, {
        value: enabled,
        expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000,
      });

      logger.info('[FeatureFlags] Flag updated', { flag, enabled });
    }

    return { success };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[FeatureFlags] Failed to set flag', undefined, { flag, enabled, error: message });
    return { success: false, error: message };
  }
}

/**
 * Get the status of all feature flags.
 */
export async function getAllFlags(): Promise<
  Array<{
    flag: FeatureFlag;
    enabled: boolean;
    description: string;
    category: string;
    impactLevel: string;
  }>
> {
  const flags = Object.values(FeatureFlag);

  const results = await Promise.all(
    flags.map(async (flag) => {
      const enabled = await isFeatureEnabled(flag);
      const metadata = FLAG_METADATA[flag];
      return {
        flag,
        enabled,
        description: metadata.description,
        category: metadata.category,
        impactLevel: metadata.impactLevel,
      };
    })
  );

  return results;
}

/**
 * Clear the local cache — useful after bulk flag updates.
 */
export function clearFlagCache(): void {
  localCache.clear();
}

// ============================================================================
// Middleware Helper
// ============================================================================

/**
 * Guard an API route with a feature flag.
 * Returns a 503 response if the feature is disabled.
 *
 * Usage:
 *   const guard = await featureFlagGuard(FeatureFlag.AFFILIATE_ANALYTICS);
 *   if (guard) return guard; // Returns 503 if disabled
 */
export async function featureFlagGuard(
  flag: FeatureFlag
): Promise<Response | null> {
  const enabled = await isFeatureEnabled(flag);
  if (!enabled) {
    return new Response(
      JSON.stringify({
        error: 'This feature is temporarily disabled for maintenance',
        code: 'FEATURE_DISABLED',
        flag,
      }),
      {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '300',
        },
      }
    );
  }
  return null;
}
