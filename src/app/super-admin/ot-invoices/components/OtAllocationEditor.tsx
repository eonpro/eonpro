'use client';

/**
 * OT Manual Reconciliation Editor
 *
 * Renders one collapsible row per sale with editable controls for medications,
 * shipping, TRT telehealth, doctor/Rx fee, fulfillment fees, and free-form
 * custom line items. Live recompute panel shows total deductions and net to
 * OT clinic so the admin can see the effect of each election immediately.
 *
 * State model:
 *   - `rowsState[orderId]` holds the currently-edited payload (in-memory)
 *   - `savedStatus[orderId]` reflects what the server last persisted
 *   - "dirty" = unsaved diff between rowsState and last load
 *
 * Saving / finalizing both POST to `/api/super-admin/ot-overrides`. The PDF
 * download POSTs to `/api/super-admin/ot-overrides/export` and triggers a
 * file download via blob URL.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  Save,
  CheckCircle2,
  RotateCcw,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Download,
  AlertCircle,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';
import { OT_PRODUCT_PRICES } from '@/lib/invoices/ot-pricing';
import {
  computeOtAllocationOverrideTotals,
  reconcileOtAllocationMedLineTotals,
  type OtAllocationOverrideMedLine,
  type OtAllocationOverridePayload,
  type OtAllocationOverrideStatus,
} from '@/services/invoices/otAllocationOverrideTypes';

// ---------------------------------------------------------------------------
// Props (kept minimal — parent owns the date window + raw OtDailyInvoices data)
// ---------------------------------------------------------------------------

export interface OtAllocationEditorPerSaleSeed {
  orderId: number;
  invoiceDbId: number | null;
  paidAt: string | null;
  patientName: string;
  patientId: number;
  /** Computed defaults used when no override exists. */
  defaultPayload: OtAllocationOverridePayload;
}

interface OtAllocationEditorProps {
  startDate: string;
  endDate: string;
  useRange: boolean;
  /** One per sale in the period, ordered by paidAt asc. Parent derives via `buildDefaultOverridePayload`. */
  seeds: OtAllocationEditorPerSaleSeed[];
}

interface SavedMeta {
  status: OtAllocationOverrideStatus;
  updatedAt: string;
  finalizedAt: string | null;
  lastEditedByUserId: number | null;
}

interface OverrideListResponse {
  overrides: Array<{
    orderId: number;
    payload: OtAllocationOverridePayload;
    status: OtAllocationOverrideStatus;
    updatedAt: string;
    finalizedAt: string | null;
    lastEditedByUserId: number | null;
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function centsToInputValue(c: number): string {
  return (c / 100).toFixed(2);
}
function dollarsInputToCents(v: string): number {
  const f = parseFloat(v);
  if (!Number.isFinite(f) || f < 0) return 0;
  return Math.round(f * 100);
}
function centsToDisplay(c: number): string {
  return `$${(c / 100).toFixed(2)}`;
}
function formatPaidEt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York',
  });
}

function deepClonePayload(p: OtAllocationOverridePayload): OtAllocationOverridePayload {
  return {
    ...p,
    meds: p.meds.map((m) => ({ ...m })),
    customLineItems: p.customLineItems.map((c) => ({ ...c })),
  };
}

