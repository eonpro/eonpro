'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Download,
  Filter,
  ArrowLeft,
  X,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface RevenueData {
  overview: {
    grossRevenue: number;
    netRevenue: number;
    refunds: number;
    fees: number;
    successfulPayments: number;
    failedPayments: number;
    averageOrderValue: number;
    periodGrowth: number;
  };
  trends: Array<{
    date: string;
    grossRevenue: number;
    netRevenue: number;
    refunds: number;
    paymentCount: number;
  }>;
  mrr: {
    totalMrr: number;
    newMrr: number;
    churnedMrr: number;
    expansionMrr: number;
    contractionMrr: number;
    netNewMrr: number;
    activeSubscriptions: number;
    arr: number;
    mrrGrowthRate: number;
  };
  byProduct: Array<{
    productId: number;
    productName: string;
    revenue: number;
    quantity: number;
    percentageOfTotal: number;
  }>;
  byPaymentMethod: Array<{
    method: string;
    revenue: number;
    count: number;
    percentageOfTotal: number;
  }>;
  forecast: Array<{
    month: string;
    predictedRevenue: number;
    confidence: number;
    lowerBound: number;
    upperBound: number;
  }>;
}

const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
};

const formatCurrencyCompact = (cents: number) => {
  const dollars = cents / 100;
  if (dollars >= 1000000) return `$${(dollars / 1000000).toFixed(1)}M`;
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}K`;
  return `$${dollars.toFixed(0)}`;
};

const COLORS = ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#6366F1'];

type DatePreset = '1d' | '7d' | '30d' | '90d' | 'quarter' | 'semester' | '12m' | 'custom';

function getDateRangeForApi(preset: DatePreset, customStart?: string, customEnd?: string): string {
  if (preset === 'custom' && customStart && customEnd) {
    return `range=custom&startDate=${customStart}&endDate=${customEnd}`;
  }
  return `range=${preset}`;
}

export default function RevenuePage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<RevenueData | null>(null);
  const [dateRange, setDateRange] = useState<DatePreset>('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [granularity, setGranularity] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [showTransactions, setShowTransactions] = useState(false);
  const [transactions, setTransactions] = useState<
    Array<{ id: number; amount: number; createdAt: string; patientName: string | null; paymentMethod: string; invoiceId: number | null }>
  >([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);

  const dateRangeParam = getDateRangeForApi(dateRange, customStart, customEnd);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const token =
        localStorage.getItem('auth-token') ||
        localStorage.getItem('super_admin-token') ||
        localStorage.getItem('admin-token') ||
        localStorage.getItem('token');

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(
        `/api/finance/revenue?${dateRangeParam}&granularity=${granularity}`,
        { credentials: 'include', headers }
      );

      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error('Failed to load revenue data:', error);
    } finally {
      setLoading(false);
    }
  }, [dateRangeParam, granularity]);

  const loadTransactions = useCallback(async () => {
    setTransactionsLoading(true);
    try {
      const token =
        localStorage.getItem('auth-token') ||
        localStorage.getItem('super_admin-token') ||
        localStorage.getItem('admin-token') ||
        localStorage.getItem('token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      let start: string;
      let end: string;
      if (dateRange === 'custom' && customStart && customEnd) {
        start = customStart;
        end = customEnd;
      } else {
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        end = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        const startDate = new Date();
        if (dateRange === '1d') startDate.setDate(startDate.getDate());
        else if (dateRange === '7d') startDate.setDate(startDate.getDate() - 7);
        else if (dateRange === '90d') startDate.setDate(startDate.getDate() - 90);
        else if (dateRange === 'quarter') {
          startDate.setMonth(Math.floor(startDate.getMonth() / 3) * 3);
          startDate.setDate(1);
        } else if (dateRange === 'semester') {
          startDate.setMonth(startDate.getMonth() < 6 ? 0 : 6);
          startDate.setDate(1);
        } else if (dateRange === '12m') startDate.setMonth(startDate.getMonth() - 12);
        else startDate.setDate(startDate.getDate() - 30);
        start = `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}`;
      }

      const res = await fetch(
        `/api/finance/revenue/transactions?startDate=${start}&endDate=${end}&limit=200`,
        { credentials: 'include', headers }
      );
      if (res.ok) {
        const json = await res.json();
        setTransactions(json.transactions || []);
      }
    } finally {
      setTransactionsLoading(false);
    }
  }, [dateRange, customStart, customEnd]);

  const handleOpenTransactions = () => {
    setShowTransactions(true);
    loadTransactions();
  };

  const handleExportTransactions = async () => {
    const pad = (n: number) => String(n).padStart(2, '0');
    let start: string;
    let end: string;
    if (dateRange === 'custom' && customStart && customEnd) {
      start = customStart;
      end = customEnd;
    } else {
      const now = new Date();
      end = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const startDate = new Date();
      if (dateRange === '1d') startDate.setDate(startDate.getDate());
      else if (dateRange === '7d') startDate.setDate(startDate.getDate() - 7);
      else if (dateRange === '90d') startDate.setDate(startDate.getDate() - 90);
      else if (dateRange === 'quarter') {
        startDate.setMonth(Math.floor(startDate.getMonth() / 3) * 3);
        startDate.setDate(1);
      } else if (dateRange === 'semester') {
        startDate.setMonth(startDate.getMonth() < 6 ? 0 : 6);
        startDate.setDate(1);
      } else if (dateRange === '12m') startDate.setMonth(startDate.getMonth() - 12);
      else startDate.setDate(startDate.getDate() - 30);
      start = `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}`;
    }
    const token = localStorage.getItem('auth-token') || localStorage.getItem('super_admin-token') || localStorage.getItem('admin-token') || localStorage.getItem('token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(
      `/api/finance/revenue/transactions?startDate=${start}&endDate=${end}&format=csv`,
      { credentials: 'include', headers }
    );
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `revenue-transactions-${start}-${end}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  useEffect(() => {
    if (dateRange === 'custom' && (!customStart || !customEnd)) return;
    loadData();
  }, [loadData, dateRange, customStart, customEnd]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  // Use real data with empty defaults
  const displayData: RevenueData = data || {
    overview: {
      grossRevenue: 0,
      netRevenue: 0,
      refunds: 0,
      fees: 0,
      successfulPayments: 0,
      failedPayments: 0,
      averageOrderValue: 0,
      periodGrowth: 0,
    },
    trends: [],
    mrr: {
      totalMrr: 0,
      newMrr: 0,
      churnedMrr: 0,
      expansionMrr: 0,
      contractionMrr: 0,
      netNewMrr: 0,
      activeSubscriptions: 0,
      arr: 0,
      mrrGrowthRate: 0,
    },
    byProduct: [],
    byPaymentMethod: [],
    forecast: [],
  };
  const isPositiveGrowth = displayData.overview.periodGrowth >= 0;

  // MRR Waterfall data
  const mrrWaterfallData = [
    {
      name: 'Starting MRR',
      value: displayData.mrr.totalMrr - displayData.mrr.netNewMrr,
      fill: '#6B7280',
    },
    { name: 'New', value: displayData.mrr.newMrr, fill: '#10B981' },
    { name: 'Expansion', value: displayData.mrr.expansionMrr, fill: '#3B82F6' },
    { name: 'Contraction', value: -displayData.mrr.contractionMrr, fill: '#F59E0B' },
    { name: 'Churned', value: -displayData.mrr.churnedMrr, fill: '#EF4444' },
    { name: 'Ending MRR', value: displayData.mrr.totalMrr, fill: '#8B5CF6' },
  ];

  const DATE_PRESETS: { value: DatePreset; label: string }[] = [
    { value: '1d', label: 'Today' },
    { value: '7d', label: '7D' },
    { value: '30d', label: '30D' },
    { value: '90d', label: '90D' },
    { value: 'quarter', label: 'Quarter' },
    { value: 'semester', label: 'Semester' },
    { value: '12m', label: '12M' },
    { value: 'custom', label: 'Custom' },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/admin/finance/reports"
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Report Center
          </Link>
          <h2 className="text-2xl font-bold text-gray-900">Revenue Analytics</h2>
          <p className="mt-1 text-sm text-gray-500">
            Track revenue trends, MRR, and payment performance
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Date Range */}
          <div className="flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-white p-1">
            {DATE_PRESETS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => {
                  setDateRange(value);
                  if (value === 'custom') {
                    const pad = (n: number) => String(n).padStart(2, '0');
                    const n = new Date();
                    const start = new Date(n.getFullYear(), n.getMonth(), 1);
                    setCustomEnd(`${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`);
                    setCustomStart(`${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`);
                  }
                }}
                className={`rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                  dateRange === value
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {dateRange === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <span className="text-gray-400">→</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
          )}
          <select
            value={granularity}
            onChange={(e) => setGranularity(e.target.value as 'daily' | 'weekly' | 'monthly')}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <button
            onClick={handleExportTransactions}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <button
          type="button"
          onClick={handleOpenTransactions}
          className="rounded-xl border border-gray-200 bg-white p-5 text-left shadow-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        >
          <div className="flex items-center justify-between">
            <div className="rounded-lg bg-emerald-50 p-2">
              <DollarSign className="h-5 w-5 text-emerald-600" />
            </div>
            <span
              className={`flex items-center text-sm font-medium ${
                isPositiveGrowth ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {isPositiveGrowth ? (
                <ArrowUpRight className="h-4 w-4" />
              ) : (
                <ArrowDownRight className="h-4 w-4" />
              )}
              {Math.abs(displayData.overview.periodGrowth).toFixed(1)}%
            </span>
          </div>
          <h3 className="mt-4 text-2xl font-bold text-gray-900">
            {formatCurrency(displayData.overview.grossRevenue)}
          </h3>
          <p className="mt-1 text-sm text-gray-500">Gross Revenue — click to view transactions</p>
        </button>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="w-fit rounded-lg bg-blue-50 p-2">
            <TrendingUp className="h-5 w-5 text-blue-600" />
          </div>
          <h3 className="mt-4 text-2xl font-bold text-gray-900">
            {formatCurrency(displayData.overview.netRevenue)}
          </h3>
          <p className="mt-1 text-sm text-gray-500">Net Revenue (after fees)</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="rounded-lg bg-purple-50 p-2">
              <Calendar className="h-5 w-5 text-purple-600" />
            </div>
            <span
              className={`flex items-center text-sm font-medium ${
                displayData.mrr.mrrGrowthRate >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {displayData.mrr.mrrGrowthRate >= 0 ? (
                <ArrowUpRight className="h-4 w-4" />
              ) : (
                <ArrowDownRight className="h-4 w-4" />
              )}
              {Math.abs(displayData.mrr.mrrGrowthRate).toFixed(1)}%
            </span>
          </div>
          <h3 className="mt-4 text-2xl font-bold text-gray-900">
            {formatCurrency(displayData.mrr.totalMrr)}
          </h3>
          <p className="mt-1 text-sm text-gray-500">Monthly Recurring Revenue</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="w-fit rounded-lg bg-amber-50 p-2">
            <TrendingDown className="h-5 w-5 text-amber-600" />
          </div>
          <h3 className="mt-4 text-2xl font-bold text-gray-900">
            {formatCurrency(displayData.overview.refunds)}
          </h3>
          <p className="mt-1 text-sm text-gray-500">Refunds</p>
        </div>
      </div>

      {/* Revenue Trend Chart */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Revenue Trend</h3>
        {displayData.trends.length === 0 ? (
          <div className="flex h-[350px] flex-col items-center justify-center text-gray-400">
            <TrendingUp className="mb-3 h-12 w-12" />
            <p className="text-gray-500">No revenue data available for this period</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={displayData.trends}>
              <defs>
                <linearGradient id="grossGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="netGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12, fill: '#6B7280' }}
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return `${date.getMonth() + 1}/${date.getDate()}`;
                }}
              />
              <YAxis
                tick={{ fontSize: 12, fill: '#6B7280' }}
                tickFormatter={(value) => formatCurrencyCompact(value)}
              />
              <Tooltip
                formatter={(value) => formatCurrency(value as number)}
                labelFormatter={(label) => new Date(label as string).toLocaleDateString()}
                contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB' }}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="grossRevenue"
                name="Gross Revenue"
                stroke="#10B981"
                fill="url(#grossGradient)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="netRevenue"
                name="Net Revenue"
                stroke="#3B82F6"
                fill="url(#netGradient)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* MRR Waterfall */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">MRR Breakdown</h3>
          {displayData.mrr.totalMrr === 0 ? (
            <div className="flex h-[300px] flex-col items-center justify-center text-gray-400">
              <Calendar className="mb-3 h-12 w-12" />
              <p className="text-gray-500">No subscription data available</p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={mrrWaterfallData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6B7280' }} />
                  <YAxis
                    tick={{ fontSize: 12, fill: '#6B7280' }}
                    tickFormatter={(value) => formatCurrencyCompact(Math.abs(value))}
                  />
                  <Tooltip
                    formatter={(value) => formatCurrency(Math.abs(value as number))}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB' }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {mrrWaterfallData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 grid grid-cols-3 gap-4 border-t border-gray-100 pt-4">
                <div className="text-center">
                  <p className="text-sm text-gray-500">New MRR</p>
                  <p className="text-lg font-semibold text-green-600">
                    +{formatCurrency(displayData.mrr.newMrr)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-500">Churned MRR</p>
                  <p className="text-lg font-semibold text-red-600">
                    -{formatCurrency(displayData.mrr.churnedMrr)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-500">Net New MRR</p>
                  <p
                    className={`text-lg font-semibold ${displayData.mrr.netNewMrr >= 0 ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {displayData.mrr.netNewMrr >= 0 ? '+' : ''}
                    {formatCurrency(displayData.mrr.netNewMrr)}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Revenue by Product */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Revenue by Product</h3>
          {displayData.byProduct.length === 0 ? (
            <div className="flex h-[200px] flex-col items-center justify-center text-gray-400">
              <DollarSign className="mb-3 h-12 w-12" />
              <p className="text-gray-500">No product revenue data available</p>
            </div>
          ) : (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="40%" height={200}>
                <PieChart>
                  <Pie
                    data={displayData.byProduct}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="revenue"
                  >
                    {displayData.byProduct.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatCurrency(value as number)}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {displayData.byProduct.slice(0, 5).map((product, index) => (
                  <div key={product.productId} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="max-w-[120px] truncate text-sm text-gray-600">
                        {product.productName}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-medium text-gray-900">
                        {formatCurrency(product.revenue)}
                      </span>
                      <span className="ml-2 text-xs text-gray-400">
                        ({product.percentageOfTotal}%)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Revenue Forecast */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Revenue Forecast</h3>
          <span className="text-sm text-gray-500">Next 6 months projection</span>
        </div>
        {displayData.forecast.length === 0 ? (
          <div className="flex h-[300px] flex-col items-center justify-center text-gray-400">
            <Calendar className="mb-3 h-12 w-12" />
            <p className="text-gray-500">Not enough data to generate forecast</p>
            <p className="mt-1 text-sm text-gray-400">
              Forecast will appear after more revenue history is available
            </p>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={displayData.forecast}>
                <defs>
                  <linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#6B7280' }} />
                <YAxis
                  tick={{ fontSize: 12, fill: '#6B7280' }}
                  tickFormatter={(value) => formatCurrencyCompact(value)}
                />
                <Tooltip
                  formatter={(value, name) => [
                    formatCurrency(value as number),
                    (name as string) === 'predictedRevenue' ? 'Predicted' : (name as string),
                  ]}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB' }}
                />
                <Area
                  type="monotone"
                  dataKey="upperBound"
                  name="Upper Bound"
                  stroke="transparent"
                  fill="#E5E7EB"
                />
                <Area
                  type="monotone"
                  dataKey="lowerBound"
                  name="Lower Bound"
                  stroke="transparent"
                  fill="#fff"
                />
                <Area
                  type="monotone"
                  dataKey="predictedRevenue"
                  name="Predicted Revenue"
                  stroke="#8B5CF6"
                  fill="url(#forecastGradient)"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                />
              </AreaChart>
            </ResponsiveContainer>
            <div className="mt-4 flex items-center gap-6 border-t border-gray-100 pt-4 text-sm text-gray-500">
              <div className="flex items-center gap-2">
                <div className="h-0.5 w-4 bg-purple-500" style={{ strokeDasharray: '5 5' }} />
                <span>Predicted Revenue</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded bg-gray-200" />
                <span>Confidence Range</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Payment Methods */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Revenue by Payment Method</h3>
        {displayData.byPaymentMethod.length === 0 ? (
          <div className="flex h-[150px] flex-col items-center justify-center text-gray-400">
            <DollarSign className="mb-3 h-10 w-10" />
            <p className="text-gray-500">No payment method data available</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {displayData.byPaymentMethod.map((method, index) => (
              <div key={method.method} className="rounded-lg bg-gray-50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium capitalize text-gray-700">
                    {method.method === 'ach_debit' ? 'ACH Debit' : method.method}
                  </span>
                  <span className="text-sm text-gray-500">{method.percentageOfTotal}%</span>
                </div>
                <p className="text-xl font-bold text-gray-900">{formatCurrency(method.revenue)}</p>
                <p className="mt-1 text-sm text-gray-500">{method.count} transactions</p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${method.percentageOfTotal}%`,
                      backgroundColor: COLORS[index % COLORS.length],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Transactions Modal */}
      {showTransactions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">Transactions (Gross Revenue)</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportTransactions}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </button>
                <button
                  onClick={() => setShowTransactions(false)}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {transactionsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
                </div>
              ) : transactions.length === 0 ? (
                <div className="py-12 text-center text-gray-500">No transactions in this period</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left font-medium text-gray-600">Date</th>
                      <th className="px-6 py-3 text-left font-medium text-gray-600">Patient</th>
                      <th className="px-6 py-3 text-right font-medium text-gray-600">Amount</th>
                      <th className="px-6 py-3 text-left font-medium text-gray-600">Method</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {transactions.map((t) => (
                      <tr key={t.id} className="hover:bg-gray-50">
                        <td className="px-6 py-3 text-gray-700">
                          {new Date(t.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-3">{t.patientName || '—'}</td>
                        <td className="px-6 py-3 text-right font-medium">
                          {formatCurrency(t.amount)}
                        </td>
                        <td className="px-6 py-3 capitalize">{t.paymentMethod}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
