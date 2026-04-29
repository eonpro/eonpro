/**
 * Regression: Cyanocobalamin (B12) canonical sig must remain stable across
 * the medication template, the addon override helper, and the addon
 * medication map. If any of these drift, refill prescriptions can be sent to
 * the pharmacy with the wrong directions.
 *
 * Reference: Provider report 2026-04-28 — refill form was showing
 * "inject 100 units (1ml) subcutaneous once weekly." for B12 instead of the
 * correct "Inject 50 units subcutaneously twice per week."
 */
import { describe, it, expect } from 'vitest';
import {
  MEDS,
  ADDON_MEDICATION_MAP,
  CYANOCOBALAMIN_B12_PRODUCT_ID,
  CYANOCOBALAMIN_B12_CANONICAL_SIG,
  CYANOCOBALAMIN_B12_CANONICAL_QUANTITY,
  CYANOCOBALAMIN_B12_CANONICAL_REFILLS,
  CYANOCOBALAMIN_B12_CANONICAL_DAYS_SUPPLY,
  getCanonicalAddonSigOverride,
} from '@/lib/medications';

describe('Cyanocobalamin (B12) canonical sig', () => {
  it('exposes the expected canonical sig string', () => {
    expect(CYANOCOBALAMIN_B12_CANONICAL_SIG).toBe(
      'Inject 50 units subcutaneously twice per week.'
    );
  });

  it('addon medication map points to the B12 product id', () => {
    expect(ADDON_MEDICATION_MAP.b12).toBe(CYANOCOBALAMIN_B12_PRODUCT_ID);
  });

  it('B12 medication entry uses the canonical sig as its primary template', () => {
    const med = MEDS[CYANOCOBALAMIN_B12_PRODUCT_ID];
    expect(med).toBeDefined();
    expect(med.name.toLowerCase()).toContain('cyanocobalamin');
    expect(med.sigTemplates?.[0]?.sig).toBe(CYANOCOBALAMIN_B12_CANONICAL_SIG);
    expect(med.sigTemplates?.[0]?.quantity).toBe(CYANOCOBALAMIN_B12_CANONICAL_QUANTITY);
    expect(med.sigTemplates?.[0]?.refills).toBe(CYANOCOBALAMIN_B12_CANONICAL_REFILLS);
    expect(med.sigTemplates?.[0]?.daysSupply).toBe(CYANOCOBALAMIN_B12_CANONICAL_DAYS_SUPPLY);
  });

  describe('getCanonicalAddonSigOverride', () => {
    it('returns the canonical override for the B12 product id', () => {
      const override = getCanonicalAddonSigOverride(CYANOCOBALAMIN_B12_PRODUCT_ID);
      expect(override).not.toBeNull();
      expect(override).toEqual({
        sig: CYANOCOBALAMIN_B12_CANONICAL_SIG,
        quantity: CYANOCOBALAMIN_B12_CANONICAL_QUANTITY,
        refills: CYANOCOBALAMIN_B12_CANONICAL_REFILLS,
        daysSupply: CYANOCOBALAMIN_B12_CANONICAL_DAYS_SUPPLY,
      });
    });

    it('returns null for non-fixed-sig medications (titrated GLP-1s, etc.)', () => {
      // Spot-check a few keys from MEDS that should NOT be force-overridden.
      const sampleKeys = Object.keys(MEDS).filter(
        (k) => k !== CYANOCOBALAMIN_B12_PRODUCT_ID
      );
      for (const key of sampleKeys) {
        expect(getCanonicalAddonSigOverride(key)).toBeNull();
      }
    });

    it('does NOT match the legacy bad sig that was reported in production', () => {
      const override = getCanonicalAddonSigOverride(CYANOCOBALAMIN_B12_PRODUCT_ID);
      expect(override?.sig.toLowerCase()).not.toContain('once weekly');
      expect(override?.sig.toLowerCase()).not.toContain('100 units');
      expect(override?.sig.toLowerCase()).not.toContain('1ml');
    });
  });
});
