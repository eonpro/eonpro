'use client';

/**
 * OT Manual Reconciliation — Non-Rx Disposition Editor
 *
 * Sister component to `OtAllocationEditor.tsx` for non-Rx charges (bloodwork,
 * consults, packages, standalone Stripe payments). Keyed by `dispositionKey`
 * (`'inv:<invoiceId>' | 'pay:<paymentId>'`) instead of `orderId`. Reuses the
 * same `OtAllocationOverridePayload` schema, the same `computeOtAllocation
 * OverrideTotals` math, and the same sales-rep dropdown source — just posts
 * to `/api/super-admin/ot-nonrx-overrides` instead of the Rx route.
 *
 * Intentional code duplication vs the Rx editor: the Rx editor is production-
 * critical and `orderId`-keyed in many places; refactoring it to dual-mode
 * carried regression risk that wasn't worth the savings. This component is
 * smaller and tightly scoped to non-Rx semantics.
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
  AlertCircle,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';
import {
  computeOtAllocationOverrideTotals,
  reconcileOtAllocationMedLineTotals,
  type OtAllocationOverrideMedLine,
  type OtAllocationOverridePayload,
  type OtAllocationOverrideStatus,
  type OtNonRxChargeKind,
} from '@/services/invoices/otAllocationOverrideTypes';

// ---------------------------------------------------------------------------
// Public seed shape (page builds these from `data.nonRxReconciliation`)
// ---------------------------------------------------------------------------

export interface OtNonRxAllocationEditorSeed {
  dispositionKey: string;
  dispositionType: 'invoice' | 'payment';
  invoiceId: number | null;
  paymentId: number | null;
  chargeKind: OtNonRxChargeKind;
  paidAt: string | null;
  patientName: string;
  productDescription: string;
  /**
   * True when the patient had any paid Rx invoice at this clinic within the
   * last 30 days. Drives the "New 8% / Rebill 1%" badge in the row header
   * and the default `commissionRateBps` in `defaultPayload`.
   */
  isRebill: boolean;
  defaultPayload: OtAllocationOverridePayload;
}

interface SalesRepOption {
  id: number;
  name: string;
  role: string;
}

interface SavedMeta {
  status: OtAllocationOverrideStatus;
  updatedAt: string;
  finalizedAt: string | null;
  lastEditedByUserId: number | null;
}

interface OverrideListResponse {
  overrides: Array<{
    dispositionKey: string;
    invoiceId: number | null;
    paymentId: number | null;
    chargeKind: OtNonRxChargeKind;
    payload: OtAllocationOverridePayload;
    status: OtAllocationOverrideStatus;
    updatedAt: string;
    finalizedAt: string | null;
    lastEditedByUserId: number | null;
  }>;
  warning?: string;
}

