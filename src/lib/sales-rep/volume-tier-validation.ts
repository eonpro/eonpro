/**
 * Sales rep volume tier validation (admin API).
 * SALE_COUNT: minSales / maxSales / flat amountCents per sale (weekly sale count).
 * WEEKLY_REVENUE_CENTS: minRevenueCents / additionalPercentBps (weekly sum of initial-sale dollars).
 */

export const VOLUME_TIER_BASIS_SALE_COUNT = 'SALE_COUNT';
export const VOLUME_TIER_BASIS_WEEKLY_REVENUE = 'WEEKLY_REVENUE_CENTS';

export type NormalizedSaleCountTier = {
  minSales: number;
  maxSales: number | null;
  amountCents: number;
  sortOrder: number;
  minRevenueCents: null;
  additionalPercentBps: null;
};

export type NormalizedRevenueTier = {
  minSales: number;
  maxSales: null;
  amountCents: number;
  sortOrder: number;
  minRevenueCents: number;
  additionalPercentBps: number;
};

export type NormalizedVolumeTierRow = NormalizedSaleCountTier | NormalizedRevenueTier;

type VolumeTierInput = {
  minSales?: number | null;
  maxSales?: number | null;
  amountCents?: number | null;
  minRevenueCents?: number | null;
  additionalPercentBps?: number | null;
};

export function validateAndNormalizeVolumeTiers(
  enabled: boolean,
  volumeTierBasis: string,
  tiers: unknown
):
  | { valid: true; normalized: NormalizedVolumeTierRow[] }
  | { valid: false; error: string; code: string } {
  if (!enabled) {
    return { valid: true, normalized: [] };
  }

  if (!Array.isArray(tiers) || tiers.length === 0) {
    return {
      valid: false,
      error: 'volumeTiers must include at least one tier when volume tiers are enabled',
      code: 'INVALID_VOLUME_TIERS',
    };
  }

  if (volumeTierBasis === VOLUME_TIER_BASIS_WEEKLY_REVENUE) {
    const normalized = (tiers as VolumeTierInput[])
      .map((tier, idx) => ({
        minRevenueCents: Number(tier.minRevenueCents),
        additionalPercentBps: Number(tier.additionalPercentBps),
        sortOrder: idx,
      }))
      .sort((a, b) => a.minRevenueCents - b.minRevenueCents);

    for (let i = 0; i < normalized.length; i += 1) {
      const tier = normalized[i];
      if (!Number.isInteger(tier.minRevenueCents) || tier.minRevenueCents < 0) {
        return {
          valid: false,
          error: 'Each revenue tier minRevenueCents must be a non-negative integer (cents)',
          code: 'INVALID_VOLUME_TIERS',
        };
      }
      if (
        !Number.isInteger(tier.additionalPercentBps) ||
        tier.additionalPercentBps < 0 ||
        tier.additionalPercentBps > 10000
      ) {
        return {
          valid: false,
          error: 'Each revenue tier additionalPercentBps must be between 0 and 10000 (100%)',
          code: 'INVALID_VOLUME_TIERS',
        };
      }
      if (i > 0 && tier.minRevenueCents <= normalized[i - 1]!.minRevenueCents) {
        return {
          valid: false,
          error: 'Revenue tiers must have strictly increasing minRevenueCents',
          code: 'INVALID_VOLUME_TIERS',
        };
      }
    }

    if (normalized[0]!.minRevenueCents !== 0) {
      return {
        valid: false,
        error: 'First revenue tier must have minRevenueCents = 0 (base bracket)',
        code: 'INVALID_VOLUME_TIERS',
      };
    }

    return {
      valid: true,
      normalized: normalized.map((t, idx) => ({
        minSales: idx + 1,
        maxSales: null,
        amountCents: 0,
        sortOrder: t.sortOrder,
        minRevenueCents: t.minRevenueCents,
        additionalPercentBps: t.additionalPercentBps,
      })),
    };
  }

  const normalized = (tiers as VolumeTierInput[])
    .map((tier, idx) => ({
      minSales: Number(tier.minSales),
      maxSales: tier.maxSales == null ? null : Number(tier.maxSales),
      amountCents: Number(tier.amountCents),
      sortOrder: idx,
    }))
    .sort((a, b) => a.minSales - b.minSales);

  for (let i = 0; i < normalized.length; i += 1) {
    const tier = normalized[i]!;
    if (!Number.isInteger(tier.minSales) || tier.minSales < 1) {
      return {
        valid: false,
        error: 'Each tier minSales must be an integer >= 1',
        code: 'INVALID_VOLUME_TIERS',
      };
    }
    if (!Number.isInteger(tier.amountCents) || tier.amountCents < 0) {
      return {
        valid: false,
        error: 'Each tier amountCents must be a non-negative integer',
        code: 'INVALID_VOLUME_TIERS',
      };
    }
    if (tier.maxSales != null) {
      if (!Number.isInteger(tier.maxSales) || tier.maxSales < tier.minSales) {
        return {
          valid: false,
          error: 'Each tier maxSales must be null or an integer >= minSales',
          code: 'INVALID_VOLUME_TIERS',
        };
      }
    }
    if (i < normalized.length - 1) {
      const next = normalized[i + 1]!;
      if (tier.maxSales == null) {
        return {
          valid: false,
          error: 'Only the last tier may be open-ended (maxSales = null)',
          code: 'INVALID_VOLUME_TIERS',
        };
      }
      if (next.minSales <= tier.maxSales) {
        return {
          valid: false,
          error:
            'Volume tiers must not overlap; each next minSales must be greater than previous maxSales',
          code: 'INVALID_VOLUME_TIERS',
        };
      }
    }
  }

  return {
    valid: true,
    normalized: normalized.map((t) => ({
      minSales: t.minSales,
      maxSales: t.maxSales,
      amountCents: t.amountCents,
      sortOrder: t.sortOrder,
      minRevenueCents: null,
      additionalPercentBps: null,
    })),
  };
}
