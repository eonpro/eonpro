/**
 * Client-side helpers for the OT retail pricing calculator (package builder + discounts).
 * Mirrors the legacy HTML calculator; amounts are USD cents from `OT_RETAIL_PACKAGES`.
 */

import {
  OT_RETAIL_PACKAGES,
  type OtRetailPackage,
  type OtRetailDurationMonths,
  getOtRetailPackagePriceCents,
} from './ot-retail-packages';

export type OtCalcDuration = OtRetailDurationMonths;

export interface OtCalcCartLine {
  pkg: OtRetailPackage;
  dur: OtCalcDuration;
  qty: number;
}

export interface OtCalcDiscountState {
  military: boolean;
  multiResearch: boolean;
  order1499: boolean;
  order2999: boolean;
  loyaltyTier: 'none' | 't1' | 't2' | 't3';
}

export const OT_CALC_CATEGORIES = [
  { id: 'bundles' as const, label: 'Bundles' },
  { id: 'rx' as const, label: 'Prescription' },
  { id: 'research' as const, label: 'Research' },
  { id: 'glp' as const, label: 'GLP-1s' },
];

export const OT_CALC_DURATIONS: OtCalcDuration[] = [1, 3, 6, 12];

export function canUsePackageAtDuration(pkg: OtRetailPackage, d: OtCalcDuration): boolean {
  if (pkg.flatRate) return true;
  if (pkg.maxDurationMonths != null && d > pkg.maxDurationMonths) return false;
  return getOtRetailPackagePriceCents(pkg, d) != null;
}

/** List price in cents at duration (flat SKUs use 1mo or 3mo price). */
export function listPriceCentsAt(pkg: OtRetailPackage, d: OtCalcDuration): number | null {
  if (pkg.flatRate) {
    return getOtRetailPackagePriceCents(pkg, 1) ?? getOtRetailPackagePriceCents(pkg, 3);
  }
  return getOtRetailPackagePriceCents(pkg, d);
}

/** Estimated 1-month rate in cents (for “savings vs 1mo” box). */
export function mo1RateCents(pkg: OtRetailPackage): number | null {
  const m1 = getOtRetailPackagePriceCents(pkg, 1);
  if (m1 != null) return m1;
  const m3 = getOtRetailPackagePriceCents(pkg, 3);
  if (m3 != null) return Math.round(m3 / 3);
  return null;
}

function isResearchKind(pkg: OtRetailPackage): boolean {
  return pkg.kind === 'research';
}

function isRxBundleGlpKind(pkg: OtRetailPackage): boolean {
  return pkg.kind === 'rx' || pkg.kind === 'bundle' || pkg.kind === 'glp';
}

/**
 * Discount percent for one unit of a line, given how many research units appeared before it in the cart.
 * Capped at 30% like the original script.
 */
export function discountPercentForUnit(
  pkg: OtRetailPackage,
  researchIndexBeforeThisUnit: number,
  disc: OtCalcDiscountState,
): number {
  let pct = 0;
  const isRes = isResearchKind(pkg);
  const isRxBunGlp = isRxBundleGlpKind(pkg);

  if (disc.military) pct += 5;
  if (disc.multiResearch && isRes && researchIndexBeforeThisUnit > 0) pct += 10;
  if (disc.order2999) pct += 10;
  else if (disc.order1499) pct += 5;

  if (disc.loyaltyTier === 't3') {
    if (isRes) pct += 10;
    else if (isRxBunGlp) pct += 5;
  } else if (disc.loyaltyTier === 't2') {
    if (isRes) pct += 10;
    else if (isRxBunGlp) pct += 5;
  } else if (disc.loyaltyTier === 't1') {
    if (isRes) pct += 10;
    else if (isRxBunGlp) pct += 5;
  }

  return Math.min(pct, 30);
}

export function buildCartLines(
  singleSel: Map<string, OtCalcDuration>,
  multiQty: Map<string, { dur: OtCalcDuration; qty: number }>,
): OtCalcCartLine[] {
  const lines: OtCalcCartLine[] = [];
  for (const pkg of OT_RETAIL_PACKAGES) {
    if (pkg.allowsMultipleQuantity) {
      const mq = multiQty.get(pkg.id);
      if (mq && mq.qty > 0 && canUsePackageAtDuration(pkg, mq.dur)) {
        lines.push({ pkg, dur: mq.dur, qty: mq.qty });
      }
    } else {
      const d = singleSel.get(pkg.id);
      if (d != null && canUsePackageAtDuration(pkg, d)) {
        lines.push({ pkg, dur: d, qty: 1 });
      }
    }
  }
  return lines;
}

export interface OtCalcTotals {
  listTotalCents: number;
  discountedTotalCents: number;
  discountSavedCents: number;
  bundleSavedCents: number;
  totalSavedCents: number;
  monthAvgCents: number;
  rowDetails: Array<{
    label: string;
    durLabel: string;
    listCents: number;
    discountedCents: number;
    showStrikethrough: boolean;
  }>;
}

export function computeCalculatorTotals(
  lines: OtCalcCartLine[],
  disc: OtCalcDiscountState,
): OtCalcTotals {
  let listTotalCents = 0;
  let discountedTotalCents = 0;
  let bundleSavedCents = 0;
  let resIdx = 0;
  const rowDetails: OtCalcTotals['rowDetails'] = [];

  for (const { pkg, dur, qty } of lines) {
    const resIdxAtLineStart = resIdx;
    let lineList = 0;
    let lineDisc = 0;
    for (let i = 0; i < qty; i++) {
      const p = listPriceCentsAt(pkg, dur);
      if (p == null) continue;
      const pct = discountPercentForUnit(pkg, resIdx, disc);
      const dp = Math.round(p * (1 - pct / 100));
      lineList += p;
      lineDisc += dp;
      if (isResearchKind(pkg)) resIdx += 1;
    }
    listTotalCents += lineList;
    discountedTotalCents += lineDisc;

    if (!pkg.flatRate) {
      const mo1 = mo1RateCents(pkg);
      if (mo1 != null) {
        const wouldPay = mo1 * dur * qty;
        bundleSavedCents += Math.max(0, wouldPay - lineList);
      }
    }

    const pctFirst = discountPercentForUnit(
      pkg,
      isResearchKind(pkg) ? resIdxAtLineStart : 0,
      disc,
    );
    const label = qty > 1 ? `${pkg.name} ×${qty}` : pkg.name;
    const durLabel = pkg.flatRate ? 'flat' : `${dur}M`;
    rowDetails.push({
      label,
      durLabel,
      listCents: lineList,
      discountedCents: lineDisc,
      showStrikethrough: pctFirst > 0,
    });
  }

  const discountSavedCents = listTotalCents - discountedTotalCents;
  const totalSavedCents = bundleSavedCents + discountSavedCents;

  const effectiveDurTotal = lines.reduce((a, { pkg, dur, qty }) => {
    const m = pkg.billingCycleMonthsHint ?? dur;
    return a + m * qty;
  }, 0);
  const effectiveQtyTotal = lines.reduce((a, { qty }) => a + qty, 0);
  const avgDur = effectiveDurTotal / Math.max(1, effectiveQtyTotal);
  const monthAvgCents = Math.round(discountedTotalCents / Math.max(1, avgDur));

  return {
    listTotalCents,
    discountedTotalCents,
    discountSavedCents,
    bundleSavedCents,
    totalSavedCents,
    monthAvgCents,
    rowDetails,
  };
}

export function formatCalcUsd(cents: number): string {
  const d = cents / 100;
  if (Number.isInteger(d)) {
    return `$${d.toLocaleString('en-US')}`;
  }
  return `$${d.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