interface Props {
  startDate: string;
  endDate: string;
  useRange: boolean;
  seeds: OtNonRxAllocationEditorSeed[];
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

const CHARGE_KIND_LABELS: Record<OtNonRxChargeKind, string> = {
  bloodwork: 'Bloodwork / labs',
  consult: 'Consult / visit',
  other: 'Other',
};
const CHARGE_KIND_COLORS: Record<OtNonRxChargeKind, string> = {
  bloodwork: 'bg-rose-100 text-rose-900',
  consult: 'bg-violet-100 text-violet-900',
  other: 'bg-gray-100 text-gray-700',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OtNonRxAllocationEditor({ startDate, endDate, useRange, seeds }: Props) {
  const [rowsState, setRowsState] = useState<Record<string, OtAllocationOverridePayload>>({});
  const [savedMeta, setSavedMeta] = useState<Record<string, SavedMeta>>({});
  const [savedPayload, setSavedPayload] = useState<Record<string, OtAllocationOverridePayload>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reps, setReps] = useState<SalesRepOption[]>([]);

  /** Sales rep dropdown — same source as the Rx editor (re-exported endpoint). */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/super-admin/ot-nonrx-overrides/sales-reps');
        if (!res.ok) return;
        const json = (await res.json()) as { reps: SalesRepOption[] };
        if (!cancelled) setReps(json.reps);
      } catch {
        /* silent — dropdown stays empty; admin can leave salesRep null */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Initialize rowsState from seeds whenever the seed set changes. */
  useEffect(() => {
    const next: Record<string, OtAllocationOverridePayload> = {};
    for (const s of seeds) next[s.dispositionKey] = deepClonePayload(s.defaultPayload);
    setRowsState(next);
    setSavedPayload({});
    setSavedMeta({});
    setExpanded({});
  }, [seeds]);

  /** Load persisted overrides for the period and overlay. */
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
        const res = await apiFetch(`/api/super-admin/ot-nonrx-overrides?${params}`);
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(j?.error || `Failed (${res.status})`);
        }
        const json = (await res.json()) as OverrideListResponse;
        if (cancelled) return;
        if (json.warning) setWarning(json.warning);
        const meta: Record<string, SavedMeta> = {};
        const saved: Record<string, OtAllocationOverridePayload> = {};
        const overlays: Record<string, OtAllocationOverridePayload> = {};
        for (const r of json.overrides) {
          meta[r.dispositionKey] = {
            status: r.status,
            updatedAt: r.updatedAt,
            finalizedAt: r.finalizedAt,
            lastEditedByUserId: r.lastEditedByUserId,
          };
          saved[r.dispositionKey] = deepClonePayload(r.payload);
          overlays[r.dispositionKey] = deepClonePayload(r.payload);
        }
        setSavedMeta(meta);
        setSavedPayload(saved);
        if (Object.keys(overlays).length > 0) {
          setRowsState((prev) => ({ ...prev, ...overlays }));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load non-Rx overrides');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, useRange, seeds.length]);

  // -------------------------------------------------------------------------
  // Derived totals
  // -------------------------------------------------------------------------
  const seedsByKey = useMemo(() => {
    const m = new Map<string, OtNonRxAllocationEditorSeed>();
    for (const s of seeds) m.set(s.dispositionKey, s);
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
      const p = rowsState[s.dispositionKey] ?? s.defaultPayload;
      const t = computeOtAllocationOverrideTotals(p);
      gross += p.patientGrossCents;
      deductions += t.totalDeductionsCents;
      net += t.netToOtClinicCents;
      const meta = savedMeta[s.dispositionKey];
      const sp = savedPayload[s.dispositionKey];
      if (meta?.status === 'DRAFT') draftCount += 1;
      if (meta?.status === 'FINALIZED') finalizedCount += 1;
      if (!sp || !payloadsEqual(p, sp)) dirtyCount += 1;
    }
    return { gross, deductions, net, dirtyCount, draftCount, finalizedCount };
  }, [seeds, rowsState, savedMeta, savedPayload]);

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------
  const updateRow = useCallback(
    (key: string, mutate: (p: OtAllocationOverridePayload) => OtAllocationOverridePayload) => {
      setRowsState((prev) => {
        const cur = prev[key];
        if (!cur) return prev;
        return { ...prev, [key]: mutate(deepClonePayload(cur)) };
      });
    },
    []
  );

  const resetRow = useCallback(
    (key: string) => {
      const seed = seedsByKey.get(key);
      if (!seed) return;
      setRowsState((prev) => ({ ...prev, [key]: deepClonePayload(seed.defaultPayload) }));
    },
    [seedsByKey]
  );

