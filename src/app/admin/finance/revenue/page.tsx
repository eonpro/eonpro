'use client';

import { useState, useEffect, useCallback } from 'react';
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

export default function RevenuePage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<RevenueData | null>(null);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | '12m'>('30d');
  const [granularity, setGranularity] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth-token') || 
                    localStorage.getItem('super_admin-token') || 
                    localStorage.getItem('admin-token') ||
                    localStorage.getItem('token');

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(
        `/api/finance/revenue?range=${dateRange}&granularity=${granularity}`,
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
  }, [dateRange, granularity]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
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
    { name: 'Starting MRR', value: displayData.mrr.totalMrr - displayData.mrr.netNewMrr, fill: '#6B7280' },
    { name: 'New', value: displayData.mrr.newMrr, fill: '#10B981' },
    { name: 'Expansion', value: displayData.mrr.expansionMrr, fill: '#3B82F6' },
    { name: 'Contraction', value: -displayData.mrr.contractionMrr, fill: '#F59E0B' },
    { name: 'Churned', value: -displayData.mrr.churnedMrr, fill: '#EF4444' },
    { name: 'Ending MRR', value: displayData.mrr.totalMrr, fill: '#8B5CF6' },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Revenue Analytics</h2>
          <p className="text-sm text-gray-500 mt-1">
            Track revenue trends, MRR, and payment performance
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Date Range */}
          <div className="flex bg-white rounded-lg border border-gray-200 p-1">
            {(['7d', '30d', '90d', '12m'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  dateRange === range
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {range.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Granularity */}
          <select
            value={granularity}
            onChange={(e) => setGranularity(e.target.value as any)}
            className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>

          {/* Export */}
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-emerald-50 rounded-lg">
              <DollarSign className="h-5 w-5 text-emerald-600" />
            </div>
            <span className={`flex items-center text-sm font-medium ${
              isPositiveGrowth ? 'text-green-600' : 'text-red-600'
            }`}>
              {isPositiveGrowth ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
              {Math.abs(displayData.overview.periodGrowth).toFixed(1)}%
            </span>
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mt-4">{formatCurrency(displayData.overview.grossRevenue)}</h3>
          <p className="text-sm text-gray-500 mt-1">Gross Revenue</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="p-2 bg-blue-50 rounded-lg w-fit">
            <TrendingUp className="h-5 w-5 text-blue-600" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mt-4">{formatCurrency(displayData.overview.netRevenue)}</h3>
          <p className="text-sm text-gray-500 mt-1">Net Revenue (after fees)</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-purple-50 rounded-lg">
              <Calendar className="h-5 w-5 text-purple-600" />
            </div>
            <span className={`flex items-center text-sm font-medium ${
              displayData.mrr.mrrGrowthRate >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {displayData.mrr.mrrGrowthRate >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
              {Math.abs(displayData.mrr.mrrGrowthRate).toFixed(1)}%
            </span>
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mt-4">{formatCurrency(displayData.mrr.totalMrr)}</h3>
          <p className="text-sm text-gray-500 mt-1">Monthly Recurring Revenue</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="p-2 bg-amber-50 rounded-lg w-fit">
            <TrendingDown className="h-5 w-5 text-amber-600" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mt-4">{formatCurrency(displayData.overview.refunds)}</h3>
          <p className="text-sm text-gray-500 mt-1">Refunds</p>
        </div>
      </div>

      {/* Revenue Trend Chart */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue Trend</h3>
        {displayData.trends.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[350px] text-gray-400">
            <TrendingUp className="h-12 w-12 mb-3" />
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* MRR Waterfall */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">MRR Breakdown</h3>
          {displayData.mrr.totalMrr === 0 ? (
            <div className="flex flex-col items-center justify-center h-[300px] text-gray-400">
              <Calendar className="h-12 w-12 mb-3" />
              <p className="text-gray-500">No subscription data available</p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={mrrWaterfallData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 11, fill: '#6B7280' }}
                  />
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
              <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-100">
                <div className="text-center">
                  <p className="text-sm text-gray-500">New MRR</p>
                  <p className="text-lg font-semibold text-green-600">+{formatCurrency(displayData.mrr.newMrr)}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-500">Churned MRR</p>
                  <p className="text-lg font-semibold text-red-600">-{formatCurrency(displayData.mrr.churnedMrr)}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-500">Net New MRR</p>
                  <p className={`text-lg font-semibold ${displayData.mrr.netNewMrr >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {displayData.mrr.netNewMrr >= 0 ? '+' : ''}{formatCurrency(displayData.mrr.netNewMrr)}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Revenue by Product */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue by Product</h3>
          {displayData.byProduct.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[200px] text-gray-400">
              <DollarSign className="h-12 w-12 mb-3" />
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
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="text-sm text-gray-600 truncate max-w-[120px]">
                        {product.productName}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-medium text-gray-900">
                        {formatCurrency(product.revenue)}
                      </span>
                      <span className="text-xs text-gray-400 ml-2">
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
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Revenue Forecast</h3>
          <span className="text-sm text-gray-500">Next 6 months projection</span>
        </div>
        {displayData.forecast.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[300px] text-gray-400">
            <Calendar className="h-12 w-12 mb-3" />
            <p className="text-gray-500">Not enough data to generate forecast</p>
            <p className="text-sm text-gray-400 mt-1">Forecast will appear after more revenue history is available</p>
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
                <XAxis 
                  dataKey="month" 
                  tick={{ fontSize: 12, fill: '#6B7280' }}
                />
                <YAxis 
                  tick={{ fontSize: 12, fill: '#6B7280' }}
                  tickFormatter={(value) => formatCurrencyCompact(value)}
                />
                <Tooltip 
                  formatter={(value, name) => [
                    formatCurrency(value as number),
                    (name as string) === 'predictedRevenue' ? 'Predicted' : name as string
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
            <div className="flex items-center gap-6 mt-4 pt-4 border-t border-gray-100 text-sm text-gray-500">
              <div className="flex items-center gap-2">
                <div className="w-4 h-0.5 bg-purple-500" style={{ strokeDasharray: '5 5' }} />
                <span>Predicted Revenue</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gray-200 rounded" />
                <span>Confidence Range</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Payment Methods */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue by Payment Method</h3>
        {displayData.byPaymentMethod.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[150px] text-gray-400">
            <DollarSign className="h-10 w-10 mb-3" />
            <p className="text-gray-500">No payment method data available</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {displayData.byPaymentMethod.map((method, index) => (
              <div key={method.method} className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 capitalize">
                    {method.method === 'ach_debit' ? 'ACH Debit' : method.method}
                  </span>
                  <span className="text-sm text-gray-500">{method.percentageOfTotal}%</span>
                </div>
                <p className="text-xl font-bold text-gray-900">{formatCurrency(method.revenue)}</p>
                <p className="text-sm text-gray-500 mt-1">{method.count} transactions</p>
                <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full"
                    style={{ 
                      width: `${method.percentageOfTotal}%`,
                      backgroundColor: COLORS[index % COLORS.length]
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
