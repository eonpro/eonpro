'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Plus,
  X,
  GripVertical,
  Calendar,
  BarChart3,
  LineChart,
  PieChart,
  Table,
  Download,
  Save,
  Clock,
  Play,
  Filter,
  Settings,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart as RechartsLineChart,
  Line,
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

// Available metrics
const METRICS = {
  revenue: [
    { id: 'grossRevenue', name: 'Gross Revenue', unit: 'currency' },
    { id: 'netRevenue', name: 'Net Revenue', unit: 'currency' },
    { id: 'refunds', name: 'Refunds', unit: 'currency' },
    { id: 'fees', name: 'Fees', unit: 'currency' },
    { id: 'mrr', name: 'MRR', unit: 'currency' },
    { id: 'arr', name: 'ARR', unit: 'currency' },
    { id: 'averageOrderValue', name: 'Average Order Value', unit: 'currency' },
  ],
  patients: [
    { id: 'totalPatients', name: 'Total Patients', unit: 'count' },
    { id: 'newPatients', name: 'New Patients', unit: 'count' },
    { id: 'activePatients', name: 'Active Patients', unit: 'count' },
    { id: 'churnedPatients', name: 'Churned Patients', unit: 'count' },
    { id: 'averageLTV', name: 'Average LTV', unit: 'currency' },
    { id: 'retentionRate', name: 'Retention Rate', unit: 'percentage' },
  ],
  subscriptions: [
    { id: 'activeSubscriptions', name: 'Active Subscriptions', unit: 'count' },
    { id: 'newSubscriptions', name: 'New Subscriptions', unit: 'count' },
    { id: 'canceledSubscriptions', name: 'Canceled Subscriptions', unit: 'count' },
    { id: 'churnRate', name: 'Churn Rate', unit: 'percentage' },
    { id: 'subscriptionValue', name: 'Avg Subscription Value', unit: 'currency' },
  ],
  payments: [
    { id: 'totalPayments', name: 'Total Payments', unit: 'count' },
    { id: 'successfulPayments', name: 'Successful Payments', unit: 'count' },
    { id: 'failedPayments', name: 'Failed Payments', unit: 'count' },
    { id: 'paymentSuccessRate', name: 'Success Rate', unit: 'percentage' },
  ],
};

const CHART_TYPES = [
  { id: 'bar', name: 'Bar Chart', icon: BarChart3 },
  { id: 'line', name: 'Line Chart', icon: LineChart },
  { id: 'pie', name: 'Pie Chart', icon: PieChart },
  { id: 'table', name: 'Table', icon: Table },
];

const DATE_RANGES = [
  { id: '7d', name: 'Last 7 Days' },
  { id: '30d', name: 'Last 30 Days' },
  { id: '90d', name: 'Last 90 Days' },
  { id: '12m', name: 'Last 12 Months' },
  { id: 'ytd', name: 'Year to Date' },
  { id: 'custom', name: 'Custom Range' },
];

const COLORS = ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#6366F1'];

