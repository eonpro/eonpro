'use client';

/**
 * Provider Performance Reports Page
 * 
 * Admin dashboard for viewing provider prescription and SOAP note metrics.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  RefreshCw,
  AlertTriangle,
  Users,
  FileText,
  DollarSign,
  Calendar,
  TrendingUp,
  Download,
} from 'lucide-react';

interface ProviderStats {
  id: number;
  name: string;
  prescriptions: number;
  soapNotes: number;
  earningsCents: number;
  earningsFormatted: string | null;
}

interface TimelineEntry {
  period: string;
  prescriptions: number;
  soapNotes: number;
}

interface ReportSummary {
  totalPrescriptions: number;
  totalSOAPNotes: number;
  totalEarningsCents: number;
  totalEarningsFormatted: string | null;
  providerCount: number;
}

type Period = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'ytd' | 'custom';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'day', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'quarter', label: 'This Quarter' },
  { value: 'year', label: 'This Year' },
  { value: 'ytd', label: 'Year to Date' },
  { value: 'custom', label: 'Custom Range' },
];

export default function ProviderPerformanceReportsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('month');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [compensationEnabled, setCompensationEnabled] = useState(false);

  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [providers, setProviders] = useState<ProviderStats[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);

  // Fetch report data
  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      let url = `/api/reports/provider-performance?period=${period}`;
      if (period === 'custom' && startDate && endDate) {
        url += `&startDate=${startDate}&endDate=${endDate}`;
      }

      const response = await fetch(url);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch report');
      }

      const data = await response.json();
      setCompensationEnabled(data.compensationEnabled);
      setSummary(data.summary);
      setProviders(data.providers);
      setTimeline(data.timeline);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [period, startDate, endDate]);

  useEffect(() => {
    if (period !== 'custom' || (startDate && endDate)) {
      fetchReport();
    }
  }, [fetchReport, period, startDate, endDate]);

  // Calculate max values for chart scaling
  const maxPrescriptions = Math.max(...timeline.map((t) => t.prescriptions), 1);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-6 w-6 text-teal-600" />
                <h1 className="text-2xl font-bold text-gray-900">
                  Provider Performance
                </h1>
              </div>
              <p className="text-gray-500 text-sm mt-1">
                Prescription and SOAP note analytics
              </p>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as Period)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
              >
                {PERIODS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              {period === 'custom' && (
                <>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  />
                  <span className="text-gray-500">to</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  />
                </>
              )}
              <button
                onClick={() => fetchReport()}
                disabled={loading}
                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <RefreshCw
                  className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <span className="text-red-700">{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-100 rounded-lg">
                    <FileText className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-gray-900">
                      {summary?.totalPrescriptions || 0}
                    </p>
                    <p className="text-gray-500 text-sm">Prescriptions</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-purple-100 rounded-lg">
                    <FileText className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-gray-900">
                      {summary?.totalSOAPNotes || 0}
                    </p>
                    <p className="text-gray-500 text-sm">SOAP Notes</p>
                  </div>
                </div>
              </div>
              {compensationEnabled && (
                <div className="bg-white rounded-xl p-6 border border-gray-200">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-green-100 rounded-lg">
                      <DollarSign className="h-6 w-6 text-green-600" />
                    </div>
                    <div>
                      <p className="text-3xl font-bold text-gray-900">
                        {summary?.totalEarningsFormatted || '$0.00'}
                      </p>
                      <p className="text-gray-500 text-sm">Total Compensation</p>
                    </div>
                  </div>
                </div>
              )}
              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-orange-100 rounded-lg">
                    <Users className="h-6 w-6 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-gray-900">
                      {summary?.providerCount || 0}
                    </p>
                    <p className="text-gray-500 text-sm">Active Providers</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Timeline Chart */}
            {timeline.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-gray-500" />
                  Prescription Activity
                </h2>
                <div className="h-64 flex items-end gap-1">
                  {timeline.map((entry, index) => {
                    const height =
                      (entry.prescriptions / maxPrescriptions) * 100;
                    return (
                      <div
                        key={index}
                        className="flex-1 flex flex-col items-center"
                      >
                        <div
                          className="w-full bg-teal-500 rounded-t hover:bg-teal-600 transition-colors cursor-pointer relative group"
                          style={{ height: `${Math.max(height, 2)}%` }}
                        >
                          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                            {entry.prescriptions} Rx
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-2 truncate w-full text-center">
                          {new Date(entry.period).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Provider Rankings */}
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Users className="h-5 w-5 text-gray-500" />
                  Provider Rankings
                </h2>
                <button className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                  <Download className="h-4 w-4" />
                  Export
                </button>
              </div>
              {providers.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Users className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                  <p>No provider data for this period.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                          Rank
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                          Provider
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">
                          Prescriptions
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">
                          SOAP Notes
                        </th>
                        {compensationEnabled && (
                          <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">
                            Earnings
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {providers.map((provider, index) => (
                        <tr
                          key={provider.id}
                          className="border-b border-gray-100 hover:bg-gray-50"
                        >
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                                index === 0
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : index === 1
                                  ? 'bg-gray-200 text-gray-700'
                                  : index === 2
                                  ? 'bg-orange-100 text-orange-700'
                                  : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {index + 1}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-medium text-gray-900">
                            {provider.name}
                          </td>
                          <td className="py-3 px-4 text-right text-gray-600">
                            {provider.prescriptions}
                          </td>
                          <td className="py-3 px-4 text-right text-gray-600">
                            {provider.soapNotes}
                          </td>
                          {compensationEnabled && (
                            <td className="py-3 px-4 text-right font-semibold text-green-600">
                              {provider.earningsFormatted || '-'}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
