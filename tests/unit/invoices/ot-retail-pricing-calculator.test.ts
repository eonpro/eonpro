import { describe, it, expect } from 'vitest';
import {
  discountPercentForUnit,
  buildCartLines,
  computeCalculatorTotals,
  canUsePackageAtDuration,
} from '@/lib/invoices/ot-retail-pricing-calculator';
import { getOtRetailPackageById } from '@/lib/invoices/ot-retail-packages';

describe('ot-retail-pricing-calculator', () => {
  it('caps discount at 30%', () => {
    const pkg = getOtRetailPackageById('bpc')!;
    const disc = {
      military: true,
      multiResearch: true,
      order1499: false,
      order2999: true,
      loyaltyTier: 't3' as const,
    };
    expect(discountPercentForUnit(pkg, 1, disc)).toBe(30);
  });

  it('applies multi-research only from second research unit onward', () => {
    const pkg = getOtRetailPackageById('bpc')!;
    const disc = { military: false, multiResearch: true, order1499: false, order2999: false, loyaltyTier: 'none' as const };
    expect(discountPercentForUnit(pkg, 0, disc)).toBe(0);
    expect(discountPercentForUnit(pkg, 1, disc)).toBe(10);
  });

  it('respects max duration when building cart', () => {
    const tesaipa = getOtRetailPackageById('tesaipa')!;
    expect(canUsePackageAtDuration(tesaipa, 6)).toBe(false);
    const lines = buildCartLines(new Map([['tesaipa', 6]]), new Map());
    expect(lines).toHaveLength(0);
    const ok = buildCartLines(new Map([['tesaipa', 3]]), new Map());
    expect(ok).toHaveLength(1);
  });

  it('computes totals for a simple cart', () => {
    const lines = buildCartLines(new Map([['trtplus', 3]]), new Map());
    const t = computeCalculatorTotals(lines, {
      military: false,
      multiResearch: false,
      order1499: false,
      order2999: false,
      loyaltyTier: 'none',
    });
    expect(t.discountedTotalCents).toBe(66_900);
    expect(t.listTotalCents).toBe(66_900);
  });
});
