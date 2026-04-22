'use client';

import { useState, useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  Download,
  Search,
  ChevronDown,
  ChevronUp,
  Users,
  Pill,
  DollarSign,
  Hash,
  Calendar,
  Loader2,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { apiFetch } from '@/lib/api/fetch';
import type {
  Issue,
  PatientSummary,
  MedicationSummary,
  SummaryStats,
} from '@/lib/billing-analysis/types';

// ── Types for API response ──

interface ApiResponse {
  data: {
    summary: SummaryStats;
    issues: Issue[];
    patients: PatientSummary[];
    medications: MedicationSummary[];
  };
  meta: {
    fileName: string;
    parsedRows: number;
    parseErrors: number;
    columns: string[];
  };
}

// ── Constants ──

const SEVERITY_CONFIG = {
  error: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', badge: 'bg-red-100 text-red-700' },
  warning: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700' },
  info: { icon: Info, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700' },
} as const;

const CHART_COLORS = ['#4fa77e', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

const TABS = ['Summary', 'Issues', 'By Patient', 'By Medication'] as const;
type Tab = (typeof TABS)[number];

const PAGE_SIZE = 50;

// ── Main Page ──

export default function CsvAnalyzerPage() {
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('Summary');
  const [dragFileName, setDragFileName] = useState<string | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setDragFileName(file.name);
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await apiFetch('/api/super-admin/csv-billing-analyzer', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || 'Analysis failed');
        return;
      }

      setResult(json);
      setActiveTab('Summary');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'text/plain': ['.txt'] },
    maxFiles: 1,
    disabled: loading,
  });

  const handleReset = () => {
    setResult(null);
    setError(null);
    setDragFileName(null);
  };

  return (
    <div className="min-h-screen p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">CSV Billing Analyzer</h1>
          <p className="mt-1 text-sm text-gray-500">
            Upload a Lifefile pharmacy CSV to detect billing inaccuracies
          </p>
        </div>
        {result && (
          <button
            onClick={handleReset}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          >
            <Upload className="h-4 w-4" />
            New Analysis
          </button>
        )}
      </div>

      {!result && !loading && (
        <div
          {...getRootProps()}
          className={`mx-auto max-w-2xl cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition-all ${
            isDragActive
              ? 'border-[#4fa77e] bg-[#4fa77e]/5'
              : 'border-gray-300 bg-white hover:border-[#4fa77e]/50 hover:bg-gray-50'
          }`}
        >
          <input {...getInputProps()} />
          <FileSpreadsheet className={`mx-auto mb-4 h-16 w-16 ${isDragActive ? 'text-[#4fa77e]' : 'text-gray-300'}`} />
          <p className="text-lg font-medium text-gray-700">
            {isDragActive ? 'Drop CSV file here' : 'Drag & drop a CSV file, or click to browse'}
          </p>
          <p className="mt-2 text-sm text-gray-400">Supports .csv and .txt files up to 50 MB</p>
        </div>
      )}

      {loading && (
        <div className="mx-auto flex max-w-2xl flex-col items-center rounded-2xl bg-white p-12 shadow-sm">
          <Loader2 className="mb-4 h-12 w-12 animate-spin text-[#4fa77e]" />
          <p className="text-lg font-medium text-gray-700">Analyzing {dragFileName}...</p>
          <p className="mt-2 text-sm text-gray-400">Processing 11,000+ rows may take a moment</p>
        </div>
      )}

      {error && (
        <div className="mx-auto max-w-2xl rounded-xl border border-red-200 bg-red-50 p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
            <div>
              <p className="font-medium text-red-800">Analysis Error</p>
              <p className="mt-1 text-sm text-red-600">{error}</p>
              <button
                onClick={handleReset}
                className="mt-3 text-sm font-medium text-red-700 underline hover:text-red-900"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      )}

      {result && <AnalysisDashboard result={result} activeTab={activeTab} setActiveTab={setActiveTab} />}
    </div>
  );
}

