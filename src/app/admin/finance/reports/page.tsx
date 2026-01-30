'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  FileBarChart,
  Plus,
  Calendar,
  Download,
  Loader2,
  Clock,
  Play,
  Trash2,
  Edit2,
  Copy,
  MoreVertical,
  Filter,
  BarChart3,
  PieChart,
  LineChart,
  Table,
  Mail,
} from 'lucide-react';

interface SavedReport {
  id: number;
  name: string;
  description: string | null;
  type: string;
  isScheduled: boolean;
  schedule: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
}

const REPORT_TEMPLATES = [
  {
    id: 'revenue-summary',
    name: 'Revenue Summary',
    description: 'Monthly revenue breakdown with trends',
    type: 'REVENUE',
    icon: BarChart3,
  },
  {
    id: 'patient-ltv',
    name: 'Patient LTV Report',
    description: 'Lifetime value analysis by cohort',
    type: 'PATIENTS',
    icon: LineChart,
  },
  {
    id: 'payout-report',
    name: 'Payout Report',
    description: 'Bank deposits and fee breakdown',
    type: 'PAYOUTS',
    icon: Table,
  },
  {
    id: 'subscription-metrics',
    name: 'Subscription Metrics',
    description: 'MRR, churn, and retention analysis',
    type: 'SUBSCRIPTIONS',
    icon: PieChart,
  },
  {
    id: 'reconciliation-report',
    name: 'Reconciliation Report',
    description: 'Unmatched payments and match history',
    type: 'RECONCILIATION',
    icon: Table,
  },
];

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [activeTab, setActiveTab] = useState<'saved' | 'templates' | 'scheduled'>('saved');
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth-token') || 
                    localStorage.getItem('super_admin-token') ||
                    localStorage.getItem('token');

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch('/api/reports', {
        credentials: 'include',
        headers,
      });

      if (response.ok) {
        const data = await response.json();
        setSavedReports(data.reports || []);
      }
    } catch (error) {
      console.error('Failed to load reports:', error);
    } finally {
      setLoading(false);
    }
  };

  // Mock saved reports for demonstration
  const mockReports: SavedReport[] = savedReports.length ? savedReports : [
    {
      id: 1,
      name: 'Monthly Revenue Report',
      description: 'Comprehensive monthly revenue analysis',
      type: 'REVENUE',
      isScheduled: true,
      schedule: '0 9 1 * *',
      lastRunAt: '2024-03-01T09:00:00Z',
      nextRunAt: '2024-04-01T09:00:00Z',
      createdAt: '2024-01-15T10:00:00Z',
    },
    {
      id: 2,
      name: 'Weekly Churn Analysis',
      description: 'Track at-risk patients and churn trends',
      type: 'PATIENTS',
      isScheduled: true,
      schedule: '0 9 * * 1',
      lastRunAt: '2024-03-04T09:00:00Z',
      nextRunAt: '2024-03-11T09:00:00Z',
      createdAt: '2024-02-01T14:30:00Z',
    },
    {
      id: 3,
      name: 'Quarterly Payout Summary',
      description: 'Payout history and fee analysis',
      type: 'PAYOUTS',
      isScheduled: false,
      schedule: null,
      lastRunAt: '2024-02-15T11:00:00Z',
      nextRunAt: null,
      createdAt: '2024-01-20T09:00:00Z',
    },
  ];

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'REVENUE': return 'bg-emerald-100 text-emerald-700';
      case 'PATIENTS': return 'bg-blue-100 text-blue-700';
      case 'PAYOUTS': return 'bg-purple-100 text-purple-700';
      case 'SUBSCRIPTIONS': return 'bg-amber-100 text-amber-700';
      case 'RECONCILIATION': return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const scheduledReports = mockReports.filter(r => r.isScheduled);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Reports</h2>
          <p className="text-sm text-gray-500 mt-1">Create, schedule, and export financial reports</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/finance/reports/builder"
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            New Report
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-white rounded-lg border border-gray-200 p-1 w-fit">
        {(['saved', 'templates', 'scheduled'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab
                ? 'bg-emerald-100 text-emerald-700'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Saved Reports */}
      {activeTab === 'saved' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Saved Reports</h3>
          </div>
          
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
            </div>
          ) : mockReports.length === 0 ? (
            <div className="p-12 text-center">
              <FileBarChart className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No saved reports yet</p>
              <p className="text-sm text-gray-400 mt-1">Create your first report to get started</p>
              <Link
                href="/admin/finance/reports/builder"
                className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
              >
                <Plus className="h-4 w-4" />
                Create Report
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {mockReports.map((report) => (
                <div key={report.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <FileBarChart className="h-5 w-5 text-gray-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900">{report.name}</p>
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${getTypeColor(report.type)}`}>
                          {report.type}
                        </span>
                        {report.isScheduled && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-full">
                            <Clock className="h-3 w-3" />
                            Scheduled
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-1">{report.description}</p>
                      {report.lastRunAt && (
                        <p className="text-xs text-gray-400 mt-1">
                          Last run: {new Date(report.lastRunAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="p-2 hover:bg-gray-100 rounded" title="Run Now">
                      <Play className="h-4 w-4 text-gray-500" />
                    </button>
                    <button className="p-2 hover:bg-gray-100 rounded" title="Download">
                      <Download className="h-4 w-4 text-gray-500" />
                    </button>
                    <button className="p-2 hover:bg-gray-100 rounded" title="Edit">
                      <Edit2 className="h-4 w-4 text-gray-500" />
                    </button>
                    <button className="p-2 hover:bg-gray-100 rounded" title="More">
                      <MoreVertical className="h-4 w-4 text-gray-500" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Templates */}
      {activeTab === 'templates' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {REPORT_TEMPLATES.map((template) => {
            const Icon = template.icon;
            return (
              <div
                key={template.id}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <Icon className="h-5 w-5 text-gray-600" />
                  </div>
                  <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${getTypeColor(template.type)}`}>
                    {template.type}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mt-4">{template.name}</h3>
                <p className="text-sm text-gray-500 mt-2">{template.description}</p>
                <Link
                  href={`/admin/finance/reports/builder?template=${template.id}`}
                  className="inline-flex items-center gap-2 mt-4 text-sm font-medium text-emerald-600 hover:text-emerald-700"
                >
                  Use Template
                  <span className="text-lg">→</span>
                </Link>
              </div>
            );
          })}

          {/* Custom Report Card */}
          <Link
            href="/admin/finance/reports/builder"
            className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl border-2 border-dashed border-emerald-300 p-6 hover:border-emerald-400 transition-colors flex flex-col items-center justify-center text-center"
          >
            <div className="p-3 bg-white rounded-full shadow-sm">
              <Plus className="h-6 w-6 text-emerald-600" />
            </div>
            <h3 className="text-lg font-semibold text-emerald-900 mt-4">Custom Report</h3>
            <p className="text-sm text-emerald-700 mt-2">Build a report from scratch with custom metrics</p>
          </Link>
        </div>
      )}

      {/* Scheduled Reports */}
      {activeTab === 'scheduled' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Scheduled Reports</h3>
            <p className="text-sm text-gray-500 mt-1">Reports that run automatically</p>
          </div>
          
          {scheduledReports.length === 0 ? (
            <div className="p-12 text-center">
              <Clock className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No scheduled reports</p>
              <p className="text-sm text-gray-400 mt-1">Schedule a report to receive it automatically</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {scheduledReports.map((report) => (
                <div key={report.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-blue-50 rounded-lg">
                      <Mail className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{report.name}</p>
                      <p className="text-sm text-gray-500">{report.description}</p>
                      <div className="flex items-center gap-4 mt-2">
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {report.schedule === '0 9 1 * *' ? 'Monthly (1st)' :
                           report.schedule === '0 9 * * 1' ? 'Weekly (Mon)' :
                           report.schedule}
                        </span>
                        {report.nextRunAt && (
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Next: {new Date(report.nextRunAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200">
                      Edit Schedule
                    </button>
                    <button className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded hover:bg-red-100">
                      Disable
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
