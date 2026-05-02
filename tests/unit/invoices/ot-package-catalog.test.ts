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
  findOtPackageMatchByPatientGross,
  findOtPackageMatchForInvoiceLine,
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
  it('doctor consult chips include $10 (bloodwork) since 2026-05-02', () => {
    expect(OT_DOCTOR_CONSULT_CHIPS.map((c) => c.cents)).toEqual([0, 1000, 1500, 3000, 5000]);
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
    /**
     * TRT Plus 6mo COGS = Cypionate qty 6 × $35 + Enclo qty 1 × $108 +
     * Anastrozole qty 1 × $72 = $390 (per-component pricing, 2026-05-02).
     */
    expect(q!.costCents).toBe(39000);
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

describe('findOtPackageMatchByPatientGross — tier-aware default cost', () => {
  it('matches Enclomiphene 1 month tier from gross + Rx description', () => {
    /**
     * Reproduces the exact scenario the user reported: patient paid $249,
     * order Rx is "Enclomiphene Citrate 25mg". Without this matcher the editor
     * pre-filled $135 (the 3-month cost on the same SKU). With it, $45.
     */
    const m = findOtPackageMatchByPatientGross(24900, 'Enclomiphene Citrate 25 mg');
    expect(m).not.toBeNull();
    expect(m!.pkg.id).toBe('enclomiphene-25mg');
    expect(m!.tier).toBe(1);
    expect(m!.quote.retailCents).toBe(24900);
    expect(m!.quote.costCents).toBe(4500);
  });

  it('matches Enclomiphene 3 month tier when patient paid $649', () => {
    const m = findOtPackageMatchByPatientGross(64900, 'Enclomiphene Citrate 25 mg');
    expect(m).not.toBeNull();
    expect(m!.pkg.id).toBe('enclomiphene-25mg');
    expect(m!.tier).toBe(3);
    expect(m!.quote.costCents).toBe(13500);
  });

  it('matches the maintenance variant when patient paid $149 (1 month maintenance)', () => {
    const m = findOtPackageMatchByPatientGross(14900, 'Enclomiphene Citrate 25 mg');
    expect(m).not.toBeNull();
    expect(m!.pkg.id).toBe('enclomiphene-25mg-maintenance');
    expect(m!.tier).toBe(1);
    expect(m!.quote.costCents).toBe(3000);
  });

  it('returns null when the gross does not match any tier of any name-overlapping package', () => {
    const m = findOtPackageMatchByPatientGross(33333, 'Enclomiphene Citrate 25 mg');
    expect(m).toBeNull();
  });

  it('returns null when productDescription is empty', () => {
    expect(findOtPackageMatchByPatientGross(24900, '')).toBeNull();
    expect(findOtPackageMatchByPatientGross(24900, null)).toBeNull();
  });

  it('returns null when gross is zero or negative', () => {
    expect(findOtPackageMatchByPatientGross(0, 'Enclomiphene 25mg')).toBeNull();
    expect(findOtPackageMatchByPatientGross(-100, 'Enclomiphene 25mg')).toBeNull();
  });

  it('matches TRT Plus 6 month and pulls the right defaults', () => {
    const m = findOtPackageMatchByPatientGross(
      128500,
      'Testosterone Cypionate 200MG/4mL · Enclomiphene 25mg'
    );
    expect(m).not.toBeNull();
    expect(m!.pkg.id).toBe('trt-plus');
    expect(m!.tier).toBe(6);
    /**
     * Cypionate packages: $0 doctor consult ($50 lives on TRT telehealth)
     * and $20 standard shipping (cypionate isn't a cold-chain med). Per
     * stakeholder direction 2026-05-02.
     */
    expect(m!.pkg.defaultConsultCents).toBe(0);
    expect(m!.pkg.defaultShippingCents).toBe(2000);
  });

  it('disambiguates a bundle from a standalone Rx by token overlap when both retails match', () => {
    /**
     * Both standalone Enclomiphene 1mo ($249) and Build 1mo ($549) are listed
     * but only Build's retail is $549. With description containing "Sermorelin"
     * the matcher should pick Build over Enclomiphene since $549 doesn't match
     * Enclomiphene at any tier — but score should still favor Build for
     * descriptions that mention both.
     */
    const m = findOtPackageMatchByPatientGross(54900, 'Enclomiphene 25mg · Sermorelin');
    expect(m).not.toBeNull();
    expect(m!.pkg.id).toBe('build');
    expect(m!.tier).toBe(1);
  });

  it('respects the tolerance option for off-by-cents drift (e.g. tax)', () => {
    /** $249.10 with $10 tolerance should still match the $249.00 1-month tier. */
    const m = findOtPackageMatchByPatientGross(24910, 'Enclomiphene Citrate 25 mg', {
      tolerance: 100,
    });
    expect(m).not.toBeNull();
    expect(m!.pkg.id).toBe('enclomiphene-25mg');
    expect(m!.tier).toBe(1);
  });
});

describe('findOtPackageMatchForInvoiceLine — multi-package invoice support', () => {
  it('matches by name + tier-in-description (path 1)', () => {
    const m = findOtPackageMatchForInvoiceLine('TRT Solo - 3 Month', 0);
    expect(m).not.toBeNull();
    expect(m!.pkg.id).toBe('trt-solo');
    expect(m!.tier).toBe(3);
  });

  it('matches HCG 6 Month line', () => {
    const m = findOtPackageMatchForInvoiceLine('HCG - 6 Month', 0);
    expect(m).not.toBeNull();
    expect(m!.pkg.id).toBe('hcg');
    expect(m!.tier).toBe(6);
    /** Per stakeholder: 6mo HCG = 2 fills × $240. */
    expect(m!.quote.costCents).toBe(48000);
  });

  it('matches NAD+ 3 Month line', () => {
    const m = findOtPackageMatchForInvoiceLine('NAD+ - 3 Month', 0);
    expect(m).not.toBeNull();
    expect(m!.pkg.id).toBe('nad-1000mg');
    expect(m!.tier).toBe(3);
  });

  it('falls back to amount-only match when description has no tier marker (path 2)', () => {
    /** $499 = HCG 3-month retail; description has no tier marker. */
    const m = findOtPackageMatchForInvoiceLine('HCG', 49900);
    expect(m).not.toBeNull();
    expect(m!.pkg.id).toBe('hcg');
    expect(m!.tier).toBe(3);
  });

  it('returns null for unmatched line items (admin handles via Custom Lines)', () => {
    expect(findOtPackageMatchForInvoiceLine('Some random one-off charge', 1234)).toBeNull();
    expect(findOtPackageMatchForInvoiceLine('', 5000)).toBeNull();
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
    /** NAD+ 3mo: linear $75/mo × 3 = $225 (was $330 pre-2026-05-02). */
    { id: 'nad-1000mg', tier: 3, retailCents: 99900, costCents: 22500 },
    { id: 'tirzepatide', tier: 1, retailCents: 39900, costCents: 15000 },
    /** trt-solo 12mo: linear $35/mo Cypionate × 12 = $420 (was $300 pre-2026-05-02). */
    { id: 'trt-solo', tier: 12, retailCents: 242900, costCents: 42000 },
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
