/**
 * Redis dependency tiers and degradation policy.
 * Keeps fail-open/fail-closed decisions explicit and operationally visible.
 */

export type RedisDependencyTier =
  | 'tier_a_auth_controls'
  | 'tier_b_performance_cache'
  | 'tier_c_retry_pipeline';
export type DegradationMode = 'fail_open' | 'fail_closed' | 'best_effort';

export interface RedisTierPolicy {
  tier: RedisDependencyTier;
  systems: string[];
  mode: DegradationMode;
  rationale: string;
}

export const REDIS_TIER_POLICIES: RedisTierPolicy[] = [
  {
    tier: 'tier_a_auth_controls',
    systems: ['sessions', 'auth middleware cache', 'rate limiting'],
    mode: 'fail_open',
    rationale:
      'Prefer availability for authenticated traffic while tracking security risk via alerts and fallback metrics.',
  },
  {
    tier: 'tier_b_performance_cache',
    systems: ['dashboard cache', 'geo cache', 'misc app cache'],
    mode: 'best_effort',
    rationale:
      'Cache improves latency only; fallback to DB/local cache is acceptable during Redis degradation.',
  },
  {
    tier: 'tier_c_retry_pipeline',
    systems: ['dead-letter queue metadata', 'retry orchestration'],
    mode: 'fail_closed',
    rationale:
      'Retry durability cannot be silently dropped; blocked writes must surface immediately for operator action.',
  },
];

export function summarizeRedisTierPolicy(): string[] {
  return REDIS_TIER_POLICIES.map((p) => `${p.tier}:${p.mode} -> ${p.systems.join(', ')}`);
}
