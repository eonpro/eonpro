'use client';

import { useEffect, useState } from 'react';
import {
  BarChart3,
  TrendingUp,
  Users,
  DollarSign,
  Download,
  Calendar,
  Award,
  AlertTriangle,
  FileText,
} from 'lucide-react';

interface ReportData {
  overview: {
    totalAffiliates: number;
    activeAffiliates: number;
    totalConversions: number;
    totalRevenueCents: number;
    totalCommissionCents: number;
    pendingPayoutCents: number;
  };
  topAffiliates: Array<{
    id: number;
    name: string;
    conversions: number;
    revenueCents: number;
    commissionCents: number;
  }>;
  trends: Array<{
    date: string;
    conversions: number;
    revenueCents: number;
    commissionCents: number;
  }>;
  fraud: {
    openAlerts: number;
    criticalAlerts: number;
    confirmedFraudCents: number;
  };
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export default function AffiliateReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'7d' | '30d' | '90d' | 'ytd'>('30d');

  useEffect(() => {
    fetchData();
  }, [period]);

  const fetchData = async () => {
    setLoading(true);
    const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token');
    
    try {
      const response = await fetch(`/api/admin/affiliates/reports?period=${period}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        setData(await response.json());
      } else {
        // Mock data for demo
        setData({
          overview: {
            totalAffiliates: 47,
            activeAffiliates: 32,
            totalConversions: 1284,
            totalRevenueCents: 12847500,
            totalCommissionCents: 1284750,
            pendingPayoutCents: 324500,
          },
          topAffiliates: [
            { id: 1, name: 'John Smith', conversions: 156, revenueCents: 1850000, commissionCents: 185000 },
            { id: 2, name: 'Sarah Johnson', conversions: 134, revenueCents: 1620000, commissionCents: 162000 },
            { id: 3, name: 'Mike Williams', conversions: 98, revenueCents: 1240000, commissionCents: 124000 },
            { id: 4, name: 'Emily Brown', conversions: 87, revenueCents: 980000, commissionCents: 98000 },
            { id: 5, name: 'David Lee', conversions: 72, revenueCents: 840000, commissionCents: 84000 },
          ],
          trends: Array.from({ length: 14 }, (_, i) => ({
            date: new Date(Date.now() - (13 - i) * 24 * 60 * 60 * 1000).toISOString(),
            conversions: Math.floor(Math.random() * 50) + 20,
            revenueCents: Math.floor(Math.random() * 500000) + 200000,
            commissionCents: Math.floor(Math.random() * 50000) + 20000,
          })),
          fraud: {
            openAlerts: 12,
            criticalAlerts: 2,
            confirmedFraudCents: 45000,
          },
        });
      }
    } catch (error) {
      console.error('Failed to fetch reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = (type: 'affiliates' | 'commissions' | '1099') => {
    // In real implementation, this would trigger a download
    console.log(`Exporting ${type} report...`);
    alert(`Generating ${type} report... This would download a CSV file.`);
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Affiliate Reports</h1>
          <p className="text-gray-500">Program performance and analytics</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Period Selector */}
          <div className="flex rounded-lg border border-gray-200 bg-white p-1">
            {(['7d', '30d', '90d', 'ytd'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                  period === p
                    ? 'bg-violet-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {p === 'ytd' ? 'YTD' : p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-violet-100 p-2 text-violet-600">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{data?.overview.activeAffiliates}</p>
              <p className="text-sm text-gray-500">Active Affiliates</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2 text-green-600">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{data?.overview.totalConversions}</p>
              <p className="text-sm text-gray-500">Total Conversions</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2 text-blue-600">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(data?.overview.totalRevenueCents || 0)}
              </p>
              <p className="text-sm text-gray-500">Revenue Generated</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-yellow-100 p-2 text-yellow-600">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(data?.overview.totalCommissionCents || 0)}
              </p>
              <p className="text-sm text-gray-500">Commission Paid</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Trend Chart */}
        <div className="lg:col-span-2 rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Performance Trend</h2>
          {data?.trends && (
            <div className="space-y-2">
              {data.trends.slice(-14).map((day, i) => {
                const maxConversions = Math.max(...data.trends.map(d => d.conversions), 1);
                const width = (day.conversions / maxConversions) * 100;
                
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-12 text-xs text-gray-500">
                      {formatDate(day.date)}
                    </span>
                    <div className="flex-1">
                      <div 
                        className="h-5 rounded-r bg-violet-500 transition-all"
                        style={{ width: `${Math.max(width, 2)}%` }}
                      />
                    </div>
                    <span className="w-16 text-right text-sm text-gray-700">
                      {day.conversions}
                    </span>
                    <span className="w-20 text-right text-sm text-green-600">
                      {formatCurrency(day.commissionCents)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top Affiliates */}
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Top Affiliates</h2>
            <Award className="h-5 w-5 text-yellow-500" />
          </div>
          <div className="space-y-3">
            {data?.topAffiliates.map((affiliate, i) => (
              <div key={affiliate.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                    i === 0 ? 'bg-yellow-100 text-yellow-700' :
                    i === 1 ? 'bg-gray-100 text-gray-700' :
                    i === 2 ? 'bg-orange-100 text-orange-700' :
                    'bg-gray-50 text-gray-500'
                  }`}>
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-medium text-gray-900">{affiliate.name}</p>
                    <p className="text-xs text-gray-500">{affiliate.conversions} conversions</p>
                  </div>
                </div>
                <span className="font-medium text-green-600">
                  {formatCurrency(affiliate.commissionCents)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Fraud Summary & Exports */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Fraud Summary */}
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Fraud Summary</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg bg-yellow-50 p-3">
              <p className="text-2xl font-bold text-yellow-700">{data?.fraud.openAlerts}</p>
              <p className="text-sm text-yellow-600">Open Alerts</p>
            </div>
            <div className="rounded-lg bg-red-50 p-3">
              <p className="text-2xl font-bold text-red-700">{data?.fraud.criticalAlerts}</p>
              <p className="text-sm text-red-600">Critical</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-2xl font-bold text-gray-700">
                {formatCurrency(data?.fraud.confirmedFraudCents || 0)}
              </p>
              <p className="text-sm text-gray-600">Prevented</p>
            </div>
          </div>
          <a
            href="/admin/affiliates/fraud-queue"
            className="mt-4 inline-flex items-center gap-2 text-sm text-violet-600 hover:text-violet-700"
          >
            <AlertTriangle className="h-4 w-4" />
            View Fraud Queue
          </a>
        </div>

        {/* Export Options */}
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Export Reports</h2>
          <div className="space-y-3">
            <button
              onClick={() => handleExport('affiliates')}
              className="flex w-full items-center justify-between rounded-lg border border-gray-200 p-3 text-left hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="font-medium text-gray-900">Affiliate List</p>
                  <p className="text-sm text-gray-500">All affiliates with stats</p>
                </div>
              </div>
              <Download className="h-5 w-5 text-gray-400" />
            </button>
            <button
              onClick={() => handleExport('commissions')}
              className="flex w-full items-center justify-between rounded-lg border border-gray-200 p-3 text-left hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <DollarSign className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="font-medium text-gray-900">Commission Report</p>
                  <p className="text-sm text-gray-500">All commission events</p>
                </div>
              </div>
              <Download className="h-5 w-5 text-gray-400" />
            </button>
            <button
              onClick={() => handleExport('1099')}
              className="flex w-full items-center justify-between rounded-lg border border-gray-200 p-3 text-left hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="font-medium text-gray-900">1099 Tax Report</p>
                  <p className="text-sm text-gray-500">Affiliates earning &gt;$600</p>
                </div>
              </div>
              <Download className="h-5 w-5 text-gray-400" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
