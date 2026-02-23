/**
 * Client-safe refill plan defaults (no DB/Prisma).
 * Used by PatientSubscriptionManager and refillQueueService.
 */

export type RefillFrequencyKey = 'MONTHLY' | 'QUARTERLY' | 'SEMESTER' | 'ANNUAL';

export interface RefillDefaultsForPlan {
  refillFrequency: RefillFrequencyKey;
  refillCount: number;
  hint?: string;
}

/**
 * Smart defaults for manual enrollment refills based on pre-paid plan duration.
 * We can only prescribe 3 months at a time for GLP-1; refills are queued for admin to verify
 * payment and approve each fill.
 *
 * - 6-month pre-paid: first 3 months = initial fill, remaining 3 months = 1 refill (quarterly).
 * - 12-month pre-paid: first 3 months = initial, 3 extra quarters = 3 refills (quarterly).
 * - Monthly: queue every month to verify payment and refill (e.g. 12 refills).
 * - Quarterly (3-month): queue 1 refill after first 3 months to verify payment for refill.
 */
export function getRefillDefaultsForPlanDuration(months: number): RefillDefaultsForPlan {
  if (months <= 1) {
    return {
      refillFrequency: 'MONTHLY',
      refillCount: 12,
      hint: 'Monthly: refills queued each month for payment verification and refill.',
    };
  }
  if (months === 3) {
    return {
      refillFrequency: 'QUARTERLY',
      refillCount: 1,
      hint: 'Quarterly: 1 refill queued after first 3 months for payment verification.',
    };
  }
  if (months === 6) {
    return {
      refillFrequency: 'QUARTERLY',
      refillCount: 1,
      hint: '6-month pre-paid: 1 refill in 3 months for remaining supply (3-month prescription limit).',
    };
  }
  if (months >= 12) {
    return {
      refillFrequency: 'QUARTERLY',
      refillCount: 3,
      hint: '12-month pre-paid: 3 refills queued quarterly after first 3 months.',
    };
  }
  const count = Math.max(1, Math.floor(months / 3));
  return {
    refillFrequency: 'QUARTERLY',
    refillCount: count,
  };
}
