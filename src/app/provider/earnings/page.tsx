'use client';

/**
 * Provider Earnings Dashboard
 *
 * Self-service dashboard for providers to view their earnings.
 */

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api/fetch';
import {
  DollarSign,
  RefreshCw,
  AlertTriangle,
  TrendingUp,
  Calendar,
  FileText,
  CheckCircle2,
  Clock,
  CreditCard,
} from 'lucide-react';

interface EarningsData {
  totalPrescriptions: number;
  totalEarnings: number;
  totalEarningsFormatted: string;
  pendingEarnings: number;
  pendingEarningsFormatted: string;
  approvedEarnings: number;
  approvedEarningsFormatted: string;
  paidEarnings: number;
  paidEarningsFormatted: string;
  voidedCount: number;
  breakdown: {
    period: string;
    prescriptions: number;
    earnings: number;
    earningsFormatted: string;
  }[];
}

interface CompensationPlan {
  flatRatePerScript: number;
  flatRateFormatted: string;
  isActive: boolean;
}

type Period = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'ytd';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'day', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'quarter', label: 'This Quarter' },
  { value: 'year', label: 'This Year' },
  { value: 'ytd', label: 'Year to Date' },
];

export default function ProviderEarningsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [period, setPeriod] = useState<Period>('month');
  const [earnings, setEarnings] = useState<EarningsData | null>(null);
  const [plan, setPlan] = useState<CompensationPlan | null>(null);
  const [ytd, setYtd] = useState<{
    totalPrescriptions: number;
    totalEarnings: number;
    totalEarningsFormatted: string;
  } | null>(null);

  // Fetch earnings data
  const fetchEarnings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiFetch(`/api/provider/earnings?period=${period}`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch earnings');
      }

      const data = await response.json();
      setEnabled(data.enabled);
      setEarnings(data.earnings);
      setPlan(data.plan);
      setYtd(data.ytd);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchEarnings();
  }, [fetchEarnings]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex items-center gap-3 text-gray-600">
          <RefreshCw className="h-6 w-6 animate-spin" />
          <span>Loading earnings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <DollarSign className="h-6 w-6 text-green-600" />
                <h1 className="text-2xl font-bold text-gray-900">My Earnings</h1>
              </div>
              <p className="mt-1 text-sm text-gray-500">Track your prescription earnings</p>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as Period)}
                className="rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-teal-500"
              >
                {PERIODS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => fetchEarnings()}
                disabled={loading}
                className="rounded-lg border border-gray-300 p-2 hover:bg-gray-50"
              >
                <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <span className="text-red-700">{error}</span>
          </div>
        )}

        {!enabled ? (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-6 text-center">
            <AlertTriangle className="mx-auto mb-3 h-12 w-12 text-yellow-500" />
            <h2 className="mb-2 text-lg font-semibold text-gray-900">
              Compensation Tracking Not Enabled
            </h2>
            <p className="text-gray-600">
              Per-script compensation tracking is not enabled for your clinic. Contact your
              administrator for more information.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-gray-200 bg-white p-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-blue-100 p-3">
                    <FileText className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-gray-900">
                      {earnings?.totalPrescriptions || 0}
                    </p>
                    <p className="text-sm text-gray-500">Prescriptions</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-green-100 p-3">
                    <DollarSign className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-gray-900">
                      {earnings?.totalEarningsFormatted || '$0.00'}
                    </p>
                    <p className="text-sm text-gray-500">Total Earnings</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-yellow-100 p-3">
                    <Clock className="h-6 w-6 text-yellow-600" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-gray-900">
                      {earnings?.pendingEarningsFormatted || '$0.00'}
                    </p>
                    <p className="text-sm text-gray-500">Pending</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-[var(--brand-primary-light)] p-3">
                    <CreditCard className="h-6 w-6 text-[var(--brand-primary)]" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-gray-900">
                      {earnings?.paidEarningsFormatted || '$0.00'}
                    </p>
                    <p className="text-sm text-gray-500">Paid Out</p>
                  </div>
                </div>
              </div>
            </div>

            {/* YTD Summary & Rate */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* YTD Summary */}
              <div className="rounded-xl bg-gradient-to-r from-teal-600 to-teal-700 p-6 text-white">
                <div className="mb-4 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  <h2 className="text-lg font-semibold">Year to Date</h2>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-3xl font-bold">{ytd?.totalEarningsFormatted || '$0.00'}</p>
                    <p className="text-sm text-teal-100">Total Earnings</p>
                  </div>
                  <div>
                    <p className="text-3xl font-bold">{ytd?.totalPrescriptions || 0}</p>
                    <p className="text-sm text-teal-100">Prescriptions</p>
                  </div>
                </div>
              </div>

              {/* Current Rate */}
              <div className="rounded-xl border border-gray-200 bg-white p-6">
                <div className="mb-4 flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-gray-500" />
                  <h2 className="text-lg font-semibold text-gray-900">Your Rate</h2>
                </div>
                {plan ? (
                  <div>
                    <p className="text-3xl font-bold text-green-600">{plan.flatRateFormatted}</p>
                    <p className="text-sm text-gray-500">per prescription</p>
                    <div className="mt-3">
                      {plan.isActive ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                          <CheckCircle2 className="h-3 w-3" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
                          Inactive
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500">
                    No compensation plan set. Contact your administrator.
                  </p>
                )}
              </div>
            </div>

            {/* Breakdown Table */}
            {earnings && earnings.breakdown.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white">
                <div className="border-b border-gray-200 p-4">
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                    <Calendar className="h-5 w-5 text-gray-500" />
                    Daily Breakdown
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                          Date
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">
                          Prescriptions
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">
                          Earnings
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {earnings.breakdown.map((day) => (
                        <tr key={day.period} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-900">
                            {new Date(day.period).toLocaleDateString('en-US', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            {day.prescriptions}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-green-600">
                            {day.earningsFormatted}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 font-semibold">
                        <td className="px-4 py-3 text-gray-900">Total</td>
                        <td className="px-4 py-3 text-right text-gray-900">
                          {earnings.totalPrescriptions}
                        </td>
                        <td className="px-4 py-3 text-right text-green-600">
                          {earnings.totalEarningsFormatted}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Empty State */}
            {earnings && earnings.breakdown.length === 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
                <FileText className="mx-auto mb-3 h-12 w-12 text-gray-300" />
                <p className="text-gray-500">No prescriptions found for this period.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
