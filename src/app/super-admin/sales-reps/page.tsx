'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
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
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';
import { normalizedIncludes } from '@/lib/utils/search';

interface SalesRepRow {
  id: number;
  displayName: string;
  status: string;
  clinicId: number;
  clinicName: string;
  totalClicks: number;
  totalConversions: number;
  totalRevenueCents: number;
  totalCommissionCents: number;
  conversionRate: number;
  refCodes: string[];
}

interface SalesRepSummary {
  totalReps: number;
  activeReps: number;
  totalSales: number;
  totalRevenueCents: number;
  totalEarningsCents: number;
  totalClicks: number;
  avgConversionRate: number;
}

interface ApiResponse {
  summary: SalesRepSummary;
  reps: SalesRepRow[];
  dateRange: { startDate: string; endDate: string };
}

interface Clinic {
  id: number;
  name: string;
}

type SortKey =
  | 'displayName'
  | 'totalClicks'
  | 'totalConversions'
  | 'totalRevenueCents'
  | 'totalCommissionCents'
  | 'conversionRate';

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

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatCurrencyFull(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatDateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  return `${new Date(start).toLocaleDateString('en-US', opts)} — ${new Date(end).toLocaleDateString('en-US', opts)}`;
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

  // Client-side sort — no API round-trip
  const [sortKey, setSortKey] = useState<SortKey>('totalConversions');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const fetchClinics = useCallback(async () => {
    try {
      const res = await apiFetch('/api/super-admin/clinics');
      if (res.ok) {
        const json = await res.json();
        setClinics(json.clinics || []);
      }
    } catch {
      // non-critical
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();

      if (preset === 'custom' && customStart && customEnd) {
        params.set('startDate', customStart);
        params.set('endDate', customEnd);
      } else if (preset !== 'custom') {
        params.set('preset', preset);
      }

      if (clinicId) params.set('clinicId', clinicId);

      const res = await apiFetch(`/api/super-admin/sales-reps?${params}`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch (error) {
      process.env.NODE_ENV === 'development' && console.error('Failed to fetch sales reps:', error);
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
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  // Client-side filter + sort — runs instantly, no network call
  const filteredReps = useMemo(() => {
    if (!data?.reps) return [];

    let result = data.reps;

    if (searchQuery) {
      result = result.filter(
        (rep) =>
          normalizedIncludes(rep.displayName, searchQuery) ||
          normalizedIncludes(rep.clinicName, searchQuery) ||
          rep.refCodes.some((code) => normalizedIncludes(code, searchQuery))
      );
    }

    return [...result].sort((a, b) => {
      if (sortKey === 'displayName') {
        return sortDir === 'asc'
          ? a.displayName.localeCompare(b.displayName)
          : b.displayName.localeCompare(a.displayName);
      }
      const valA = (a[sortKey] as number) || 0;
      const valB = (b[sortKey] as number) || 0;
      return sortDir === 'asc' ? valA - valB : valB - valA;
    });
  }, [data?.reps, searchQuery, sortKey, sortDir]);

  const handleExportCsv = () => {
    if (!data || filteredReps.length === 0) return;

    const dateLabel = data.dateRange
      ? formatDateRange(data.dateRange.startDate, data.dateRange.endDate)
      : preset;

    let csv = `Sales Rep Performance Report\n`;
    csv += `Period: ${dateLabel}\n`;
    csv += `Generated: ${new Date().toLocaleString()}\n\n`;
    csv += `Rank,Sales Rep,Clinic,Status,Clicks,Sales,Revenue,Earnings,Conv. Rate,Ref Codes\n`;

    filteredReps.forEach((rep, i) => {
      csv += `${i + 1},"${rep.displayName}","${rep.clinicName}",${rep.status},${rep.totalClicks},${rep.totalConversions},${(rep.totalRevenueCents / 100).toFixed(2)},${(rep.totalCommissionCents / 100).toFixed(2)},${rep.conversionRate.toFixed(1)}%,"${rep.refCodes.join(', ')}"\n`;
    });

    csv += `\nSummary\n`;
    csv += `Total Reps,${data.summary.totalReps}\n`;
    csv += `Active Reps,${data.summary.activeReps}\n`;
    csv += `Total Sales,${data.summary.totalSales}\n`;
    csv += `Total Revenue,$${(data.summary.totalRevenueCents / 100).toFixed(2)}\n`;
    csv += `Total Earnings,$${(data.summary.totalEarningsCents / 100).toFixed(2)}\n`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sales-reps-report-${preset}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-40" />;
    return sortDir === 'asc' ? (
      <ChevronUp className="ml-1 inline h-3 w-3" />
    ) : (
      <ChevronDown className="ml-1 inline h-3 w-3" />
    );
  };

  const summary = data?.summary;
  const isRefetching = loading && data !== null;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <BadgeDollarSign className="h-5 w-5 text-[var(--brand-primary)]" />
            <span className="text-sm font-medium text-[var(--brand-primary)]">Cross-Clinic View</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Reps</h1>
          <p className="text-gray-500">Affiliate sales performance & reporting</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleExportCsv}
            disabled={!data || filteredReps.length === 0}
            className="flex items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[#3d8a66] disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-700">
          <Calendar className="h-4 w-4" />
          Period & Filters
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Time Period</label>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/20"
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
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">End Date</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/20"
                />
              </div>
            </>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Clinic</label>
            <select
              value={clinicId}
              onChange={(e) => setClinicId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/20"
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
                placeholder="Name, clinic, or code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/20"
              />
            </div>
          </div>
        </div>

        {data?.dateRange && (
          <div className="mt-3 text-xs text-gray-500">
            Showing data for: {formatDateRange(data.dateRange.startDate, data.dateRange.endDate)}
          </div>
        )}
      </div>

      {/* Summary Cards — show stale data with opacity while refetching */}
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
        ) : summary ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-xl bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-[var(--brand-primary-light)] p-2 text-[var(--brand-primary)]">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{summary.totalReps}</p>
                  <p className="text-sm text-gray-500">Total Reps</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-green-100 p-2 text-green-600">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{summary.activeReps}</p>
                  <p className="text-sm text-gray-500">Active</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-100 p-2 text-blue-600">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {summary.totalSales.toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-500">Total Sales</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-100 p-2 text-emerald-600">
                  <DollarSign className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatCurrency(summary.totalRevenueCents)}
                  </p>
                  <p className="text-sm text-gray-500">Revenue</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-yellow-100 p-2 text-yellow-600">
                  <BadgeDollarSign className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatCurrency(summary.totalEarningsCents)}
                  </p>
                  <p className="text-sm text-gray-500">Earnings</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-purple-100 p-2 text-purple-600">
                  <Target className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatPercent(summary.avgConversionRate)}
                  </p>
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

      {/* Sales Reps Table */}
      <div className={`relative overflow-hidden rounded-xl bg-white shadow-sm transition-opacity ${isRefetching ? 'opacity-60' : ''}`}>
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
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      #
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-900"
                      onClick={() => handleSort('displayName')}
                    >
                      Sales Rep <SortIcon column="displayName" />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Clinic
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Status
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-900"
                      onClick={() => handleSort('totalClicks')}
                    >
                      Clicks <SortIcon column="totalClicks" />
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-900"
                      onClick={() => handleSort('totalConversions')}
                    >
                      Sales <SortIcon column="totalConversions" />
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-900"
                      onClick={() => handleSort('totalRevenueCents')}
                    >
                      Revenue <SortIcon column="totalRevenueCents" />
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-900"
                      onClick={() => handleSort('totalCommissionCents')}
                    >
                      Earnings <SortIcon column="totalCommissionCents" />
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-900"
                      onClick={() => handleSort('conversionRate')}
                    >
                      Conv. Rate <SortIcon column="conversionRate" />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Codes
                    </th>
                    <th className="relative px-4 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {filteredReps.map((rep, i) => (
                    <tr key={rep.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">{i + 1}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <p className="font-medium text-gray-900">{rep.displayName}</p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-gray-400" />
                          <span className="text-sm text-gray-700">{rep.clinicName}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                            rep.status === 'ACTIVE'
                              ? 'bg-green-100 text-green-800'
                              : rep.status === 'PAUSED'
                                ? 'bg-yellow-100 text-yellow-800'
                                : rep.status === 'SUSPENDED'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {rep.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-900">
                        {rep.totalClicks.toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-gray-900">
                        {rep.totalConversions.toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-900">
                        {formatCurrencyFull(rep.totalRevenueCents)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-green-600">
                        {formatCurrencyFull(rep.totalCommissionCents)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-900">
                        {formatPercent(rep.conversionRate)}
                      </td>
                      <td className="px-4 py-3">
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
                            <span className="text-xs text-gray-400">+{rep.refCodes.length - 2}</span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <Link
                          href={`/super-admin/sales-reps/${rep.id}`}
                          className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          title="View details"
                        >
                          <Eye className="inline h-4 w-4" />
                        </Link>
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
                    : 'Add affiliates via the Affiliates tab to see them here'}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Table footer with count */}
      {filteredReps.length > 0 && (
        <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
          <span>
            Showing {filteredReps.length} of {data?.reps.length ?? 0} sales reps
          </span>
          {data?.dateRange && (
            <span>{formatDateRange(data.dateRange.startDate, data.dateRange.endDate)}</span>
          )}
        </div>
      )}
    </div>
  );
}
