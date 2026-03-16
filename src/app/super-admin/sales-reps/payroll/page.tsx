'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  DollarSign, TrendingUp, BadgeDollarSign, Clock, CheckCircle2,
  XCircle, Download, Calendar, Building2, Search, RefreshCw,
  ChevronDown, ChevronUp, ChevronLeft, ArrowUpDown, Users,
  FileText, CreditCard, Repeat, Sparkles, Filter, Check,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

// ============================================================================
// Types
// ============================================================================

interface StatusBreakdown { count: number; cents: number; }
interface GrandTotal {
  events: number; revenueCents: number; commissionCents: number;
  overrideEvents: number; overrideCommissionCents: number; combinedCommissionCents: number;
  statusBreakdown: { pending: StatusBreakdown; approved: StatusBreakdown; paid: StatusBreakdown; reversed: StatusBreakdown };
  newVsRecurring: { newSale: StatusBreakdown; recurring: StatusBreakdown };
}

interface RepSummary {
  salesRepId: number; name: string; email: string; clinicId: number; clinicName: string;
  totalEvents: number; totalRevenueCents: number; totalCommissionCents: number;
  totalBaseCents: number; totalVolumeTierCents: number; totalProductCents: number; totalMultiItemCents: number;
  manualCount: number; stripeCount: number;
  newSaleCount: number; newSaleCommissionCents: number;
  recurringCount: number; recurringCommissionCents: number;
  pendingCount: number; pendingCents: number;
  approvedCount: number; approvedCents: number;
  paidCount: number; paidCents: number;
  reversedCount: number; reversedCents: number;
  totalOverrideCommissionCents: number; totalOverrideEvents: number;
  combinedTotalCents: number;
}

interface CommissionEvent {
  id: number; occurredAt: string; salesRepId: number; salesRepName: string; salesRepEmail: string;
  clinicId: number; clinicName: string; status: string; isManual: boolean; isRecurring: boolean;
  stripeEventId: string | null; eventAmountCents: number; commissionAmountCents: number;
  baseCommissionCents: number; volumeTierBonusCents: number; productBonusCents: number;
  multiItemBonusCents: number; planName: string | null; notes: string | null;
}

interface OverrideEvent {
  id: number; occurredAt: string; overrideRepId: number; overrideRepName: string;
  overrideRepEmail: string; subordinateRepId: number; clinicName: string; status: string;
  eventAmountCents: number; overridePercentBps: number; commissionAmountCents: number;
  stripeEventId: string | null;
}

interface PayrollData {
  dateRange: { startDate: string; endDate: string };
  grandTotal: GrandTotal;
  repSummaries: RepSummary[];
  overrideRepSummaries: any[];
  events: CommissionEvent[];
  overrideEvents: OverrideEvent[];
}

interface Clinic { id: number; name: string; }

// ============================================================================
// Constants
// ============================================================================

const PRESETS = [
  { value: 'this-week', label: 'This Week' },
  { value: 'last-week', label: 'Last Week' },
  { value: 'this-month', label: 'This Month' },
  { value: 'last-month', label: 'Last Month' },
  { value: 'last30', label: 'Last 30 Days' },
  { value: 'this-quarter', label: 'This Quarter' },
  { value: 'last-quarter', label: 'Last Quarter' },
  { value: 'this-year', label: 'This Year' },
  { value: 'all-time', label: 'All Time' },
  { value: 'custom', label: 'Custom Range' },
] as const;

type Tab = 'summary' | 'events' | 'overrides';

// ============================================================================
// Helpers
// ============================================================================

