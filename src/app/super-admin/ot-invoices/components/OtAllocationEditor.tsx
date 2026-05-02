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
  Package as PackageIcon,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';
import { OT_PRODUCT_PRICES } from '@/lib/invoices/ot-pricing';
import {
  OT_PACKAGE_CATALOG,
  OT_PACKAGE_TIER_LABELS,
  OT_DOCTOR_CONSULT_CHIPS,
  OT_SHIPPING_CHIPS,
  getOtPackageQuoteAtTier,
  type OtPackageCatalogRow,
  type OtPackageTier,
} from '@/lib/invoices/ot-package-catalog';
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
  /** Patient-facing product description (what they paid for). */
  productDescription: string | null;
  /**
   * True when the patient had a paid Rx invoice at this clinic within the last
   * 30 days. Drives the row-header "New 8%" / "Rebill 1%" badge and the
   * default commission rate in `defaultPayload.commissionRateBps`.
   */
  isRebill: boolean;
  /** Computed defaults used when no override exists. */
  defaultPayload: OtAllocationOverridePayload;
}

interface SalesRepOption {
  id: number;
  name: string;
  role: string;
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
  /** Set when the API returned an empty list because the schema isn't migrated yet. */
  warning?: string;
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
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reps, setReps] = useState<SalesRepOption[]>([]);

  /** Load the sales rep dropdown options once on mount. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/super-admin/ot-overrides/sales-reps');
        if (!res.ok) return;
        const json = (await res.json()) as { reps: SalesRepOption[] };
        if (!cancelled) setReps(json.reps);
      } catch {
        /* silent — rep dropdown stays empty; admin can still type a custom name */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    setWarning(null);
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
        if (json.warning) setWarning(json.warning);
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
      {warning && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {warning}
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
              reps={reps}
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
  reps: SalesRepOption[];
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
  reps,
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
            {seed.productDescription && (
              <p
                className="mt-0.5 truncate text-xs font-medium text-emerald-800"
                title={seed.productDescription}
              >
                Paid for: {seed.productDescription}
              </p>
            )}
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
          <SaleTypeBadge isRebill={seed.isRebill} />
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
              <PackageQuickFill payload={payload} onMutate={onMutate} />
              <MedicationsEditor payload={payload} onMutate={onMutate} />
              <FeesEditor payload={payload} onMutate={onMutate} />
              <SalesRepEditor payload={payload} onMutate={onMutate} reps={reps} />
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

/**
 * One-click pre-fill from the OT package catalog. Selecting `<package> @ <tier>`
 * REPLACES the meds row with a single line at the package's pharmacy cost,
 * and sets shipping + doctor consult to the package's defaults. Custom line
 * items, notes, and patient gross are left alone.
 */
function PackageQuickFill({
  payload,
  onMutate,
}: {
  payload: OtAllocationOverridePayload;
  onMutate: (m: (p: OtAllocationOverridePayload) => OtAllocationOverridePayload) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedPkg, setSelectedPkg] = useState<OtPackageCatalogRow | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return OT_PACKAGE_CATALOG.slice(0, 30);
    return OT_PACKAGE_CATALOG.filter((p) =>
      `${p.name} ${p.subtitle ?? ''} ${p.category}`.toLowerCase().includes(q)
    ).slice(0, 30);
  }, [query]);

  const applyAtTier = (pkg: OtPackageCatalogRow, tier: OtPackageTier) => {
    const quote = getOtPackageQuoteAtTier(pkg, tier);
    if (!quote) return;
    onMutate((p) => ({
      ...p,
      meds: [
        {
          medicationKey: null,
          name: pkg.name,
          strength: pkg.subtitle ?? '',
          vialSize: OT_PACKAGE_TIER_LABELS[tier],
          quantity: 1,
          unitPriceCents: quote.costCents,
          lineTotalCents: quote.costCents,
          source: 'catalog' as const,
          commissionRateBps: null,
        },
      ],
      shippingCents: pkg.defaultShippingCents,
      doctorRxFeeCents: pkg.defaultConsultCents,
    }));
    setOpen(false);
    setSelectedPkg(null);
    setQuery('');
  };

  return (
    <section className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PackageIcon className="h-4 w-4 text-emerald-700" />
          <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-900">
            Apply package
          </h4>
          <span className="text-[11px] text-emerald-800/80">
            One-click prefill from the OT pricing sheet
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            setSelectedPkg(null);
            setQuery('');
          }}
          className="rounded-lg border border-emerald-300 bg-white px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-50"
        >
          {open ? 'Close' : 'Choose package…'}
        </button>
      </div>
      {open && (
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div>
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search packages, bundles, or research peptides…"
              className="mb-2 w-full rounded-md border border-gray-200 px-2 py-1 text-xs focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
            />
            <div className="max-h-72 overflow-y-auto rounded-md border border-gray-100 bg-white">
              {matches.length === 0 ? (
                <p className="px-3 py-3 text-xs text-gray-500">No matches.</p>
              ) : (
                <ul className="flex flex-col">
                  {matches.map((pkg) => (
                    <li key={pkg.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedPkg(pkg)}
                        className={`flex w-full flex-col items-start gap-0.5 px-2.5 py-1.5 text-left text-xs hover:bg-emerald-50 ${
                          selectedPkg?.id === pkg.id ? 'bg-emerald-100' : ''
                        }`}
                      >
                        <span className="font-medium text-gray-900">{pkg.name}</span>
                        {pkg.subtitle && (
                          <span className="text-[11px] text-gray-500">{pkg.subtitle}</span>
                        )}
                        <span className="text-[10px] uppercase tracking-wider text-emerald-800/70">
                          {pkg.category}
                          {pkg.researchOnly ? ' · research only' : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="rounded-md border border-gray-100 bg-white p-3">
            {selectedPkg ? (
              <PackageTierSelector pkg={selectedPkg} onApply={applyAtTier} />
            ) : (
              <p className="text-xs text-gray-500">
                Select a package on the left to choose a tier and apply.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function PackageTierSelector({
  pkg,
  onApply,
}: {
  pkg: OtPackageCatalogRow;
  onApply: (pkg: OtPackageCatalogRow, tier: OtPackageTier) => void;
}) {
  const tiers: OtPackageTier[] = [1, 3, 6, 12];
  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-xs font-semibold text-gray-900">{pkg.name}</p>
        {pkg.subtitle && <p className="text-[11px] text-gray-500">{pkg.subtitle}</p>}
        <p className="mt-1 text-[11px] text-gray-500">
          Defaults: doctor {centsToDisplay(pkg.defaultConsultCents)} · shipping{' '}
          {centsToDisplay(pkg.defaultShippingCents)}
        </p>
      </div>
      <ul className="flex flex-col gap-1">
        {tiers.map((tier) => {
          const quote = getOtPackageQuoteAtTier(pkg, tier);
          const offered = quote != null;
          return (
            <li key={tier}>
              <button
                type="button"
                disabled={!offered}
                onClick={() => offered && onApply(pkg, tier)}
                className={`flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs ${
                  offered
                    ? 'border-emerald-200 bg-white hover:border-emerald-400 hover:bg-emerald-50'
                    : 'cursor-not-allowed border-gray-100 bg-gray-50 text-gray-400'
                }`}
              >
                <span className="font-semibold">{OT_PACKAGE_TIER_LABELS[tier]}</span>
                {offered ? (
                  <span className="flex items-center gap-3 tabular-nums">
                    <span className="text-gray-700">
                      Retail{' '}
                      <span className="font-semibold text-gray-900">
                        {centsToDisplay(quote.retailCents)}
                      </span>
                    </span>
                    <span className="text-gray-700">
                      Cost{' '}
                      <span className="font-semibold text-emerald-700">
                        {centsToDisplay(quote.costCents)}
                      </span>
                    </span>
                  </span>
                ) : (
                  <span className="text-[11px] uppercase">Not offered</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-[10px] text-gray-500">
        Applying replaces the medications list with one line at the package&apos;s pharmacy cost and
        sets shipping + doctor consult to the package defaults. Patient gross is unchanged.
      </p>
    </div>
  );
}

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
          commissionRateBps: null,
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
          commissionRateBps: null,
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
              className="flex flex-col gap-1.5 rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2"
            >
              <div className="grid grid-cols-12 items-center gap-2">
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
              </div>
              <MedCommissionRateRow
                med={m}
                onSetRate={(bps) => updateMedAt(idx, { commissionRateBps: bps })}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Per-medication commission rate row. Displayed as a thin band beneath each med
 * line so the admin can opt-in to a rep commission % per item without inflating
 * the main row. "—" = no rate set; the line contributes $0 to commission.
 */
function MedCommissionRateRow({
  med,
  onSetRate,
}: {
  med: OtAllocationOverrideMedLine;
  onSetRate: (bps: number | null) => void;
}) {
  const chips: Array<{ label: string; bps: number | null }> = [
    { label: 'No %', bps: null },
    { label: '1%', bps: 100 },
    { label: '8%', bps: 800 },
  ];
  const lineCommissionCents =
    med.commissionRateBps != null && med.commissionRateBps > 0
      ? Math.round((med.lineTotalCents * med.commissionRateBps) / 10_000)
      : 0;
  return (
    <div className="flex flex-wrap items-center gap-2 pl-1 text-[11px] text-gray-600">
      <span className="font-medium uppercase tracking-wider text-gray-400">Rep %</span>
      {chips.map((c) => {
        const active =
          (c.bps == null && med.commissionRateBps == null) ||
          (c.bps != null && med.commissionRateBps === c.bps);
        return (
          <button
            key={c.label}
            type="button"
            onClick={() => onSetRate(c.bps)}
            className={`rounded-full px-2 py-0.5 ${
              active
                ? 'bg-cyan-600 text-white'
                : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {c.label}
          </button>
        );
      })}
      <input
        type="number"
        min={0}
        max={50}
        step={0.5}
        value={med.commissionRateBps != null ? (med.commissionRateBps / 100).toFixed(2) : ''}
        placeholder="custom %"
        onChange={(e) => {
          const v = e.target.value.trim();
          if (v === '') {
            onSetRate(null);
            return;
          }
          const pct = parseFloat(v);
          if (!Number.isFinite(pct) || pct < 0) return;
          onSetRate(Math.round(Math.min(pct, 50) * 100));
        }}
        className="w-16 rounded-md border border-gray-200 px-2 py-0.5 text-right text-[11px] tabular-nums"
      />
      {lineCommissionCents > 0 && (
        <span className="ml-auto font-semibold text-cyan-700">
          = {centsToDisplay(lineCommissionCents)}
        </span>
      )}
    </div>
  );
}

/**
 * Small inline badge that tells the admin whether a sale was auto-classified as
 * NEW (8%) or a REBILL (1%) — patient had a prior paid Rx within last 30 days.
 * Surfaced in the row header so the rate is visible without expanding.
 */
function SaleTypeBadge({ isRebill }: { isRebill: boolean }) {
  if (isRebill) {
    return (
      <span
        title="Patient had a paid Rx within the last 30 days. Auto rate: 1%."
        className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900"
      >
        Rebill · 1%
      </span>
    );
  }
  return (
    <span
      title="No paid Rx in the last 30 days. Auto rate: 8%."
      className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900"
    >
      New · 8%
    </span>
  );
}

function SalesRepEditor({
  payload,
  onMutate,
  reps,
}: {
  payload: OtAllocationOverridePayload;
  onMutate: (m: (p: OtAllocationOverridePayload) => OtAllocationOverridePayload) => void;
  reps: SalesRepOption[];
}) {
  const medsTotalCents = payload.meds.reduce((s, m) => s + m.lineTotalCents, 0);
  const grossMinusCogsCents = Math.max(0, payload.patientGrossCents - medsTotalCents);
  const payloadRateBps = payload.commissionRateBps ?? null;
  const hasAutoRate = payloadRateBps !== null && payloadRateBps > 0;
  const autoRateCommission = hasAutoRate
    ? Math.round((grossMinusCogsCents * (payloadRateBps as number)) / 10_000)
    : 0;
  const totalLineCommission = payload.meds.reduce((s, m) => {
    if (m.commissionRateBps == null || m.commissionRateBps <= 0) return s;
    return s + Math.round((m.lineTotalCents * m.commissionRateBps) / 10_000);
  }, 0);
  const usingManualOverride = payload.salesRepCommissionCentsOverride !== null;
  let effectiveCommission: number;
  if (usingManualOverride) {
    effectiveCommission = payload.salesRepCommissionCentsOverride as number;
  } else if (hasAutoRate) {
    effectiveCommission = autoRateCommission;
  } else {
    effectiveCommission = totalLineCommission;
  }
  let ratePercentLabel: string | null = null;
  if (payloadRateBps !== null) {
    const decimals = payloadRateBps % 100 === 0 ? 0 : 1;
    ratePercentLabel = `${(payloadRateBps / 100).toFixed(decimals)}%`;
  }

  return (
    <section className="rounded-lg border border-cyan-100 bg-cyan-50/30 p-3">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-cyan-900">
        Sales rep & commission
      </h4>
      {hasAutoRate && !usingManualOverride && (
        <p className="mb-2 text-[11px] text-cyan-900">
          <span className="font-semibold">Auto rate:</span> {ratePercentLabel} × (gross{' '}
          {centsToDisplay(payload.patientGrossCents)} − COGS {centsToDisplay(medsTotalCents)}) ={' '}
          <span className="font-semibold tabular-nums">{centsToDisplay(autoRateCommission)}</span>
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-gray-500">
            Assigned rep
          </label>
          <select
            value={payload.salesRepId ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '') {
                onMutate((p) => ({ ...p, salesRepId: null, salesRepName: null }));
                return;
              }
              const id = parseInt(v, 10);
              const match = reps.find((r) => r.id === id);
              onMutate((p) => ({
                ...p,
                salesRepId: id,
                salesRepName: match?.name ?? p.salesRepName ?? `User #${id}`,
              }));
            }}
            className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs"
          >
            <option value="">— No rep assigned —</option>
            {reps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.role})
              </option>
            ))}
          </select>
          {payload.salesRepId != null && payload.salesRepName && (
            <p className="mt-1 text-[10px] text-gray-500">Saved: {payload.salesRepName}</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-gray-500">
            Commission $ {usingManualOverride ? '(manual)' : ''}
            {!usingManualOverride && hasAutoRate ? `(auto ${ratePercentLabel})` : ''}
            {!usingManualOverride && !hasAutoRate ? '(from per-line %)' : ''}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              step={0.01}
              disabled={payload.salesRepId == null}
              value={centsToInputValue(effectiveCommission)}
              onChange={(e) => {
                const cents = dollarsInputToCents(e.target.value);
                onMutate((p) => ({ ...p, salesRepCommissionCentsOverride: cents }));
              }}
              className="w-32 rounded-md border border-gray-200 px-2 py-1 text-right text-xs tabular-nums disabled:bg-gray-100"
            />
            {usingManualOverride && (
              <button
                type="button"
                onClick={() => onMutate((p) => ({ ...p, salesRepCommissionCentsOverride: null }))}
                className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                title={
                  hasAutoRate
                    ? `Reset to auto ${ratePercentLabel} × (gross − COGS)`
                    : 'Reset to per-line % sum'
                }
              >
                {hasAutoRate ? 'Use auto rate' : 'Use per-line %'}
              </button>
            )}
          </div>
          {payload.salesRepId == null && (
            <p className="mt-1 text-[10px] text-gray-500">Select a rep to enable commission.</p>
          )}
          {payload.salesRepId != null && (
            <p className="mt-1 text-[10px] text-cyan-800">
              Effective commission this sale: {centsToDisplay(effectiveCommission)}
            </p>
          )}
        </div>
      </div>
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
          chips={OT_SHIPPING_CHIPS}
          onChange={(c) => onMutate((p) => ({ ...p, shippingCents: c }))}
        />
        <FeeWithChips
          label="TRT telehealth"
          value={payload.trtTelehealthCents}
          chips={[
            { label: '$50', cents: 5000 },
            { label: '$0', cents: 0 },
          ]}
          onChange={(c) => onMutate((p) => ({ ...p, trtTelehealthCents: c }))}
        />
        <FeeWithChips
          label="Doctor consult"
          value={payload.doctorRxFeeCents}
          chips={OT_DOCTOR_CONSULT_CHIPS}
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
        <RowKv label="Doctor consult" value={totals.doctorRxFeeCents} negative />
        <RowKv label="Fulfillment" value={totals.fulfillmentFeesCents} negative />
        <RowKv label="Custom lines" value={totals.customLineItemsCents} negative />
        <RowKv label="Sales rep commission" value={totals.salesRepCommissionCents} negative />
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
