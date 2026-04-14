'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  Users,
  TrendingUp,
  TrendingDown,
  Activity,
  DollarSign,
  ShoppingCart,
  CreditCard,
  AlertTriangle,
  Loader2,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Mail,
  ChevronRight,
  UserMinus,
  Package,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
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
import { apiFetch } from '@/lib/api/fetch';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Period = '7d' | '30d' | '90d' | '12m';
type Section = 'overview' | 'revenue' | 'patients' | 'subscriptions' | 'orders';

interface KPIs {
  totalRevenue: number;
  revenueGrowth: number;
  mrr: number;
  totalPatients: number;
  patientsWithPayments: number;
  activeSubscriptions: number;
  churnRate: number;
  avgOrderValue: number;
  successfulPayments: number;
  failedPayments: number;
  activeProviders: number;
  totalOrders: number;
  pendingOrders: number;
  completedOrders: number;
  conversionRate: number;
}

interface RevenueTrend {
  date: string;
  grossRevenue: number;
  netRevenue: number;
  refunds: number;
  paymentCount: number;
}

interface TimelinePoint {
  date: string;
  count: number;
}

interface PlanBreakdown {
  planName: string;
  count: number;
  mrr: number;
  percentageOfTotal: number;
}

interface OverviewData {
  kpis: KPIs;
  revenueTrends: RevenueTrend[];
  newPatientsTimeline: TimelinePoint[];
  subscriptionsByPlan: PlanBreakdown[];
}

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
  trends: RevenueTrend[];
  mrr: {
    totalMrr: number;
    newMrr: number;
    churnedMrr: number;
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

interface PatientSegment {
  segment: string;
  count: number;
  totalRevenue: number;
  averageLTV: number;
  percentageOfTotal: number;
}

interface AtRiskPatient {
  patientId: number;
  patientName: string;
  riskScore: number;
  riskFactors: string[];
  lastPaymentDate: string | null;
  subscriptionStatus: string | null;
  totalRevenue: number;
}

interface PatientData {
  metrics: {
    totalPatients: number;
    patientsWithPayments: number;
    averageLTV: number;
    medianLTV: number;
    totalLTV: number;
    activeSubscriptions: number;
    churnedLast30Days: number;
    churnRate: number;
  };
  segments: PatientSegment[];
  atRisk: AtRiskPatient[];
  retention: {
    months: string[];
    data: Array<{ cohort: string; size: number; retention: number[] }>;
    averageRetention: number[];
  };
  paymentBehavior: {
    onTimePayments: number;
    latePayments: number;
    failedPayments: number;
    onTimePercentage: number;
    latePercentage: number;
    failedPercentage: number;
    averagePaymentDelay: number;
  };
}

interface SubscriptionTrend {
  month: string;
  newSubscriptions: number;
  canceledSubscriptions: number;
  netChange: number;
  endingCount: number;
  mrr: number;
}

interface SubscriptionData {
  metrics: {
    activeSubscriptions: number;
    pausedSubscriptions: number;
    canceledSubscriptions: number;
    pastDueSubscriptions: number;
    totalMrr: number;
    averageSubscriptionValue: number;
    subscriptionsByPlan: PlanBreakdown[];
  };
  churn: {
    churnRate: number;
    churnedCount: number;
    churnedMrr: number;
    churnReasons: Array<{ reason: string; count: number; mrr: number; percentageOfTotal: number }>;
    averageLifetimeBeforeChurn: number;
    retentionRate: number;
  };
  trends: SubscriptionTrend[];
  pastDue: {
    subscriptions: Array<{
      id: number;
      patientName: string;
      amount: number;
      daysSinceStart: number;
    }>;
    totalAmount: number;
    daysPastDue: { under7: number; under30: number; over30: number };
  };
}

interface OrderTimeline {
  date: string;
  total: number;
  completed: number;
  pending: number;
}

interface OrderData {
  statusCounts: Record<string, number>;
  recentOrders: Array<{
    id: number;
    status: string;
    createdAt: string;
    patient: { id: number; firstName: string; lastName: string } | null;
  }>;
  dailyOrders: OrderTimeline[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const COLORS = ['#4fa77e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);

const formatCurrencyCompact = (cents: number) => {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(1)}K`;
  return `$${dollars.toFixed(0)}`;
};

const formatNumber = (n: number) => new Intl.NumberFormat('en-US').format(n);

const formatPercent = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

const periodLabels: Record<Period, string> = {
  '7d': 'Last 7 Days',
  '30d': 'Last 30 Days',
  '90d': 'Last 90 Days',
  '12m': 'Last 12 Months',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KPICard({
  label,
  value,
  change,
  icon: Icon,
  format: fmt = 'number',
  trend,
}: {
  label: string;
  value: number;
  change?: number;
  icon: React.ElementType;
  format?: 'currency' | 'number' | 'percent';
  trend?: 'up-good' | 'up-bad' | 'down-good' | 'down-bad';
}) {
  let displayValue: string;
  switch (fmt) {
    case 'currency':
      displayValue = formatCurrency(value);
      break;
    case 'percent':
      displayValue = `${value.toFixed(1)}%`;
      break;
    default:
      displayValue = formatNumber(value);
  }

  const changeIsPositive = change != null && change >= 0;
  const trendColor = trend
    ? trend.includes('good')
      ? 'text-emerald-600'
      : 'text-red-600'
    : changeIsPositive
      ? 'text-emerald-600'
      : 'text-red-600';

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-3 flex items-center justify-between">
        <div className="rounded-lg bg-[var(--brand-primary-light)] p-2">
          <Icon className="h-5 w-5 text-[var(--brand-primary)]" />
        </div>
        {change != null && (
          <div className={`flex items-center gap-0.5 text-sm font-medium ${trendColor}`}>
            {changeIsPositive ? (
              <ArrowUpRight className="h-4 w-4" />
            ) : (
              <ArrowDownRight className="h-4 w-4" />
            )}
            {formatPercent(change)}
          </div>
        )}
      </div>
      <h3 className="text-2xl font-bold text-gray-900">{displayValue}</h3>
      <p className="mt-1 text-sm text-gray-500">{label}</p>
    </div>
  );
}

function SectionCard({
  title,
  children,
  className = '',
  action,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-6 shadow-sm ${className}`}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
        active
          ? 'bg-[var(--brand-primary)] text-white shadow-sm'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-48 items-center justify-center text-sm text-gray-400">{message}</div>
  );
}

// ---------------------------------------------------------------------------
// Section Renderers
// ---------------------------------------------------------------------------

function OverviewSection({ data, period }: { data: OverviewData; period: Period }) {
  const { kpis, revenueTrends, newPatientsTimeline, subscriptionsByPlan } = data;

  return (
    <div className="space-y-6">
      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <KPICard
          label="Total Revenue"
          value={kpis.totalRevenue}
          change={kpis.revenueGrowth}
          icon={DollarSign}
          format="currency"
          trend={kpis.revenueGrowth >= 0 ? 'up-good' : 'down-bad'}
        />
        <KPICard label="MRR" value={kpis.mrr} icon={TrendingUp} format="currency" />
        <KPICard label="Total Patients" value={kpis.totalPatients} icon={Users} />
        <KPICard label="Active Subscriptions" value={kpis.activeSubscriptions} icon={CreditCard} />
        <KPICard
          label="Churn Rate"
          value={kpis.churnRate}
          icon={UserMinus}
          format="percent"
          trend={kpis.churnRate > 5 ? 'up-bad' : 'down-good'}
        />
        <KPICard
          label="Conversion Rate"
          value={kpis.conversionRate}
          icon={Activity}
          format="percent"
          trend={kpis.conversionRate >= 50 ? 'up-good' : 'down-bad'}
        />
      </div>

      {/* Second row KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KPICard
          label="Avg Order Value"
          value={kpis.avgOrderValue}
          icon={ShoppingCart}
          format="currency"
        />
        <KPICard label="Active Providers" value={kpis.activeProviders} icon={Activity} />
        <KPICard label="Pending Orders" value={kpis.pendingOrders} icon={Package} />
        <KPICard
          label="Payments (Success / Fail)"
          value={kpis.successfulPayments}
          icon={CreditCard}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Revenue Trend */}
        <SectionCard title="Revenue Trend">
          {revenueTrends.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={revenueTrends} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4fa77e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#4fa77e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis
                  tickFormatter={(v: number) => formatCurrencyCompact(v)}
                  tick={{ fontSize: 11 }}
                  stroke="#9ca3af"
                  width={60}
                />
                <Tooltip
                  formatter={(value?: number) => formatCurrency(value ?? 0)}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }}
                />
                <Area
                  type="monotone"
                  dataKey="grossRevenue"
                  name="Revenue"
                  stroke="#4fa77e"
                  fill="url(#revGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="No revenue data for this period" />
          )}
        </SectionCard>

        {/* New Patients */}
        <SectionCard title="New Patient Registrations">
          {newPatientsTimeline.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={newPatientsTimeline}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" width={40} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }} />
                <Bar dataKey="count" name="New Patients" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="No patient registration data" />
          )}
        </SectionCard>
      </div>

      {/* Subscriptions by Plan */}
      {subscriptionsByPlan.length > 0 && (
        <SectionCard title="Subscriptions by Plan">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {subscriptionsByPlan.map((plan, idx) => (
              <div
                key={plan.planName}
                className="flex items-center gap-4 rounded-lg border border-gray-100 bg-gray-50 p-4"
              >
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                />
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{plan.planName}</p>
                  <p className="text-sm text-gray-500">
                    {plan.count} subscribers &middot; {formatCurrency(plan.mrr)} MRR
                  </p>
                </div>
                <span className="text-sm font-medium text-gray-700">
                  {plan.percentageOfTotal.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Quick Links */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Link
          href="/admin/analytics/emails"
          className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="rounded-lg bg-blue-50 p-2">
            <Mail className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-gray-900">Email Analytics</p>
            <p className="text-sm text-gray-500">Delivery rates, open rates & more</p>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400" />
        </Link>
        <Link
          href="/admin/finance"
          className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="rounded-lg bg-emerald-50 p-2">
            <DollarSign className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-gray-900">Finance Dashboard</p>
            <p className="text-sm text-gray-500">Detailed billing & invoicing</p>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400" />
        </Link>
        <Link
          href="/admin/orders"
          className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="rounded-lg bg-orange-50 p-2">
            <ShoppingCart className="h-5 w-5 text-orange-600" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-gray-900">Order Management</p>
            <p className="text-sm text-gray-500">Pipeline & fulfillment</p>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400" />
        </Link>
      </div>
    </div>
  );
}

function RevenueSection({ data }: { data: RevenueData }) {
  return (
    <div className="space-y-6">
      {/* Revenue KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KPICard
          label="Gross Revenue"
          value={data.overview.grossRevenue}
          change={data.overview.periodGrowth}
          icon={DollarSign}
          format="currency"
        />
        <KPICard
          label="Refunds"
          value={data.overview.refunds}
          icon={TrendingDown}
          format="currency"
        />
        <KPICard
          label="Avg Order Value"
          value={data.overview.averageOrderValue}
          icon={ShoppingCart}
          format="currency"
        />
        <KPICard
          label="Successful Payments"
          value={data.overview.successfulPayments}
          icon={CreditCard}
        />
      </div>

      {/* MRR Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KPICard label="Total MRR" value={data.mrr.totalMrr} icon={TrendingUp} format="currency" />
        <KPICard label="New MRR" value={data.mrr.newMrr} icon={TrendingUp} format="currency" />
        <KPICard
          label="Churned MRR"
          value={data.mrr.churnedMrr}
          icon={TrendingDown}
          format="currency"
        />
        <KPICard label="ARR" value={data.mrr.arr} icon={DollarSign} format="currency" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Revenue Trend */}
        <SectionCard title="Revenue Over Time">
          {data.trends.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={data.trends} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4fa77e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#4fa77e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis
                  tickFormatter={(v: number) => formatCurrencyCompact(v)}
                  tick={{ fontSize: 11 }}
                  stroke="#9ca3af"
                  width={60}
                />
                <Tooltip
                  formatter={(value?: number) => formatCurrency(value ?? 0)}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }}
                />
                <Area
                  type="monotone"
                  dataKey="grossRevenue"
                  name="Revenue"
                  stroke="#4fa77e"
                  fill="url(#revGrad2)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="No revenue trend data" />
          )}
        </SectionCard>

        {/* Revenue by Product */}
        <SectionCard title="Revenue by Product">
          {data.byProduct.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={data.byProduct}
                  dataKey="revenue"
                  nameKey="productName"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  innerRadius={50}
                  paddingAngle={2}
                  label={(props: any) =>
                    `${props.productName ?? ''} (${props.percentageOfTotal ?? 0}%)`
                  }
                >
                  {data.byProduct.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value?: number) => formatCurrency(value ?? 0)}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="No product revenue data" />
          )}
        </SectionCard>
      </div>

      {/* Revenue Forecast */}
      {data.forecast.length > 0 && (
        <SectionCard title="Revenue Forecast (Next 6 Months)">
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data.forecast} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#9ca3af" />
              <YAxis
                tickFormatter={(v: number) => formatCurrencyCompact(v)}
                tick={{ fontSize: 11 }}
                stroke="#9ca3af"
                width={60}
              />
              <Tooltip
                formatter={(value?: number, name?: string) =>
                  `${name ?? ''}: ${formatCurrency(value ?? 0)}`
                }
                contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }}
              />
              <Area
                type="monotone"
                dataKey="upperBound"
                name="Upper Bound"
                stroke="none"
                fill="url(#forecastGrad)"
              />
              <Area
                type="monotone"
                dataKey="lowerBound"
                name="Lower Bound"
                stroke="none"
                fill="transparent"
              />
              <Line
                type="monotone"
                dataKey="predictedRevenue"
                name="Predicted"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={{ fill: '#8b5cf6' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </SectionCard>
      )}

      {/* Payment Methods */}
      {data.byPaymentMethod.length > 0 && (
        <SectionCard title="Revenue by Payment Method">
          <div className="space-y-3">
            {data.byPaymentMethod.map((method) => (
              <div key={method.method} className="flex items-center gap-4">
                <div className="w-32 text-sm font-medium capitalize text-gray-700">
                  {method.method.replace(/_/g, ' ')}
                </div>
                <div className="flex-1">
                  <div className="h-3 rounded-full bg-gray-100">
                    <div
                      className="h-3 rounded-full bg-[var(--brand-primary)]"
                      style={{ width: `${method.percentageOfTotal}%` }}
                    />
                  </div>
                </div>
                <div className="w-24 text-right text-sm font-medium text-gray-900">
                  {formatCurrency(method.revenue)}
                </div>
                <div className="w-16 text-right text-sm text-gray-500">
                  {method.percentageOfTotal.toFixed(1)}%
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function PatientsSection({ data }: { data: PatientData }) {
  return (
    <div className="space-y-6">
      {/* Patient KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KPICard label="Total Patients" value={data.metrics.totalPatients} icon={Users} />
        <KPICard
          label="With Payments"
          value={data.metrics.patientsWithPayments}
          icon={CreditCard}
        />
        <KPICard
          label="Avg Lifetime Value"
          value={data.metrics.averageLTV}
          icon={DollarSign}
          format="currency"
        />
        <KPICard
          label="Churn Rate (30d)"
          value={data.metrics.churnRate}
          icon={UserMinus}
          format="percent"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Patient Segments */}
        <SectionCard title="Patient Segments">
          {data.segments.length > 0 ? (
            <div className="space-y-4">
              {data.segments.map((seg, idx) => (
                <div key={seg.segment} className="flex items-center gap-4">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900">{seg.segment}</span>
                      <span className="text-sm text-gray-500">{seg.count} patients</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-gray-100">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${seg.percentageOfTotal}%`,
                          backgroundColor: COLORS[idx % COLORS.length],
                        }}
                      />
                    </div>
                    <div className="mt-1 flex justify-between text-xs text-gray-500">
                      <span>Total: {formatCurrency(seg.totalRevenue)}</span>
                      <span>Avg LTV: {formatCurrency(seg.averageLTV)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="No segment data" />
          )}
        </SectionCard>

        {/* Payment Behavior */}
        <SectionCard title="Payment Behavior">
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={[
                  { name: 'On Time', value: data.paymentBehavior.onTimePayments, fill: '#4fa77e' },
                  { name: 'Late', value: data.paymentBehavior.latePayments, fill: '#f59e0b' },
                  { name: 'Failed', value: data.paymentBehavior.failedPayments, fill: '#ef4444' },
                ]}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                innerRadius={40}
              >
                <Cell fill="#4fa77e" />
                <Cell fill="#f59e0b" />
                <Cell fill="#ef4444" />
              </Pie>
              <Legend />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }} />
            </PieChart>
          </ResponsiveContainer>
          {data.paymentBehavior.averagePaymentDelay > 0 && (
            <p className="mt-2 text-center text-sm text-gray-500">
              Avg late payment delay: {data.paymentBehavior.averagePaymentDelay} days
            </p>
          )}
        </SectionCard>
      </div>

      {/* Retention Matrix */}
      {data.retention.data.length > 0 && (
        <SectionCard title="Cohort Retention">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Cohort</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Size</th>
                  {data.retention.averageRetention.slice(0, 7).map((_, i) => (
                    <th key={i} className="px-3 py-2 text-center font-medium text-gray-500">
                      M{i}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.retention.data.map((row) => (
                  <tr key={row.cohort} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium text-gray-900">{row.cohort}</td>
                    <td className="px-3 py-2 text-gray-600">{row.size}</td>
                    {row.retention.slice(0, 7).map((pct, i) => (
                      <td key={i} className="px-3 py-2 text-center">
                        <span
                          className="inline-block rounded px-2 py-0.5 text-xs font-medium"
                          style={{
                            backgroundColor: `rgba(79, 167, 126, ${pct / 100})`,
                            color: pct > 50 ? '#fff' : '#374151',
                          }}
                        >
                          {pct}%
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-medium">
                  <td className="px-3 py-2 text-gray-700">Average</td>
                  <td className="px-3 py-2" />
                  {data.retention.averageRetention.slice(0, 7).map((pct, i) => (
                    <td key={i} className="px-3 py-2 text-center text-gray-700">
                      {pct}%
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* At-Risk Patients */}
      {data.atRisk.length > 0 && (
        <SectionCard title="At-Risk Patients">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Patient</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Risk Score</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Risk Factors</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Last Payment</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500">Total Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.atRisk.map((p) => (
                  <tr key={p.patientId} className="border-b border-gray-100">
                    <td className="px-3 py-3 font-medium text-gray-900">{p.patientName}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-16 rounded-full bg-gray-200">
                          <div
                            className="h-2 rounded-full"
                            style={{
                              width: `${p.riskScore}%`,
                              backgroundColor:
                                p.riskScore > 70
                                  ? '#ef4444'
                                  : p.riskScore > 40
                                    ? '#f59e0b'
                                    : '#4fa77e',
                            }}
                          />
                        </div>
                        <span className="text-xs font-medium text-gray-600">{p.riskScore}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {p.riskFactors.map((f) => (
                          <span
                            key={f}
                            className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-700"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-gray-600">
                      {p.lastPaymentDate
                        ? new Date(p.lastPaymentDate).toLocaleDateString()
                        : 'Never'}
                    </td>
                    <td className="px-3 py-3 text-right font-medium text-gray-900">
                      {formatCurrency(p.totalRevenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function SubscriptionsSection({ data }: { data: SubscriptionData }) {
  return (
    <div className="space-y-6">
      {/* Subscription KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KPICard
          label="Active Subscriptions"
          value={data.metrics.activeSubscriptions}
          icon={CreditCard}
        />
        <KPICard
          label="Total MRR"
          value={data.metrics.totalMrr}
          icon={TrendingUp}
          format="currency"
        />
        <KPICard
          label="Churn Rate"
          value={data.churn.churnRate}
          icon={UserMinus}
          format="percent"
        />
        <KPICard
          label="Retention Rate"
          value={data.churn.retentionRate}
          icon={Activity}
          format="percent"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KPICard label="Paused" value={data.metrics.pausedSubscriptions} icon={Activity} />
        <KPICard label="Past Due" value={data.metrics.pastDueSubscriptions} icon={AlertTriangle} />
        <KPICard
          label="Avg Subscription Value"
          value={data.metrics.averageSubscriptionValue}
          icon={DollarSign}
          format="currency"
        />
        <KPICard
          label="Avg Lifetime Before Churn"
          value={data.churn.averageLifetimeBeforeChurn}
          icon={Activity}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Subscription Trends */}
        <SectionCard title="Subscription Growth">
          {data.trends.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.trends} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" width={40} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }} />
                <Legend />
                <Bar dataKey="newSubscriptions" name="New" fill="#4fa77e" radius={[4, 4, 0, 0]} />
                <Bar
                  dataKey="canceledSubscriptions"
                  name="Canceled"
                  fill="#ef4444"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="No subscription trend data" />
          )}
        </SectionCard>

        {/* MRR Trend */}
        <SectionCard title="MRR Over Time">
          {data.trends.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.trends} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis
                  tickFormatter={(v: number) => formatCurrencyCompact(v)}
                  tick={{ fontSize: 11 }}
                  stroke="#9ca3af"
                  width={60}
                />
                <Tooltip
                  formatter={(value?: number) => formatCurrency(value ?? 0)}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }}
                />
                <Line
                  type="monotone"
                  dataKey="mrr"
                  name="MRR"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={{ fill: '#8b5cf6' }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="No MRR data" />
          )}
        </SectionCard>
      </div>

      {/* Churn Reasons */}
      {data.churn.churnReasons.length > 0 && (
        <SectionCard title="Churn Reasons">
          <div className="space-y-3">
            {data.churn.churnReasons.map((reason) => (
              <div key={reason.reason} className="flex items-center gap-4">
                <div className="w-40 text-sm font-medium text-gray-700">{reason.reason}</div>
                <div className="flex-1">
                  <div className="h-3 rounded-full bg-gray-100">
                    <div
                      className="h-3 rounded-full bg-red-400"
                      style={{ width: `${reason.percentageOfTotal}%` }}
                    />
                  </div>
                </div>
                <div className="w-20 text-right text-sm font-medium text-gray-900">
                  {reason.count}
                </div>
                <div className="w-24 text-right text-sm text-gray-500">
                  {formatCurrency(reason.mrr)} MRR
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Subscriptions by Plan */}
      {data.metrics.subscriptionsByPlan.length > 0 && (
        <SectionCard title="Active Subscriptions by Plan">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={data.metrics.subscriptionsByPlan}
                dataKey="count"
                nameKey="planName"
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={50}
                paddingAngle={2}
                label={(props: any) => `${props.planName ?? ''} (${props.count ?? 0})`}
              >
                {data.metrics.subscriptionsByPlan.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }} />
            </PieChart>
          </ResponsiveContainer>
        </SectionCard>
      )}

      {/* Past Due */}
      {data.pastDue.subscriptions.length > 0 && (
        <SectionCard
          title="Past Due Subscriptions"
          action={
            <span className="text-sm font-medium text-red-600">
              {formatCurrency(data.pastDue.totalAmount)} at risk
            </span>
          }
        >
          <div className="mb-4 flex gap-4 text-sm">
            <span className="rounded bg-yellow-50 px-3 py-1 text-yellow-800">
              &lt;7 days: {data.pastDue.daysPastDue.under7}
            </span>
            <span className="rounded bg-orange-50 px-3 py-1 text-orange-800">
              7-30 days: {data.pastDue.daysPastDue.under30}
            </span>
            <span className="rounded bg-red-50 px-3 py-1 text-red-800">
              30+ days: {data.pastDue.daysPastDue.over30}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Patient</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500">Amount</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500">Days</th>
                </tr>
              </thead>
              <tbody>
                {data.pastDue.subscriptions.slice(0, 10).map((sub) => (
                  <tr key={sub.id} className="border-b border-gray-100">
                    <td className="px-3 py-2 font-medium text-gray-900">{sub.patientName}</td>
                    <td className="px-3 py-2 text-right text-gray-900">
                      {formatCurrency(sub.amount)}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600">{sub.daysSinceStart}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function OrdersSection({ data }: { data: OrderData }) {
  const statusColors: Record<string, string> = {
    PENDING: '#f59e0b',
    PENDING_REVIEW: '#f97316',
    IN_PROGRESS: '#3b82f6',
    COMPLETED: '#4fa77e',
    CANCELED: '#ef4444',
    DECLINED: '#ef4444',
    SHIPPED: '#06b6d4',
    DELIVERED: '#10b981',
  };

  const statusEntries = Object.entries(data.statusCounts).sort(([, a], [, b]) => b - a);
  const totalOrders = statusEntries.reduce((sum, [, count]) => sum + count, 0);

  return (
    <div className="space-y-6">
      {/* Status Distribution */}
      <SectionCard title="Order Status Distribution">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {statusEntries.map(([status, count]) => (
            <div key={status} className="rounded-lg border border-gray-100 bg-gray-50 p-4">
              <div className="flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: statusColors[status] || '#9ca3af' }}
                />
                <span className="text-sm font-medium capitalize text-gray-700">
                  {status.toLowerCase().replace(/_/g, ' ')}
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold text-gray-900">{count}</p>
              <p className="text-xs text-gray-500">
                {totalOrders > 0 ? ((count / totalOrders) * 100).toFixed(1) : 0}% of total
              </p>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Order Timeline */}
      {data.dailyOrders.length > 0 && (
        <SectionCard title="Orders Over Time">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.dailyOrders} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#9ca3af" />
              <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" width={40} />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }} />
              <Legend />
              <Bar
                dataKey="completed"
                name="Completed"
                stackId="a"
                fill="#4fa77e"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="pending"
                name="Pending"
                stackId="a"
                fill="#f59e0b"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
      )}

      {/* Recent Orders */}
      {data.recentOrders.length > 0 && (
        <SectionCard title="Recent Orders">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Order ID</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Patient</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Status</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.recentOrders.slice(0, 15).map((order) => (
                  <tr key={order.id} className="border-b border-gray-100">
                    <td className="px-3 py-2 font-mono text-gray-900">#{order.id}</td>
                    <td className="px-3 py-2 text-gray-600">
                      {order.patient
                        ? `${order.patient.firstName} ${order.patient.lastName}`
                        : 'N/A'}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: (statusColors[order.status] || '#9ca3af') + '20',
                          color: statusColors[order.status] || '#6b7280',
                        }}
                      >
                        {order.status.toLowerCase().replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-500">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AdminAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<Section>('overview');
  const [period, setPeriod] = useState<Period>('30d');
  const [error, setError] = useState<string | null>(null);

  const [overviewData, setOverviewData] = useState<OverviewData | null>(null);
  const [revenueData, setRevenueData] = useState<RevenueData | null>(null);
  const [patientData, setPatientData] = useState<PatientData | null>(null);
  const [subscriptionData, setSubscriptionData] = useState<SubscriptionData | null>(null);
  const [orderData, setOrderData] = useState<OrderData | null>(null);

  const fetchData = useCallback(async (section: Section, p: Period, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await apiFetch(`/api/admin/clinic-analytics?section=${section}&period=${p}`);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }
      const json = await res.json();

      switch (section) {
        case 'overview':
          setOverviewData(json.data);
          break;
        case 'revenue':
          setRevenueData(json.data);
          break;
        case 'patients':
          setPatientData(json.data);
          break;
        case 'subscriptions':
          setSubscriptionData(json.data);
          break;
        case 'orders':
          setOrderData(json.data);
          break;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData(activeTab, period);
  }, [activeTab, period, fetchData]);

  const handleTabChange = (tab: Section) => {
    setActiveTab(tab);
  };

  const handleRefresh = () => {
    fetchData(activeTab, period, true);
  };

  const tabs: { id: Section; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'revenue', label: 'Revenue', icon: DollarSign },
    { id: 'patients', label: 'Patients', icon: Users },
    { id: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
    { id: 'orders', label: 'Orders', icon: ShoppingCart },
  ];

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clinic Analytics</h1>
          <p className="mt-1 text-gray-600">
            Comprehensive insights into clinic performance and growth
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Period Selector */}
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
          >
            {Object.entries(periodLabels).map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>

          {/* Refresh */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-gray-50 p-1.5">
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            active={activeTab === tab.id}
            onClick={() => handleTabChange(tab.id)}
            icon={tab.icon}
            label={tab.label}
          />
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <div>
            <p className="font-medium">Failed to load analytics</p>
            <p className="text-sm">{error}</p>
          </div>
          <button
            onClick={handleRefresh}
            className="ml-auto rounded-lg bg-red-100 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-200"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex h-96 items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-[var(--brand-primary)]" />
            <p className="mt-3 text-sm text-gray-500">Loading analytics data...</p>
          </div>
        </div>
      )}

      {/* Content */}
      {!loading && !error && (
        <>
          {activeTab === 'overview' && overviewData && (
            <OverviewSection data={overviewData} period={period} />
          )}
          {activeTab === 'revenue' && revenueData && <RevenueSection data={revenueData} />}
          {activeTab === 'patients' && patientData && <PatientsSection data={patientData} />}
          {activeTab === 'subscriptions' && subscriptionData && (
            <SubscriptionsSection data={subscriptionData} />
          )}
          {activeTab === 'orders' && orderData && <OrdersSection data={orderData} />}
        </>
      )}
    </div>
  );
}