function $(c: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(c / 100); }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
function fmtShort(d: string) { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
function dateRange(s: string, e: string) { return `${fmtDate(s)} — ${fmtDate(e)}`; }

function presetToDates(preset: string): { startDate?: string; endDate?: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const dow = now.getDay();
  const fmt = (dt: Date) => dt.toISOString().split('T')[0];

  switch (preset) {
    case 'this-week': { const s = new Date(y, m, d - dow); return { startDate: fmt(s), endDate: fmt(now) }; }
    case 'last-week': { const s = new Date(y, m, d - dow - 7); const e = new Date(y, m, d - dow - 1); return { startDate: fmt(s), endDate: fmt(e) }; }
    case 'this-month': return { startDate: fmt(new Date(y, m, 1)), endDate: fmt(now) };
    case 'last-month': return { startDate: fmt(new Date(y, m - 1, 1)), endDate: fmt(new Date(y, m, 0)) };
    case 'last30': return { startDate: fmt(new Date(y, m, d - 30)), endDate: fmt(now) };
    case 'this-quarter': { const qm = Math.floor(m / 3) * 3; return { startDate: fmt(new Date(y, qm, 1)), endDate: fmt(now) }; }
    case 'last-quarter': { const qm = Math.floor(m / 3) * 3 - 3; return { startDate: fmt(new Date(y, qm, 1)), endDate: fmt(new Date(y, qm + 3, 0)) }; }
    case 'this-year': return { startDate: fmt(new Date(y, 0, 1)), endDate: fmt(now) };
    case 'all-time': return {};
    default: return {};
  }
}

const statusBadge: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-blue-100 text-blue-800',
  PAID: 'bg-green-100 text-green-800',
  REVERSED: 'bg-red-100 text-red-800',
};

// ============================================================================
// Page Component
// ============================================================================

