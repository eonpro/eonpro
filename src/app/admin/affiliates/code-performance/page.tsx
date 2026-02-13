'use client';

/**
 * Admin Affiliate Code Performance Page
 *
 * Displays performance metrics for all affiliate ref codes:
 * - Sortable table with Code, Affiliate, Clicks, Conversions, Revenue, Rate
 * - Date range filter
 * - Export to CSV
 * - Click through to affiliate detail
 */

import { useEffect, useState, useCallback } from 'react';
import {
  Search,
  Download,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  TrendingUp,
  MousePointer,
  DollarSign,
  Target,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';

interface CodePerformance {
  code: string;
  affiliateId: number;
  affiliateName: string;
  affiliateStatus: string;
  uses: number; // Code uses (someone wrote the code in intake)
  clicks: number; // Alias for uses (backward compatibility)
  conversions: number; // Paying customers
  revenue: number;
  conversionRate: number;
  lastUseAt: string | null;
  lastClickAt: string | null; // Alias for lastUseAt
  lastConversionAt: string | null;
  createdAt: string;
}

interface Totals {
  totalCodes: number;
  totalUses: number;
  totalClicks: number; // Alias for totalUses
  totalConversions: number;
  totalRevenue: number;
  avgConversionRate: number;
}

type SortField =
  | 'code'
  | 'affiliateName'
  | 'uses'
  | 'clicks'
  | 'conversions'
  | 'revenue'
  | 'conversionRate';
type SortOrder = 'asc' | 'desc';

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export default function CodePerformancePage() {
  const [codes, setCodes] = useState<CodePerformance[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<string>('30d');
  const [sortBy, setSortBy] = useState<SortField>('conversions');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Copy state
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token');

    try {
      const params = new URLSearchParams({
        period,
        sortBy,
        sortOrder,
        limit: '100',
        ...(search ? { search } : {}),
      });

      const response = await fetch(`/api/admin/affiliates/code-performance?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch data');
      }

      const data = await response.json();
      setCodes(data.codes);
      setTotals(data.totals);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [period, sortBy, sortOrder, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const handleCopyCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleExport = () => {
    const headers = [
      'Code',
      'Affiliate',
      'Status',
      'Uses',
      'Conversions',
      'Revenue',
      'Conversion Rate',
      'Last Use',
      'Last Conversion',
    ];
    const rows = codes.map((c) => [
      c.code,
      c.affiliateName,
      c.affiliateStatus,
      c.uses ?? c.clicks,
      c.conversions,
      (c.revenue / 100).toFixed(2),
      c.conversionRate.toFixed(2) + '%',
      c.lastUseAt ?? c.lastClickAt ?? '',
      c.lastConversionAt || '',
    ]);

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `affiliate-code-performance-${period}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    // Handle "uses" and "clicks" as the same sort field
    const effectiveSortBy = sortBy === 'clicks' ? 'uses' : sortBy;
    const effectiveField = field === 'clicks' ? 'uses' : field;
    if (effectiveSortBy !== effectiveField)
      return <ArrowUpDown className="h-4 w-4 text-gray-400" />;
    return sortOrder === 'asc' ? (
      <ArrowUp className="h-4 w-4 text-violet-600" />
    ) : (
      <ArrowDown className="h-4 w-4 text-violet-600" />
    );
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Code Performance</h1>
          <p className="text-gray-500">Track affiliate referral code usage and conversions</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleExport}
            disabled={codes.length === 0}
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {totals && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-violet-100 p-2 text-violet-600">
                <Target className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{totals.totalCodes}</p>
                <p className="text-sm text-gray-500">Active Codes</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2 text-blue-600">
                <MousePointer className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {(totals.totalUses ?? totals.totalClicks).toLocaleString()}
                </p>
                <p className="text-sm text-gray-500">Total Uses</p>
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
                  {totals.totalConversions.toLocaleString()}
                </p>
                <p className="text-sm text-gray-500">Conversions</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-yellow-100 p-2 text-yellow-600">
                <DollarSign className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(totals.totalRevenue)}
                </p>
                <p className="text-sm text-gray-500">Total Revenue</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Search */}
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search codes or affiliates..."
            className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-4 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </div>

        {/* Period Filter */}
        <div className="flex rounded-lg border border-gray-200 bg-white p-1">
          {(['7d', '30d', '90d', 'ytd', 'all'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                period === p ? 'bg-violet-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {p === 'ytd' ? 'YTD' : p === 'all' ? 'All' : p}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        {loading ? (
          <div className="flex h-96 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
          </div>
        ) : error ? (
          <div className="flex h-96 flex-col items-center justify-center text-center">
            <p className="text-red-600">{error}</p>
            <button onClick={fetchData} className="mt-4 text-violet-600 hover:text-violet-700">
              Try again
            </button>
          </div>
        ) : codes.length === 0 ? (
          <div className="flex h-96 flex-col items-center justify-center text-center">
            <Target className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-2 text-gray-500">No affiliate codes found</p>
            <p className="text-sm text-gray-400">Create ref codes in the Affiliates section</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700"
                    onClick={() => handleSort('code')}
                  >
                    <div className="flex items-center gap-1">
                      Code
                      <SortIcon field="code" />
                    </div>
                  </th>
                  <th
                    className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700"
                    onClick={() => handleSort('affiliateName')}
                  >
                    <div className="flex items-center gap-1">
                      Affiliate
                      <SortIcon field="affiliateName" />
                    </div>
                  </th>
                  <th
                    className="cursor-pointer px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700"
                    onClick={() => handleSort('uses')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Uses
                      <SortIcon field="uses" />
                    </div>
                  </th>
                  <th
                    className="cursor-pointer px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700"
                    onClick={() => handleSort('conversions')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Conversions
                      <SortIcon field="conversions" />
                    </div>
                  </th>
                  <th
                    className="cursor-pointer px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700"
                    onClick={() => handleSort('revenue')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Revenue
                      <SortIcon field="revenue" />
                    </div>
                  </th>
                  <th
                    className="cursor-pointer px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700"
                    onClick={() => handleSort('conversionRate')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Conv. Rate
                      <SortIcon field="conversionRate" />
                    </div>
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Last Activity
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {codes.map((code) => (
                  <tr key={code.code} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium text-gray-900">{code.code}</span>
                        <button
                          onClick={() => handleCopyCode(code.code)}
                          className="text-gray-400 hover:text-gray-600"
                          title="Copy code"
                        >
                          {copiedCode === code.code ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="font-medium text-gray-900">{code.affiliateName}</p>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              code.affiliateStatus === 'ACTIVE'
                                ? 'bg-green-100 text-green-700'
                                : code.affiliateStatus === 'PAUSED'
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {code.affiliateStatus}
                          </span>
                        </div>
                        <a
                          href={`/admin/affiliates/${code.affiliateId}`}
                          className="text-gray-400 hover:text-violet-600"
                          title="View affiliate"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-gray-700">
                      {(code.uses ?? code.clicks).toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      <span
                        className={`font-medium ${
                          code.conversions > 0 ? 'text-green-600' : 'text-gray-500'
                        }`}
                      >
                        {code.conversions.toLocaleString()}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right font-medium text-gray-900">
                      {formatCurrency(code.revenue)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      <span
                        className={`font-medium ${
                          code.conversionRate >= 5
                            ? 'text-green-600'
                            : code.conversionRate >= 2
                              ? 'text-yellow-600'
                              : 'text-gray-500'
                        }`}
                      >
                        {formatPercent(code.conversionRate)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-500">
                      {code.lastConversionAt ? (
                        <span title={`Last conversion: ${formatDate(code.lastConversionAt)}`}>
                          {formatDate(code.lastConversionAt)}
                        </span>
                      ) : (code.lastUseAt ?? code.lastClickAt) ? (
                        <span title={`Last use: ${formatDate(code.lastUseAt ?? code.lastClickAt)}`}>
                          {formatDate(code.lastUseAt ?? code.lastClickAt)}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary Footer */}
      {totals && codes.length > 0 && (
        <div className="mt-4 text-center text-sm text-gray-500">
          Showing {codes.length} of {totals.totalCodes} codes
          {totals.avgConversionRate > 0 && (
            <span className="ml-2">
              | Avg. conversion rate: {formatPercent(totals.avgConversionRate)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
