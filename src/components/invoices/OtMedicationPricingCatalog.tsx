'use client';

import React, { useMemo, useState, useCallback } from 'react';
import { Search, Download, Copy, Check, ListChecks } from 'lucide-react';
import {
  OT_RETAIL_PACKAGES,
  type OtRetailPackage,
  type OtRetailPackageCategory,
  formatOtRetailUsd,
  filterOtRetailPackages,
  exportOtRetailPackagesCsv,
  getOtRetailPackagePriceCents,
  OT_RETAIL_CATEGORY_LABELS,
} from '@/lib/invoices/ot-retail-packages';

type BillingPreference = 'all' | 'one_month' | 'three_month' | 'six_month' | 'twelve_month';

const KIND_CLASS: Record<OtRetailPackage['kind'], string> = {
  bundle: 'bg-amber-100 text-amber-900',
  rx: 'bg-sky-100 text-sky-900',
  research: 'bg-violet-100 text-violet-900',
  glp: 'bg-pink-100 text-pink-900',
};

function rowSummaryLine(pkg: OtRetailPackage, pref: BillingPreference): string {
  const parts: string[] = [pkg.name];
  const add = (months: 1 | 3 | 6 | 12, label: string) => {
    const p = getOtRetailPackagePriceCents(pkg, months);
    if (p != null) parts.push(`${label}: ${formatOtRetailUsd(p)}`);
  };
  if (pref === 'all' || pref === 'one_month') add(1, '1mo');
  if (pref === 'all' || pref === 'three_month') add(3, '3mo');
  if (pref === 'all' || pref === 'six_month') add(6, '6mo');
  if (pref === 'all' || pref === 'twelve_month') add(12, '12mo');
  return parts.join(' | ');
}

function flagSummary(p: OtRetailPackage): string {
  const bits: string[] = [];
  if (p.maxDurationMonths) bits.push(`${p.maxDurationMonths}mo max`);
  if (p.flatRate) bits.push('flat');
  if (p.allowsMultipleQuantity) bits.push('qty+');
  return bits.length ? bits.join(' · ') : '—';
}

export interface OtMedicationPricingCatalogProps {
  /** When true, show compact padding for embedding in super-admin tabs */
  embedded?: boolean;
}

export function OtMedicationPricingCatalog({ embedded = false }: OtMedicationPricingCatalogProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<OtRetailPackageCategory | 'all'>('all');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [billingPref, setBillingPref] = useState<BillingPreference>('all');
  const [copied, setCopied] = useState(false);

  const filtered = useMemo(() => {
    const q = filterOtRetailPackages(OT_RETAIL_PACKAGES, query);
    if (category === 'all') return q;
    return q.filter((p) => p.category === category);
  }, [query, category]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelected(new Set(filtered.map((r) => r.id)));
  }, [filtered]);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const copySelected = useCallback(async () => {
    const rows = OT_RETAIL_PACKAGES.filter((r) => selected.has(r.id));
    if (rows.length === 0) return;
    const text = rows.map((r) => rowSummaryLine(r, billingPref)).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [selected, billingPref]);

  const downloadCsv = useCallback(() => {
    const csv = exportOtRetailPackagesCsv(filtered);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ot-retail-packages-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [filtered]);

  const pad = embedded ? 'py-2' : 'py-4';

  return (
    <div className={`space-y-4 ${pad}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Search packages, subtitles, ids…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['all', 'bundles', 'rx', 'research', 'glp'] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                category === c
                  ? 'bg-[#C9A84C] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {OT_RETAIL_CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-gray-500">Copy selected lines include:</span>
        {(
          [
            ['all', 'All durations quoted'],
            ['one_month', '1 mo only'],
            ['three_month', '3 mo only'],
            ['six_month', '6 mo only'],
            ['twelve_month', '12 mo only'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setBillingPref(k)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              billingPref === k
                ? 'bg-[#4fa77e] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={selectAllVisible}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <ListChecks className="h-3.5 w-3.5" />
          Select visible ({filtered.length})
        </button>
        <button
          type="button"
          onClick={clearSelection}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={copySelected}
          disabled={selected.size === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-40"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          Copy selected ({selected.size})
        </button>
        <button
          type="button"
          onClick={downloadCsv}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <Download className="h-3.5 w-3.5" />
          Download CSV ({filtered.length})
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <th className="w-10 px-2 py-3" />
              <th className="px-3 py-3">Package</th>
              <th className="px-3 py-3">Subtitle</th>
              <th className="px-3 py-3">Type</th>
              <th className="px-3 py-3 text-right">1 mo</th>
              <th className="px-3 py-3 text-right">3 mo</th>
              <th className="px-3 py-3 text-right">6 mo</th>
              <th className="px-3 py-3 text-right">12 mo</th>
              <th className="px-3 py-3">Flags</th>
              <th className="px-3 py-3">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((row) => (
              <tr
                key={row.id}
                className={selected.has(row.id) ? 'bg-[#C9A84C]/10' : 'hover:bg-gray-50'}
              >
                <td className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={() => toggle(row.id)}
                    className="rounded border-gray-300 text-[#C9A84C] focus:ring-[#C9A84C]"
                    aria-label={`Select ${row.name}`}
                  />
                </td>
                <td className="max-w-[220px] px-3 py-2 font-medium text-gray-900">{row.name}</td>
                <td className="max-w-[200px] px-3 py-2 text-xs text-gray-600">{row.subtitle}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${KIND_CLASS[row.kind]}`}
                  >
                    {row.kind}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  {formatOtRetailUsd(getOtRetailPackagePriceCents(row, 1))}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-medium">
                  {formatOtRetailUsd(getOtRetailPackagePriceCents(row, 3))}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  {formatOtRetailUsd(getOtRetailPackagePriceCents(row, 6))}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  {formatOtRetailUsd(getOtRetailPackagePriceCents(row, 12))}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-600">{flagSummary(row)}</td>
                <td className="max-w-[160px] px-3 py-2 text-xs text-gray-500">{row.notes ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-gray-400">No rows match your search.</p>
        )}
      </div>
      <p className="text-xs text-gray-400">
        Retail packages match the OT Men&apos;s Health pricing calculator (6/12 mo tiers use 3% savings per step).
        Selections are for quoting and building Stripe lines — they do not change Lifefile COGS. Source:{' '}
        <code className="rounded bg-gray-100 px-1">ot-retail-packages.ts</code>.
      </p>
    </div>
  );
}
