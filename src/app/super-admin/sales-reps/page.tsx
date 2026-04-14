'use client';

import { calendarTodayServer } from '@/lib/utils/platform-calendar';
import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  BadgeDollarSign,
  Users,
  TrendingUp,
  DollarSign,
  Target,
  Download,
  Calendar,
  Building2,
  ChevronDown,
  ChevronUp,
  Eye,
  ArrowUpDown,
  Search,
  RefreshCw,
  MousePointer,
  UserCheck,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';
import { normalizedIncludes } from '@/lib/utils/search';

interface SalesRepRow {
  id: number;
  name: string;
  email: string;
  status: string;
  clinicId: number;
  clinicName: string | null;
  lastLogin: string | null;
  totalClicks: number;
  totalConversions: number;
  patientsAssigned: number;
  conversionRate: number;
  commissionEarnedCents: number;
  revenueCents: number;
  refCodes: string[];
}

interface Summary {
  totalReps: number;
  activeReps: number;
  totalPatients: number;
  totalClicks: number;
  totalConversions: number;
  totalCommissionCents: number;
  totalRevenueCents: number;
  avgConversionRate: number;
}

interface ApiResponse {
  summary: Summary;
  reps: SalesRepRow[];
  dateRange: { startDate: string; endDate: string };
}

interface Clinic {
  id: number;
  name: string;
}

type SortKey =
  | 'name'
  | 'totalClicks'
  | 'totalConversions'
  | 'patientsAssigned'
  | 'conversionRate'
  | 'commissionEarnedCents'
  | 'revenueCents';

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

