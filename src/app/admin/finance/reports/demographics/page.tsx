'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Users,
  UserPlus,
  Activity,
  Calendar,
  Loader2,
  Download,
  MapPin,
  BarChart3,
  PieChart,
  ArrowLeft,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  PieChart as RechartsPieChart,
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

const DATE_RANGES = [
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'this_quarter', label: 'This Quarter' },
  { id: 'this_semester', label: 'This Semester' },
  { id: 'this_year', label: 'This Year' },
];

const COLORS = ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#6366F1', '#EC4899'];

interface DemographicsSummary {
  totalPatients: number;
  newInPeriod: number;
  activePatients: number;
  averageAge: number;
  maleCount: number;
  femaleCount: number;
  otherCount: number;
  maleFemaleRatio: number;
  genderBreakdown: Array<{ value: string; count: number; percentage: number }>;
}

interface PatientsByStateEntry {
  state: string;
  count: number;
  percentage: number;
}

interface PatientsByAgeBucketEntry {
  bucket: string;
  count: number;
  percentage: number;
}

export default function DemographicsReportPage() {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('this_month');
  const [summary, setSummary] = useState<DemographicsSummary | null>(null);
  const [byState, setByState] = useState<PatientsByStateEntry[]>([]);
  const [byAgeBucket, setByAgeBucket] = useState<PatientsByAgeBucketEntry[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch(
        `/api/reports/patients?type=demographics&range=${dateRange}`
      );

      if (response.ok) {
        const data = await response.json();
        setSummary(data.summary || null);
        setByState(data.byState || []);
        setByAgeBucket(data.byAgeBucket || []);
      }
    } catch (error) {
      console.error('Failed to load demographics', error);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleExport = () => {
    const rows = [
      ['Demographics Report', `Period: ${dateRange}`, new Date().toISOString().slice(0, 10)],
      [],
      ['Summary', '', ''],
      ['Total Patients', summary?.totalPatients ?? 0, ''],
      ['New in Period', summary?.newInPeriod ?? 0, ''],
      ['Active Patients', summary?.activePatients ?? 0, ''],
      ['Average Age', summary?.averageAge ?? 0, ''],
      ['Male / Female Ratio', summary?.maleFemaleRatio ?? 0, ''],
      [],
      ['By State', 'Count', 'Percentage'],
      ...(byState.map((r) => [r.state, r.count, `${r.percentage}%`])),
      [],
      ['By Age Bucket', 'Count', 'Percentage'],
      ...(byAgeBucket.map((r) => [r.bucket, r.count, `${r.percentage}%`])),
      [],
      ['By Gender', 'Count', 'Percentage'],
      ...(summary?.genderBreakdown.map((r) => [r.value, r.count, `${r.percentage}%`]) ?? []),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `demographics-report-${dateRange}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const genderChartData = summary?.genderBreakdown ?? [];
  const stateChartData = byState.slice(0, 15);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/admin/finance/reports"
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Report Center
          </Link>
          <h2 className="text-2xl font-bold text-gray-900">Patient Demographics</h2>
          <p className="mt-1 text-sm text-gray-500">
            Geographic, age, and gender breakdown of your patient population
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
          >
            {DATE_RANGES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-50 p-2">
              <Users className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-900">
                {(summary?.totalPatients ?? 0).toLocaleString()}
              </h3>
              <p className="text-sm text-gray-500">Total Patients</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 p-2">
              <UserPlus className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-900">
                {(summary?.newInPeriod ?? 0).toLocaleString()}
              </h3>
              <p className="text-sm text-gray-500">New in Period</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-[var(--brand-primary-light)] p-2">
              <Activity className="h-5 w-5 text-[var(--brand-primary)]" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-900">
                {(summary?.activePatients ?? 0).toLocaleString()}
              </h3>
              <p className="text-sm text-gray-500">Active Patients</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-50 p-2">
              <Calendar className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-900">
                {summary?.averageAge ?? 0} yrs
              </h3>
              <p className="text-sm text-gray-500">Average Age</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-pink-50 p-2">
              <PieChart className="h-5 w-5 text-pink-600" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-900">
                {summary?.maleFemaleRatio ?? 0} : 1
              </h3>
              <p className="text-sm text-gray-500">M:F Ratio</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* By State */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
            <MapPin className="h-5 w-5 text-gray-500" />
            Patients by State
          </h3>
          {stateChartData.length === 0 ? (
            <div className="flex h-[280px] flex-col items-center justify-center text-gray-400">
              <BarChart3 className="mb-3 h-12 w-12" />
              <p>No state data for this period</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={stateChartData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis type="number" tick={{ fontSize: 12, fill: '#6B7280' }} />
                <YAxis
                  type="category"
                  dataKey="state"
                  width={40}
                  tick={{ fontSize: 12, fill: '#6B7280' }}
                />
                <Tooltip
                  formatter={((value: number, name: string, props: { payload: { percentage: number } }) => [
                    `${value} (${props.payload.percentage}%)`,
                    'Patients',
                  ]) as any}
                />
                <Bar dataKey="count" fill="#10B981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* By Gender */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
            <PieChart className="h-5 w-5 text-gray-500" />
            Gender Distribution
          </h3>
          {genderChartData.length === 0 ? (
            <div className="flex h-[280px] flex-col items-center justify-center text-gray-400">
              <PieChart className="mb-3 h-12 w-12" />
              <p>No gender data for this period</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <RechartsPieChart>
                <Pie
                  data={genderChartData}
                  dataKey="count"
                  nameKey="value"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  label={({ value, percent }: any) => `${value} (${((percent ?? 0) * 100).toFixed(1)}%)`}
                >
                  {genderChartData.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={((value: number, name: string, props: { payload: { percentage: number } }) => [
                    `${value} (${props.payload.percentage}%)`,
                    name,
                  ]) as any}
                />
              </RechartsPieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Age Buckets */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
          <BarChart3 className="h-5 w-5 text-gray-500" />
          Age Demographics
        </h3>
        {byAgeBucket.length === 0 ? (
          <div className="flex h-[280px] flex-col items-center justify-center text-gray-400">
            <Calendar className="mb-3 h-12 w-12" />
            <p>No age data for this period</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byAgeBucket}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis
                dataKey="bucket"
                tick={{ fontSize: 12, fill: '#6B7280' }}
              />
              <YAxis tick={{ fontSize: 12, fill: '#6B7280' }} />
              <Tooltip
                formatter={((value: number, name: string, props: { payload: { percentage: number } }) => [
                  `${value} (${props.payload.percentage}%)`,
                  'Patients',
                ]) as any}
              />
              <Bar dataKey="count" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
