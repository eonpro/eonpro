'use client';

import React, { useCallback, useMemo, useState } from 'react';
import {
  OT_RETAIL_PACKAGES,
  type OtRetailPackage,
  type OtRetailPackageCategory,
} from '@/lib/invoices/ot-retail-packages';
import {
  OT_CALC_CATEGORIES,
  OT_CALC_DURATIONS,
  type OtCalcDuration,
  type OtCalcDiscountState,
  canUsePackageAtDuration,
  listPriceCentsAt,
  buildCartLines,
  computeCalculatorTotals,
  formatCalcUsd,
} from '@/lib/invoices/ot-retail-pricing-calculator';

const ACCENT = '#C9A84C';
const BG = '#f7f6f2';

const KIND_BADGE: Record<OtRetailPackage['kind'], string> = {
  bundle: 'border border-amber-200 bg-[#fdf6e3] text-[#8a6a00]',
  rx: 'bg-[#e8f0fe] text-[#1a56a0]',
  research: 'bg-[#fef3e2] text-[#92500a]',
  glp: 'bg-[#fce8f3] text-[#861f5e]',
};

const KIND_LABEL: Record<OtRetailPackage['kind'], string> = {
  bundle: 'Bundle',
  rx: 'Rx',
  research: 'Research',
  glp: 'GLP-1',
};

function newMap<K, V>(base: Map<K, V>): Map<K, V> {
  return new Map(base);
}