function fmtDateRange(start: string, end: string): string {
  const o: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  return `${new Date(start).toLocaleDateString('en-US', o)} — ${new Date(end).toLocaleDateString('en-US', o)}`;
}
function fmtPct(v: number): string {
  return `${v.toFixed(1)}%`;
}
function fmtUSD(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export default function SalesRepsPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [preset, setPreset] = useState<string>('last30');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [clinicId, setClinicId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('commissionEarnedCents');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const fetchClinics = useCallback(async () => {
    try {
      const res = await apiFetch('/api/super-admin/clinics');
      if (res.ok) {
        setClinics((await res.json()).clinics || []);
      }
    } catch {
      /* non-critical */
    }
  }, []);

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
      if (clinicId) p.set('clinicId', clinicId);
      const res = await apiFetch(`/api/super-admin/sales-reps?${p}`);
      if (res.ok) setData(await res.json());
    } catch (e) {
      process.env.NODE_ENV === 'development' && console.error('Failed to fetch sales reps:', e);
    } finally {
      setLoading(false);
    }
  }, [preset, customStart, customEnd, clinicId]);

  useEffect(() => {
    fetchClinics();
  }, [fetchClinics]);
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const filteredReps = useMemo(() => {
    if (!data?.reps) return [];
    let result = data.reps;
    if (searchQuery) {
      result = result.filter(
        (r) =>
          normalizedIncludes(r.name, searchQuery) ||
          normalizedIncludes(r.email, searchQuery) ||
          normalizedIncludes(r.clinicName || '', searchQuery) ||
          r.refCodes.some((c) => normalizedIncludes(c, searchQuery))
      );
    }
    return [...result].sort((a, b) => {
      if (sortKey === 'name')
        return sortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      const va = (a[sortKey] as number) || 0;
      const vb = (b[sortKey] as number) || 0;
      return sortDir === 'asc' ? va - vb : vb - va;
    });
  }, [data?.reps, searchQuery, sortKey, sortDir]);

  const handleExportCsv = () => {
    if (!data || filteredReps.length === 0) return;
    const dl = data.dateRange
      ? fmtDateRange(data.dateRange.startDate, data.dateRange.endDate)
      : preset;
    let csv = `Sales Rep Payroll Report\nPeriod: ${dl}\nGenerated: ${new Date().toLocaleString()}\n\n`;
    csv += `Rank,Sales Rep,Email,Clinic,Status,Clicks,Conversions,Patients,Revenue,Commission Earned,Conv. Rate,Ref Codes\n`;
    filteredReps.forEach((r, i) => {
      csv += `${i + 1},"${r.name}","${r.email}","${r.clinicName}",${r.status},${r.totalClicks},${r.totalConversions},${r.patientsAssigned},${(r.revenueCents / 100).toFixed(2)},${(r.commissionEarnedCents / 100).toFixed(2)},${r.conversionRate.toFixed(1)}%,"${r.refCodes.join(', ')}"\n`;
    });
    csv += `\nSummary\nTotal Reps,${data.summary.totalReps}\nActive Reps,${data.summary.activeReps}\nTotal Conversions,${data.summary.totalConversions}\nTotal Patients,${data.summary.totalPatients}\nTotal Revenue,$${(data.summary.totalRevenueCents / 100).toFixed(2)}\nTotal Commissions,$${(data.summary.totalCommissionCents / 100).toFixed(2)}\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sales-reps-payroll-${preset}-${calendarTodayServer()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const [downloadingPayroll, setDownloadingPayroll] = useState(false);

  const handleDownloadPayrollReport = async () => {
    if (!data?.dateRange) return;
    setDownloadingPayroll(true);
    try {
      const p = new URLSearchParams();
      p.set('startDate', data.dateRange.startDate.split('T')[0]);
      p.set('endDate', data.dateRange.endDate.split('T')[0]);
      if (clinicId) p.set('clinicId', clinicId);
      p.set('format', 'csv');

      const res = await apiFetch(`/api/super-admin/sales-reps/payroll-report?${p}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to download payroll report');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sales-rep-payroll-detail-${data.dateRange.startDate.split('T')[0]}-to-${data.dateRange.endDate.split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      process.env.NODE_ENV === 'development' && console.error('Payroll download failed:', e);
      alert('Failed to download payroll report');
    } finally {
      setDownloadingPayroll(false);
    }
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-40" />;
    return sortDir === 'asc' ? (
      <ChevronUp className="ml-1 inline h-3 w-3" />
    ) : (
      <ChevronDown className="ml-1 inline h-3 w-3" />
    );
  };

  const s = data?.summary;
  const isRefetching = loading && data !== null;

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <BadgeDollarSign className="h-5 w-5 text-[var(--brand-primary)]" />
            <span className="text-sm font-medium text-[var(--brand-primary)]">
              Cross-Clinic View
            </span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Reps</h1>
          <p className="text-gray-500">Performance & commission reporting for payroll</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/super-admin/sales-reps/payroll"
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            <BadgeDollarSign className="h-4 w-4" /> Payroll Center
          </a>
          <a
            href="/super-admin/sales-reps/commission-plans"
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <BadgeDollarSign className="h-4 w-4" /> Commission Plans
          </a>
          <a
            href="/super-admin/sales-reps/salaries"
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <DollarSign className="h-4 w-4" /> Salaries
          </a>
          <a
            href="/super-admin/sales-reps/overrides"
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Users className="h-4 w-4" /> Override Managers
          </a>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button
            onClick={handleExportCsv}
            disabled={!data || filteredReps.length === 0}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Summary CSV
          </button>
          <button
            onClick={handleDownloadPayrollReport}
            disabled={!data || downloadingPayroll}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Download className={`h-4 w-4 ${downloadingPayroll ? 'animate-spin' : ''}`} />{' '}
            {downloadingPayroll ? 'Downloading...' : 'Export CSV'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-700">
          <Calendar className="h-4 w-4" /> Period & Filters
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Time Period</label>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
              className="focus:ring-[var(--brand-primary)]/20 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2"
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
                <label className="mb-1 block text-xs font-medium text-gray-500">Start Date</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--brand-primary)] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">End Date</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--brand-primary)] focus:outline-none"
                />
              </div>
            </>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Clinic</label>
            <select
              value={clinicId}
              onChange={(e) => setClinicId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--brand-primary)] focus:outline-none"
            >
              <option value="">All Clinics</option>
              {clinics.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Name, email, clinic, or code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-[var(--brand-primary)] focus:outline-none"
              />
            </div>
          </div>
        </div>
        {data?.dateRange && (
          <div className="mt-3 text-xs text-gray-500">
            Showing data for: {fmtDateRange(data.dateRange.startDate, data.dateRange.endDate)}
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className={`relative mb-6 transition-opacity ${isRefetching ? 'opacity-60' : ''}`}>
        {loading && !data ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-xl bg-white p-5 shadow-sm">
                <div className="h-4 w-16 rounded bg-gray-200" />
                <div className="mt-2 h-7 w-20 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        ) : s ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-xl bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-[var(--brand-primary-light)] p-2 text-[var(--brand-primary)]">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{s.totalReps}</p>
                  <p className="text-sm text-gray-500">{s.activeReps} active</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-green-100 p-2 text-green-600">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {s.totalConversions.toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-500">Conversions</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-yellow-100 p-2 text-yellow-600">
                  <UserCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {s.totalPatients.toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-500">Patients</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-100 p-2 text-blue-600">
                  <DollarSign className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{fmtUSD(s.totalRevenueCents)}</p>
                  <p className="text-sm text-gray-500">Revenue</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-100 p-2 text-emerald-600">
                  <BadgeDollarSign className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-emerald-700">
                    {fmtUSD(s.totalCommissionCents)}
                  </p>
                  <p className="text-sm text-gray-500">Commissions</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-purple-100 p-2 text-purple-600">
                  <Target className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{fmtPct(s.avgConversionRate)}</p>
                  <p className="text-sm text-gray-500">Conv. Rate</p>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {isRefetching && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--brand-primary)] border-t-transparent" />
          </div>
        )}
      </div>

      {/* Table */}
      <div
        className={`relative overflow-hidden rounded-xl bg-white shadow-sm transition-opacity ${isRefetching ? 'opacity-60' : ''}`}
      >
        {loading && !data ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--brand-primary)] border-t-transparent" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      #
                    </th>
                    <th
                      className="cursor-pointer px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-900"
                      onClick={() => handleSort('name')}
                    >
                      Sales Rep <SortIcon column="name" />
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Clinic
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Status
                    </th>
                    <th
                      className="cursor-pointer px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-900"
                      onClick={() => handleSort('totalConversions')}
                    >
                      Sales <SortIcon column="totalConversions" />
                    </th>
                    <th
                      className="cursor-pointer px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-900"
                      onClick={() => handleSort('patientsAssigned')}
                    >
                      Patients <SortIcon column="patientsAssigned" />
                    </th>
                    <th
                      className="cursor-pointer px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-900"
                      onClick={() => handleSort('revenueCents')}
                    >
                      Revenue <SortIcon column="revenueCents" />
                    </th>
                    <th
                      className="cursor-pointer px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-900"
                      onClick={() => handleSort('commissionEarnedCents')}
                    >
                      Earnings <SortIcon column="commissionEarnedCents" />
                    </th>
                    <th
                      className="cursor-pointer px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-900"
                      onClick={() => handleSort('conversionRate')}
                    >
                      Conv % <SortIcon column="conversionRate" />
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Codes
                    </th>
                    <th className="relative px-3 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {filteredReps.map((rep, i) => (
                    <tr
                      key={rep.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => {
                        window.location.href = `/super-admin/sales-reps/${rep.id}`;
                      }}
                    >
                      <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-500">{i + 1}</td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <p className="font-medium text-[var(--brand-primary)] hover:underline">
                          {rep.name}
                        </p>
                        <p className="text-xs text-gray-500">{rep.email}</p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-gray-400" />
                          <span className="text-sm text-gray-700">{rep.clinicName || '—'}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${rep.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : rep.status === 'SUSPENDED' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}
                        >
                          {rep.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-medium text-gray-900">
                        {rep.totalConversions.toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-sm text-gray-900">
                        {rep.patientsAssigned.toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-sm text-gray-900">
                        {fmtUSD(rep.revenueCents)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-semibold text-emerald-600">
                        {fmtUSD(rep.commissionEarnedCents)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-sm text-gray-900">
                        {fmtPct(rep.conversionRate)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {rep.refCodes.slice(0, 2).map((code) => (
                            <span
                              key={code}
                              className="inline-flex rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-700"
                            >
                              {code}
                            </span>
                          ))}
                          {rep.refCodes.length > 2 && (
                            <span className="text-xs text-gray-400">
                              +{rep.refCodes.length - 2}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            window.location.href = `/super-admin/sales-reps/${rep.id}`;
                          }}
                          className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-[var(--brand-primary)]"
                          title="View details"
                        >
                          <Eye className="inline h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredReps.length === 0 && !loading && (
              <div className="py-16 text-center">
                <BadgeDollarSign className="mx-auto h-12 w-12 text-gray-300" />
                <p className="mt-2 text-gray-500">No sales reps found</p>
                <p className="mt-1 text-sm text-gray-400">
                  {searchQuery
                    ? 'Try adjusting your search or filters'
                    : 'Create users with the Sales Rep role to see them here'}
                </p>
              </div>
            )}
          </>
        )}
      </div>
      {filteredReps.length > 0 && (
        <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
          <span>
            Showing {filteredReps.length} of {data?.reps.length ?? 0} sales reps
          </span>
          {data?.dateRange && (
            <span>{fmtDateRange(data.dateRange.startDate, data.dateRange.endDate)}</span>
          )}
        </div>
      )}
    </div>
  );
}
