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
  Activity,
  Users,
  BarChart2,
  Package,
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
  LineChart,
  Line,
} from 'recharts';
import { apiFetch } from '@/lib/api/fetch';

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

interface ProductBreakdownData {
  products: Array<{
    product: string;
    count: number;
    revenue: number;
    percentageOfRevenue: number;
  }>;
  totalRevenue: number;
  totalUnits: number;
  invoiceCount: number;
}

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
  const [stripeAnalytics, setStripeAnalytics] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [productBreakdown, setProductBreakdown] = useState<ProductBreakdownData | null>(null);
  const [productBreakdownLoading, setProductBreakdownLoading] = useState(false);

  const dateRangeParam = getDateRangeForApi(dateRange, customStart, customEnd);

  const loadData = useCallback(async () => {
    setLoading(true);
    setProductBreakdownLoading(true);
    try {
      const [revenueRes, breakdownRes] = await Promise.all([
        apiFetch(`/api/finance/revenue?${dateRangeParam}&granularity=${granularity}`),
        apiFetch(`/api/finance/product-breakdown?${dateRangeParam}`),
      ]);

      if (revenueRes.ok) {
        setData(await revenueRes.json());
      }
      if (breakdownRes.ok) {
        setProductBreakdown(await breakdownRes.json());
      }
    } catch (error) {
      console.error('Failed to load revenue data:', error);
    } finally {
      setLoading(false);
      setProductBreakdownLoading(false);
    }
  }, [dateRangeParam, granularity]);

  const loadTransactions = useCallback(async () => {
    setTransactionsLoading(true);
    try {
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

      const res = await apiFetch(
        `/api/finance/revenue/transactions?startDate=${start}&endDate=${end}&limit=200`
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
    const res = await apiFetch(
      `/api/finance/revenue/transactions?startDate=${start}&endDate=${end}&format=csv`
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

  const loadStripeAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const res = await apiFetch('/api/stripe/analytics?type=all&months=12');
      if (res.ok) {
        setStripeAnalytics(await res.json());
      }
    } catch (err) {
      console.error('Failed to load Stripe analytics:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (dateRange === 'custom' && (!customStart || !customEnd)) return;
    loadData();
    loadStripeAnalytics();
  }, [loadData, loadStripeAnalytics, dateRange, customStart, customEnd]);

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
            <div className="rounded-lg bg-[var(--brand-primary-light)] p-2">
              <Calendar className="h-5 w-5 text-[var(--brand-primary)]" />
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

        {/* Revenue by Product (catalog-linked) */}
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

      {/* Product Breakdown — units sold & revenue per product category */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-emerald-600" />
            <h3 className="text-lg font-semibold text-gray-900">Product Breakdown</h3>
          </div>
          {productBreakdown && (
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span>{productBreakdown.invoiceCount} invoices</span>
              <span className="font-medium text-gray-900">
                {formatCurrency(productBreakdown.totalRevenue)}
              </span>
            </div>
          )}
        </div>
        {productBreakdownLoading ? (
          <div className="flex h-[200px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
          </div>
        ) : !productBreakdown || productBreakdown.products.length === 0 ? (
          <div className="flex h-[200px] flex-col items-center justify-center text-gray-400">
            <Package className="mb-3 h-12 w-12" />
            <p className="text-gray-500">No paid invoices in this period</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6 lg:flex-row">
            {/* Pie chart */}
            <div className="flex-shrink-0">
              <ResponsiveContainer width={220} height={220}>
                <PieChart>
                  <Pie
                    data={productBreakdown.products}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="revenue"
                    nameKey="product"
                  >
                    {productBreakdown.products.map((_entry, index) => (
                      <Cell key={`pb-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatCurrency(value as number)}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {/* Table */}
            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    <th className="pb-3 pr-4">Product</th>
                    <th className="pb-3 pr-4 text-right">Units Sold</th>
                    <th className="pb-3 pr-4 text-right">Revenue</th>
                    <th className="pb-3 text-right">% of Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {productBreakdown.products.map((row, index) => (
                    <tr key={row.product} className="hover:bg-gray-50/50">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-3 w-3 flex-shrink-0 rounded-full"
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <span className="font-medium text-gray-900">{row.product}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-gray-700">
                        {row.count.toLocaleString()}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums font-medium text-gray-900">
                        {formatCurrency(row.revenue)}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-2 w-16 overflow-hidden rounded-full bg-gray-100">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(row.percentageOfRevenue, 100)}%`,
                                backgroundColor: COLORS[index % COLORS.length],
                              }}
                            />
                          </div>
                          <span className="w-12 text-right tabular-nums text-gray-500">
                            {row.percentageOfRevenue}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 font-semibold text-gray-900">
                    <td className="pt-3 pr-4">Total</td>
                    <td className="pt-3 pr-4 text-right tabular-nums">
                      {productBreakdown.totalUnits.toLocaleString()}
                    </td>
                    <td className="pt-3 pr-4 text-right tabular-nums">
                      {formatCurrency(productBreakdown.totalRevenue)}
                    </td>
                    <td className="pt-3 text-right tabular-nums text-gray-500">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
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
                <div className="h-0.5 w-4 bg-[var(--brand-primary)]" style={{ strokeDasharray: '5 5' }} />
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

      {/* Stripe Revenue Analytics */}
      {stripeAnalytics && (
        <>
          {/* Net Revenue Trend (Stripe) */}
          {stripeAnalytics.trends?.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-blue-500" />
                  <h3 className="text-lg font-semibold text-gray-900">Net Revenue Trend (Stripe)</h3>
                </div>
                <span className="text-sm text-gray-500">Last 12 months</span>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={stripeAnalytics.trends}>
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
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#6B7280' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#6B7280' }} tickFormatter={(v) => formatCurrencyCompact(v)} />
                  <Tooltip formatter={(value: number, name: string) => [formatCurrency(value), name === 'gross' ? 'Gross' : name === 'net' ? 'Net' : name === 'fees' ? 'Fees' : name === 'refunds' ? 'Refunds' : name]} contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB' }} />
                  <Area type="monotone" dataKey="gross" name="Gross" stroke="#10B981" fill="url(#grossGradient)" strokeWidth={2} />
                  <Area type="monotone" dataKey="net" name="Net" stroke="#3B82F6" fill="url(#netGradient)" strokeWidth={2} />
                  <Line type="monotone" dataKey="fees" name="Fees" stroke="#EF4444" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                  <Legend />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* MRR / Churn Side by Side */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* MRR Time Series */}
            {stripeAnalytics.mrr?.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-emerald-500" />
                  <h3 className="text-lg font-semibold text-gray-900">MRR / ARR Over Time</h3>
                </div>
                {stripeAnalytics.summary && (
                  <div className="mb-4 flex gap-4">
                    <div className="rounded-lg bg-emerald-50 px-3 py-2">
                      <p className="text-xs text-emerald-600">Current MRR</p>
                      <p className="text-lg font-bold text-emerald-700">{stripeAnalytics.summary.currentMRRFormatted}</p>
                    </div>
                    <div className="rounded-lg bg-blue-50 px-3 py-2">
                      <p className="text-xs text-blue-600">Current ARR</p>
                      <p className="text-lg font-bold text-blue-700">{stripeAnalytics.summary.currentARRFormatted}</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 px-3 py-2">
                      <p className="text-xs text-gray-600">Active Subs</p>
                      <p className="text-lg font-bold text-gray-700">{stripeAnalytics.summary.activeSubscriptions}</p>
                    </div>
                  </div>
                )}
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={stripeAnalytics.mrr}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6B7280' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} tickFormatter={(v) => formatCurrencyCompact(v)} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB' }} />
                    <Area type="monotone" dataKey="mrr" name="MRR" stroke="#10B981" fill="#10B98120" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Churn Rate */}
            {stripeAnalytics.churn?.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <Users className="h-5 w-5 text-orange-500" />
                  <h3 className="text-lg font-semibold text-gray-900">Monthly Churn Rate</h3>
                </div>
                {stripeAnalytics.summary && (
                  <div className="mb-4 flex gap-4">
                    <div className="rounded-lg bg-orange-50 px-3 py-2">
                      <p className="text-xs text-orange-600">Avg Churn</p>
                      <p className="text-lg font-bold text-orange-700">{stripeAnalytics.summary.avgMonthlyChurnFormatted}</p>
                    </div>
                    <div className="rounded-lg bg-emerald-50 px-3 py-2">
                      <p className="text-xs text-emerald-600">Avg Retention</p>
                      <p className="text-lg font-bold text-emerald-700">{(100 - stripeAnalytics.summary.avgMonthlyChurn).toFixed(1)}%</p>
                    </div>
                  </div>
                )}
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={stripeAnalytics.churn}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6B7280' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} tickFormatter={(v) => `${v}%`} />
                    <Tooltip formatter={(v: number) => `${v}%`} contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB' }} />
                    <Line type="monotone" dataKey="churnRate" name="Churn Rate" stroke="#F59E0B" strokeWidth={2} dot={{ fill: '#F59E0B', r: 3 }} />
                    <Line type="monotone" dataKey="retentionRate" name="Retention Rate" stroke="#10B981" strokeWidth={2} dot={{ fill: '#10B981', r: 3 }} />
                    <Legend />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Stripe Forecast */}
          {stripeAnalytics.forecast?.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-purple-500" />
                  <h3 className="text-lg font-semibold text-gray-900">3-Month Revenue Forecast (Stripe)</h3>
                </div>
                <span className="text-sm text-gray-500">Based on linear regression</span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {stripeAnalytics.forecast.map((f: any) => (
                  <div key={f.month} className="rounded-lg border border-purple-100 bg-purple-50/50 p-4">
                    <p className="text-sm font-medium text-purple-700">{f.month}</p>
                    <p className="mt-1 text-2xl font-bold text-purple-900">{f.projectedFormatted}</p>
                    <p className="mt-1 text-xs text-purple-600">
                      Range: {f.lowerBoundFormatted} &ndash; {f.upperBoundFormatted}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cohort Revenue */}
          {stripeAnalytics.cohorts?.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <BarChart2 className="h-5 w-5 text-indigo-500" />
                <h3 className="text-lg font-semibold text-gray-900">Revenue Cohorts</h3>
              </div>
              <p className="mb-3 text-sm text-gray-500">Revenue by customer signup month &mdash; how each cohort spends over time</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-gray-500">
                      <th className="pb-2 pr-4 font-medium">Cohort</th>
                      <th className="pb-2 pr-3 font-medium text-right">Customers</th>
                      {Array.from({ length: Math.min(6, stripeAnalytics.cohorts[0]?.months?.length || 0) }, (_, i) => (
                        <th key={i} className="pb-2 pr-3 font-medium text-right">M{i}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stripeAnalytics.cohorts.slice(-8).map((cohort: any) => (
                      <tr key={cohort.cohortMonth} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium text-gray-700">{cohort.cohortMonth}</td>
                        <td className="py-2 pr-3 text-right text-gray-600">{cohort.customerCount}</td>
                        {cohort.months.slice(0, 6).map((m: any) => {
                          const maxRev = Math.max(...cohort.months.slice(0, 6).map((x: any) => x.revenue), 1);
                          const intensity = Math.min(m.revenue / maxRev, 1);
                          return (
                            <td
                              key={m.month}
                              className="py-2 pr-3 text-right text-xs font-medium"
                              style={{
                                backgroundColor: m.revenue > 0 ? `rgba(16, 185, 129, ${0.1 + intensity * 0.4})` : 'transparent',
                                color: m.revenue > 0 ? '#065F46' : '#9CA3AF',
                              }}
                            >
                              {m.revenue > 0 ? m.revenueFormatted : '-'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {analyticsLoading && (
        <div className="flex items-center justify-center rounded-xl border border-gray-200 bg-white py-12 shadow-sm">
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-600" />
            <p className="mt-2 text-sm text-gray-500">Loading Stripe analytics...</p>
          </div>
        </div>
      )}

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