  const saveRow = useCallback(
    async (seed: OtNonRxAllocationEditorSeed, status: OtAllocationOverrideStatus) => {
      const payload = rowsState[seed.dispositionKey];
      if (!payload) return;
      setSavingKey(seed.dispositionKey);
      setError(null);
      try {
        const reconciled = {
          ...payload,
          meds: reconcileOtAllocationMedLineTotals(payload.meds),
          chargeKind: seed.chargeKind,
        };
        const res = await apiFetch('/api/super-admin/ot-nonrx-overrides', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoiceId: seed.invoiceId,
            paymentId: seed.paymentId,
            chargeKind: seed.chargeKind,
            payload: reconciled,
            status,
          }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(j?.error || `Save failed (${res.status})`);
        }
        const json = (await res.json()) as { override: SavedMeta & { dispositionKey: string } };
        setSavedMeta((prev) => ({
          ...prev,
          [seed.dispositionKey]: {
            status: json.override.status,
            updatedAt: json.override.updatedAt,
            finalizedAt: json.override.finalizedAt,
            lastEditedByUserId: json.override.lastEditedByUserId,
          },
        }));
        setSavedPayload((prev) => ({
          ...prev,
          [seed.dispositionKey]: deepClonePayload(reconciled),
        }));
        setRowsState((prev) => ({ ...prev, [seed.dispositionKey]: deepClonePayload(reconciled) }));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Save failed');
      } finally {
        setSavingKey(null);
      }
    },
    [rowsState]
  );

  const saveAllDirty = useCallback(async () => {
    setBulkSaving(true);
    setError(null);
    try {
      for (const s of seeds) {
        const cur = rowsState[s.dispositionKey];
        const sp = savedPayload[s.dispositionKey];
        if (!cur) continue;
        if (sp && payloadsEqual(cur, sp)) continue;
        const meta = savedMeta[s.dispositionKey];
        const targetStatus: OtAllocationOverrideStatus =
          meta?.status === 'FINALIZED' ? 'FINALIZED' : 'DRAFT';
        await saveRow(s, targetStatus);
      }
    } finally {
      setBulkSaving(false);
    }
  }, [seeds, rowsState, savedPayload, savedMeta, saveRow]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (seeds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 py-16 text-center">
        <p className="text-sm text-gray-500">No non-Rx charges in this period to disposition.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryTile label="Patient gross (sum)" value={centsToDisplay(grandTotals.gross)} tone="neutral" />
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
            {bulkSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Save all drafts ({grandTotals.dirtyCount})
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
          const payload = rowsState[seed.dispositionKey] ?? seed.defaultPayload;
          const totals = computeOtAllocationOverrideTotals(payload);
          const meta = savedMeta[seed.dispositionKey];
          const sp = savedPayload[seed.dispositionKey];
          const isDirty = !sp || !payloadsEqual(payload, sp);
          return (
            <NonRxRow
              key={seed.dispositionKey}
              seed={seed}
              payload={payload}
              totals={totals}
              meta={meta ?? null}
              isDirty={isDirty}
              isSaving={savingKey === seed.dispositionKey}
              isExpanded={!!expanded[seed.dispositionKey]}
              reps={reps}
              onToggleExpand={() =>
                setExpanded((prev) => ({
                  ...prev,
                  [seed.dispositionKey]: !prev[seed.dispositionKey],
                }))
              }
              onMutate={(m) => updateRow(seed.dispositionKey, m)}
              onReset={() => resetRow(seed.dispositionKey)}
              onSaveDraft={() => saveRow(seed, 'DRAFT')}
              onFinalize={() => saveRow(seed, 'FINALIZED')}
            />
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary tile (local copy so we don't cross-import from sibling)
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
// Per-row UI
// ---------------------------------------------------------------------------

interface NonRxRowProps {
  seed: OtNonRxAllocationEditorSeed;
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

function NonRxRow({
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
}: NonRxRowProps) {
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
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium text-gray-900">{seed.patientName}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${CHARGE_KIND_COLORS[seed.chargeKind]}`}
              >
                {CHARGE_KIND_LABELS[seed.chargeKind]}
              </span>
              <span
                title={
                  seed.isRebill
                    ? 'Patient had a paid Rx within the last 30 days. Auto rate: 1%.'
                    : 'No paid Rx in the last 30 days. Auto rate: 8%.'
                }
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  seed.isRebill
                    ? 'bg-amber-100 text-amber-900'
                    : 'bg-emerald-100 text-emerald-900'
                }`}
              >
                {seed.isRebill ? 'Rebill · 1%' : 'New · 8%'}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusColor}`}
              >
                {statusLabel}
              </span>
              {isDirty && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-900">
                  Unsaved
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-gray-500">
              {seed.productDescription || '(no description)'} · {formatPaidEt(seed.paidAt)} ·{' '}
              <span className="font-mono">{seed.dispositionKey}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-gray-500">Gross</p>
            <p className="font-mono text-sm tabular-nums text-gray-700">
              {centsToDisplay(payload.patientGrossCents)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-gray-500">Net</p>
            <p
              className={`font-mono text-sm tabular-nums ${
                totals.netToOtClinicCents < 0 ? 'text-rose-700' : 'text-[#4fa77e]'
              }`}
            >
              {centsToDisplay(totals.netToOtClinicCents)}
            </p>
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-gray-100 px-4 py-4">
          {/* Meds / service lines */}
          <MedsSection payload={payload} onMutate={onMutate} />

          {/* Cents fields */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <CentsField
              label="Shipping"
              value={payload.shippingCents}
              onChange={(c) => onMutate((p) => ({ ...p, shippingCents: c }))}
            />
            <CentsField
              label="TRT telehealth"
              value={payload.trtTelehealthCents}
              onChange={(c) => onMutate((p) => ({ ...p, trtTelehealthCents: c }))}
            />
            <CentsField
              label="Doctor / Rx fee"
              value={payload.doctorRxFeeCents}
              onChange={(c) => onMutate((p) => ({ ...p, doctorRxFeeCents: c }))}
            />
            <CentsField
              label="Fulfillment fees"
              value={payload.fulfillmentFeesCents}
              onChange={(c) => onMutate((p) => ({ ...p, fulfillmentFeesCents: c }))}
            />
          </div>

          {/* Sales rep + commission */}
          <div className="mt-4 rounded-lg border border-cyan-100 bg-cyan-50/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-cyan-900">
                Sales rep & commission
              </h4>
              <NonRxCommissionRateChips
                payloadRateBps={payload.commissionRateBps ?? null}
                onSetRate={(bps) =>
                  /**
                   * Setting the rate also clears any manual $ override so the
                   * displayed commission reflects the new auto rate. Admin
                   * can still type a $ amount in the COMMISSION $ field below.
                   */
                  onMutate((p) => ({
                    ...p,
                    commissionRateBps: bps,
                    salesRepCommissionCentsOverride: null,
                  }))
                }
              />
            </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-[10px] font-medium uppercase tracking-wider text-gray-500">
                Sales rep
              </label>
              <select
                value={payload.salesRepId ?? ''}
                onChange={(e) => {
                  const id = e.target.value === '' ? null : Number(e.target.value);
                  const rep = reps.find((r) => r.id === id) ?? null;
                  onMutate((p) => ({
                    ...p,
                    salesRepId: id,
                    salesRepName: rep?.name ?? null,
                    /** Clear commission override when rep changes — admin re-types if needed. */
                    salesRepCommissionCentsOverride: id == null ? null : p.salesRepCommissionCentsOverride,
                  }));
                }}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm shadow-sm focus:border-[#4fa77e] focus:outline-none"
              >
                <option value="">(none)</option>
                {reps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} — {r.role}
                  </option>
                ))}
              </select>
            </div>
            <NonRxRepCommissionField payload={payload} onMutate={onMutate} totals={totals} />
            <div className="rounded-lg bg-gray-50 p-2 text-xs text-gray-600">
              <p className="font-medium uppercase tracking-wider text-[10px]">Computed totals</p>
              <p className="mt-1">Deductions: {centsToDisplay(totals.totalDeductionsCents)}</p>
              <p>Net to OT: {centsToDisplay(totals.netToOtClinicCents)}</p>
            </div>
            </div>
          </div>

          {/* Custom line items */}
          <CustomLinesSection payload={payload} onMutate={onMutate} />

          {/* Notes */}
          <div className="mt-4">
            <label className="block text-[10px] font-medium uppercase tracking-wider text-gray-500">
              Notes (no PHI — visible in audit log)
            </label>
            <textarea
              value={payload.notes ?? ''}
              onChange={(e) => {
                const v = e.target.value.slice(0, 1000);
                onMutate((p) => ({ ...p, notes: v.length > 0 ? v : null }));
              }}
              rows={2}
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs shadow-sm focus:border-[#4fa77e] focus:outline-none"
            />
          </div>

          {/* Actions */}
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              <RotateCcw className="h-3 w-3" /> Reset to computed
            </button>
            <button
              type="button"
              onClick={onSaveDraft}
              disabled={isSaving}
              className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 shadow-sm hover:bg-amber-100 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Save draft
            </button>
            <button
              type="button"
              onClick={onFinalize}
              disabled={isSaving}
              className="flex items-center gap-1.5 rounded-lg bg-[#4fa77e] px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-[#3d8a65] disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3 w-3" />
              )}
              Finalize
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-sections
// ---------------------------------------------------------------------------

function MedsSection({
  payload,
  onMutate,
}: {
  payload: OtAllocationOverridePayload;
  onMutate: (m: (p: OtAllocationOverridePayload) => OtAllocationOverridePayload) => void;
}) {
  const addLine = () => {
    onMutate((p) => ({
      ...p,
      meds: [
        ...p.meds,
        {
          medicationKey: null,
          name: '',
          strength: '',
          vialSize: '',
          quantity: 1,
          unitPriceCents: 0,
          lineTotalCents: 0,
          source: 'custom' as const,
          commissionRateBps: null,
        },
      ],
    }));
  };
  const removeLine = (idx: number) => {
    onMutate((p) => ({ ...p, meds: p.meds.filter((_, i) => i !== idx) }));
  };
  const updateLine = (idx: number, mut: (m: OtAllocationOverrideMedLine) => OtAllocationOverrideMedLine) => {
    onMutate((p) => ({
      ...p,
      meds: p.meds.map((m, i) => {
        if (i !== idx) return m;
        const next = mut({ ...m });
        next.lineTotalCents = next.unitPriceCents * next.quantity;
        return next;
      }),
    }));
  };

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-700">
          Service / cost lines
        </h4>
        <button
          type="button"
          onClick={addLine}
          className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
        >
          <Plus className="h-3 w-3" /> Add line
        </button>
      </div>
      {payload.meds.length === 0 ? (
        <p className="text-[11px] italic text-gray-500">No cost lines — admin types in the lab/consult cost.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {payload.meds.map((m, idx) => (
            <div
              key={`${idx}-${m.name}`}
              className="grid grid-cols-1 gap-2 rounded-lg border border-gray-100 bg-white p-2 sm:grid-cols-12"
            >
              <input
                type="text"
                value={m.name}
                onChange={(e) => updateLine(idx, (cur) => ({ ...cur, name: e.target.value }))}
                placeholder="Description (e.g. Quest CMP)"
                className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs sm:col-span-6"
              />
              <input
                type="number"
                min={1}
                value={m.quantity}
                onChange={(e) =>
                  updateLine(idx, (cur) => ({ ...cur, quantity: Math.max(1, Number(e.target.value)) }))
                }
                className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs sm:col-span-1"
              />
              <input
                type="text"
                inputMode="decimal"
                value={centsToInputValue(m.unitPriceCents)}
                onChange={(e) =>
                  updateLine(idx, (cur) => ({ ...cur, unitPriceCents: dollarsInputToCents(e.target.value) }))
                }
                placeholder="Unit cost"
                className="rounded-md border border-gray-200 bg-white px-2 py-1 text-right font-mono text-xs sm:col-span-2"
              />
              <div className="flex items-center justify-end font-mono text-xs text-gray-700 sm:col-span-2">
                {centsToDisplay(m.lineTotalCents)}
              </div>
              <button
                type="button"
                onClick={() => removeLine(idx)}
                className="rounded-md border border-rose-200 bg-rose-50 px-2 text-xs font-medium text-rose-700 hover:bg-rose-100 sm:col-span-1"
              >
                <Trash2 className="mx-auto h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomLinesSection({
  payload,
  onMutate,
}: {
  payload: OtAllocationOverridePayload;
  onMutate: (m: (p: OtAllocationOverridePayload) => OtAllocationOverridePayload) => void;
}) {
  const addLine = () =>
    onMutate((p) => ({
      ...p,
      customLineItems: [...p.customLineItems, { description: '', amountCents: 0 }],
    }));
  const removeLine = (idx: number) =>
    onMutate((p) => ({
      ...p,
      customLineItems: p.customLineItems.filter((_, i) => i !== idx),
    }));

  return (
    <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-700">
          Custom line items
        </h4>
        <button
          type="button"
          onClick={addLine}
          className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
        >
          <Plus className="h-3 w-3" /> Add line
        </button>
      </div>
      {payload.customLineItems.length === 0 ? (
        <p className="text-[11px] italic text-gray-500">No custom line items.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {payload.customLineItems.map((c, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2">
              <input
                type="text"
                value={c.description}
                onChange={(e) =>
                  onMutate((p) => ({
                    ...p,
                    customLineItems: p.customLineItems.map((x, i) =>
                      i === idx ? { ...x, description: e.target.value } : x
                    ),
                  }))
                }
                placeholder="Description"
                className="col-span-9 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs"
              />
              <input
                type="text"
                inputMode="decimal"
                value={centsToInputValue(c.amountCents)}
                onChange={(e) => {
                  const cents = dollarsInputToCents(e.target.value);
                  onMutate((p) => ({
                    ...p,
                    customLineItems: p.customLineItems.map((x, i) =>
                      i === idx ? { ...x, amountCents: cents } : x
                    ),
                  }));
                }}
                placeholder="$"
                className="col-span-2 rounded-md border border-gray-200 bg-white px-2 py-1 text-right font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => removeLine(idx)}
                className="col-span-1 rounded-md border border-rose-200 bg-rose-50 text-xs font-medium text-rose-700 hover:bg-rose-100"
              >
                <Trash2 className="mx-auto h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CentsField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (cents: number) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-[10px] font-medium uppercase tracking-wider text-gray-500">
        {label}
      </label>
      <input
        type="text"
        inputMode="decimal"
        value={centsToInputValue(value)}
        disabled={disabled}
        onChange={(e) => onChange(dollarsInputToCents(e.target.value))}
        className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-right font-mono text-sm shadow-sm focus:border-[#4fa77e] focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
      />
    </div>
  );
}

/**
 * Rep commission $ field for the non-Rx editor — same precedence as the Rx
 * editor: manual override > payload-level auto rate × (gross − COGS) >
 * legacy per-line bps. The auto rate is set to 100 (rebill) or 800 (new) by
 * the seed builder; admin can type a $ to override per row.
 */
function NonRxRepCommissionField({
  payload,
  onMutate,
  totals,
}: {
  payload: OtAllocationOverridePayload;
  onMutate: (m: (p: OtAllocationOverridePayload) => OtAllocationOverridePayload) => void;
  totals: { salesRepCommissionCents: number };
}) {
  const payloadRateBps = payload.commissionRateBps ?? null;
  const hasAutoRate = payloadRateBps !== null && payloadRateBps > 0;
  const usingManualOverride = payload.salesRepCommissionCentsOverride !== null;
  const effectiveCents = usingManualOverride
    ? (payload.salesRepCommissionCentsOverride as number)
    : totals.salesRepCommissionCents;
  let ratePctLabel: string | null = null;
  if (payloadRateBps !== null) {
    const decimals = payloadRateBps % 100 === 0 ? 0 : 1;
    ratePctLabel = `${(payloadRateBps / 100).toFixed(decimals)}%`;
  }
  let labelSuffix = '';
  if (usingManualOverride) {
    labelSuffix = '(manual)';
  } else if (hasAutoRate) {
    labelSuffix = `(auto ${ratePctLabel})`;
  }

  return (
    <div>
      <label className="block text-[10px] font-medium uppercase tracking-wider text-gray-500">
        Rep commission ($) {labelSuffix}
      </label>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          value={centsToInputValue(effectiveCents)}
          disabled={payload.salesRepId === null}
          onChange={(e) => {
            const cents = dollarsInputToCents(e.target.value);
            onMutate((p) => ({
              ...p,
              salesRepCommissionCentsOverride: p.salesRepId === null ? null : cents,
            }));
          }}
          className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-right font-mono text-sm shadow-sm focus:border-[#4fa77e] focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
        />
        {usingManualOverride && payload.salesRepId !== null && (
          <button
            type="button"
            onClick={() => onMutate((p) => ({ ...p, salesRepCommissionCentsOverride: null }))}
            className="whitespace-nowrap rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] font-medium text-gray-700 hover:bg-gray-50"
            title={
              hasAutoRate
                ? `Reset to auto ${ratePctLabel} × gross`
                : 'Reset to per-line %'
            }
          >
            Reset
          </button>
        )}
      </div>
      {!usingManualOverride && hasAutoRate && (
        <p className="mt-1 text-[10px] text-cyan-800">
          {ratePctLabel} × gross {centsToDisplay(payload.patientGrossCents)} ={' '}
          <span className="font-semibold tabular-nums">{centsToDisplay(effectiveCents)}</span>
        </p>
      )}
    </div>
  );
}

/**
 * Payload-level commission rate chips for the non-Rx editor (mirrors the
 * Rx editor's CommissionRateChips). Sets `payload.commissionRateBps`,
 * which the totals engine applies against `(patientGross − Σ med.lineTotal)`.
 */
function NonRxCommissionRateChips({
  payloadRateBps,
  onSetRate,
}: {
  payloadRateBps: number | null;
  onSetRate: (bps: number | null) => void;
}) {
  const chips: Array<{ label: string; bps: number | null }> = [
    { label: 'No %', bps: null },
    { label: '1%', bps: 100 },
    { label: '8%', bps: 800 },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 text-[10px] text-gray-600">
      {chips.map((c) => {
        const active =
          (c.bps === null && payloadRateBps === null) ||
          (c.bps !== null && payloadRateBps === c.bps);
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
        value={payloadRateBps !== null ? (payloadRateBps / 100).toFixed(2) : ''}
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
        className="w-20 rounded-md border border-gray-200 px-2 py-0.5 text-right text-[10px] tabular-nums"
      />
    </div>
  );
}
