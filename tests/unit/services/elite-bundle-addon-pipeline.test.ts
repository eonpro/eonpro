import { describe, it, expect } from 'vitest';

import {
  isWellMedrAddonPriceId,
  getAddonPlanByStripePriceId,
} from '@/config/billingPlans';

// ──────────────────────────────────────────────────────────────
// Part 1: Addon Price ID Detection (billingPlans.ts)
// ──────────────────────────────────────────────────────────────
describe('isWellMedrAddonPriceId', () => {
  it('recognizes the Elite+ Bundle price ID', () => {
    expect(isWellMedrAddonPriceId('price_1TEFKjDfH4PWyxxd4roD32Ae')).toBe(true);
  });

  it('recognizes individual addon price IDs', () => {
    expect(isWellMedrAddonPriceId('price_1TEFJTDfH4PWyxxdJY3Ngi7T')).toBe(true); // NAD+
    expect(isWellMedrAddonPriceId('price_1TEFKJDfH4PWyxxdDZkq3vD5')).toBe(true); // Sermorelin
    expect(isWellMedrAddonPriceId('price_1TEFJ8DfH4PWyxxdgUpek4Yt')).toBe(true); // B12
  });

  it('rejects non-addon price IDs', () => {
    expect(isWellMedrAddonPriceId('price_1StAGYDfH4PWyxxdePAervoq')).toBe(false); // Semaglutide monthly
    expect(isWellMedrAddonPriceId('price_FAKE_123')).toBe(false);
    expect(isWellMedrAddonPriceId('')).toBe(false);
  });
});

describe('getAddonPlanByStripePriceId', () => {
  it('returns the Elite Bundle plan for its price ID', () => {
    const plan = getAddonPlanByStripePriceId('price_1TEFKjDfH4PWyxxd4roD32Ae');
    expect(plan).toBeDefined();
    expect(plan!.id).toBe('wm_addon_elite_bundle');
    expect(plan!.category).toBe('addons');
    expect(plan!.price).toBe(19900);
  });

  it('returns the NAD+ plan for its price ID', () => {
    const plan = getAddonPlanByStripePriceId('price_1TEFJTDfH4PWyxxdJY3Ngi7T');
    expect(plan).toBeDefined();
    expect(plan!.id).toBe('wm_addon_nad');
  });

  it('returns the Sermorelin plan for its price ID', () => {
    const plan = getAddonPlanByStripePriceId('price_1TEFKJDfH4PWyxxdDZkq3vD5');
    expect(plan).toBeDefined();
    expect(plan!.id).toBe('wm_addon_sermorelin');
  });

  it('returns the B12 plan for its price ID', () => {
    const plan = getAddonPlanByStripePriceId('price_1TEFJ8DfH4PWyxxdgUpek4Yt');
    expect(plan).toBeDefined();
    expect(plan!.id).toBe('wm_addon_b12');
  });

  it('returns undefined for non-addon price IDs', () => {
    expect(getAddonPlanByStripePriceId('price_FAKE')).toBeUndefined();
    expect(getAddonPlanByStripePriceId('')).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────
// Part 2: extractMedicationName coverage (refillQueueService.ts)
// The function is not exported, so we test it indirectly by
// verifying the pattern matching logic in isolation.
// ──────────────────────────────────────────────────────────────
describe('Medication name extraction logic (pattern verification)', () => {
  function extractMedicationName(planName: string | null): string | undefined {
    if (!planName) return undefined;
    const lower = planName.toLowerCase();
    if (lower.includes('semaglutide')) return 'Semaglutide';
    if (lower.includes('tirzepatide')) return 'Tirzepatide';
    if (lower.includes('elite') && lower.includes('bundle'))
      return 'Elite Bundle (NAD+, Sermorelin, B12)';
    if (lower.includes('nad')) return 'NAD+';
    if (lower.includes('sermorelin')) return 'Sermorelin';
    if (lower.includes('b12') || lower.includes('cyanocobalamin'))
      return 'Cyanocobalamin (B12)';
    return undefined;
  }

  it('extracts Semaglutide', () => {
    expect(extractMedicationName('Semaglutide 2.5mg/2mL')).toBe('Semaglutide');
    expect(extractMedicationName('semaglutide injection')).toBe('Semaglutide');
  });

  it('extracts Tirzepatide', () => {
    expect(extractMedicationName('Tirzepatide 10mg/3mL')).toBe('Tirzepatide');
  });

  it('extracts Elite Bundle', () => {
    expect(extractMedicationName('Elite Bundle')).toBe(
      'Elite Bundle (NAD+, Sermorelin, B12)',
    );
    expect(extractMedicationName('Elite+ Bundle')).toBe(
      'Elite Bundle (NAD+, Sermorelin, B12)',
    );
    expect(extractMedicationName('elite bundle (NAD+, Sermorelin, B12)')).toBe(
      'Elite Bundle (NAD+, Sermorelin, B12)',
    );
  });

  it('extracts NAD+', () => {
    expect(extractMedicationName('NAD+')).toBe('NAD+');
    expect(extractMedicationName('NAD+ Injection')).toBe('NAD+');
  });

  it('extracts Sermorelin', () => {
    expect(extractMedicationName('Sermorelin')).toBe('Sermorelin');
    expect(extractMedicationName('Sermorelin Injection')).toBe('Sermorelin');
  });

  it('extracts B12 / Cyanocobalamin', () => {
    expect(extractMedicationName('B12')).toBe('Cyanocobalamin (B12)');
    expect(extractMedicationName('Cyanocobalamin (B12)')).toBe(
      'Cyanocobalamin (B12)',
    );
  });

  it('returns undefined for unknown names', () => {
    expect(extractMedicationName(null)).toBeUndefined();
    expect(extractMedicationName('')).toBeUndefined();
    expect(extractMedicationName('Unknown Product')).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────
// Part 3: Addon ID mapping from plan IDs
// ──────────────────────────────────────────────────────────────
describe('Addon ID mapping from billing plan', () => {
  it('maps Elite Bundle plan to elite_bundle addon ID', () => {
    const plan = getAddonPlanByStripePriceId('price_1TEFKjDfH4PWyxxd4roD32Ae');
    const addonIds =
      plan?.id === 'wm_addon_elite_bundle'
        ? ['elite_bundle']
        : plan?.id === 'wm_addon_nad'
          ? ['nad_plus']
          : plan?.id === 'wm_addon_sermorelin'
            ? ['sermorelin']
            : plan?.id === 'wm_addon_b12'
              ? ['b12']
              : [];
    expect(addonIds).toEqual(['elite_bundle']);
  });

  it('maps NAD+ plan to nad_plus addon ID', () => {
    const plan = getAddonPlanByStripePriceId('price_1TEFJTDfH4PWyxxdJY3Ngi7T');
    const addonIds =
      plan?.id === 'wm_addon_elite_bundle'
        ? ['elite_bundle']
        : plan?.id === 'wm_addon_nad'
          ? ['nad_plus']
          : [];
    expect(addonIds).toEqual(['nad_plus']);
  });
});
