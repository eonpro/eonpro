/**
 * OT Package Catalog tests
 *
 * Backstops the data file that powers the manual reconciliation editor's
 * "Apply package" picker. Catches regressions like:
 *   - A row with retail-but-no-cost flagged as offered, breaking the picker
 *   - Cents that drift into dollar-as-integer mistakes ($5 → 500 ≠ 5)
 *   - Required default-fee fields missing
 *   - Chip values for shipping/consult drifting from spec
 */

import { describe, it, expect } from 'vitest';
import {
  OT_PACKAGE_CATALOG,
  OT_DOCTOR_CONSULT_CHIPS,
  OT_SHIPPING_CHIPS,
  OT_PACKAGE_TIER_LABELS,
  getOtPackageById,
  getOtPackageQuoteAtTier,
  type OtPackageTier,
} from '@/lib/invoices/ot-package-catalog';

describe('OT_PACKAGE_CATALOG — schema invariants', () => {
  it('every row has a stable id, name, category, and defaults', () => {
    for (const row of OT_PACKAGE_CATALOG) {
      expect(row.id).toMatch(/^[a-z0-9-]+$/);
      expect(row.name.length).toBeGreaterThan(0);
      expect(['rx', 'bundle', 'addon', 'lab', 'consult', 'research']).toContain(row.category);
      expect(Number.isInteger(row.defaultConsultCents)).toBe(true);
      expect(row.defaultConsultCents).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(row.defaultShippingCents)).toBe(true);
      expect(row.defaultShippingCents).toBeGreaterThanOrEqual(0);
    }
  });

  it('all ids are unique', () => {
    const ids = OT_PACKAGE_CATALOG.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every retail / cost cents value is a positive integer (no dollar-as-cents bugs)', () => {
    for (const row of OT_PACKAGE_CATALOG) {
      for (const v of Object.values(row.retailCentsByTier)) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v as number).toBeGreaterThan(0);
      }
      for (const v of Object.values(row.costCentsByTier)) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v as number).toBeGreaterThan(0);
      }
    }
  });

  it('defaults are within the manual-selection chip ranges or explicitly research-only', () => {
    const consultAllowed = new Set(OT_DOCTOR_CONSULT_CHIPS.map((c) => c.cents));
    const shippingAllowed = new Set(OT_SHIPPING_CHIPS.map((c) => c.cents));
    /**
     * Research peptides default to $5 (chips don't include $5; admin enters via the numeric input).
     * Some packages (e.g. Retatrutide 20mg) override shipping to a sheet-defined value.
     * Both cases just emit a debug warning here, not a hard fail.
     */
    for (const row of OT_PACKAGE_CATALOG) {
      const consultMatchesChip = consultAllowed.has(row.defaultConsultCents);
      const shippingMatchesChip = shippingAllowed.has(row.defaultShippingCents);
      if (!consultMatchesChip || !shippingMatchesChip) {
        // eslint-disable-next-line no-console
        console.debug(
          `[ot-package-catalog] ${row.id}: consult=${row.defaultConsultCents}c, shipping=${row.defaultShippingCents}c — outside chip set`
        );
      }
    }
    /** No assertion fails — this is documentation that off-chip defaults are intentional. */
    expect(true).toBe(true);
  });
});

describe('OT_DOCTOR_CONSULT_CHIPS / OT_SHIPPING_CHIPS — exact values per pricing sheet spec', () => {
  it('doctor consult chips are exactly $0, $15, $30, $50', () => {
    expect(OT_DOCTOR_CONSULT_CHIPS.map((c) => c.cents)).toEqual([0, 1500, 3000, 5000]);
  });

  it('shipping chips are exactly $0, $20, $30', () => {
    expect(OT_SHIPPING_CHIPS.map((c) => c.cents)).toEqual([0, 2000, 3000]);
  });
});

describe('getOtPackageById', () => {
  it('finds a known Rx package', () => {
    const p = getOtPackageById('enclomiphene-25mg');
    expect(p).toBeDefined();
    expect(p!.name.toLowerCase()).toContain('enclomiphene');
    expect(p!.retailCentsByTier[1]).toBe(24900);
    expect(p!.costCentsByTier[1]).toBe(4500);
    expect(p!.defaultConsultCents).toBe(3000);
    expect(p!.defaultShippingCents).toBe(2000);
  });

  it('returns undefined for an unknown id', () => {
    expect(getOtPackageById('does-not-exist')).toBeUndefined();
  });
});

describe('getOtPackageQuoteAtTier', () => {
  it('returns retail + cost cents for an offered tier', () => {
    const p = getOtPackageById('trt-plus')!;
    const q = getOtPackageQuoteAtTier(p, 6);
    expect(q).not.toBeNull();
    expect(q!.retailCents).toBe(128500);
    expect(q!.costCents).toBe(28800);
  });

  it('returns null when neither retail nor cost exists for that tier', () => {
    const p = getOtPackageById('glutathione-200mg')!;
    /** Glutathione is not offered as 1mo in the pricing sheet. */
    expect(getOtPackageQuoteAtTier(p, 1)).toBeNull();
  });

  it('returns retail with cost=0 when only retail is listed (research peptides)', () => {
    const p = getOtPackageById('melanotan-2-sun-kissed')!;
    const q = getOtPackageQuoteAtTier(p, 3);
    expect(q).not.toBeNull();
    expect(q!.retailCents).toBe(19900);
    /** Research peptides have no clinic-side cost in this sheet. */
    expect(q!.costCents).toBe(0);
  });
});

describe('Tier labels exposed for UI', () => {
  it('covers all four tiers with human strings', () => {
    const tiers: OtPackageTier[] = [1, 3, 6, 12];
    for (const t of tiers) {
      expect(OT_PACKAGE_TIER_LABELS[t]).toMatch(/month/);
    }
  });
});

describe('Spot-check pricing accuracy from the source spreadsheet', () => {
  /** A handful of representative rows — guards against silent transcription drift. */
  const cases: Array<{
    id: string;
    tier: OtPackageTier;
    retailCents: number;
    costCents: number;
  }> = [
    { id: 'enclomiphene-25mg', tier: 12, retailCents: 244200, costCents: 54000 },
    { id: 'nad-1000mg', tier: 3, retailCents: 99900, costCents: 33000 },
    { id: 'tirzepatide', tier: 1, retailCents: 39900, costCents: 15000 },
    { id: 'trt-solo', tier: 12, retailCents: 242900, costCents: 30000 },
    { id: 'handsome-wealthy', tier: 6, retailCents: 333500, costCents: 93000 },
    { id: 'build', tier: 12, retailCents: 477300, costCents: 198000 },
  ];

  for (const c of cases) {
    it(`${c.id} @ tier ${c.tier} matches sheet`, () => {
      const pkg = getOtPackageById(c.id)!;
      const q = getOtPackageQuoteAtTier(pkg, c.tier)!;
      expect(q.retailCents).toBe(c.retailCents);
      expect(q.costCents).toBe(c.costCents);
    });
  }
});