function payloadsEqual(a: OtAllocationOverridePayload, b: OtAllocationOverridePayload): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OtAllocationEditor({
  startDate,
  endDate,
  useRange,
  seeds,
}: OtAllocationEditorProps) {
  /** Per-orderId in-memory edited payload. */
  const [rowsState, setRowsState] = useState<Record<number, OtAllocationOverridePayload>>({});
  /** Per-orderId persisted state echoed from the server (or absent → COMPUTED). */
  const [savedMeta, setSavedMeta] = useState<Record<number, SavedMeta>>({});
  /** Per-orderId snapshot of the last-saved payload for dirty diffing. */
  const [savedPayload, setSavedPayload] = useState<Record<number, OtAllocationOverridePayload>>({});
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [savingOrderId, setSavingOrderId] = useState<number | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /** Initialize rowsState from seeds whenever the seed set changes. */
  useEffect(() => {
    const next: Record<number, OtAllocationOverridePayload> = {};
    for (const s of seeds) {
      next[s.orderId] = deepClonePayload(s.defaultPayload);
    }
    setRowsState(next);
    setSavedPayload({});
    setSavedMeta({});
    setExpanded({});
  }, [seeds]);

  /** Pull persisted overrides for the period and overlay. */
  useEffect(() => {
    let cancelled = false;
    if (seeds.length === 0) return;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const params = new URLSearchParams({ date: startDate });
        if (useRange && endDate !== startDate) params.set('endDate', endDate);
        const res = await apiFetch(`/api/super-admin/ot-overrides?${params}`);
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(j?.error || `Failed (${res.status})`);
        }
        const json = (await res.json()) as OverrideListResponse;
        if (cancelled) return;
        const meta: Record<number, SavedMeta> = {};
        const saved: Record<number, OtAllocationOverridePayload> = {};
        const overlays: Record<number, OtAllocationOverridePayload> = {};
        for (const r of json.overrides) {
          meta[r.orderId] = {
            status: r.status,
            updatedAt: r.updatedAt,
            finalizedAt: r.finalizedAt,
            lastEditedByUserId: r.lastEditedByUserId,
          };
          saved[r.orderId] = deepClonePayload(r.payload);
          overlays[r.orderId] = deepClonePayload(r.payload);
        }
        setSavedMeta(meta);
        setSavedPayload(saved);
        if (Object.keys(overlays).length > 0) {
          setRowsState((prev) => ({ ...prev, ...overlays }));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load overrides');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, useRange, seeds.length]);

  // -------------------------------------------------------------------------
  // Derived per-row + grand totals (recompute on every keystroke — cheap in cents)
  // -------------------------------------------------------------------------

  const seedsByOrderId = useMemo(() => {
    const m = new Map<number, OtAllocationEditorPerSaleSeed>();
    for (const s of seeds) m.set(s.orderId, s);
    return m;
  }, [seeds]);

  const grandTotals = useMemo(() => {
    let gross = 0;
    let deductions = 0;
    let net = 0;
    let dirtyCount = 0;
    let draftCount = 0;
    let finalizedCount = 0;
    for (const s of seeds) {
      const p = rowsState[s.orderId] ?? s.defaultPayload;
      const t = computeOtAllocationOverrideTotals(p);
      gross += p.patientGrossCents;
      deductions += t.totalDeductionsCents;
      net += t.netToOtClinicCents;
      const meta = savedMeta[s.orderId];
      const sp = savedPayload[s.orderId];
      if (meta?.status === 'DRAFT') draftCount += 1;
      if (meta?.status === 'FINALIZED') finalizedCount += 1;
      if (!sp || !payloadsEqual(p, sp)) dirtyCount += 1;
    }
    return { gross, deductions, net, dirtyCount, draftCount, finalizedCount };
  }, [seeds, rowsState, savedMeta, savedPayload]);

  // -------------------------------------------------------------------------
  // Row mutation helpers
  // -------------------------------------------------------------------------

  const updateRow = useCallback(
    (orderId: number, mutate: (p: OtAllocationOverridePayload) => OtAllocationOverridePayload) => {
      setRowsState((prev) => {
        const cur = prev[orderId];
        if (!cur) return prev;
        return { ...prev, [orderId]: mutate(deepClonePayload(cur)) };
      });
    },
    []
  );

  const resetRowToComputed = useCallback(
    (orderId: number) => {
      const seed = seedsByOrderId.get(orderId);
      if (!seed) return;
      setRowsState((prev) => ({ ...prev, [orderId]: deepClonePayload(seed.defaultPayload) }));
    },
    [seedsByOrderId]
  );

  // -------------------------------------------------------------------------
  // Save / Finalize
  // -------------------------------------------------------------------------

  const saveRow = useCallback(
    async (orderId: number, status: OtAllocationOverrideStatus) => {
      const payload = rowsState[orderId];
      if (!payload) return;
      setSavingOrderId(orderId);
      setError(null);
      try {
        const reconciled = {
          ...payload,
          meds: reconcileOtAllocationMedLineTotals(payload.meds),
        };
        const res = await apiFetch('/api/super-admin/ot-overrides', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, payload: reconciled, status }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(j?.error || `Save failed (${res.status})`);
        }
        const json = (await res.json()) as {
          override: SavedMeta & { orderId: number };
        };
        setSavedMeta((prev) => ({
          ...prev,
          [orderId]: {
            status: json.override.status,
            updatedAt: json.override.updatedAt,
            finalizedAt: json.override.finalizedAt,
            lastEditedByUserId: json.override.lastEditedByUserId,
          },
        }));
        setSavedPayload((prev) => ({ ...prev, [orderId]: deepClonePayload(reconciled) }));
        setRowsState((prev) => ({ ...prev, [orderId]: deepClonePayload(reconciled) }));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Save failed');
      } finally {
        setSavingOrderId(null);
      }
    },
    [rowsState]
  );

  const saveAllDirty = useCallback(async () => {
    setBulkSaving(true);
    setError(null);
    try {
      for (const s of seeds) {
        const cur = rowsState[s.orderId];
        const sp = savedPayload[s.orderId];
        if (!cur) continue;
        if (sp && payloadsEqual(cur, sp)) continue;
        const meta = savedMeta[s.orderId];
        const targetStatus: OtAllocationOverrideStatus =
          meta?.status === 'FINALIZED' ? 'FINALIZED' : 'DRAFT';
        await saveRow(s.orderId, targetStatus);
      }
    } finally {
      setBulkSaving(false);
    }
  }, [seeds, rowsState, savedPayload, savedMeta, saveRow]);

  const downloadPdf = useCallback(async () => {
    setDownloadingPdf(true);
    setError(null);
    try {
      const body: Record<string, string> = { date: startDate, format: 'pdf' };
      if (useRange && endDate !== startDate) body.endDate = endDate;
      const res = await fetch('/api/super-admin/ot-overrides/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error || `PDF failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const slug = useRange && endDate !== startDate ? `${startDate}_${endDate}` : startDate;
      a.download = `ot-manual-reconciliation-${slug}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF download failed');
    } finally {
      setDownloadingPdf(false);
    }
  }, [startDate, endDate, useRange]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (seeds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 py-16 text-center">
        <p className="text-sm text-gray-500">No sales in this period to reconcile.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryTile
          label="Patient gross (sum)"
          value={centsToDisplay(grandTotals.gross)}
          tone="neutral"
        />
        <SummaryTile
          label="Total deductions (manual)"
          value={centsToDisplay(grandTotals.deductions)}
          tone="warning"
        />
        <SummaryTile
          label="Net to OT clinic (manual)"
          value={centsToDisplay(grandTotals.net)}
          tone={grandTotals.net < 0 ? 'negative' : 'positive'}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900">
            {grandTotals.draftCount} draft
          </span>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-900">
            {grandTotals.finalizedCount} finalized
          </span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-700">
            {seeds.length - grandTotals.draftCount - grandTotals.finalizedCount} computed
          </span>
          {grandTotals.dirtyCount > 0 && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-900">
              {grandTotals.dirtyCount} unsaved
            </span>
          )}
          {loading && (
            <span className="flex items-center gap-1 text-gray-500">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading saved overrides…
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={saveAllDirty}
            disabled={bulkSaving || grandTotals.dirtyCount === 0}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {bulkSaving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            Save all drafts ({grandTotals.dirtyCount})
          </button>
          <button
            type="button"
            onClick={downloadPdf}
            disabled={downloadingPdf}
            className="flex items-center gap-1.5 rounded-lg bg-[#4fa77e] px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-[#3d8a65] disabled:opacity-50"
          >
            {downloadingPdf ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Download className="h-3 w-3" />
            )}
            Download PDF
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {seeds.map((seed) => {
          const payload = rowsState[seed.orderId] ?? seed.defaultPayload;
          const totals = computeOtAllocationOverrideTotals(payload);
          const meta = savedMeta[seed.orderId];
          const sp = savedPayload[seed.orderId];
          const isDirty = !sp || !payloadsEqual(payload, sp);
          return (
            <OtAllocationRow
              key={seed.orderId}
              seed={seed}
              payload={payload}
              totals={totals}
              meta={meta ?? null}
              isDirty={isDirty}
              isSaving={savingOrderId === seed.orderId}
              isExpanded={!!expanded[seed.orderId]}
              onToggleExpand={() =>
                setExpanded((prev) => ({ ...prev, [seed.orderId]: !prev[seed.orderId] }))
              }
              onMutate={(m) => updateRow(seed.orderId, m)}
              onReset={() => resetRowToComputed(seed.orderId)}
              onSaveDraft={() => saveRow(seed.orderId, 'DRAFT')}
              onFinalize={() => saveRow(seed.orderId, 'FINALIZED')}
            />
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tiles
// ---------------------------------------------------------------------------

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'neutral' | 'positive' | 'negative' | 'warning';
}) {
  const valueColor =
    tone === 'positive'
      ? 'text-[#4fa77e]'
      : tone === 'negative'
        ? 'text-rose-700'
        : tone === 'warning'
          ? 'text-amber-700'
          : 'text-gray-900';
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${valueColor}`}>{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-sale row
// ---------------------------------------------------------------------------

interface OtAllocationRowProps {
  seed: OtAllocationEditorPerSaleSeed;
  payload: OtAllocationOverridePayload;
  totals: ReturnType<typeof computeOtAllocationOverrideTotals>;
  meta: SavedMeta | null;
  isDirty: boolean;
  isSaving: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onMutate: (m: (p: OtAllocationOverridePayload) => OtAllocationOverridePayload) => void;
  onReset: () => void;
  onSaveDraft: () => void;
  onFinalize: () => void;
}

function OtAllocationRow({
  seed,
  payload,
  totals,
  meta,
  isDirty,
  isSaving,
  isExpanded,
  onToggleExpand,
  onMutate,
  onReset,
  onSaveDraft,
  onFinalize,
}: OtAllocationRowProps) {
  const statusLabel = meta ? meta.status : 'COMPUTED';
  const statusColor =
    meta?.status === 'FINALIZED'
      ? 'bg-emerald-100 text-emerald-900'
      : meta?.status === 'DRAFT'
        ? 'bg-amber-100 text-amber-900'
        : 'bg-gray-100 text-gray-600';

  return (
    <div
      className={`rounded-2xl border bg-white shadow-sm transition-colors ${
        isDirty ? 'border-blue-300' : 'border-gray-100'
      }`}
    >
      <button
        type="button"
        onClick={onToggleExpand}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50/60"
      >
        <div className="flex min-w-0 items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-400" />
          ) : (
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">{seed.patientName}</p>
            <p className="text-xs text-gray-500">
              {formatPaidEt(seed.paidAt)} · Order #{seed.orderId}
              {seed.invoiceDbId ? ` · Inv ${seed.invoiceDbId}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-3">
          <div className="hidden text-right text-xs text-gray-500 sm:block">
            <span className="font-semibold tabular-nums text-gray-900">
              {centsToDisplay(payload.patientGrossCents)}
            </span>{' '}
            gross
          </div>
          <div className="hidden text-right text-xs text-gray-500 sm:block">
            <span
              className={`font-semibold tabular-nums ${totals.netToOtClinicCents < 0 ? 'text-rose-700' : 'text-[#4fa77e]'}`}
            >
              {centsToDisplay(totals.netToOtClinicCents)}
            </span>{' '}
            net
          </div>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor}`}>
            {statusLabel}
          </span>
          {isDirty && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-900">
              Unsaved
            </span>
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-gray-100 px-4 py-4">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="flex flex-col gap-5 lg:col-span-2">
              <MedicationsEditor payload={payload} onMutate={onMutate} />
              <FeesEditor payload={payload} onMutate={onMutate} />
              <CustomLinesEditor payload={payload} onMutate={onMutate} />
              <NotesEditor payload={payload} onMutate={onMutate} />
            </div>
            <div className="flex flex-col gap-3">
              <TotalsPanel patientGross={payload.patientGrossCents} totals={totals} />
              <RowActions
                isSaving={isSaving}
                isDirty={isDirty}
                isFinalized={meta?.status === 'FINALIZED'}
                onReset={onReset}
                onSaveDraft={onSaveDraft}
                onFinalize={onFinalize}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-editors
// ---------------------------------------------------------------------------

function MedicationsEditor({
  payload,
  onMutate,
}: {
  payload: OtAllocationOverridePayload;
  onMutate: (m: (p: OtAllocationOverridePayload) => OtAllocationOverridePayload) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');

  const filteredCatalog = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return OT_PRODUCT_PRICES.slice(0, 50);
    return OT_PRODUCT_PRICES.filter((p) =>
      `${p.name} ${p.strength} ${p.vialSize}`.toLowerCase().includes(q)
    ).slice(0, 50);
  }, [pickerQuery]);

  const addCatalogMed = (productId: number) => {
    const row = OT_PRODUCT_PRICES.find((p) => p.productId === productId);
    if (!row) return;
    onMutate((p) => ({
      ...p,
      meds: [
        ...p.meds,
        {
          medicationKey: String(row.productId),
          name: row.name,
          strength: row.strength,
          vialSize: row.vialSize,
          quantity: 1,
          unitPriceCents: row.priceCents,
          lineTotalCents: row.priceCents,
          source: 'catalog',
        },
      ],
    }));
    setPickerOpen(false);
    setPickerQuery('');
  };

  const addCustomMed = () => {
    onMutate((p) => ({
      ...p,
      meds: [
        ...p.meds,
        {
          medicationKey: null,
          name: 'Custom medication',
          strength: '',
          vialSize: '',
          quantity: 1,
          unitPriceCents: 0,
          lineTotalCents: 0,
          source: 'custom',
        },
      ],
    }));
    setPickerOpen(false);
    setPickerQuery('');
  };

  const updateMedAt = (idx: number, patch: Partial<OtAllocationOverrideMedLine>) => {
    onMutate((p) => {
      const next = [...p.meds];
      const cur = next[idx];
      const merged: OtAllocationOverrideMedLine = { ...cur, ...patch };
      merged.lineTotalCents = merged.unitPriceCents * merged.quantity;
      next[idx] = merged;
      return { ...p, meds: next };
    });
  };

  const removeMed = (idx: number) => {
    onMutate((p) => ({ ...p, meds: p.meds.filter((_, i) => i !== idx) }));
  };

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Medications ({payload.meds.length})
        </h4>
        <div className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <Plus className="h-3 w-3" /> Add medication
          </button>
          {pickerOpen && (
            <div className="absolute right-0 top-9 z-20 w-[420px] rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
              <input
                type="text"
                autoFocus
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                placeholder="Search OT pricing catalog…"
                className="mb-2 w-full rounded-md border border-gray-200 px-2 py-1 text-xs focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
              />
              <div className="max-h-64 overflow-y-auto">
                {filteredCatalog.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-gray-500">No catalog matches.</p>
                ) : (
                  <ul className="flex flex-col">
                    {filteredCatalog.map((row) => (
                      <li key={row.productId}>
                        <button
                          type="button"
                          onClick={() => addCatalogMed(row.productId)}
                          className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-gray-50"
                        >
                          <span className="truncate">
                            <span className="font-semibold">{row.name}</span>{' '}
                            <span className="text-gray-500">{row.strength}</span>{' '}
                            <span className="text-gray-400">{row.vialSize}</span>
                          </span>
                          <span className="font-mono tabular-nums text-gray-700">
                            {centsToDisplay(row.priceCents)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                type="button"
                onClick={addCustomMed}
                className="mt-2 w-full rounded-md border border-dashed border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                + Add custom (free-form)
              </button>
            </div>
          )}
        </div>
      </div>
      {payload.meds.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-xs text-gray-500">
          No medications selected. Use Add medication to pull from the OT catalog or add a custom
          line.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {payload.meds.map((m, idx) => (
            <li
              key={idx}
              className="grid grid-cols-12 items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2"
            >
              <input
                type="text"
                value={m.name}
                onChange={(e) => updateMedAt(idx, { name: e.target.value })}
                className="col-span-3 rounded-md border border-gray-200 px-2 py-1 text-xs"
                placeholder="Name"
              />
              <input
                type="text"
                value={m.strength}
                onChange={(e) => updateMedAt(idx, { strength: e.target.value })}
                className="col-span-2 rounded-md border border-gray-200 px-2 py-1 text-xs"
                placeholder="Strength"
              />
              <input
                type="text"
                value={m.vialSize}
                onChange={(e) => updateMedAt(idx, { vialSize: e.target.value })}
                className="col-span-2 rounded-md border border-gray-200 px-2 py-1 text-xs"
                placeholder="Vial"
              />
              <input
                type="number"
                min={1}
                value={m.quantity}
                onChange={(e) =>
                  updateMedAt(idx, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })
                }
                className="col-span-1 rounded-md border border-gray-200 px-2 py-1 text-right text-xs tabular-nums"
              />
              <input
                type="number"
                min={0}
                step={0.01}
                value={centsToInputValue(m.unitPriceCents)}
                onChange={(e) =>
                  updateMedAt(idx, { unitPriceCents: dollarsInputToCents(e.target.value) })
                }
                className="col-span-2 rounded-md border border-gray-200 px-2 py-1 text-right text-xs tabular-nums"
              />
              <span className="col-span-1 text-right text-xs font-semibold tabular-nums text-gray-900">
                {centsToDisplay(m.lineTotalCents)}
              </span>
              <button
                type="button"
                onClick={() => removeMed(idx)}
                className="col-span-1 flex justify-end text-rose-500 hover:text-rose-700"
                aria-label="Remove medication"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FeesEditor({
  payload,
  onMutate,
}: {
  payload: OtAllocationOverridePayload;
  onMutate: (m: (p: OtAllocationOverridePayload) => OtAllocationOverridePayload) => void;
}) {
  return (
    <section>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Fees</h4>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FeeWithChips
          label="Shipping"
          value={payload.shippingCents}
          chips={[
            { label: 'Standard $20', cents: 2000 },
            { label: 'Premium $30', cents: 3000 },
            { label: 'Free $0', cents: 0 },
          ]}
          onChange={(c) => onMutate((p) => ({ ...p, shippingCents: c }))}
        />
        <FeeWithChips
          label="TRT telehealth"
          value={payload.trtTelehealthCents}
          chips={[
            { label: 'TRT $50', cents: 5000 },
            { label: 'None $0', cents: 0 },
          ]}
          onChange={(c) => onMutate((p) => ({ ...p, trtTelehealthCents: c }))}
        />
        <FeeWithChips
          label="Doctor / Rx fee"
          value={payload.doctorRxFeeCents}
          chips={[
            { label: 'Async $30', cents: 3000 },
            { label: 'Sync $50', cents: 5000 },
            { label: 'Waived $0', cents: 0 },
          ]}
          onChange={(c) => onMutate((p) => ({ ...p, doctorRxFeeCents: c }))}
        />
        <FeeWithChips
          label="Fulfillment fees"
          value={payload.fulfillmentFeesCents}
          chips={[
            { label: '$5', cents: 500 },
            { label: '$0', cents: 0 },
          ]}
          onChange={(c) => onMutate((p) => ({ ...p, fulfillmentFeesCents: c }))}
        />
      </div>
    </section>
  );
}

function FeeWithChips({
  label,
  value,
  chips,
  onChange,
}: {
  label: string;
  value: number;
  chips: { label: string; cents: number }[];
  onChange: (cents: number) => void;
}) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-700">{label}</span>
        <input
          type="number"
          min={0}
          step={0.01}
          value={centsToInputValue(value)}
          onChange={(e) => onChange(dollarsInputToCents(e.target.value))}
          className="w-24 rounded-md border border-gray-200 px-2 py-1 text-right text-xs tabular-nums"
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {chips.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => onChange(c.cents)}
            className={`rounded-full px-2 py-0.5 text-xs ${
              value === c.cents
                ? 'bg-[#4fa77e] text-white'
                : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CustomLinesEditor({
  payload,
  onMutate,
}: {
  payload: OtAllocationOverridePayload;
  onMutate: (m: (p: OtAllocationOverridePayload) => OtAllocationOverridePayload) => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Custom line items ({payload.customLineItems.length})
        </h4>
        <button
          type="button"
          onClick={() =>
            onMutate((p) => ({
              ...p,
              customLineItems: [...p.customLineItems, { description: '', amountCents: 0 }],
            }))
          }
          className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          <Plus className="h-3 w-3" /> Add line
        </button>
      </div>
      {payload.customLineItems.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
          No custom line items. Add one for special charges (consult, comp, special handling…).
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {payload.customLineItems.map((c, idx) => (
            <li
              key={idx}
              className="grid grid-cols-12 items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2"
            >
              <input
                type="text"
                value={c.description}
                onChange={(e) =>
                  onMutate((p) => {
                    const next = [...p.customLineItems];
                    next[idx] = { ...next[idx], description: e.target.value };
                    return { ...p, customLineItems: next };
                  })
                }
                className="col-span-9 rounded-md border border-gray-200 px-2 py-1 text-xs"
                placeholder="Description (e.g. Comp shipping, Manager override)"
              />
              <input
                type="number"
                min={0}
                step={0.01}
                value={centsToInputValue(c.amountCents)}
                onChange={(e) =>
                  onMutate((p) => {
                    const next = [...p.customLineItems];
                    next[idx] = { ...next[idx], amountCents: dollarsInputToCents(e.target.value) };
                    return { ...p, customLineItems: next };
                  })
                }
                className="col-span-2 rounded-md border border-gray-200 px-2 py-1 text-right text-xs tabular-nums"
              />
              <button
                type="button"
                onClick={() =>
                  onMutate((p) => ({
                    ...p,
                    customLineItems: p.customLineItems.filter((_, i) => i !== idx),
                  }))
                }
                className="col-span-1 flex justify-end text-rose-500 hover:text-rose-700"
                aria-label="Remove line item"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NotesEditor({
  payload,
  onMutate,
}: {
  payload: OtAllocationOverridePayload;
  onMutate: (m: (p: OtAllocationOverridePayload) => OtAllocationOverridePayload) => void;
}) {
  return (
    <section>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Notes (optional, max 1000 chars — no PHI)
      </h4>
      <textarea
        value={payload.notes ?? ''}
        onChange={(e) =>
          onMutate((p) => ({
            ...p,
            notes: e.target.value.length > 0 ? e.target.value.slice(0, 1000) : null,
          }))
        }
        className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs"
        rows={2}
        placeholder="Reconciliation context for this sale (e.g. comp'd shipping per CFO, refund scheduled)"
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Right-rail totals + row actions
// ---------------------------------------------------------------------------

function TotalsPanel({
  patientGross,
  totals,
}: {
  patientGross: number;
  totals: ReturnType<typeof computeOtAllocationOverrideTotals>;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50/40 p-4">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Live totals
      </h4>
      <div className="flex flex-col gap-1 text-xs tabular-nums">
        <RowKv label="Patient gross" value={patientGross} bold />
        <RowKv label="Medications" value={totals.medicationsCents} negative />
        <RowKv label="Shipping" value={totals.shippingCents} negative />
        <RowKv label="TRT telehealth" value={totals.trtTelehealthCents} negative />
        <RowKv label="Doctor / Rx fee" value={totals.doctorRxFeeCents} negative />
        <RowKv label="Fulfillment" value={totals.fulfillmentFeesCents} negative />
        <RowKv label="Custom lines" value={totals.customLineItemsCents} negative />
        <div className="my-1 h-px bg-gray-200" />
        <RowKv label="Total deductions" value={totals.totalDeductionsCents} bold negative />
        <RowKv
          label="Net to OT clinic"
          value={totals.netToOtClinicCents}
          bold
          tone={totals.netToOtClinicCents < 0 ? 'negative' : 'positive'}
        />
      </div>
    </div>
  );
}

function RowKv({
  label,
  value,
  bold,
  negative,
  tone,
}: {
  label: string;
  value: number;
  bold?: boolean;
  negative?: boolean;
  tone?: 'positive' | 'negative';
}) {
  const valueColor =
    tone === 'positive'
      ? 'text-[#4fa77e]'
      : tone === 'negative'
        ? 'text-rose-700'
        : negative
          ? 'text-gray-700'
          : 'text-gray-900';
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? 'font-semibold text-gray-900' : 'text-gray-600'}>{label}</span>
      <span className={`${bold ? 'font-bold' : 'font-medium'} ${valueColor}`}>
        {negative && value > 0 && tone !== 'negative' ? '−' : ''}
        {centsToDisplay(value)}
      </span>
    </div>
  );
}

function RowActions({
  isSaving,
  isDirty,
  isFinalized,
  onReset,
  onSaveDraft,
  onFinalize,
}: {
  isSaving: boolean;
  isDirty: boolean;
  isFinalized: boolean;
  onReset: () => void;
  onSaveDraft: () => void;
  onFinalize: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onSaveDraft}
        disabled={isSaving}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
      >
        {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
        {isFinalized ? 'Save (already finalized)' : 'Save draft'}
        {isDirty && !isSaving && <span className="text-blue-600">•</span>}
      </button>
      <button
        type="button"
        onClick={onFinalize}
        disabled={isSaving}
        className="flex items-center justify-center gap-1.5 rounded-lg bg-[#4fa77e] px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-[#3d8a65] disabled:opacity-50"
      >
        {isSaving ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <CheckCircle2 className="h-3 w-3" />
        )}
        Finalize
      </button>
      <button
        type="button"
        onClick={onReset}
        disabled={isSaving}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
      >
        <RotateCcw className="h-3 w-3" />
        Reset to computed
      </button>
    </div>
  );
}