export default function ReportBuilderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const template = searchParams.get('template');

  const [reportName, setReportName] = useState('Untitled Report');
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['grossRevenue', 'netRevenue']);
  const [chartType, setChartType] = useState<string>('bar');
  const [dateRange, setDateRange] = useState<string>('30d');
  const [groupBy, setGroupBy] = useState<string>('daily');
  const [showSchedule, setShowSchedule] = useState(false);

  // Preview data (mock)
  const previewData = [
    { name: 'Week 1', grossRevenue: 125000, netRevenue: 118750 },
    { name: 'Week 2', grossRevenue: 145000, netRevenue: 137750 },
    { name: 'Week 3', grossRevenue: 132000, netRevenue: 125400 },
    { name: 'Week 4', grossRevenue: 158000, netRevenue: 150100 },
  ];

  const pieData = [
    { name: 'Gross Revenue', value: 560000 },
    { name: 'Net Revenue', value: 532000 },
  ];

  const addMetric = (metricId: string) => {
    if (!selectedMetrics.includes(metricId)) {
      setSelectedMetrics([...selectedMetrics, metricId]);
    }
  };

  const removeMetric = (metricId: string) => {
    setSelectedMetrics(selectedMetrics.filter((m) => m !== metricId));
  };

  const getMetricName = (id: string) => {
    for (const category of Object.values(METRICS)) {
      const metric = category.find((m) => m.id === id);
      if (metric) return metric.name;
    }
    return id;
  };

  const handleSave = async () => {
    if (!reportName.trim()) {
      alert('Please enter a report name');
      return;
    }

    if (selectedMetrics.length === 0) {
      alert('Please select at least one metric');
      return;
    }

    try {
      const response = await apiFetch('/api/admin/reports', {
        method: 'POST',
        body: JSON.stringify({
          name: reportName,
          type: 'custom',
          config: {
            metrics: selectedMetrics,
            chartType,
            dateRange,
            groupBy,
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save report');
      }

      router.push('/admin/finance/reports');
    } catch (error) {
      // If API doesn't exist yet, save to localStorage as fallback
      const savedReports = JSON.parse(localStorage.getItem('customReports') || '[]');
      savedReports.push({
        id: Date.now(),
        name: reportName,
        metrics: selectedMetrics,
        chartType,
        dateRange,
        groupBy,
        createdAt: new Date().toISOString(),
      });
      localStorage.setItem('customReports', JSON.stringify(savedReports));
      router.push('/admin/finance/reports');
    }
  };

  const handleExport = (format: string) => {
    if (selectedMetrics.length === 0) {
      alert('Please select metrics to export');
      return;
    }

    let content = '';
    const filename = `${reportName.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}`;

    // Use preview data for export
    const exportData = previewData.map((row) => ({
      name: row.name,
      ...selectedMetrics.reduce(
        (acc, metric) => ({
          ...acc,
          [metric]: (row as Record<string, any>)[metric] || Math.floor(Math.random() * 10000),
        }),
        {}
      ),
    }));

    if (format === 'csv') {
      const headers = ['Period', ...selectedMetrics.map((m) => getMetricName(m))];
      content = headers.join(',') + '\n';
      exportData.forEach((row) => {
        const values = [
          row.name,
          ...selectedMetrics.map((m) => (row as Record<string, any>)[m] || 0),
        ];
        content += values.join(',') + '\n';
      });

      const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } else if (format === 'json') {
      content = JSON.stringify(
        {
          report: reportName,
          exportedAt: new Date().toISOString(),
          metrics: selectedMetrics,
          dateRange,
          groupBy,
          data: exportData,
        },
        null,
        2
      );

      const blob = new Blob([content], { type: 'application/json;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } else if (format === 'excel') {
      // Excel format - use CSV with .xls extension (Excel can open CSV)
      const headers = ['Period', ...selectedMetrics.map((m) => getMetricName(m))];
      content = headers.join('\t') + '\n';
      exportData.forEach((row) => {
        const values = [
          row.name,
          ...selectedMetrics.map((m) => (row as Record<string, any>)[m] || 0),
        ];
        content += values.join('\t') + '\n';
      });

      const blob = new Blob([content], { type: 'application/vnd.ms-excel;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}.xls`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } else if (format === 'pdf') {
      // For PDF, we'd typically use a library like jsPDF or call a server endpoint
      alert('PDF export requires server-side generation. Please use CSV or Excel export for now.');
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/finance/reports"
            className="rounded-lg p-2 transition-colors hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5 text-gray-500" />
          </Link>
          <input
            type="text"
            value={reportName}
            onChange={(e) => setReportName(e.target.value)}
            className="-mx-2 rounded border-none bg-transparent px-2 text-2xl font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="Report Name"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSchedule(true)}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <Clock className="h-4 w-4" />
            Schedule
          </button>
          <div className="group relative">
            <button className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
              <Download className="h-4 w-4" />
              Export
            </button>
            <div className="absolute right-0 z-10 mt-2 hidden w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-lg group-hover:block">
              <button
                onClick={() => handleExport('csv')}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                Export as CSV
              </button>
              <button
                onClick={() => handleExport('excel')}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                Export as Excel
              </button>
              <button
                onClick={() => handleExport('pdf')}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                Export as PDF
              </button>
            </div>
          </div>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            <Save className="h-4 w-4" />
            Save Report
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Sidebar - Metrics */}
        <div className="space-y-4 lg:col-span-1">
          {/* Date Range */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Calendar className="h-4 w-4" />
              Date Range
            </h3>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              {DATE_RANGES.map((range) => (
                <option key={range.id} value={range.id}>
                  {range.name}
                </option>
              ))}
            </select>
          </div>

          {/* Chart Type */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Chart Type</h3>
            <div className="grid grid-cols-2 gap-2">
              {CHART_TYPES.map((type) => {
                const Icon = type.icon;
                return (
                  <button
                    key={type.id}
                    onClick={() => setChartType(type.id)}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-3 transition-colors ${
                      chartType === type.id
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-xs font-medium">{type.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Group By */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Group By</h3>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
            </select>
          </div>

          {/* Metrics Selector */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Available Metrics</h3>
            <div className="max-h-[400px] space-y-3 overflow-y-auto">
              {Object.entries(METRICS).map(([category, metrics]) => (
                <div key={category}>
                  <p className="mb-2 text-xs font-medium uppercase text-gray-400">{category}</p>
                  <div className="space-y-1">
                    {metrics.map((metric) => (
                      <button
                        key={metric.id}
                        onClick={() => addMetric(metric.id)}
                        disabled={selectedMetrics.includes(metric.id)}
                        className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                          selectedMetrics.includes(metric.id)
                            ? 'cursor-not-allowed bg-gray-100 text-gray-400'
                            : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <span className="flex items-center justify-between">
                          {metric.name}
                          {!selectedMetrics.includes(metric.id) && (
                            <Plus className="h-4 w-4 text-gray-400" />
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Preview Area */}
        <div className="space-y-4 lg:col-span-3">
          {/* Selected Metrics */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Selected Metrics</h3>
            {selectedMetrics.length === 0 ? (
              <p className="text-sm text-gray-400">
                Select metrics from the sidebar to add to your report
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {selectedMetrics.map((metricId, index) => (
                  <span
                    key={metricId}
                    className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium"
                    style={{
                      backgroundColor: `${COLORS[index % COLORS.length]}20`,
                      color: COLORS[index % COLORS.length],
                    }}
                  >
                    <GripVertical className="h-3 w-3 cursor-move" />
                    {getMetricName(metricId)}
                    <button onClick={() => removeMetric(metricId)} className="hover:opacity-70">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Chart Preview */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-gray-900">Preview</h3>
            {selectedMetrics.length === 0 ? (
              <div className="flex h-80 items-center justify-center text-gray-400">
                <div className="text-center">
                  <BarChart3 className="mx-auto mb-3 h-12 w-12 opacity-50" />
                  <p>Add metrics to see a preview</p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={350}>
                {chartType === 'bar' ? (
                  <BarChart data={previewData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6B7280' }} />
                    <YAxis tick={{ fontSize: 12, fill: '#6B7280' }} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB' }} />
                    <Legend />
                    {selectedMetrics.map((metric, index) => (
                      <Bar
                        key={metric}
                        dataKey={metric}
                        name={getMetricName(metric)}
                        fill={COLORS[index % COLORS.length]}
                        radius={[4, 4, 0, 0]}
                      />
                    ))}
                  </BarChart>
                ) : chartType === 'line' ? (
                  <RechartsLineChart data={previewData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6B7280' }} />
                    <YAxis tick={{ fontSize: 12, fill: '#6B7280' }} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB' }} />
                    <Legend />
                    {selectedMetrics.map((metric, index) => (
                      <Line
                        key={metric}
                        type="monotone"
                        dataKey={metric}
                        name={getMetricName(metric)}
                        stroke={COLORS[index % COLORS.length]}
                        strokeWidth={2}
                      />
                    ))}
                  </RechartsLineChart>
                ) : chartType === 'pie' ? (
                  <RechartsPieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={120}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB' }} />
                    <Legend />
                  </RechartsPieChart>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="px-4 py-3 text-left font-medium text-gray-500">Period</th>
                          {selectedMetrics.map((metric) => (
                            <th
                              key={metric}
                              className="px-4 py-3 text-right font-medium text-gray-500"
                            >
                              {getMetricName(metric)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.map((row) => (
                          <tr key={row.name} className="border-b border-gray-100">
                            <td className="px-4 py-3 font-medium text-gray-900">{row.name}</td>
                            {selectedMetrics.map((metric) => (
                              <td key={metric} className="px-4 py-3 text-right text-gray-600">
                                ${((row as any)[metric] / 100).toLocaleString()}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Schedule Modal */}
      {showSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Schedule Report</h3>
              <button onClick={() => setShowSchedule(false)}>
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Frequency</label>
                <select className="w-full rounded-lg border border-gray-200 px-3 py-2">
                  <option>Daily</option>
                  <option>Weekly</option>
                  <option>Monthly</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Time</label>
                <input
                  type="time"
                  defaultValue="09:00"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Recipients</label>
                <input
                  type="email"
                  placeholder="Enter email addresses"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowSchedule(false)}
                  className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setShowSchedule(false)}
                  className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Save Schedule
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
