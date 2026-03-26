'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Award,
  TrendingDown,
  Users,
  Zap,
  Trophy,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Scale,
  Calendar,
  ArrowUpRight,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { apiFetch } from '@/lib/api/fetch';

type Period = '30d' | '90d' | '180d' | '365d' | 'all';
type SortMode = 'rate' | 'total';

interface PatientResult {
  patientId: number;
  firstName: string;
  lastName: string;
  startWeight: number;
  currentWeight: number;
  totalLost: number;
  durationDays: number;
  lbsPerMonth: number;
  firstLogDate: string;
  lastLogDate: string;
  logCount: number;
}

interface Summary {
  totalPatientsTracked: number;
  patientsWithLoss: number;
  avgLbsLost: number;
  avgLbsPerMonth: number;
  topLbsLost: number;
  totalLbsLost: number;
}

interface ResultsData {
  results: PatientResult[];
  summary: Summary;
}

const PERIOD_LABELS: Record<Period, string> = {
  '30d': 'Last 30 Days',
  '90d': 'Last 90 Days',
  '180d': 'Last 6 Months',
  '365d': 'Last Year',
  all: 'All Time',
};

const BAR_COLORS = [
  '#10b981', '#059669', '#047857', '#065f46', '#064e3b',
  '#34d399', '#6ee7b7', '#a7f3d0', '#d1fae5', '#ecfdf5',
  '#14b8a6', '#0d9488', '#0f766e', '#115e59', '#134e4a',
];

