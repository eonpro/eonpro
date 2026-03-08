'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Receipt,
  AlertCircle,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  ChevronLeft,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';
import RevenueAreaChart from '@/components/billing/RevenueAreaChart';
import ARAgingBarChart from '@/components/billing/ARAgingBarChart';
import FeeBreakdownPieChart from '@/components/billing/FeeBreakdownPieChart';
import CollectionGauge from '@/components/billing/CollectionGauge';
import TopClinicsBarChart from '@/components/billing/TopClinicsBarChart';
import type { FullDashboard } from '@/services/billing/billingAnalyticsService';

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);

export default function BillingAnalyticsPage() {
  const router = useRouter();
  const [data, setData] = useState<FullDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiFetch('/api/super-admin/billing-analytics?type=dashboard');
        if (res.ok) {
          const json = await res.json();
          setData(json.data);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#4fa77e] border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen p-6 lg:p-8">
        <div className="py-12 text-center">
          <BarChart3 className="mx-auto mb-4 h-12 w-12 text-gray-300" />
          <p className="text-gray-500">Failed to load analytics data</p>
        </div>
      </div>
    );
  }

  const { overview, revenueTrend, arAging, feeBreakdown, collectionMetrics, topClinics, monthComparison } = data;

  return (
    <div className="min-h-screen p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8 flex items-center gap-4">
        <button
          onClick={() => router.push('/super-admin/clinic-billing')}
          className="rounded-lg p-2 transition-colors hover:bg-gray-100"
        >
          <ChevronLeft className="h-5 w-5 text-gray-500" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financial Analytics</h1>
          <p className="mt-1 text-gray-500">Platform billing performance and insights</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-6">
        <KPICard
          label="Total Revenue"
          value={formatCurrency(overview.totalRevenue)}
          icon={<DollarSign className="h-5 w-5 text-[#4fa77e]" />}
          bgIcon="bg-[#4fa77e]/10"
        />
        <KPICard
          label="MoM Change"
          value={`${overview.momChange > 0 ? '+' : ''}${overview.momChange}%`}
          icon={
            overview.momChange >= 0 ? (
              <TrendingUp className="h-5 w-5 text-green-600" />
            ) : (
              <TrendingDown className="h-5 w-5 text-red-600" />
            )
          }
          bgIcon={overview.momChange >= 0 ? 'bg-green-100' : 'bg-red-100'}
        />
        <KPICard
          label="Collection Rate"
          value={`${overview.collectionRate}%`}
          icon={<Receipt className="h-5 w-5 text-blue-600" />}
          bgIcon="bg-blue-100"
        />
        <KPICard
          label="Avg Invoice"
          value={formatCurrency(overview.avgInvoiceValue)}
          icon={<BarChart3 className="h-5 w-5 text-purple-600" />}
          bgIcon="bg-purple-100"
        />
        <KPICard
          label="Outstanding"
          value={formatCurrency(overview.totalOutstanding)}
          icon={<AlertCircle className="h-5 w-5 text-yellow-600" />}
          bgIcon="bg-yellow-100"
        />
        <KPICard
          label="Overdue"
          value={formatCurrency(overview.totalOverdue)}
          icon={<AlertCircle className="h-5 w-5 text-red-600" />}
          bgIcon="bg-red-100"
        />
      </div>

      {/* Charts Row 1: Revenue Trend + Collection Gauge */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Revenue Trend (12 Months)</h2>
          <RevenueAreaChart data={revenueTrend} />
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Collection Efficiency</h2>
          <CollectionGauge data={collectionMetrics} />
        </div>
      </div>

      {/* Charts Row 2: AR Aging + Fee Breakdown */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Accounts Receivable Aging</h2>
          <ARAgingBarChart data={arAging} />
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Fee Type Breakdown</h2>
          <FeeBreakdownPieChart data={feeBreakdown} />
        </div>
      </div>

      {/* Charts Row 3: Top Clinics */}
      <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Top Clinics by Revenue</h2>
        <TopClinicsBarChart data={topClinics} />
      </div>

      {/* Monthly Comparison Table */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Monthly Comparison</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Metric</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">
                  {monthComparison.current.month}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">
                  {monthComparison.previous.month}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">
                  {monthComparison.lastYear.month}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">MoM</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">YoY</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <ComparisonRow
                label="Revenue"
                current={monthComparison.current.revenue}
                previous={monthComparison.previous.revenue}
                lastYear={monthComparison.lastYear.revenue}
                format="currency"
              />
              <ComparisonRow
                label="Invoices"
                current={monthComparison.current.invoiceCount}
                previous={monthComparison.previous.invoiceCount}
                lastYear={monthComparison.lastYear.invoiceCount}
                format="number"
              />
              <ComparisonRow
                label="Paid"
                current={monthComparison.current.paidCount}
                previous={monthComparison.previous.paidCount}
                lastYear={monthComparison.lastYear.paidCount}
                format="number"
              />
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Method Breakdown */}
      {collectionMetrics.paymentMethodBreakdown.length > 0 && (
        <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Payment Methods</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {collectionMetrics.paymentMethodBreakdown.map((pm) => (
              <div key={pm.method} className="rounded-xl border border-gray-100 p-4">
                <p className="text-xs capitalize text-gray-500">{pm.method.replace(/_/g, ' ')}</p>
                <p className="text-lg font-bold text-gray-900">{formatCurrency(pm.amountCents)}</p>
                <p className="text-xs text-gray-400">{pm.count} payments</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KPICard({
  label,
  value,
  icon,
  bgIcon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  bgIcon: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`rounded-xl p-2 ${bgIcon}`}>{icon}</div>
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-lg font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
}

function ComparisonRow({
  label,
  current,
  previous,
  lastYear,
  format,
}: {
  label: string;
  current: number;
  previous: number;
  lastYear: number;
  format: 'currency' | 'number';
}) {
  const fmt = (v: number) =>
    format === 'currency' ? formatCurrency(v) : v.toLocaleString();

  const momDelta = previous > 0 ? ((current - previous) / previous) * 100 : 0;
  const yoyDelta = lastYear > 0 ? ((current - lastYear) / lastYear) * 100 : 0;

  const DeltaBadge = ({ delta }: { delta: number }) => {
    if (delta === 0) return <span className="text-gray-400">-</span>;
    const positive = delta > 0;
    return (
      <span className={`inline-flex items-center gap-0.5 text-sm font-medium ${positive ? 'text-green-600' : 'text-red-600'}`}>
        {positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
        {Math.abs(Math.round(delta))}%
      </span>
    );
  };

  return (
    <tr>
      <td className="px-4 py-3 text-sm font-medium text-gray-900">{label}</td>
      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{fmt(current)}</td>
      <td className="px-4 py-3 text-right text-sm text-gray-600">{fmt(previous)}</td>
      <td className="px-4 py-3 text-right text-sm text-gray-600">{fmt(lastYear)}</td>
      <td className="px-4 py-3 text-right"><DeltaBadge delta={momDelta} /></td>
      <td className="px-4 py-3 text-right"><DeltaBadge delta={yoyDelta} /></td>
    </tr>
  );
}