export default function PayrollReportPage() {
  const [data, setData] = useState<PayrollData | null>(null);
  const [loading, setLoading] = useState(true);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [preset, setPreset] = useState('this-month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [clinicId, setClinicId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [tab, setTab] = useState<Tab>('summary');
  const [expandedRep, setExpandedRep] = useState<number | null>(null);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<number>>(new Set());
  const [selectedOverrideIds, setSelectedOverrideIds] = useState<Set<number>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);
  const [sortKey, setSortKey] = useState<string>('combinedTotalCents');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [downloadingCsv, setDownloadingCsv] = useState(false);

  const fetchClinics = useCallback(async () => {
    try {
      const res = await apiFetch('/api/super-admin/clinics');
      if (res.ok) setClinics((await res.json()).clinics || []);
    } catch { /* non-critical */ }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (preset === 'custom' && customStart && customEnd) {
        p.set('startDate', customStart);
        p.set('endDate', customEnd);
      } else if (preset !== 'custom') {
        const dates = presetToDates(preset);
        if (dates.startDate) p.set('startDate', dates.startDate);
        if (dates.endDate) p.set('endDate', dates.endDate);
      }
      if (clinicId) p.set('clinicId', clinicId);
      if (statusFilter) p.set('status', statusFilter);
      if (typeFilter) p.set('type', typeFilter);

      const res = await apiFetch(`/api/super-admin/sales-reps/payroll-report?${p}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setSelectedEventIds(new Set());
        setSelectedOverrideIds(new Set());
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [preset, customStart, customEnd, clinicId, statusFilter, typeFilter]);

  useEffect(() => { fetchClinics(); }, [fetchClinics]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sortedReps = useMemo(() => {
    if (!data?.repSummaries) return [];
    let result = data.repSummaries;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((r) =>
        r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || r.clinicName.toLowerCase().includes(q)
      );
    }
    return [...result].sort((a, b) => {
      if (sortKey === 'name') return sortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      const va = (a as any)[sortKey] || 0;
      const vb = (b as any)[sortKey] || 0;
      return sortDir === 'asc' ? va - vb : vb - va;
    });
  }, [data?.repSummaries, searchQuery, sortKey, sortDir]);

  const handleExportCsv = async () => {
    if (!data?.dateRange) return;
    setDownloadingCsv(true);
    try {
      const p = new URLSearchParams();
      p.set('startDate', data.dateRange.startDate.split('T')[0]);
      p.set('endDate', data.dateRange.endDate.split('T')[0]);
      if (clinicId) p.set('clinicId', clinicId);
      if (statusFilter) p.set('status', statusFilter);
      if (typeFilter) p.set('type', typeFilter);
      p.set('format', 'csv');
      const res = await apiFetch(`/api/super-admin/sales-reps/payroll-report?${p}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `payroll-${data.dateRange.startDate.split('T')[0]}-to-${data.dateRange.endDate.split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        alert('Failed to download CSV');
      }
    } catch { alert('Failed to download CSV'); }
    finally { setDownloadingCsv(false); }
  };

  const handleBatchAction = async (action: 'mark_paid' | 'mark_approved') => {
    if (selectedEventIds.size === 0 && selectedOverrideIds.size === 0) return;
    setBatchLoading(true);
    try {
      const res = await apiFetch('/api/super-admin/sales-reps/payroll-report', {
        method: 'PATCH',
        body: JSON.stringify({
          action,
          eventIds: selectedEventIds.size > 0 ? Array.from(selectedEventIds) : undefined,
          overrideEventIds: selectedOverrideIds.size > 0 ? Array.from(selectedOverrideIds) : undefined,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        alert(`Updated ${result.directUpdated} direct + ${result.overrideUpdated} override commissions to ${action === 'mark_paid' ? 'PAID' : 'APPROVED'}`);
        fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to update');
      }
    } catch { alert('Failed to update'); }
    finally { setBatchLoading(false); }
  };

  const toggleEventSelection = (id: number) => {
    setSelectedEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleOverrideSelection = (id: number) => {
    setSelectedOverrideIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllApproved = () => {
    if (!data) return;
    const approved = data.events.filter((e) => e.status === 'APPROVED').map((e) => e.id);
    setSelectedEventIds(new Set(approved));
    const overrideApproved = data.overrideEvents.filter((e) => e.status === 'APPROVED').map((e) => e.id);
    setSelectedOverrideIds(new Set(overrideApproved));
  };

  const gt = data?.grandTotal;
  const isRefetching = loading && data !== null;
  const SortIcon = ({ col }: { col: string }) => {
    if (sortKey !== col) return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-40" />;
    return sortDir === 'asc' ? <ChevronUp className="ml-1 inline h-3 w-3" /> : <ChevronDown className="ml-1 inline h-3 w-3" />;
  };

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <a href="/super-admin/sales-reps" className="mb-3 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
          <ChevronLeft className="h-4 w-4" /> Back to Sales Reps
        </a>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Payroll Commission Report</h1>
            <p className="text-gray-500">Comprehensive commission reporting for payroll processing</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={fetchData} disabled={loading} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button onClick={handleExportCsv} disabled={!data || downloadingCsv} className="flex items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[#3d8a66] disabled:opacity-50">
              <Download className={`h-4 w-4 ${downloadingCsv ? 'animate-spin' : ''}`} /> {downloadingCsv ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-700"><Filter className="h-4 w-4" /> Filters</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Period</label>
            <select value={preset} onChange={(e) => setPreset(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
              {PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          {preset === 'custom' && (
            <>
              <div><label className="mb-1 block text-xs font-medium text-gray-500">Start</label><input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-500">End</label><input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></div>
            </>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Clinic</label>
            <select value={clinicId} onChange={(e) => setClinicId(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <option value="">All Clinics</option>
              {clinics.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <option value="">Active (P/A/P)</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="PAID">Paid</option>
              <option value="REVERSED">Reversed</option>
              <option value="ALL">All Statuses</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Type</label>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <option value="">All Types</option>
              <option value="new">New Sales Only</option>
              <option value="recurring">Recurring Only</option>
              <option value="manual">Manual Only</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Rep name or email..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm" />
            </div>
          </div>
        </div>
        {data?.dateRange && <div className="mt-3 text-xs text-gray-500">Period: {dateRange(data.dateRange.startDate, data.dateRange.endDate)}</div>}
      </div>

      {/* Summary Cards */}
      {loading && !data ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">{Array.from({ length: 8 }).map((_, i) => (<div key={i} className="animate-pulse rounded-xl bg-white p-4 shadow-sm"><div className="h-3 w-16 rounded bg-gray-200" /><div className="mt-2 h-6 w-20 rounded bg-gray-200" /></div>))}</div>
      ) : gt ? (
        <div className={`relative mb-6 transition-opacity ${isRefetching ? 'opacity-60' : ''}`}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-blue-500" /><span className="text-xs font-medium text-gray-500">Revenue</span></div>
              <p className="mt-1 text-lg font-bold text-gray-900">{$(gt.revenueCents)}</p>
              <p className="text-xs text-gray-400">{gt.events} events</p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2"><BadgeDollarSign className="h-4 w-4 text-emerald-500" /><span className="text-xs font-medium text-gray-500">Direct Commission</span></div>
              <p className="mt-1 text-lg font-bold text-emerald-700">{$(gt.commissionCents)}</p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2"><Users className="h-4 w-4 text-purple-500" /><span className="text-xs font-medium text-gray-500">Override Commission</span></div>
              <p className="mt-1 text-lg font-bold text-purple-700">{$(gt.overrideCommissionCents)}</p>
              <p className="text-xs text-gray-400">{gt.overrideEvents} events</p>
            </div>
            <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-green-50 p-4 shadow-sm ring-1 ring-emerald-200">
              <div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-600" /><span className="text-xs font-medium text-emerald-600">Combined Total</span></div>
              <p className="mt-1 text-lg font-bold text-emerald-800">{$(gt.combinedCommissionCents)}</p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-indigo-500" /><span className="text-xs font-medium text-gray-500">New Sales</span></div>
              <p className="mt-1 text-lg font-bold text-indigo-700">{$(gt.newVsRecurring.newSale.cents)}</p>
              <p className="text-xs text-gray-400">{gt.newVsRecurring.newSale.count} events</p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2"><Repeat className="h-4 w-4 text-cyan-500" /><span className="text-xs font-medium text-gray-500">Recurring</span></div>
              <p className="mt-1 text-lg font-bold text-cyan-700">{$(gt.newVsRecurring.recurring.cents)}</p>
              <p className="text-xs text-gray-400">{gt.newVsRecurring.recurring.count} events</p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-amber-500" /><span className="text-xs font-medium text-gray-500">Pending</span></div>
              <p className="mt-1 text-lg font-bold text-amber-700">{$(gt.statusBreakdown.pending.cents)}</p>
              <p className="text-xs text-gray-400">{gt.statusBreakdown.pending.count} events</p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-blue-500" /><span className="text-xs font-medium text-gray-500">Ready to Pay</span></div>
              <p className="mt-1 text-lg font-bold text-blue-700">{$(gt.statusBreakdown.approved.cents)}</p>
              <p className="text-xs text-gray-400">{gt.statusBreakdown.approved.count} events</p>
            </div>
          </div>
          {isRefetching && <div className="absolute inset-0 flex items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--brand-primary)] border-t-transparent" /></div>}
        </div>
      ) : null}

      {/* Tabs */}
      <div className="mb-4 flex items-center gap-1 rounded-lg bg-gray-100 p-1">
        {[
          { key: 'summary' as Tab, label: 'Per-Rep Summary', icon: Users },
          { key: 'events' as Tab, label: 'Commission Events', icon: FileText },
          { key: 'overrides' as Tab, label: 'Override Events', icon: CreditCard },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)} className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <Icon className="h-4 w-4" /> {label}
            {key === 'events' && data?.events.length ? <span className="ml-1 rounded-full bg-gray-200 px-1.5 py-0.5 text-xs">{data.events.length}</span> : null}
            {key === 'overrides' && data?.overrideEvents.length ? <span className="ml-1 rounded-full bg-gray-200 px-1.5 py-0.5 text-xs">{data.overrideEvents.length}</span> : null}
          </button>
        ))}
      </div>

      {/* Batch Actions */}
      {(selectedEventIds.size > 0 || selectedOverrideIds.size > 0) && (
        <div className="mb-4 flex items-center gap-3 rounded-lg bg-blue-50 px-4 py-3 text-sm">
          <span className="font-medium text-blue-800">{selectedEventIds.size + selectedOverrideIds.size} selected</span>
          <button onClick={() => handleBatchAction('mark_paid')} disabled={batchLoading} className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50">
            <Check className="h-3 w-3" /> Mark as Paid
          </button>
          <button onClick={() => handleBatchAction('mark_approved')} disabled={batchLoading} className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            <Check className="h-3 w-3" /> Mark as Approved
          </button>
          <button onClick={() => { setSelectedEventIds(new Set()); setSelectedOverrideIds(new Set()); }} className="text-xs text-gray-500 hover:text-gray-700">Clear</button>
        </div>
      )}

      {/* TAB: Per-Rep Summary */}
      {tab === 'summary' && (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="cursor-pointer px-3 py-3 text-left text-xs font-medium uppercase text-gray-500 hover:text-gray-900" onClick={() => handleSort('name')}>Sales Rep <SortIcon col="name" /></th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-500">Clinic</th>
                  <th className="cursor-pointer px-3 py-3 text-right text-xs font-medium uppercase text-gray-500 hover:text-gray-900" onClick={() => handleSort('totalRevenueCents')}>Revenue <SortIcon col="totalRevenueCents" /></th>
                  <th className="cursor-pointer px-3 py-3 text-right text-xs font-medium uppercase text-gray-500 hover:text-gray-900" onClick={() => handleSort('newSaleCommissionCents')}>New Sale $ <SortIcon col="newSaleCommissionCents" /></th>
                  <th className="cursor-pointer px-3 py-3 text-right text-xs font-medium uppercase text-gray-500 hover:text-gray-900" onClick={() => handleSort('recurringCommissionCents')}>Recurring $ <SortIcon col="recurringCommissionCents" /></th>
                  <th className="cursor-pointer px-3 py-3 text-right text-xs font-medium uppercase text-gray-500 hover:text-gray-900" onClick={() => handleSort('totalCommissionCents')}>Direct <SortIcon col="totalCommissionCents" /></th>
                  <th className="cursor-pointer px-3 py-3 text-right text-xs font-medium uppercase text-gray-500 hover:text-gray-900" onClick={() => handleSort('totalOverrideCommissionCents')}>Override <SortIcon col="totalOverrideCommissionCents" /></th>
                  <th className="cursor-pointer px-3 py-3 text-right text-xs font-medium uppercase text-gray-500 hover:text-gray-900" onClick={() => handleSort('combinedTotalCents')}>Total <SortIcon col="combinedTotalCents" /></th>
                  <th className="px-3 py-3 text-center text-xs font-medium uppercase text-gray-500">Status</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedReps.map((rep) => (
                  <>
                    <tr key={rep.salesRepId} className="cursor-pointer hover:bg-gray-50" onClick={() => setExpandedRep(expandedRep === rep.salesRepId ? null : rep.salesRepId)}>
                      <td className="px-3 py-3"><p className="font-medium text-gray-900">{rep.name}</p><p className="text-xs text-gray-500">{rep.email}</p></td>
                      <td className="px-3 py-3 text-gray-700">{rep.clinicName}</td>
                      <td className="px-3 py-3 text-right text-gray-900">{$(rep.totalRevenueCents)}</td>
                      <td className="px-3 py-3 text-right"><span className="text-indigo-700">{$(rep.newSaleCommissionCents)}</span><span className="ml-1 text-xs text-gray-400">({rep.newSaleCount})</span></td>
                      <td className="px-3 py-3 text-right"><span className="text-cyan-700">{$(rep.recurringCommissionCents)}</span><span className="ml-1 text-xs text-gray-400">({rep.recurringCount})</span></td>
                      <td className="px-3 py-3 text-right font-medium text-emerald-700">{$(rep.totalCommissionCents)}</td>
                      <td className="px-3 py-3 text-right font-medium text-purple-700">{rep.totalOverrideCommissionCents > 0 ? $(rep.totalOverrideCommissionCents) : '—'}</td>
                      <td className="px-3 py-3 text-right font-bold text-gray-900">{$(rep.combinedTotalCents)}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-1">
                          {rep.pendingCount > 0 && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">{rep.pendingCount}P</span>}
                          {rep.approvedCount > 0 && <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-800">{rep.approvedCount}A</span>}
                          {rep.paidCount > 0 && <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-800">{rep.paidCount}$</span>}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">{expandedRep === rep.salesRepId ? <ChevronUp className="inline h-4 w-4 text-gray-400" /> : <ChevronDown className="inline h-4 w-4 text-gray-400" />}</td>
                    </tr>
                    {expandedRep === rep.salesRepId && (
                      <tr key={`${rep.salesRepId}-detail`}>
                        <td colSpan={10} className="bg-gray-50 px-4 py-3">
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="rounded-lg bg-white p-3"><p className="text-xs text-gray-500">Base Commission</p><p className="text-sm font-semibold">{$(rep.totalBaseCents)}</p></div>
                            <div className="rounded-lg bg-white p-3"><p className="text-xs text-gray-500">Volume Tier Bonus</p><p className="text-sm font-semibold">{$(rep.totalVolumeTierCents)}</p></div>
                            <div className="rounded-lg bg-white p-3"><p className="text-xs text-gray-500">Product Bonus</p><p className="text-sm font-semibold">{$(rep.totalProductCents)}</p></div>
                            <div className="rounded-lg bg-white p-3"><p className="text-xs text-gray-500">Multi-Item Bonus</p><p className="text-sm font-semibold">{$(rep.totalMultiItemCents)}</p></div>
                          </div>
                          <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                            <span>Manual: {rep.manualCount}</span>
                            <span>Stripe: {rep.stripeCount}</span>
                            <span>Pending: {$(rep.pendingCents)}</span>
                            <span>Approved: {$(rep.approvedCents)}</span>
                            <span>Paid: {$(rep.paidCents)}</span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {sortedReps.length === 0 && !loading && (
                  <tr><td colSpan={10} className="py-12 text-center text-gray-500">No commission data for this period</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: Commission Events */}
      {tab === 'events' && (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <span className="text-sm font-medium text-gray-700">{data?.events.length || 0} commission events</span>
            <button onClick={selectAllApproved} className="text-xs text-blue-600 hover:underline">Select all Approved</button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-2 text-center"><input type="checkbox" className="rounded" onChange={(e) => { if (e.target.checked) { setSelectedEventIds(new Set(data?.events.map((ev) => ev.id) || [])); } else { setSelectedEventIds(new Set()); } }} checked={data?.events.length ? selectedEventIds.size === data.events.length : false} /></th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Date</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Sales Rep</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Clinic</th>
                  <th className="px-3 py-2 text-center text-xs font-medium uppercase text-gray-500">Type</th>
                  <th className="px-3 py-2 text-center text-xs font-medium uppercase text-gray-500">Status</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">Revenue</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">Commission</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Breakdown</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Plan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(data?.events || []).map((ev) => (
                  <tr key={ev.id} className={`hover:bg-gray-50 ${selectedEventIds.has(ev.id) ? 'bg-blue-50' : ''}`}>
                    <td className="px-2 py-2 text-center"><input type="checkbox" className="rounded" checked={selectedEventIds.has(ev.id)} onChange={() => toggleEventSelection(ev.id)} /></td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-700">{fmtShort(ev.occurredAt)}</td>
                    <td className="px-3 py-2"><p className="font-medium text-gray-900">{ev.salesRepName}</p></td>
                    <td className="px-3 py-2 text-gray-600">{ev.clinicName}</td>
                    <td className="px-3 py-2 text-center">
                      {ev.isManual ? <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">Manual</span>
                        : ev.isRecurring ? <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-xs font-medium text-cyan-700">Recurring</span>
                        : <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">New Sale</span>}
                    </td>
                    <td className="px-3 py-2 text-center"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge[ev.status] || 'bg-gray-100 text-gray-700'}`}>{ev.status}</span></td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-gray-900">{$(ev.eventAmountCents)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-emerald-700">{$(ev.commissionAmountCents)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1 text-xs">
                        {ev.baseCommissionCents > 0 && <span className="rounded bg-gray-100 px-1.5 py-0.5">Base {$(ev.baseCommissionCents)}</span>}
                        {ev.volumeTierBonusCents > 0 && <span className="rounded bg-yellow-50 px-1.5 py-0.5 text-yellow-700">Tier {$(ev.volumeTierBonusCents)}</span>}
                        {ev.productBonusCents > 0 && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">Product {$(ev.productBonusCents)}</span>}
                        {ev.multiItemBonusCents > 0 && <span className="rounded bg-purple-50 px-1.5 py-0.5 text-purple-700">Multi {$(ev.multiItemBonusCents)}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">{ev.planName || '—'}</td>
                  </tr>
                ))}
                {(!data?.events || data.events.length === 0) && !loading && (
                  <tr><td colSpan={10} className="py-12 text-center text-gray-500">No commission events for this period</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: Override Events */}
      {tab === 'overrides' && (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <span className="text-sm font-medium text-gray-700">{data?.overrideEvents.length || 0} override commission events</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-2 text-center"><input type="checkbox" className="rounded" onChange={(e) => { if (e.target.checked) { setSelectedOverrideIds(new Set(data?.overrideEvents.map((e) => e.id) || [])); } else { setSelectedOverrideIds(new Set()); } }} checked={data?.overrideEvents.length ? selectedOverrideIds.size === data.overrideEvents.length : false} /></th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Date</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Manager</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Clinic</th>
                  <th className="px-3 py-2 text-center text-xs font-medium uppercase text-gray-500">Status</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">Sub Revenue</th>
                  <th className="px-3 py-2 text-center text-xs font-medium uppercase text-gray-500">Rate</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">Override Commission</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(data?.overrideEvents || []).map((ov) => (
                  <tr key={ov.id} className={`hover:bg-gray-50 ${selectedOverrideIds.has(ov.id) ? 'bg-blue-50' : ''}`}>
                    <td className="px-2 py-2 text-center"><input type="checkbox" className="rounded" checked={selectedOverrideIds.has(ov.id)} onChange={() => toggleOverrideSelection(ov.id)} /></td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-700">{fmtShort(ov.occurredAt)}</td>
                    <td className="px-3 py-2"><p className="font-medium text-gray-900">{ov.overrideRepName}</p></td>
                    <td className="px-3 py-2 text-gray-600">{ov.clinicName}</td>
                    <td className="px-3 py-2 text-center"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge[ov.status] || 'bg-gray-100 text-gray-700'}`}>{ov.status}</span></td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-gray-900">{$(ov.eventAmountCents)}</td>
                    <td className="px-3 py-2 text-center text-xs text-gray-600">{(ov.overridePercentBps / 100).toFixed(2)}%</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-purple-700">{$(ov.commissionAmountCents)}</td>
                  </tr>
                ))}
                {(!data?.overrideEvents || data.overrideEvents.length === 0) && !loading && (
                  <tr><td colSpan={8} className="py-12 text-center text-gray-500">No override commission events for this period</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
