'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Users,
  TrendingUp,
  TrendingDown,
  DollarSign,
  AlertTriangle,
  Loader2,
  Search,
  Filter,
  ChevronRight,
  ArrowUpRight,
  Clock,
  CreditCard,
  XCircle,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from 'recharts';
import { apiFetch } from '@/lib/api/fetch';

interface PatientMetrics {
  totalPatients: number;
  patientsWithPayments: number;
  averageLTV: number;
  medianLTV: number;
  totalLTV: number;
  activeSubscriptions: number;
  churnedLast30Days: number;
  churnRate: number;
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
  email: string;
  riskScore: number;
  riskFactors: string[];
  lastPaymentDate: string | null;
  subscriptionStatus: string | null;
  totalRevenue: number;
}

interface CohortData {
  cohort: string;
  size: number;
  retention: Record<number, number>;
  averageLTV: number;
}

interface PaymentBehavior {
  onTimePayments: number;
  latePayments: number;
  failedPayments: number;
  onTimePercentage: number;
  latePercentage: number;
  failedPercentage: number;
  averagePaymentDelay: number;
}

interface PatientData {
  metrics: PatientMetrics;
  segments: PatientSegment[];
  atRisk: AtRiskPatient[];
  cohorts: CohortData[];
  paymentBehavior: PaymentBehavior;
  retentionMatrix: {
    months: string[];
    data: Array<{ cohort: string; size: number; retention: number[] }>;
    averageRetention: number[];
  };
}

const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
};

const SEGMENT_COLORS = {
  VIP: '#8B5CF6',
  Regular: '#3B82F6',
  Occasional: '#10B981',
  New: '#6B7280',
};

