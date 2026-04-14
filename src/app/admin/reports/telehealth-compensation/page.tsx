'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Video,
  RefreshCw,
  AlertTriangle,
  DollarSign,
  Calendar,
  Download,
  CheckCircle2,
  Clock,
  Users,
  Filter,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface AppointmentRow {
  id: number;
  startTime: string;
  endTime: string;
  duration: number;
  status: string;
  completedAt: string | null;
  provider: { id: number; name: string };
  patient: { id: number; name: string };
  reason: string | null;
  payoutCents: number;
  payoutFormatted: string;
}

interface ProviderBreakdown {
  id: number;
  name: string;
  npi: string | null;
  completed: number;
  scheduled: number;
  totalCents: number;
  totalFormatted: string;
}

interface ReportData {
  ratePerAppointmentCents: number;
  summary: {
    totalAppointments: number;
    completedCount: number;
    scheduledCount: number;
    totalPayoutCents: number;
    totalPayoutFormatted: string;
  };
  providerBreakdown: ProviderBreakdown[];
  appointments: AppointmentRow[];
}

interface ProviderOption {
  id: number;
  name: string;
}

type StatusFilter = 'ALL' | 'SCHEDULED' | 'COMPLETED';

function getDefaultDates() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

export default function TelehealthCompensationPage() {
  const defaults = getDefaultDates();
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [providerId, setProviderId] = useState<string>('');
  const [providers, setProviders] = useState<ProviderOption[]>([]);

  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadProviders() {
      try {
        const res = await apiFetch('/api/scheduling/availability?action=providers');
        if (res.ok) {
          const json = await res.json();
          const list = (json.providers || json || []).map((p: any) => ({
            id: p.id,
            name: `${p.firstName} ${p.lastName}`,
          }));
          setProviders(list);
        }
      } catch {
        // providers dropdown is best-effort
      }
    }
    loadProviders();
  }, []);

  const fetchReport = useCallback(async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        status: statusFilter,
      });
      if (providerId) params.set('providerId', providerId);

      const res = await apiFetch(`/api/admin/reports/telehealth-compensation?${params}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `Request failed (${res.status})`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, statusFilter, providerId]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  function exportCsv() {
    if (!data) return;
    const header = 'Date,Time,Provider,Patient,Status,Duration (min),Payout';
    const rows = data.appointments.map((a) => {
      const dt = new Date(a.startTime);
      return [
        dt.toLocaleDateString('en-US'),
        dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        `"${a.provider.name}"`,
        `"${a.patient.name}"`,
        a.status,
        a.duration,
        a.payoutFormatted,
      ].join(',');
    });

    const summaryRows = [
      '',
      'Provider Summary',
      'Provider,Completed,Scheduled,Total Payout',
      ...data.providerBreakdown.map(
        (p) => `"${p.name}",${p.completed},${p.scheduled},${p.totalFormatted}`
      ),
      '',
      `Total Completed,${data.summary.completedCount}`,
      `Total Payout,${data.summary.totalPayoutFormatted}`,
      `Rate per Appointment,$${(data.ratePerAppointmentCents / 100).toFixed(2)}`,
    ];

    const csv = [header, ...rows, ...summaryRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `telehealth-compensation-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const STATUS_BADGES: Record<string, string> = {
    COMPLETED: 'bg-green-100 text-green-700',
    SCHEDULED: 'bg-blue-100 text-blue-700',
    CONFIRMED: 'bg-blue-100 text-blue-700',
    IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
    CHECKED_IN: 'bg-purple-100 text-purple-700',
    CANCELLED: 'bg-red-100 text-red-700',
    NO_SHOW: 'bg-gray-100 text-gray-700',
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Video className="h-6 w-6 text-teal-600" />
                <h1 className="text-2xl font-bold text-gray-900">Telehealth Compensation Report</h1>
              </div>
              <p className="mt-1 text-sm text-gray-500">
                Track telehealth appointments and provider payouts at $35 per completed visit
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={exportCsv}
                disabled={!data || data.appointments.length === 0}
                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
              <button
                onClick={fetchReport}
                disabled={loading}
                className="rounded-lg border border-gray-300 bg-white p-2 hover:bg-gray-50"
              >
                <RefreshCw className={`h-5 w-5 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-end gap-4 rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
            <Filter className="h-4 w-4" />
            Filters
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="SCHEDULED">Scheduled Only</option>
              <option value="COMPLETED">Completed Only</option>
            </select>
          </div>
          {providers.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Provider</label>
              <select
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500"
              >
                <option value="">All Providers</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-600" />
            <span className="text-sm text-red-700">{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : data ? (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-blue-100 p-3">
                    <Calendar className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">
                      {data.summary.totalAppointments}
                    </p>
                    <p className="text-sm text-gray-500">Total Appointments</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-green-100 p-3">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">
                      {data.summary.completedCount}
                    </p>
                    <p className="text-sm text-gray-500">Completed</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-indigo-100 p-3">
                    <Clock className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">
                      {data.summary.scheduledCount}
                    </p>
                    <p className="text-sm text-gray-500">Scheduled</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-emerald-100 p-3">
                    <DollarSign className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-emerald-700">
                      {data.summary.totalPayoutFormatted}
                    </p>
                    <p className="text-sm text-gray-500">Total Payout</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Provider Breakdown */}
            {data.providerBreakdown.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white">
                <div className="border-b border-gray-200 p-4">
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                    <Users className="h-5 w-5 text-gray-500" />
                    Provider Breakdown
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                          Provider
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">
                          Completed
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">
                          Scheduled
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">
                          Payout
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.providerBreakdown.map((p) => (
                        <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{p.completed}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{p.scheduled}</td>
                          <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                            {p.totalFormatted}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {data.providerBreakdown.length > 1 && (
                      <tfoot>
                        <tr className="bg-gray-50 font-semibold">
                          <td className="px-4 py-3 text-gray-900">Total</td>
                          <td className="px-4 py-3 text-right text-gray-900">
                            {data.summary.completedCount}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-900">
                            {data.summary.scheduledCount}
                          </td>
                          <td className="px-4 py-3 text-right text-emerald-700">
                            {data.summary.totalPayoutFormatted}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )}

            {/* Appointments Table */}
            <div className="rounded-xl border border-gray-200 bg-white">
              <div className="border-b border-gray-200 p-4">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                  <Video className="h-5 w-5 text-gray-500" />
                  Appointment Details
                  <span className="ml-2 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                    {data.appointments.length}
                  </span>
                </h2>
              </div>
              {data.appointments.length === 0 ? (
                <div className="py-12 text-center">
                  <Video className="mx-auto mb-3 h-12 w-12 text-gray-300" />
                  <p className="text-gray-500">No telehealth appointments found for this period.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                          Date
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                          Time
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                          Provider
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                          Patient
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                          Status
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">
                          Duration
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">
                          Payout
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.appointments.map((appt) => {
                        const dt = new Date(appt.startTime);
                        return (
                          <tr key={appt.id} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                              {dt.toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                              {dt.toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                              {appt.provider.name}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                              {appt.patient.name}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGES[appt.status] || 'bg-gray-100 text-gray-600'}`}
                              >
                                {appt.status}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600">
                              {appt.duration} min
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold">
                              {appt.payoutCents > 0 ? (
                                <span className="text-emerald-600">{appt.payoutFormatted}</span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