// ── Dashboard Container ──

function AnalysisDashboard({
  result,
  activeTab,
  setActiveTab,
}: {
  result: ApiResponse;
  activeTab: Tab;
  setActiveTab: (t: Tab) => void;
}) {
  const { summary, issues, patients, medications } = result.data;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard icon={Hash} label="Total Rows" value={summary.totalRows.toLocaleString()} />
        <StatCard icon={Users} label="Patients" value={summary.uniquePatients.toLocaleString()} />
        <StatCard icon={Pill} label="Medications" value={summary.uniqueMedications.toLocaleString()} />
        <StatCard
          icon={DollarSign}
          label="Total Billed"
          value={`$${summary.totalBilled.toLocaleString()}`}
        />
        <StatCard icon={Calendar} label="Orders" value={summary.uniqueOrders.toLocaleString()} />
        <StatCard
          icon={AlertTriangle}
          label="Issues Found"
          value={summary.totalIssues.toLocaleString()}
          accent={summary.totalIssues > 0}
        />
      </div>

      {/* Severity Breakdown */}
      {summary.totalIssues > 0 && (
        <div className="flex gap-3">
          <SeverityBadge severity="error" count={summary.issuesByServerity.error} />
          <SeverityBadge severity="warning" count={summary.issuesByServerity.warning} />
          <SeverityBadge severity="info" count={summary.issuesByServerity.info} />
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'border-[#4fa77e] text-[#4fa77e]'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {tab}
              {tab === 'Issues' && summary.totalIssues > 0 && (
                <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                  {summary.totalIssues}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'Summary' && (
        <SummaryTab summary={summary} issues={issues} medications={medications} meta={result.meta} />
      )}
      {activeTab === 'Issues' && <IssuesTab issues={issues} />}
      {activeTab === 'By Patient' && <PatientsTab patients={patients} />}
      {activeTab === 'By Medication' && <MedicationsTab medications={medications} />}
    </div>
  );
}

// ── Stat Card ──

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Hash;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${accent ? 'text-red-500' : 'text-gray-400'}`} />
        <span className="text-xs font-medium text-gray-500">{label}</span>
      </div>
      <p className={`mt-2 text-xl font-bold ${accent ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

function SeverityBadge({ severity, count }: { severity: 'error' | 'warning' | 'info'; count: number }) {
  if (count === 0) return null;
  const cfg = SEVERITY_CONFIG[severity];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${cfg.badge}`}>
      <Icon className="h-3.5 w-3.5" />
      {count} {severity === 'error' ? 'Error' : severity === 'warning' ? 'Warning' : 'Info'}
      {count !== 1 ? 's' : ''}
    </span>
  );
}

// ── Summary Tab ──

function SummaryTab({
  summary,
  issues,
  medications,
  meta,
}: {
  summary: SummaryStats;
  issues: Issue[];
  medications: MedicationSummary[];
  meta: ApiResponse['meta'];
}) {
  const issuesByRule = useMemo(() => {
    const map = new Map<string, number>();
    for (const issue of issues) {
      map.set(issue.rule, (map.get(issue.rule) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name: name.length > 30 ? name.slice(0, 30) + '…' : name, fullName: name, value }))
      .sort((a, b) => b.value - a.value);
  }, [issues]);

  const medChartData = useMemo(
    () =>
      medications
        .filter((m) => m.totalBilled > 0)
        .slice(0, 8)
        .map((m) => ({
          name: m.drugName.length > 25 ? m.drugName.slice(0, 25) + '…' : m.drugName,
          billed: m.totalBilled,
          patients: m.uniquePatients,
        })),
    [medications]
  );

  return (
    <div className="space-y-6">
      {/* File Info */}
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">File Details</h3>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm md:grid-cols-4">
          <div>
            <span className="text-gray-400">File:</span>{' '}
            <span className="font-medium text-gray-700">{meta.fileName}</span>
          </div>
          <div>
            <span className="text-gray-400">Rows Parsed:</span>{' '}
            <span className="font-medium text-gray-700">{meta.parsedRows.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-gray-400">Columns:</span>{' '}
            <span className="font-medium text-gray-700">{meta.columns.length}</span>
          </div>
          <div>
            <span className="text-gray-400">Date Range:</span>{' '}
            <span className="font-medium text-gray-700">
              {summary.dateRangeStart || '—'} to {summary.dateRangeEnd || '—'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Issues by Rule Chart */}
        {issuesByRule.length > 0 && (
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-gray-700">Issues by Category</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={issuesByRule} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value) => [value, 'Issues']}
                  labelFormatter={(label) => {
                    const item = issuesByRule.find((i) => i.name === String(label));
                    return item?.fullName ?? String(label);
                  }}
                />
                <Bar dataKey="value" fill="#4fa77e" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Medication Billing Chart */}
        {medChartData.length > 0 && (
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-gray-700">Top Medications by Billing</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={medChartData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => `$${v.toLocaleString()}`} />
                <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => [`$${Number(value).toLocaleString()}`, 'Total Billed']} />
                <Bar dataKey="billed" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Severity Pie Chart */}
      {summary.totalIssues > 0 && (
        <div className="mx-auto max-w-md rounded-xl bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-center text-sm font-semibold text-gray-700">Issue Severity Breakdown</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={[
                  { name: 'Errors', value: summary.issuesByServerity.error },
                  { name: 'Warnings', value: summary.issuesByServerity.warning },
                  { name: 'Info', value: summary.issuesByServerity.info },
                ].filter((d) => d.value > 0)}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={90}
                paddingAngle={3}
                dataKey="value"
              >
                {[
                  { name: 'Errors', value: summary.issuesByServerity.error },
                  { name: 'Warnings', value: summary.issuesByServerity.warning },
                  { name: 'Info', value: summary.issuesByServerity.info },
                ]
                  .filter((d) => d.value > 0)
                  .map((_, i) => (
                    <Cell key={i} fill={['#ef4444', '#f59e0b', '#3b82f6'][i]} />
                  ))}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── Issues Tab ──

function IssuesTab({ issues }: { issues: Issue[] }) {
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [ruleFilter, setRuleFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<'severity' | 'rule' | 'patientName'>('severity');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);

  const uniqueRules = useMemo(() => [...new Set(issues.map((i) => i.rule))], [issues]);

  const severityOrder: Record<string, number> = { error: 0, warning: 1, info: 2 };

  const filtered = useMemo(() => {
    let list = [...issues];

    if (severityFilter !== 'all') {
      list = list.filter((i) => i.severity === severityFilter);
    }
    if (ruleFilter !== 'all') {
      list = list.filter((i) => i.rule === ruleFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          i.patientName.toLowerCase().includes(q) ||
          i.drugName.toLowerCase().includes(q) ||
          i.rxNumber.toLowerCase().includes(q) ||
          i.details.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'severity') {
        cmp = (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9);
      } else if (sortField === 'rule') {
        cmp = a.rule.localeCompare(b.rule);
      } else {
        cmp = a.patientName.localeCompare(b.patientName);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [issues, severityFilter, ruleFilter, search, sortField, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
    setPage(0);
  };

  const exportIssuesCsv = () => {
    const header = 'Severity,Rule,Patient,Drug,Rx Number,Row Numbers,Details';
    const rows = filtered.map(
      (i) =>
        `"${i.severity}","${i.rule}","${i.patientName}","${i.drugName}","${i.rxNumber}","${i.rowNumbers.join(';')}","${i.details.replace(/"/g, '""')}"`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'billing-issues-export.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return <ChevronDown className="h-3 w-3 text-gray-300" />;
    return sortDir === 'asc' ? (
      <ChevronUp className="h-3 w-3 text-[#4fa77e]" />
    ) : (
      <ChevronDown className="h-3 w-3 text-[#4fa77e]" />
    );
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 md:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search patient, drug, Rx number..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
          />
        </div>

        <select
          value={severityFilter}
          onChange={(e) => {
            setSeverityFilter(e.target.value);
            setPage(0);
          }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#4fa77e] focus:outline-none"
        >
          <option value="all">All Severities</option>
          <option value="error">Errors</option>
          <option value="warning">Warnings</option>
          <option value="info">Info</option>
        </select>

        <select
          value={ruleFilter}
          onChange={(e) => {
            setRuleFilter(e.target.value);
            setPage(0);
          }}
          className="max-w-[240px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#4fa77e] focus:outline-none"
        >
          <option value="all">All Rules</option>
          {uniqueRules.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <button
          onClick={exportIssuesCsv}
          className="ml-auto flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {/* Results count */}
      <p className="text-sm text-gray-500">
        Showing {paged.length} of {filtered.length} issues
      </p>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th
                onClick={() => handleSort('severity')}
                className="cursor-pointer px-4 py-3 text-left font-medium text-gray-600"
              >
                <span className="flex items-center gap-1">
                  Severity <SortIcon field="severity" />
                </span>
              </th>
              <th
                onClick={() => handleSort('rule')}
                className="cursor-pointer px-4 py-3 text-left font-medium text-gray-600"
              >
                <span className="flex items-center gap-1">
                  Rule <SortIcon field="rule" />
                </span>
              </th>
              <th
                onClick={() => handleSort('patientName')}
                className="cursor-pointer px-4 py-3 text-left font-medium text-gray-600"
              >
                <span className="flex items-center gap-1">
                  Patient <SortIcon field="patientName" />
                </span>
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Drug</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Rx #</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Rows</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Details</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((issue) => {
              const cfg = SEVERITY_CONFIG[issue.severity];
              const Icon = cfg.icon;
              return (
                <tr key={issue.id} className={`border-b border-gray-50 ${cfg.bg}`}>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 ${cfg.color}`}>
                      <Icon className="h-3.5 w-3.5" />
                      <span className="capitalize">{issue.severity}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">{issue.rule}</td>
                  <td className="px-4 py-3 text-gray-700">{issue.patientName || '—'}</td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-gray-700" title={issue.drugName}>
                    {issue.drugName || '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{issue.rxNumber || '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {issue.rowNumbers.slice(0, 5).join(', ')}
                    {issue.rowNumbers.length > 5 && `… +${issue.rowNumbers.length - 5}`}
                  </td>
                  <td className="max-w-[300px] px-4 py-3 text-gray-600">{issue.details}</td>
                </tr>
              );
            })}
            {paged.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                  <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-green-400" />
                  {issues.length === 0 ? 'No issues detected — data looks clean!' : 'No issues match your filters'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {page + 1} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Patients Tab ──

function PatientsTab({ patients }: { patients: PatientSummary[] }) {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<'issueCount' | 'totalBilled' | 'totalRows' | 'patientName'>('issueCount');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [page, setPage] = useState(0);
  const [expandedPatient, setExpandedPatient] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = [...patients];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.patientName.toLowerCase().includes(q) ||
          p.uniqueMedications.some((m) => m.toLowerCase().includes(q))
      );
    }
    list.sort((a, b) => {
      let cmp: number;
      if (sortField === 'patientName') {
        cmp = a.patientName.localeCompare(b.patientName);
      } else {
        cmp = (a[sortField] as number) - (b[sortField] as number);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [patients, search, sortField, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
    setPage(0);
  };

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return <ChevronDown className="h-3 w-3 text-gray-300" />;
    return sortDir === 'asc' ? (
      <ChevronUp className="h-3 w-3 text-[#4fa77e]" />
    ) : (
      <ChevronDown className="h-3 w-3 text-[#4fa77e]" />
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 md:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search patient or medication..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
          />
        </div>
        <p className="ml-auto text-sm text-gray-500">{filtered.length} patients</p>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="w-8 px-4 py-3" />
              <th
                onClick={() => handleSort('patientName')}
                className="cursor-pointer px-4 py-3 text-left font-medium text-gray-600"
              >
                <span className="flex items-center gap-1">
                  Patient <SortIcon field="patientName" />
                </span>
              </th>
              <th
                onClick={() => handleSort('totalRows')}
                className="cursor-pointer px-4 py-3 text-left font-medium text-gray-600"
              >
                <span className="flex items-center gap-1">
                  Rows <SortIcon field="totalRows" />
                </span>
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Medications</th>
              <th
                onClick={() => handleSort('totalBilled')}
                className="cursor-pointer px-4 py-3 text-left font-medium text-gray-600"
              >
                <span className="flex items-center gap-1">
                  Total Billed <SortIcon field="totalBilled" />
                </span>
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Orders</th>
              <th
                onClick={() => handleSort('issueCount')}
                className="cursor-pointer px-4 py-3 text-left font-medium text-gray-600"
              >
                <span className="flex items-center gap-1">
                  Issues <SortIcon field="issueCount" />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {paged.map((p) => {
              const isExpanded = expandedPatient === p.patientName;
              return (
                <tr key={p.patientName} className="border-b border-gray-50">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setExpandedPatient(isExpanded ? null : p.patientName)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{p.patientName}</td>
                  <td className="px-4 py-3 text-gray-700">{p.totalRows}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {isExpanded ? (
                      <ul className="space-y-1">
                        {p.uniqueMedications.map((m) => (
                          <li key={m} className="text-xs text-gray-600">
                            {m}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span>{p.uniqueMedications.length} medication{p.uniqueMedications.length !== 1 ? 's' : ''}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">${p.totalBilled.toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-600">{p.orders.length}</td>
                  <td className="px-4 py-3">
                    {p.issueCount > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        <AlertCircle className="h-3 w-3" />
                        {p.issueCount}
                      </span>
                    ) : (
                      <span className="text-green-600">
                        <CheckCircle2 className="h-4 w-4" />
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {page + 1} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Medications Tab ──

function MedicationsTab({ medications }: { medications: MedicationSummary[] }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return medications;
    const q = search.toLowerCase();
    return medications.filter((m) => m.drugName.toLowerCase().includes(q));
  }, [medications, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 md:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search medication..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
          />
        </div>
        <p className="ml-auto text-sm text-gray-500">{filtered.length} medications</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((med) => (
          <div
            key={med.drugName}
            className={`rounded-xl bg-white p-5 shadow-sm ${med.hasPriceVariance ? 'ring-2 ring-amber-300' : ''}`}
          >
            <h4 className="mb-3 text-sm font-semibold text-gray-900" title={med.drugName}>
              {med.drugName.length > 50 ? med.drugName.slice(0, 50) + '…' : med.drugName}
            </h4>
            {med.hasPriceVariance && (
              <div className="mb-3 flex items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                <AlertTriangle className="h-3 w-3" />
                Price variance detected
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-400">Total Rows</span>
                <p className="font-semibold text-gray-900">{med.totalRows.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-gray-400">Patients</span>
                <p className="font-semibold text-gray-900">{med.uniquePatients.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-gray-400">Qty Dispensed</span>
                <p className="font-semibold text-gray-900">{med.totalQuantityDispensed.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-gray-400">Total Billed</span>
                <p className="font-semibold text-gray-900">${med.totalBilled.toLocaleString()}</p>
              </div>
            </div>
            {med.uniquePrices.length > 0 && (
              <div className="mt-3 border-t border-gray-100 pt-3">
                <span className="text-xs font-medium text-gray-500">Price Distribution</span>
                <div className="mt-1 flex flex-wrap gap-2">
                  {med.uniquePrices.map((p) => (
                    <span
                      key={p.price}
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        med.hasPriceVariance ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      ${p.price} ({p.count}x)
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