export function OtRetailPricingCalculator() {
  const [browseDur, setBrowseDur] = useState<OtCalcDuration>(3);
  const [category, setCategory] = useState<OtRetailPackageCategory>('bundles');
  const [singleSel, setSingleSel] = useState<Map<string, OtCalcDuration>>(() => new Map());
  const [multiQty, setMultiQty] = useState<Map<string, { dur: OtCalcDuration; qty: number }>>(
    () => new Map()
  );
  const [disc, setDisc] = useState<OtCalcDiscountState>({
    military: false,
    multiResearch: false,
    order1499: false,
    order2999: false,
    loyaltyTier: 'none',
  });

  const filtered = useMemo(
    () => OT_RETAIL_PACKAGES.filter((p) => p.category === category),
    [category]
  );

  const cartLines = useMemo(() => buildCartLines(singleSel, multiQty), [singleSel, multiQty]);

  const totals = useMemo(() => computeCalculatorTotals(cartLines, disc), [cartLines, disc]);

  const totalItems = cartLines.reduce((s, l) => s + l.qty, 0);

  const toggleSingle = useCallback(
    (pkg: OtRetailPackage) => {
      if (pkg.allowsMultipleQuantity) return;
      setSingleSel((prev) => {
        const next = newMap(prev);
        const cur = next.get(pkg.id);
        if (cur === browseDur) {
          next.delete(pkg.id);
        } else if (canUsePackageAtDuration(pkg, browseDur)) {
          next.set(pkg.id, browseDur);
        }
        return next;
      });
    },
    [browseDur]
  );

  const incMulti = useCallback(
    (pkg: OtRetailPackage) => {
      if (!pkg.allowsMultipleQuantity) return;
      setMultiQty((prev) => {
        const next = newMap(prev);
        const cur = next.get(pkg.id) ?? { dur: browseDur, qty: 0 };
        next.set(pkg.id, { dur: browseDur, qty: cur.qty + 1 });
        return next;
      });
    },
    [browseDur]
  );

  const decMulti = useCallback((id: string) => {
    setMultiQty((prev) => {
      const next = newMap(prev);
      const cur = next.get(id);
      if (!cur) return prev;
      if (cur.qty <= 1) next.delete(id);
      else next.set(id, { dur: cur.dur, qty: cur.qty - 1 });
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setSingleSel(new Map());
    setMultiQty(new Map());
  }, []);

  const toggleOrder1499 = useCallback(() => {
    setDisc((d) => {
      if (d.order1499) return { ...d, order1499: false };
      return { ...d, order1499: true, order2999: false };
    });
  }, []);

  const toggleOrder2999 = useCallback(() => {
    setDisc((d) => {
      if (d.order2999) return { ...d, order2999: false };
      return { ...d, order2999: true, order1499: false };
    });
  }, []);

  const setLoyalty = useCallback((tier: OtCalcDiscountState['loyaltyTier']) => {
    setDisc((d) => ({ ...d, loyaltyTier: tier }));
  }, []);

  return (
    <div
      className="w-full overflow-x-hidden rounded-2xl border border-stone-200/80 p-4 sm:p-6 md:pr-10"
      style={{ backgroundColor: BG, color: '#1a1a1a' }}
    >
      <h1 className="text-xl font-bold tracking-tight text-stone-900">
        OT Men&apos;s Health — pricing calculator
      </h1>
      <p className="mt-1 text-[13px] text-stone-500">
        Select duration · tap compounds to add at that duration · mix durations · apply discounts
      </p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {OT_CALC_DURATIONS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setBrowseDur(d)}
            className={`min-w-[4.5rem] flex-1 rounded-lg border-[1.5px] px-2 py-2 text-[13px] font-semibold transition-colors sm:flex-none sm:px-4 ${
              browseDur === d
                ? 'border-transparent text-white'
                : 'border-stone-300 bg-white text-stone-500 hover:border-[color:var(--ot-acc)] hover:text-[color:var(--ot-acc)]'
            }`}
            style={
              browseDur === d
                ? { backgroundColor: ACCENT, borderColor: ACCENT, ['--ot-acc' as string]: ACCENT }
                : { ['--ot-acc' as string]: ACCENT }
            }
          >
            {d === 1 ? '1 month' : `${d} months`}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] italic text-stone-400">
        Browsing {browseDur === 1 ? '1-month' : `${browseDur}-month`} pricing — tap a compound to
        add at <strong style={{ color: ACCENT }}>{browseDur}M</strong>
        {'. '}
        Blue badge = added at a different duration than you&apos;re browsing.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px] lg:items-start">
        <div>
          <div className="mb-2.5 flex gap-0 overflow-x-auto border-b-2 border-stone-200">
            {OT_CALC_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={`whitespace-nowrap border-b-2 px-3.5 py-2 text-xs font-medium transition-colors ${
                  category === c.id
                    ? '-mb-0.5 border-b-[color:var(--acc)] font-bold text-stone-900'
                    : 'border-transparent text-stone-400 hover:text-stone-800'
                }`}
                style={{ ['--acc' as string]: ACCENT }}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1">
            {filtered.map((pkg) => {
              const avail = canUsePackageAtDuration(pkg, browseDur);
              const isMulti = !!pkg.allowsMultipleQuantity;
              const mq = multiQty.get(pkg.id);
              const selDur = isMulti ? mq?.dur : singleSel.get(pkg.id);
              const isSel = isMulti ? (mq?.qty ?? 0) > 0 : selDur != null;
              const assignedDur = isSel ? selDur : null;
              const isDiff = isSel && !pkg.flatRate && assignedDur !== browseDur;
              const pCents = avail ? listPriceCentsAt(pkg, browseDur) : null;
              const locked = !avail && !isSel;
              const qtyVal = mq?.qty ?? 0;

              return (
                <div
                  key={pkg.id}
                  role={isMulti || locked ? undefined : 'button'}
                  tabIndex={isMulti || locked ? undefined : 0}
                  onClick={() => !isMulti && !locked && toggleSingle(pkg)}
                  onKeyDown={(e) => {
                    if (!isMulti && !locked && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      toggleSingle(pkg);
                    }
                  }}
                  className={`flex items-center gap-2 rounded-lg border-[1.5px] bg-white px-2.5 py-2 sm:gap-2.5 sm:px-3 ${
                    locked ? 'cursor-not-allowed opacity-[0.35]' : isMulti ? '' : 'cursor-pointer'
                  } ${isSel ? 'border-[color:var(--acc)] bg-[#fffcf3]' : 'border-[#e8e6e0] hover:border-[color:var(--acc)]'}`}
                  style={{ ['--acc' as string]: ACCENT }}
                >
                  <div
                    className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border-[1.5px] ${
                      isSel ? 'border-transparent' : 'border-stone-300 bg-white'
                    }`}
                    style={isSel ? { backgroundColor: ACCENT } : undefined}
                  >
                    {isSel && (
                      <span
                        className="block h-[6px] w-[9px] -translate-y-px translate-x-px rotate-[-45deg] border-b-[1.5px] border-l-[1.5px] border-white"
                        aria-hidden
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-stone-900">
                      {pkg.name}
                      {isSel && assignedDur != null && (
                        <span
                          className="ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold text-white"
                          style={{ backgroundColor: isDiff ? '#1a5fa0' : ACCENT }}
                        >
                          {pkg.flatRate ? 'flat' : `${assignedDur}M`}
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[10px] text-stone-400">{pkg.subtitle}</div>
                  </div>
                  <div className="flex flex-shrink-0 gap-1">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${KIND_BADGE[pkg.kind]}`}
                    >
                      {KIND_LABEL[pkg.kind]}
                    </span>
                    {pkg.maxDurationMonths != null && !pkg.flatRate && (
                      <span className="rounded bg-[#fde8e8] px-1.5 py-0.5 text-[9px] font-bold text-[#991f1f]">
                        {pkg.maxDurationMonths}M max
                      </span>
                    )}
                  </div>
                  {isMulti ? (
                    <div
                      className="ml-1 flex flex-shrink-0 items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => decMulti(pkg.id)}
                        className="flex h-[22px] w-[22px] items-center justify-center rounded border-[1.5px] bg-white text-[15px] font-bold leading-none"
                        style={{ borderColor: ACCENT, color: ACCENT }}
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>
                      <span className="min-w-[16px] text-center text-xs font-bold">{qtyVal}</span>
                      <button
                        type="button"
                        onClick={() => incMulti(pkg)}
                        className="flex h-[22px] w-[22px] items-center justify-center rounded border-[1.5px] bg-white text-[15px] font-bold leading-none"
                        style={{ borderColor: ACCENT, color: ACCENT }}
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>
                  ) : null}
                  <div className="flex-shrink-0 text-right">
                    {!isMulti ? (
                      locked ? (
                        <span className="text-[11px] text-stone-300">{browseDur}M N/A</span>
                      ) : pCents != null ? (
                        <span className="text-xs font-bold" style={{ color: ACCENT }}>
                          {formatCalcUsd(pCents)}
                        </span>
                      ) : (
                        <span className="text-[11px] text-stone-300">—</span>
                      )
                    ) : pCents != null ? (
                      <span className="text-xs font-bold" style={{ color: ACCENT }}>
                        {formatCalcUsd(pCents)}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border-[1.5px] border-[#e8e6e0] bg-white shadow-sm lg:sticky lg:top-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f0ede6] px-3.5 py-3">
            <span className="text-[13px] font-bold text-stone-900">Package builder</span>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#f7f6f2] px-2 py-0.5 text-[11px] text-stone-500">
                {totalItems} selected
              </span>
              <button
                type="button"
                onClick={clearAll}
                className="text-[11px] text-stone-400 underline hover:text-[color:var(--acc)]"
                style={{ ['--acc' as string]: ACCENT }}
              >
                Clear all
              </button>
            </div>
          </div>

          <div className="min-h-[60px] px-3.5 py-3">
            {cartLines.length === 0 ? (
              <p className="py-5 text-center text-xs italic text-stone-300">
                Select compounds to build your package.
              </p>
            ) : (
              <>
                {totals.rowDetails.map((row, i) => (
                  <div
                    key={`${row.label}-${i}`}
                    className="flex items-baseline justify-between gap-2 border-b border-[#f5f3ee] py-1.5 last:border-b-0"
                  >
                    <span
                      className="min-w-0 flex-1 truncate text-xs text-stone-600"
                      title={row.label}
                    >
                      {row.label}
                      <span className="ml-1 text-[9px] text-stone-300">{row.durLabel}</span>
                    </span>
                    <span className="flex-shrink-0 text-xs font-bold text-stone-900">
                      {row.showStrikethrough && (
                        <span className="mr-1 text-[10px] font-normal text-stone-300 line-through">
                          {formatCalcUsd(row.listCents)}
                        </span>
                      )}
                      {formatCalcUsd(row.discountedCents)}
                    </span>
                  </div>
                ))}
                <div className="my-2.5 h-px bg-stone-200" />
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-xs text-stone-500">Package total</span>
                  <span className="text-[22px] font-bold tracking-tight text-stone-900">
                    {totals.discountSavedCents > 0 && (
                      <span className="mr-1 text-sm font-normal text-stone-300 line-through">
                        {formatCalcUsd(totals.listTotalCents)}
                      </span>
                    )}
                    {formatCalcUsd(totals.discountedTotalCents)}
                  </span>
                </div>
                {totals.discountSavedCents > 0 && (
                  <p className="mb-1 text-xs font-semibold text-emerald-700">
                    Saving {formatCalcUsd(totals.discountSavedCents)} with discounts
                  </p>
                )}
                <p className="mb-3 text-[11px] text-stone-400">
                  ~{formatCalcUsd(totals.monthAvgCents)}/month avg
                </p>
                {(totals.bundleSavedCents > 0 || totals.discountSavedCents > 0) && (
                  <div className="rounded-lg border border-[#e8d98a] bg-[#fffcf0] px-3 py-2.5">
                    <div className="mb-2 text-[9px] font-bold uppercase tracking-wider text-[#a08000]">
                      Savings vs buying at 1-month rate
                    </div>
                    {totals.bundleSavedCents > 0 && (
                      <div className="mb-1 flex justify-between text-xs text-[#7a6000]">
                        <span>Multi-month bundling</span>
                        <span>−{formatCalcUsd(totals.bundleSavedCents)}</span>
                      </div>
                    )}
                    {totals.discountSavedCents > 0 && (
                      <div className="mb-1 flex justify-between text-xs text-[#7a6000]">
                        <span>Discounts applied</span>
                        <span>−{formatCalcUsd(totals.discountSavedCents)}</span>
                      </div>
                    )}
                    {totals.totalSavedCents > 0 && (
                      <div className="mt-1 flex justify-between border-t border-amber-200/50 pt-1 text-xs font-bold text-[#7a6000]">
                        <span>Total saved</span>
                        <span>−{formatCalcUsd(totals.totalSavedCents)}</span>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="border-t border-[#f0ede6] px-3.5 py-3">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-stone-400">
              Apply discounts
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-xs text-stone-600 hover:bg-stone-50">
                <input
                  type="checkbox"
                  checked={disc.military}
                  onChange={(e) => setDisc((d) => ({ ...d, military: e.target.checked }))}
                  className="h-3.5 w-3.5"
                  style={{ accentColor: ACCENT }}
                />
                Military — 5% off all
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-xs text-stone-600 hover:bg-stone-50">
                <input
                  type="checkbox"
                  checked={disc.multiResearch}
                  onChange={(e) => setDisc((d) => ({ ...d, multiResearch: e.target.checked }))}
                  className="h-3.5 w-3.5"
                  style={{ accentColor: ACCENT }}
                />
                Multi-research compound — 10% off 2nd+
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-xs text-stone-600 hover:bg-stone-50">
                <input
                  type="checkbox"
                  checked={disc.order1499}
                  onChange={toggleOrder1499}
                  className="h-3.5 w-3.5"
                  style={{ accentColor: ACCENT }}
                />
                Initial order ≥$1,499 — +5%
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-xs text-stone-600 hover:bg-stone-50">
                <input
                  type="checkbox"
                  checked={disc.order2999}
                  onChange={toggleOrder2999}
                  className="h-3.5 w-3.5"
                  style={{ accentColor: ACCENT }}
                />
                Initial order ≥$2,999 — +10%
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-xs text-stone-600 hover:bg-stone-50">
                <input
                  type="checkbox"
                  checked={disc.loyaltyTier === 't1'}
                  onChange={() => setLoyalty(disc.loyaltyTier === 't1' ? 'none' : 't1')}
                  className="h-3.5 w-3.5"
                  style={{ accentColor: ACCENT }}
                />
                Loyalty tier 1 ($249–$2,999 spent)
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-xs text-stone-600 hover:bg-stone-50">
                <input
                  type="checkbox"
                  checked={disc.loyaltyTier === 't2'}
                  onChange={() => setLoyalty(disc.loyaltyTier === 't2' ? 'none' : 't2')}
                  className="h-3.5 w-3.5"
                  style={{ accentColor: ACCENT }}
                />
                Loyalty tier 2 ($3k–$4,999 spent)
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-xs text-stone-600 hover:bg-stone-50">
                <input
                  type="checkbox"
                  checked={disc.loyaltyTier === 't3'}
                  onChange={() => setLoyalty(disc.loyaltyTier === 't3' ? 'none' : 't3')}
                  className="h-3.5 w-3.5"
                  style={{ accentColor: ACCENT }}
                />
                Loyalty tier 3 ($5k+ spent)
              </label>
            </div>
            <p className="mt-2 px-0.5 text-[10px] italic leading-relaxed text-stone-400">
              Order thresholds are mutually exclusive. Loyalty tiers are mutually exclusive. Loyalty
              discounts require rep at $100K+ total revenue.
            </p>
          </div>
        </div>
      </div>

      <p className="mt-4 text-[10px] text-stone-400">
        List prices sync with{' '}
        <code className="rounded bg-white/80 px-1">ot-retail-packages.ts</code>. For a flat table
        and CSV export, use{' '}
        <a className="underline" style={{ color: ACCENT }} href="/admin/ot-medication-pricing">
          OT medication pricing
        </a>
        .
      </p>
    </div>
  );
}