function formatDuration(days: number): string {
  if (days < 30) return `${days}d`;
  const months = Math.round(days / 30.44);
  if (months < 12) return `${months}mo`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem > 0 ? `${years}y ${rem}mo` : `${years}y`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function AdminResultsPage() {
  const [data, setData] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('90d');
  const [activeTab, setActiveTab] = useState<SortMode>('rate');

  const fetchResults = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/api/admin/weight-loss-results?period=${period}&sort=${activeTab}&limit=50`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json: ResultsData = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load results');
    } finally {
      setLoading(false);
    }
  }, [period, activeTab]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  const chartData = data
    ? [...data.results]
        .sort((a, b) => b.totalLost - a.totalLost)
        .slice(0, 15)
        .map((r) => ({
          name: `${r.firstName} ${r.lastName}`,
          totalLost: r.totalLost,
          patientId: r.patientId,
        }))
    : [];

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Award className="h-7 w-7 text-emerald-600" />
              Weight Loss Results
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Patient outcomes ranked by efficiency and total weight lost
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm focus:border-emerald-500 focus:ring-emerald-500"
            >
              {Object.entries(PERIOD_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <button
              onClick={fetchResults}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        {data && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <SummaryCard
              icon={<Users className="h-5 w-5 text-blue-600" />}
              label="Patients Tracked"
              value={data.summary.totalPatientsTracked}
              sub={`${data.summary.patientsWithLoss} with loss`}
              bg="bg-blue-50"
            />
            <SummaryCard
              icon={<Scale className="h-5 w-5 text-emerald-600" />}
              label="Total lbs Lost"
              value={`${data.summary.totalLbsLost.toLocaleString()} lbs`}
              sub={`across ${data.summary.patientsWithLoss} patients`}
              bg="bg-emerald-50"
            />
            <SummaryCard
              icon={<TrendingDown className="h-5 w-5 text-teal-600" />}
              label="Avg. Weight Lost"
              value={`${data.summary.avgLbsLost} lbs`}
              sub={`${data.summary.avgLbsPerMonth} lbs/mo avg`}
              bg="bg-teal-50"
            />
            <SummaryCard
              icon={<Zap className="h-5 w-5 text-amber-600" />}
              label="Best Rate"
              value={
                data.results.length > 0
                  ? `${Math.max(...data.results.map((r) => r.lbsPerMonth))} lbs/mo`
                  : '—'
              }
              sub={
                data.results.length > 0
                  ? (() => {
                      const best = data.results.reduce((a, b) =>
                        a.lbsPerMonth > b.lbsPerMonth ? a : b
                      );
                      return `${best.firstName} ${best.lastName}`;
                    })()
                  : ''
              }
              bg="bg-amber-50"
            />
            <SummaryCard
              icon={<Trophy className="h-5 w-5 text-purple-600" />}
              label="Most Lost"
              value={`${data.summary.topLbsLost} lbs`}
              sub={
                data.results.length > 0
                  ? (() => {
                      const sorted = [...data.results].sort(
                        (a, b) => b.totalLost - a.totalLost
                      );
                      return `${sorted[0].firstName} ${sorted[0].lastName}`;
                    })()
                  : ''
              }
              bg="bg-purple-50"
            />
          </div>
        )}

        {/* Loading / Error */}
        {loading && !data && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
            <span className="ml-3 text-gray-500">Loading results...</span>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {data && data.results.length === 0 && !loading && (
          <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
            <Scale className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No weight loss results yet</p>
            <p className="text-sm text-gray-400 mt-1">
              Patients need at least 2 weight logs over 7+ days to appear here
            </p>
          </div>
        )}

        {data && data.results.length > 0 && (
          <>
            {/* Tab Toggle */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              <div className="border-b border-gray-200">
                <div className="flex">
                  <button
                    onClick={() => setActiveTab('rate')}
                    className={`flex-1 py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'rate'
                        ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Zap className="h-4 w-4 inline mr-1.5 -mt-0.5" />
                    Efficiency Leaderboard (lbs/month)
                  </button>
                  <button
                    onClick={() => setActiveTab('total')}
                    className={`flex-1 py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'total'
                        ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Trophy className="h-4 w-4 inline mr-1.5 -mt-0.5" />
                    Total Weight Lost
                  </button>
                </div>
              </div>

              {/* Leaderboard Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="text-left py-3 px-4 font-semibold text-gray-600 w-12">
                        #
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-600">
                        Patient
                      </th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-600">
                        Start
                      </th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-600">
                        Current
                      </th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-600">
                        Lost
                      </th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-600">
                        Duration
                      </th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-600">
                        {activeTab === 'rate' ? 'lbs/mo' : 'Check-ins'}
                      </th>
                      <th className="py-3 px-4 font-semibold text-gray-600 w-36">
                        {activeTab === 'rate' ? 'Rate' : 'Progress'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.results.map((r, idx) => {
                      const maxValue =
                        activeTab === 'rate'
                          ? Math.max(...data.results.map((x) => x.lbsPerMonth))
                          : Math.max(...data.results.map((x) => x.totalLost));
                      const barValue =
                        activeTab === 'rate' ? r.lbsPerMonth : r.totalLost;
                      const barPct = maxValue > 0 ? (barValue / maxValue) * 100 : 0;

                      return (
                        <tr
                          key={r.patientId}
                          className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
                        >
                          <td className="py-3 px-4">
                            {idx < 3 ? (
                              <span
                                className={`inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold ${
                                  idx === 0
                                    ? 'bg-amber-100 text-amber-700'
                                    : idx === 1
                                      ? 'bg-gray-200 text-gray-600'
                                      : 'bg-orange-100 text-orange-600'
                                }`}
                              >
                                {idx + 1}
                              </span>
                            ) : (
                              <span className="text-gray-400 font-medium pl-1.5">
                                {idx + 1}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <a
                              href={`/admin/patients/${r.patientId}`}
                              className="font-medium text-gray-900 hover:text-emerald-700 hover:underline inline-flex items-center gap-1"
                            >
                              {r.firstName} {r.lastName}
                              <ArrowUpRight className="h-3 w-3 text-gray-400" />
                            </a>
                            <div className="text-xs text-gray-400 mt-0.5">
                              <Calendar className="h-3 w-3 inline mr-0.5 -mt-0.5" />
                              {formatDate(r.firstLogDate)} — {formatDate(r.lastLogDate)}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right text-gray-600">
                            {r.startWeight} lbs
                          </td>
                          <td className="py-3 px-4 text-right text-gray-600">
                            {r.currentWeight} lbs
                          </td>
                          <td className="py-3 px-4 text-right font-semibold text-emerald-700">
                            -{r.totalLost} lbs
                          </td>
                          <td className="py-3 px-4 text-right text-gray-500">
                            {formatDuration(r.durationDays)}
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-gray-700">
                            {activeTab === 'rate'
                              ? `${r.lbsPerMonth}`
                              : `${r.logCount}`}
                          </td>
                          <td className="py-3 px-4">
                            <div className="w-full bg-gray-100 rounded-full h-2.5">
                              <div
                                className="h-2.5 rounded-full bg-emerald-500 transition-all duration-500"
                                style={{ width: `${Math.max(barPct, 4)}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Total Loss Bar Chart */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">
                Most Weight Lost — Top 15
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                Patients ranked by total pounds lost ({PERIOD_LABELS[period]})
              </p>
              {chartData.length > 0 ? (
                <div style={{ width: '100%', height: Math.max(chartData.length * 44, 200) }}>
                  <ResponsiveContainer>
                    <BarChart
                      data={chartData}
                      layout="vertical"
                      margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis
                        type="number"
                        tickFormatter={(v: number) => `${v} lbs`}
                        fontSize={12}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={140}
                        tick={{ fontSize: 12 }}
                      />
                      <Tooltip
                        formatter={(value: number) => [`${value} lbs`, 'Total Lost']}
                        contentStyle={{
                          borderRadius: '8px',
                          border: '1px solid #e5e7eb',
                          fontSize: '13px',
                        }}
                      />
                      <Bar dataKey="totalLost" radius={[0, 4, 4, 0]} barSize={28}>
                        {chartData.map((_entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={BAR_COLORS[index % BAR_COLORS.length]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-gray-400 text-center py-8">No data to display</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
  bg,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub: string;
  bg: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2 ${bg}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            {label}
          </p>
          <p className="text-xl font-bold text-gray-900 truncate">{value}</p>
          {sub && (
            <p className="text-xs text-gray-400 truncate">{sub}</p>
          )}
        </div>
      </div>
    </div>
  );
}
