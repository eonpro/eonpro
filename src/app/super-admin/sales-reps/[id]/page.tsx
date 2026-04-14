'use client';

import { calendarTodayServer } from '@/lib/utils/platform-calendar';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
// Link removed — patient detail pages use plain <a> tags to avoid RSC fetch hangs
import {
  ChevronLeft,
  BadgeDollarSign,
  TrendingUp,
  DollarSign,
  MousePointer,
  Target,
  Download,
  Calendar,
  Building2,
  RefreshCw,
  Mail,
  Clock,
  UserCheck,
  Receipt,
  Users,
  BarChart3,
  FileText,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

// ============================================================================
// Types
// ============================================================================

interface RepDetail {
  id: number;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  clinicId: number;
  clinicName: string | null;
  createdAt: string;
  lastLogin: string | null;
  currentPlan: string | null;
}

interface Stats {
  totalClicks: number;
  totalConversions: number;
  patientsAssigned: number;
  commissionEarnedCents: number;
  revenueCents: number;
  commissionEvents: number;
  conversionRate: number;
  avgDealSizeCents: number;
  avgCommissionPerSaleCents: number;
}

interface DailyRow {
  date: string;
  clicks: number;
  conversions: number;
  commissionCents: number;
}
interface WeeklyRow {
  weekStart: string;
  weekEnd: string;
  clicks: number;
  conversions: number;
  commissionCents: number;
}
interface CommissionEvent {
  id: number;
  occurredAt: string;
  eventAmountCents: number;
  commissionAmountCents: number;
  baseCommissionCents: number;
  volumeTierBonusCents: number;
  productBonusCents: number;
  multiItemBonusCents: number;
  status: string;
  isManual: boolean;
  notes: string | null;
  planName: string | null;
}
interface PatientRow {
  assignmentId: number;
  assignedAt: string;
  patientId: number;
  displayId: string | null;
  firstName: string;
  lastName: string;
  clinicId: number;
  createdAt: string;
  hasPayment: boolean;
}
interface CodePerformance {
  id: number;
  refCode: string;
  isActive: boolean;
  clicks: number;
  conversions: number;
  conversionRate: number;
}

interface DetailResponse {
  rep: RepDetail;
  stats: Stats;
  dailyBreakdown: DailyRow[];
  weeklyRollup: WeeklyRow[];
  commissionLedger: CommissionEvent[];
  patients: PatientRow[];
  codePerformance: CodePerformance[];
  dateRange: { startDate: string; endDate: string };
}

// ============================================================================
// Constants + Helpers
// ============================================================================

const PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this-week', label: 'This Week' },
  { value: 'last-week', label: 'Last Week' },
  { value: 'last7', label: 'Last 7 Days' },
  { value: 'this-month', label: 'This Month' },
  { value: 'last-month', label: 'Last Month' },
  { value: 'last30', label: 'Last 30 Days' },
  { value: 'this-quarter', label: 'This Quarter' },
  { value: 'last-quarter', label: 'Last Quarter' },
  { value: 'this-semester', label: 'This Semester' },
  { value: 'last-semester', label: 'Last Semester' },
  { value: 'this-year', label: 'This Year' },
  { value: 'last-year', label: 'Last Year' },
  { value: 'all-time', label: 'All Time' },
  { value: 'custom', label: 'Custom Range' },
] as const;