export default function PatientFinancePage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PatientData | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'atRisk' | 'cohorts'>('overview');
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const token =
        localStorage.getItem('auth-token') ||
        localStorage.getItem('super_admin-token') ||
        localStorage.getItem('admin-token') ||
        localStorage.getItem('token');

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await apiFetch('/api/finance/patients', {
        credentials: 'include',
        headers,
      });

      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error('Failed to load patient data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  // Mock data for demonstration
  const mockData: PatientData = data || {
    metrics: {
      totalPatients: 1250,
      patientsWithPayments: 892,
      averageLTV: 45000,
      medianLTV: 32500,
      totalLTV: 40140000,
      activeSubscriptions: 450,
      churnedLast30Days: 23,
      churnRate: 4.8,
    },
    segments: [
      {
        segment: 'VIP',
        count: 125,
        totalRevenue: 18750000,
        averageLTV: 150000,
        percentageOfTotal: 10,
      },
      {
        segment: 'Regular',
        count: 375,
        totalRevenue: 15000000,
        averageLTV: 40000,
        percentageOfTotal: 30,
      },
      {
        segment: 'Occasional',
        count: 450,
        totalRevenue: 5400000,
        averageLTV: 12000,
        percentageOfTotal: 36,
      },
      { segment: 'New', count: 300, totalRevenue: 990000, averageLTV: 3300, percentageOfTotal: 24 },
    ],
    atRisk: [
      {
        patientId: 1,
        patientName: 'Sarah Johnson',
        email: 'sarah@example.com',
        riskScore: 85,
        riskFactors: ['No payment in 60+ days', 'Recent failed payment'],
        lastPaymentDate: '2024-01-15',
        subscriptionStatus: 'PAST_DUE',
        totalRevenue: 125000,
      },
      {
        patientId: 2,
        patientName: 'Michael Chen',
        email: 'michael@example.com',
        riskScore: 72,
        riskFactors: ['Subscription paused', 'No payment in 30+ days'],
        lastPaymentDate: '2024-02-01',
        subscriptionStatus: 'PAUSED',
        totalRevenue: 89000,
      },
      {
        patientId: 3,
        patientName: 'Emily Davis',
        email: 'emily@example.com',
        riskScore: 68,
        riskFactors: ['Multiple failed payments'],
        lastPaymentDate: '2024-01-28',
        subscriptionStatus: 'ACTIVE',
        totalRevenue: 67500,
      },
      {
        patientId: 4,
        patientName: 'David Wilson',
        email: 'david@example.com',
        riskScore: 55,
        riskFactors: ['No payment in 30+ days'],
        lastPaymentDate: '2024-02-05',
        subscriptionStatus: 'ACTIVE',
        totalRevenue: 45000,
      },
      {
        patientId: 5,
        patientName: 'Jessica Brown',
        email: 'jessica@example.com',
        riskScore: 52,
        riskFactors: ['Subscription canceled'],
        lastPaymentDate: '2024-01-20',
        subscriptionStatus: 'CANCELED',
        totalRevenue: 112000,
      },
    ],
    cohorts: [
      { cohort: '2024-01', size: 85, retention: { 0: 100, 1: 82, 2: 75 }, averageLTV: 28000 },
      { cohort: '2024-02', size: 92, retention: { 0: 100, 1: 85 }, averageLTV: 22000 },
      { cohort: '2024-03', size: 78, retention: { 0: 100 }, averageLTV: 15000 },
    ],
    paymentBehavior: {
      onTimePayments: 2450,
      latePayments: 280,
      failedPayments: 120,
      onTimePercentage: 86,
      latePercentage: 10,
      failedPercentage: 4,
      averagePaymentDelay: 3.2,
    },
    retentionMatrix: {
      months: ['2023-10', '2023-11', '2023-12', '2024-01', '2024-02', '2024-03'],
      data: [
        { cohort: '2023-10', size: 65, retention: [100, 88, 82, 78, 75, 72] },
        { cohort: '2023-11', size: 72, retention: [100, 85, 80, 76, 73, 0] },
        { cohort: '2023-12', size: 80, retention: [100, 87, 83, 79, 0, 0] },
        { cohort: '2024-01', size: 85, retention: [100, 82, 75, 0, 0, 0] },
        { cohort: '2024-02', size: 92, retention: [100, 85, 0, 0, 0, 0] },
        { cohort: '2024-03', size: 78, retention: [100, 0, 0, 0, 0, 0] },
      ],
      averageRetention: [100, 85, 80, 78, 74, 72],
    },
  };

  const displayData = mockData;

  const getRiskColor = (score: number) => {
    if (score >= 80) return 'text-red-600 bg-red-50';
    if (score >= 60) return 'text-orange-600 bg-orange-50';
    if (score >= 40) return 'text-yellow-600 bg-yellow-50';
    return 'text-green-600 bg-green-50';
  };

  const filteredAtRisk = displayData.atRisk.filter(
    (p) =>
      p.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Patient Payment Analytics</h2>
          <p className="mt-1 text-sm text-gray-500">
            LTV analysis, cohort retention, and at-risk patient identification
          </p>
        </div>
        <div className="flex rounded-lg border border-gray-200 bg-white p-1">
          {(['overview', 'atRisk', 'cohorts'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'atRisk' ? 'At Risk' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <>
          {/* Metrics Cards */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="w-fit rounded-lg bg-blue-50 p-2">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <h3 className="mt-4 text-2xl font-bold text-gray-900">
                {displayData.metrics.totalPatients.toLocaleString()}
              </h3>
              <p className="mt-1 text-sm text-gray-500">Total Patients</p>
              <p className="mt-1 text-xs text-gray-400">
                {displayData.metrics.patientsWithPayments} with payments
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="w-fit rounded-lg bg-emerald-50 p-2">
                <DollarSign className="h-5 w-5 text-emerald-600" />
              </div>
              <h3 className="mt-4 text-2xl font-bold text-gray-900">
                {formatCurrency(displayData.metrics.averageLTV)}
              </h3>
              <p className="mt-1 text-sm text-gray-500">Average LTV</p>
              <p className="mt-1 text-xs text-gray-400">
                Median: {formatCurrency(displayData.metrics.medianLTV)}
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="w-fit rounded-lg bg-emerald-50 p-2">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
              <h3 className="mt-4 text-2xl font-bold text-gray-900">
                {displayData.metrics.activeSubscriptions}
              </h3>
              <p className="mt-1 text-sm text-gray-500">Active Subscriptions</p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="rounded-lg bg-red-50 p-2">
                  <TrendingDown className="h-5 w-5 text-red-600" />
                </div>
                {displayData.metrics.churnRate > 5 && (
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                )}
              </div>
              <h3 className="mt-4 text-2xl font-bold text-gray-900">
                {displayData.metrics.churnRate.toFixed(1)}%
              </h3>
              <p className="mt-1 text-sm text-gray-500">Monthly Churn Rate</p>
              <p className="mt-1 text-xs text-gray-400">
                {displayData.metrics.churnedLast30Days} churned last 30 days
              </p>
            </div>
          </div>

          {/* Segments and Payment Behavior */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Patient Segments */}
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">Patient Segments</h3>
              <div className="space-y-4">
                {displayData.segments.map((segment) => (
                  <div key={segment.segment} className="flex items-center gap-4">
                    <div
                      className="h-12 w-3 rounded-full"
                      style={{
                        backgroundColor:
                          SEGMENT_COLORS[segment.segment as keyof typeof SEGMENT_COLORS] ||
                          '#6B7280',
                      }}
                    />
                    <div className="flex-1">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">{segment.segment}</span>
                        <span className="text-sm text-gray-500">{segment.count} patients</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">
                          Avg LTV: {formatCurrency(segment.averageLTV)}
                        </span>
                        <span className="font-medium text-gray-900">
                          {formatCurrency(segment.totalRevenue)}
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${segment.percentageOfTotal}%`,
                            backgroundColor:
                              SEGMENT_COLORS[segment.segment as keyof typeof SEGMENT_COLORS] ||
                              '#6B7280',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Payment Behavior */}
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">Payment Behavior</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={[
                    {
                      name: 'On Time',
                      value: displayData.paymentBehavior.onTimePayments,
                      fill: '#10B981',
                    },
                    {
                      name: 'Late',
                      value: displayData.paymentBehavior.latePayments,
                      fill: '#F59E0B',
                    },
                    {
                      name: 'Failed',
                      value: displayData.paymentBehavior.failedPayments,
                      fill: '#EF4444',
                    },
                  ]}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6B7280' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#6B7280' }} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB' }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {[{ fill: '#10B981' }, { fill: '#F59E0B' }, { fill: '#EF4444' }].map(
                      (entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      )
                    )}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 grid grid-cols-3 gap-4 border-t border-gray-100 pt-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">
                    {displayData.paymentBehavior.onTimePercentage}%
                  </p>
                  <p className="text-xs text-gray-500">On Time</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-amber-600">
                    {displayData.paymentBehavior.latePercentage}%
                  </p>
                  <p className="text-xs text-gray-500">Late</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600">
                    {displayData.paymentBehavior.failedPercentage}%
                  </p>
                  <p className="text-xs text-gray-500">Failed</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* At Risk Tab */}
      {activeTab === 'atRisk' && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">At-Risk Patients</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Patients showing signs of potential churn
                </p>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-gray-400" />
                <input
                  type="text"
                  placeholder="Search patients..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-lg border border-gray-200 py-2 pl-10 pr-4 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {filteredAtRisk.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="mx-auto mb-3 h-12 w-12 text-gray-300" />
                <p className="text-gray-500">No at-risk patients found</p>
              </div>
            ) : (
              filteredAtRisk.map((patient) => (
                <div key={patient.patientId} className="p-4 transition-colors hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div
                        className={`rounded-full px-3 py-1 text-sm font-medium ${getRiskColor(patient.riskScore)}`}
                      >
                        {patient.riskScore}
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-900">{patient.patientName}</h4>
                        <p className="text-sm text-gray-500">{patient.email}</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {patient.riskFactors.map((factor, index) => (
                            <span
                              key={index}
                              className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                            >
                              <AlertTriangle className="h-3 w-3" />
                              {factor}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">
                        {formatCurrency(patient.totalRevenue)}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">Total Revenue</p>
                      {patient.lastPaymentDate && (
                        <p className="mt-1 flex items-center justify-end gap-1 text-xs text-gray-400">
                          <Clock className="h-3 w-3" />
                          Last: {new Date(patient.lastPaymentDate).toLocaleDateString()}
                        </p>
                      )}
                      <Link
                        href={`/admin/patients?id=${patient.patientId}`}
                        className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700"
                      >
                        View profile
                        <ChevronRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Cohorts Tab */}
      {activeTab === 'cohorts' && (
        <>
          {/* Retention Heatmap */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Retention Matrix</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="pb-3 pr-4 font-medium text-gray-500">Cohort</th>
                    <th className="pb-3 pr-4 font-medium text-gray-500">Size</th>
                    {['M0', 'M1', 'M2', 'M3', 'M4', 'M5'].map((month) => (
                      <th
                        key={month}
                        className="w-16 pb-3 pr-4 text-center font-medium text-gray-500"
                      >
                        {month}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayData.retentionMatrix.data.map((row) => (
                    <tr key={row.cohort}>
                      <td className="py-2 pr-4 font-medium text-gray-900">{row.cohort}</td>
                      <td className="py-2 pr-4 text-gray-600">{row.size}</td>
                      {row.retention.map((value, index) => (
                        <td key={index} className="py-2 pr-4">
                          {value > 0 ? (
                            <div
                              className="flex h-8 w-16 items-center justify-center rounded text-xs font-medium"
                              style={{
                                backgroundColor: `rgba(16, 185, 129, ${value / 100})`,
                                color: value > 50 ? 'white' : '#374151',
                              }}
                            >
                              {value}%
                            </div>
                          ) : (
                            <div className="flex h-8 w-16 items-center justify-center rounded bg-gray-50 text-gray-300">
                              -
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-t border-gray-200">
                    <td className="py-3 pr-4 font-medium text-gray-900">Average</td>
                    <td className="py-3 pr-4">-</td>
                    {displayData.retentionMatrix.averageRetention.map((value, index) => (
                      <td key={index} className="py-3 pr-4">
                        <div className="flex h-8 w-16 items-center justify-center rounded bg-gray-100 text-xs font-bold text-gray-700">
                          {value}%
                        </div>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Cohort LTV Chart */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Cohort LTV Comparison</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={displayData.cohorts}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="cohort" tick={{ fontSize: 12, fill: '#6B7280' }} />
                <YAxis
                  tick={{ fontSize: 12, fill: '#6B7280' }}
                  tickFormatter={(value) => `$${(value / 100).toFixed(0)}`}
                />
                <Tooltip
                  formatter={(value) => formatCurrency(value as number)}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB' }}
                />
                <Legend />
                <Bar dataKey="averageLTV" name="Average LTV" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