function $(c: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(c / 100);
}
function pct(v: number) {
  return `${v.toFixed(1)}%`;
}
function sd(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fd(d: string) {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
function dr(s: string, e: string) {
  const o: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  return `${new Date(s).toLocaleDateString('en-US', o)} — ${new Date(e).toLocaleDateString('en-US', o)}`;
}

const statusColor: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-blue-100 text-blue-800',
  PAID: 'bg-green-100 text-green-800',
  REVERSED: 'bg-red-100 text-red-800',
};

// ============================================================================
// Page Component
// ============================================================================

export default function SalesRepDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<string>('last30');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (preset === 'custom' && customStart && customEnd) {
        p.set('startDate', customStart);
        p.set('endDate', customEnd);
      } else if (preset !== 'custom') {
        p.set('preset', preset);
      }
      const res = await apiFetch(`/api/super-admin/sales-reps/${id}?${p}`);
      if (res.ok) setData(await res.json());
    } catch (e) {
      process.env.NODE_ENV === 'development' && console.error('Failed:', e);
    } finally {
      setLoading(false);
    }
  }, [id, preset, customStart, customEnd]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const maxConv = useMemo(
    () => Math.max(...(data?.dailyBreakdown.map((d) => d.conversions) ?? [0]), 1),
    [data?.dailyBreakdown]
  );
  const sortedCodes = useMemo(
    () => [...(data?.codePerformance ?? [])].sort((a, b) => b.conversions - a.conversions),
    [data?.codePerformance]
  );

  // ---- CSV Export (Summary) ----
  const handleExportCsv = () => {
    if (!data) return;
    const r = data.rep;
    const dl = dr(data.dateRange.startDate, data.dateRange.endDate);
    let csv = `Sales Rep Report Card\nRep: ${r.name}\nEmail: ${r.email}\nClinic: ${r.clinicName}\nPlan: ${r.currentPlan || 'None'}\nPeriod: ${dl}\nGenerated: ${new Date().toLocaleString()}\n\n`;
    csv += `Summary\nClicks,${data.stats.totalClicks}\nConversions,${data.stats.totalConversions}\nPatients,${data.stats.patientsAssigned}\nRevenue,${(data.stats.revenueCents / 100).toFixed(2)}\nCommission Earned,${(data.stats.commissionEarnedCents / 100).toFixed(2)}\nCommission Events,${data.stats.commissionEvents}\nConv Rate,${data.stats.conversionRate.toFixed(1)}%\nAvg Deal Size,${(data.stats.avgDealSizeCents / 100).toFixed(2)}\nAvg Commission/Sale,${(data.stats.avgCommissionPerSaleCents / 100).toFixed(2)}\n\n`;
    csv += `Weekly Summary\nWeek,Clicks,Conversions,Commission\n`;
    data.weeklyRollup.forEach((w) => {
      csv += `${w.weekStart} to ${w.weekEnd},${w.clicks},${w.conversions},${(w.commissionCents / 100).toFixed(2)}\n`;
    });
    csv += `\nDaily Breakdown\nDate,Clicks,Conversions,Commission\n`;
    data.dailyBreakdown.forEach((d) => {
      csv += `${new Date(d.date).toISOString().slice(0, 10)},${d.clicks},${d.conversions},${(d.commissionCents / 100).toFixed(2)}\n`;
    });
    csv += `\nRef Codes\nCode,Active,Clicks,Conversions,Conv Rate\n`;
    data.codePerformance.forEach((c) => {
      csv += `${c.refCode},${c.isActive ? 'Yes' : 'No'},${c.clicks},${c.conversions},${c.conversionRate.toFixed(1)}%\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-rep-${r.name.replace(/\s+/g, '-')}-report-${calendarTodayServer()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  // ---- Detailed Payroll CSV ----
  const [dlPayroll, setDlPayroll] = useState(false);
  const handlePayrollCsv = async () => {
    if (!data?.dateRange) return;
    setDlPayroll(true);
    try {
      const p = new URLSearchParams();
      p.set('startDate', data.dateRange.startDate.split('T')[0]);
      p.set('endDate', data.dateRange.endDate.split('T')[0]);
      p.set('salesRepId', id);
      p.set('format', 'csv');
      const res = await apiFetch(`/api/super-admin/sales-reps/payroll-report?${p}`);
      if (!res.ok) {
        alert('Failed to download');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payroll-detail-${data.rep.name.replace(/\s+/g, '-')}-${data.dateRange.startDate.split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Failed to download');
    } finally {
      setDlPayroll(false);
    }
  };

  // ---- Loading / Not Found ----
  if (loading && !data)
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--brand-primary)] border-t-transparent" />
      </div>
    );
  if (!data)
    return (
      <div className="p-6">
        <a
          href="/super-admin/sales-reps"
          className="mb-4 flex items-center gap-1 text-gray-600 hover:text-gray-900"
        >
          <ChevronLeft className="h-5 w-5" />
          Back
        </a>
        <div className="py-16 text-center">
          <p className="text-gray-500">Sales rep not found.</p>
        </div>
      </div>
    );

  const rep = data.rep;
  const st = data.stats;
  const isRefetching = loading && data !== null;

  return (
    <div className="p-6">
      {/* ================================================================ */}
      {/* SECTION 1: Profile Header                                        */}
      {/* ================================================================ */}
      <div className="mb-6">
        <a
          href="/super-admin/sales-reps"
          className="mb-4 flex items-center gap-1 text-gray-600 hover:text-gray-900"
        >
          <ChevronLeft className="h-5 w-5" />
          Back to Sales Reps
        </a>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{rep.name}</h1>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${rep.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}
              >
                {rep.status}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" />
                {rep.clinicName}
              </span>
              <span className="flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" />
                {rep.email}
              </span>
              {rep.currentPlan && (
                <span className="flex items-center gap-1">
                  <BadgeDollarSign className="h-3.5 w-3.5" />
                  {rep.currentPlan}
                </span>
              )}
              {rep.lastLogin && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  Last login: {fd(rep.lastLogin)}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Joined: {fd(rep.createdAt)}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Download className="h-4 w-4" />
              Summary CSV
            </button>
            <button
              onClick={handlePayrollCsv}
              disabled={dlPayroll}
              className="flex items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[#3d8a66] disabled:opacity-50"
            >
              <FileText className={`h-4 w-4 ${dlPayroll ? 'animate-spin' : ''}`} />
              {dlPayroll ? 'Downloading...' : 'Payroll Report'}
            </button>
          </div>
        </div>
      </div>

      {/* Period Filter */}
      <div className="mb-6 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-700">
          <Calendar className="h-4 w-4" />
          Period
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Time Period</label>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--brand-primary)] focus:outline-none"
            >
              {PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          {preset === 'custom' && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Start</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">End</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
            </>
          )}
        </div>
        {data.dateRange && (
          <div className="mt-2 text-xs text-gray-500">
            Showing: {dr(data.dateRange.startDate, data.dateRange.endDate)}
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* SECTION 2: KPI Cards (8)                                         */}
      {/* ================================================================ */}
      <div className={`relative mb-6 transition-opacity ${isRefetching ? 'opacity-60' : ''}`}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          {[
            {
              icon: MousePointer,
              bg: 'bg-blue-100',
              fg: 'text-blue-600',
              val: st.totalClicks.toLocaleString(),
              label: 'Clicks',
            },
            {
              icon: TrendingUp,
              bg: 'bg-green-100',
              fg: 'text-green-600',
              val: st.totalConversions.toLocaleString(),
              label: 'Conversions',
            },
            {
              icon: UserCheck,
              bg: 'bg-yellow-100',
              fg: 'text-yellow-600',
              val: st.patientsAssigned.toLocaleString(),
              label: 'Patients',
            },
            {
              icon: DollarSign,
              bg: 'bg-indigo-100',
              fg: 'text-indigo-600',
              val: $(st.revenueCents),
              label: 'Revenue',
            },
            {
              icon: BadgeDollarSign,
              bg: 'bg-emerald-100',
              fg: 'text-emerald-600',
              val: $(st.commissionEarnedCents),
              label: 'Earned',
              valColor: 'text-emerald-700',
            },
            {
              icon: Target,
              bg: 'bg-purple-100',
              fg: 'text-purple-600',
              val: pct(st.conversionRate),
              label: 'Conv Rate',
            },
            {
              icon: Receipt,
              bg: 'bg-orange-100',
              fg: 'text-orange-600',
              val: $(st.avgDealSizeCents),
              label: 'Avg Deal',
            },
            {
              icon: BarChart3,
              bg: 'bg-pink-100',
              fg: 'text-pink-600',
              val: $(st.avgCommissionPerSaleCents),
              label: 'Avg Comm',
            },
          ].map(({ icon: Icon, bg, fg, val, label, valColor }) => (
            <div key={label} className="rounded-xl bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2.5">
                <div className={`rounded-lg ${bg} p-1.5 ${fg}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className={`text-lg font-bold ${valColor || 'text-gray-900'}`}>{val}</p>
                  <p className="text-xs text-gray-500">{label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        {isRefetching && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--brand-primary)] border-t-transparent" />
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* SECTION 3: Daily Performance + Ref Codes                         */}
      {/* ================================================================ */}
      <div
        className={`mb-6 grid gap-6 transition-opacity lg:grid-cols-3 ${isRefetching ? 'opacity-60' : ''}`}
      >
        <div className="rounded-xl bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Daily Performance</h2>
          {data.dailyBreakdown.length > 0 ? (
            <div className="max-h-[350px] space-y-1 overflow-y-auto">
              {data.dailyBreakdown.map((day, i) => {
                const w = (day.conversions / maxConv) * 100;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-12 flex-shrink-0 text-[11px] text-gray-500">
                      {sd(day.date)}
                    </span>
                    <div className="flex-1">
                      <div
                        className="h-3.5 rounded-r bg-[var(--brand-primary)] transition-all"
                        style={{ width: `${Math.max(w, 2)}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-[11px] font-medium text-gray-700">
                      {day.conversions}
                    </span>
                    <span className="w-14 text-right text-[11px] text-emerald-600">
                      {$(day.commissionCents)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex h-40 items-center justify-center text-gray-500">
              No data for this period
            </div>
          )}
        </div>

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Ref Codes</h2>
          {sortedCodes.length > 0 ? (
            <div className="space-y-3">
              {sortedCodes.map((code) => (
                <div key={code.id} className="rounded-lg border border-gray-100 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-gray-900">
                        {code.refCode}
                      </span>
                      {!code.isActive && (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                          Inactive
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-medium text-[var(--brand-primary)]">
                      {code.conversions} conv.
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-4 text-xs text-gray-500">
                    <span>{code.clicks} clicks</span>
                    <span>{pct(code.conversionRate)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-[var(--brand-primary)]"
                      style={{ width: `${Math.min(code.conversionRate * 2, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-gray-500">No ref codes</div>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* SECTION 4: Commission Event Ledger                               */}
      {/* ================================================================ */}
      <div className={`mb-6 transition-opacity ${isRefetching ? 'opacity-60' : ''}`}>
        <div className="rounded-xl bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Receipt className="h-5 w-5 text-gray-400" />
              Commission Ledger
            </h2>
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
              {data.commissionLedger.length} events
            </span>
          </div>
          {data.commissionLedger.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50/50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500">
                      Date
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium uppercase text-gray-500">
                      Sale Amt
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium uppercase text-gray-500">
                      Commission
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium uppercase text-gray-500">
                      Base
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium uppercase text-gray-500">
                      Tier
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium uppercase text-gray-500">
                      Product
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium uppercase text-gray-500">
                      Multi
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500">
                      Status
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500">
                      Source
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500">
                      Plan
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.commissionLedger.map((ev) => (
                    <tr key={ev.id} className="hover:bg-gray-50/50">
                      <td className="whitespace-nowrap px-4 py-2.5 text-sm text-gray-900">
                        {fd(ev.occurredAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-sm text-gray-900">
                        {$(ev.eventAmountCents)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-sm font-semibold text-emerald-600">
                        {$(ev.commissionAmountCents)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs text-gray-500">
                        {$(ev.baseCommissionCents)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs text-gray-500">
                        {ev.volumeTierBonusCents > 0 ? $(ev.volumeTierBonusCents) : '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs text-gray-500">
                        {ev.productBonusCents > 0 ? $(ev.productBonusCents) : '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs text-gray-500">
                        {ev.multiItemBonusCents > 0 ? $(ev.multiItemBonusCents) : '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor[ev.status] || 'bg-gray-100 text-gray-800'}`}
                        >
                          {ev.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-500">
                        {ev.isManual ? 'Manual' : 'Stripe'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-500">
                        {ev.planName || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center">
              <Receipt className="mx-auto h-10 w-10 text-gray-300" />
              <p className="mt-2 text-gray-500">No commission events yet</p>
              <p className="mt-1 text-xs text-gray-400">
                Commission events appear here when payments are processed for this rep's patients
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* SECTION 5: Weekly Summary                                        */}
      {/* ================================================================ */}
      {data.weeklyRollup.length > 0 && (
        <div className={`mb-6 transition-opacity ${isRefetching ? 'opacity-60' : ''}`}>
          <div className="rounded-xl bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                <BarChart3 className="h-5 w-5 text-gray-400" />
                Weekly Summary
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50/50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500">
                      Week
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium uppercase text-gray-500">
                      Clicks
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium uppercase text-gray-500">
                      Conversions
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium uppercase text-gray-500">
                      Commission
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.weeklyRollup.map((w, i) => {
                    const now = new Date();
                    const ws = new Date(w.weekStart);
                    const we = new Date(w.weekEnd);
                    const isCurrent = now >= ws && now <= we;
                    return (
                      <tr
                        key={i}
                        className={
                          isCurrent ? 'bg-[var(--brand-primary)]/5' : 'hover:bg-gray-50/50'
                        }
                      >
                        <td className="whitespace-nowrap px-4 py-2.5 text-sm text-gray-900">
                          {sd(w.weekStart)} — {sd(w.weekEnd)}
                          {isCurrent && (
                            <span className="bg-[var(--brand-primary)]/10 ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium text-[var(--brand-primary)]">
                              Current
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right text-sm text-gray-900">
                          {w.clicks.toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right text-sm font-medium text-gray-900">
                          {w.conversions.toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right text-sm font-semibold text-emerald-600">
                          {$(w.commissionCents)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* SECTION 6: Assigned Patients                                     */}
      {/* ================================================================ */}
      <div className={`mb-6 transition-opacity ${isRefetching ? 'opacity-60' : ''}`}>
        <div className="rounded-xl bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Users className="h-5 w-5 text-gray-400" />
              Assigned Patients
            </h2>
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
              {data.patients.length} patients
            </span>
          </div>
          {data.patients.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50/50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500">
                      Patient
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500">
                      ID
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500">
                      Assigned
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500">
                      Payment
                    </th>
                    <th className="relative px-4 py-2.5">
                      <span className="sr-only">View</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.patients.map((pt) => (
                    <tr key={pt.assignmentId} className="hover:bg-gray-50/50">
                      <td className="whitespace-nowrap px-4 py-2.5 text-sm font-medium text-gray-900">
                        {pt.firstName} {pt.lastName}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-sm text-gray-500">
                        {pt.displayId || `#${pt.patientId}`}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-sm text-gray-500">
                        {fd(pt.assignedAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        {pt.hasPayment ? (
                          <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
                            Paid
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">
                            No payment
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        <a
                          href={`/patients/${pt.patientId}`}
                          className="text-xs text-[var(--brand-primary)] hover:underline"
                        >
                          View
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center">
              <Users className="mx-auto h-10 w-10 text-gray-300" />
              <p className="mt-2 text-gray-500">No patients assigned in this period</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
