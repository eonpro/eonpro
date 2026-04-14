'use client';

import { instantToCalendarDate } from '@/lib/utils/platform-calendar';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Plus,
  X,
  Calendar,
  BarChart3,
  LineChart,
  PieChart,
  Table,
  Download,
  Save,
  Play,
  Filter,
  Settings,
  ChevronDown,
  Columns3,
  GripVertical,
  Clock,
  Mail,
  Loader2,
  Check,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart as RechartsLine,
  Line,
  PieChart as RechartsPie,
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

interface ColumnDef {
  id: string;
  label: string;
  type: string;
  sortable?: boolean;
  filterable?: boolean;
  groupable?: boolean;
}
interface FilterDef {
  field: string;
  label: string;
  type: string;
  options?: { value: string; label: string }[];
}
interface GroupByOption {
  id: string;
  label: string;
}
interface DataSourceDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  columns: ColumnDef[];
  filters: FilterDef[];
  groupByOptions: GroupByOption[];
}
interface ReportRow {
  [key: string]: any;
}

const CHART_TYPES = [
  { id: 'table', name: 'Table', icon: Table },
  { id: 'bar', name: 'Bar Chart', icon: BarChart3 },
  { id: 'line', name: 'Line Chart', icon: LineChart },
  { id: 'pie', name: 'Pie Chart', icon: PieChart },
];

const DATE_PRESETS = [
  { value: '', label: 'All Time' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '90d', label: 'Last 90 Days' },
  { value: 'ytd', label: 'Year to Date' },
  { value: 'custom', label: 'Custom Range' },
];

const COLORS = [
  '#10B981',
  '#3B82F6',
  '#8B5CF6',
  '#F59E0B',
  '#EF4444',
  '#6366F1',
  '#06B6D4',
  '#EC4899',
];

function $(c: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(c / 100);
}

function fmtVal(val: any, type: string): string {
  if (val === null || val === undefined) return '—';
  if (type === 'currency') return $(Number(val));
  if (type === 'percent') return `${Number(val).toFixed(1)}%`;
  if (type === 'date') return typeof val === 'string' ? new Date(val).toLocaleDateString() : '—';
  if (type === 'boolean') return val ? 'Yes' : 'No';
  if (type === 'number') return Number(val).toLocaleString();
  return String(val);
}

function presetToDateRange(preset: string): { startDate: string; endDate: string } | undefined {
  if (!preset) return undefined;
  const now = new Date();
  const fmt = (d: Date) => instantToCalendarDate(d);
  const end = fmt(now);
  if (preset === '7d') return { startDate: fmt(new Date(Date.now() - 7 * 86400000)), endDate: end };
  if (preset === '30d')
    return { startDate: fmt(new Date(Date.now() - 30 * 86400000)), endDate: end };
  if (preset === '90d')
    return { startDate: fmt(new Date(Date.now() - 90 * 86400000)), endDate: end };
  if (preset === 'ytd') return { startDate: `${now.getFullYear()}-01-01`, endDate: end };
  return undefined;
}

export default function ReportBuilderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams.get('templateId');

  const [dataSources, setDataSources] = useState<DataSourceDef[]>([]);
  const [selectedSource, setSelectedSource] = useState('');
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [chartType, setChartType] = useState('table');
  const [groupBy, setGroupBy] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [datePreset, setDatePreset] = useState('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [activeFilters, setActiveFilters] = useState<
    { field: string; operator: string; value: any }[]
  >([]);
  const [reportName, setReportName] = useState('Untitled Report');
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [totalRows, setTotalRows] = useState(0);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
    apiFetch('/api/reports/sources').then(async (res) => {
      if (res.ok) {
        const json = await res.json();
        setDataSources(json.sources || []);
      }
    });
  }, []);

  useEffect(() => {
    if (templateId) {
      apiFetch(`/api/reports/templates/${templateId}`).then(async (res) => {
        if (res.ok) {
          const { template } = await res.json();
          setReportName(template.name);
          setSelectedSource(template.dataSource);
          const cfg = template.config as any;
          if (cfg.columns) setSelectedColumns(cfg.columns);
          if (cfg.groupBy) setGroupBy(cfg.groupBy);
          if (cfg.chartType) setChartType(cfg.chartType);
          if (cfg.sortBy) setSortBy(cfg.sortBy);
          if (cfg.sortDir) setSortDir(cfg.sortDir);
          if (cfg.filters) setActiveFilters(cfg.filters);
          if (cfg.datePreset) setDatePreset(cfg.datePreset);
        }
      });
    }
  }, [templateId]);

  const currentSource = useMemo(
    () => dataSources.find((ds) => ds.id === selectedSource),
    [dataSources, selectedSource]
  );

  useEffect(() => {
    if (currentSource && selectedColumns.length === 0) {
      setSelectedColumns(currentSource.columns.slice(0, 6).map((c) => c.id));
    }
  }, [currentSource]);

  const handleRun = useCallback(async () => {
    if (!selectedSource) return;
    setRunning(true);
    setError('');
    try {
      const dateRange =
        datePreset === 'custom' && customStart && customEnd
          ? { startDate: customStart, endDate: customEnd }
          : presetToDateRange(datePreset);

      const res = await apiFetch('/api/reports/run', {
        method: 'POST',
        body: JSON.stringify({
          dataSource: selectedSource,
          columns: selectedColumns,
          filters: activeFilters,
          groupBy: groupBy || undefined,
          sortBy: sortBy || undefined,
          sortDir,
          dateRange,
          limit: 1000,
        }),
      });

      if (res.ok) {
        const result = await res.json();
        setRows(result.rows || []);
        setSummary(result.summary || {});
        setTotalRows(result.meta?.totalRows || 0);
        setHasRun(true);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || 'Failed to run report');
      }
    } catch {
      setError('Failed to run report');
    } finally {
      setRunning(false);
    }
  }, [
    selectedSource,
    selectedColumns,
    activeFilters,
    groupBy,
    sortBy,
    sortDir,
    datePreset,
    customStart,
    customEnd,
  ]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const config = {
        columns: selectedColumns,
        groupBy,
        sortBy,
        sortDir,
        chartType,
        filters: activeFilters,
        datePreset,
      };
      const method = templateId ? 'PATCH' : 'POST';
      const url = templateId ? `/api/reports/templates/${templateId}` : '/api/reports/templates';
      const res = await apiFetch(url, {
        method,
        body: JSON.stringify({
          name: reportName,
          dataSource: selectedSource,
          config,
          isShared: false,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (!templateId && json.template?.id) {
          router.push(`/admin/finance/reports/builder?templateId=${json.template.id}`);
        }
        alert('Report saved!');
      } else {
        alert('Failed to save');
      }
    } catch {
      alert('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async (format: 'csv' | 'pdf' | 'xlsx') => {
    setExporting(true);
    try {
      const dateRange =
        datePreset === 'custom' && customStart && customEnd
          ? { startDate: customStart, endDate: customEnd }
          : presetToDateRange(datePreset);

      const res = await apiFetch('/api/reports/export', {
        method: 'POST',
        body: JSON.stringify({
          dataSource: selectedSource,
          columns: selectedColumns,
          filters: activeFilters,
          groupBy: groupBy || undefined,
          sortBy: sortBy || undefined,
          sortDir,
          dateRange,
          limit: 5000,
          format,
          reportName,
        }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${reportName.replace(/\s/g, '-')}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      alert('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const toggleColumn = (colId: string) => {
    setSelectedColumns((prev) =>
      prev.includes(colId) ? prev.filter((c) => c !== colId) : [...prev, colId]
    );
  };

  const visibleCols = useMemo(() => {
    if (!currentSource) return [];
    return currentSource.columns.filter((c) => selectedColumns.includes(c.id));
  }, [currentSource, selectedColumns]);

  const chartData = useMemo(() => {
    if (!hasRun || rows.length === 0) return [];
    return rows.slice(0, 20).map((row) => {
      const entry: any = {};
      for (const col of visibleCols) {
        entry[col.label] = col.type === 'currency' ? (row[col.id] || 0) / 100 : row[col.id];
      }
      const firstStringCol = visibleCols.find((c) => c.type === 'string');
      entry.name = firstStringCol ? row[firstStringCol.id] : `Row`;
      return entry;
    });
  }, [rows, visibleCols, hasRun]);

  const numericCols = visibleCols.filter(
    (c) => c.type === 'currency' || c.type === 'number' || c.type === 'percent'
  );

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      {/* Top Bar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <a
            href="/admin/reports"
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <ArrowLeft className="h-5 w-5" />
          </a>
          <input
            type="text"
            value={reportName}
            onChange={(e) => setReportName(e.target.value)}
            className="border-0 bg-transparent text-lg font-semibold text-gray-900 focus:outline-none focus:ring-0"
            placeholder="Report name..."
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRun}
            disabled={!selectedSource || running}
            className="flex items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[#3d8a66] disabled:opacity-50"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? 'Running...' : 'Run Report'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !selectedSource}
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{' '}
            Save
          </button>
          <div className="relative">
            <button
              onClick={() => handleExport('csv')}
              disabled={!hasRun || exporting}
              className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> Export
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar — Config */}
        <div className="w-72 flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50 p-4">
          {/* Data Source */}
          <div className="mb-5">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500">
              Data Source
            </label>
            <select
              value={selectedSource}
              onChange={(e) => {
                setSelectedSource(e.target.value);
                setSelectedColumns([]);
                setGroupBy('');
                setRows([]);
                setHasRun(false);
              }}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">Select data source...</option>
              {dataSources.map((ds) => (
                <option key={ds.id} value={ds.id}>
                  {ds.name}
                </option>
              ))}
            </select>
          </div>

          {currentSource && (
            <>
              {/* Date Range */}
              <div className="mb-5">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Date Range
                </label>
                <select
                  value={datePreset}
                  onChange={(e) => setDatePreset(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                >
                  {DATE_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
                {datePreset === 'custom' && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="rounded border border-gray-200 px-2 py-1.5 text-xs"
                    />
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="rounded border border-gray-200 px-2 py-1.5 text-xs"
                    />
                  </div>
                )}
              </div>

              {/* Columns */}
              <div className="mb-5">
                <label className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <Columns3 className="h-3 w-3" /> Columns ({selectedColumns.length})
                </label>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white">
                  {currentSource.columns.map((col) => (
                    <label
                      key={col.id}
                      className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedColumns.includes(col.id)}
                        onChange={() => toggleColumn(col.id)}
                        className="rounded text-[var(--brand-primary)]"
                      />
                      <span className="flex-1 text-gray-700">{col.label}</span>
                      <span className="text-[10px] text-gray-400">{col.type}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Group By */}
              <div className="mb-5">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Group By
                </label>
                <select
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">No grouping (raw data)</option>
                  {currentSource.groupByOptions.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sort */}
              <div className="mb-5">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Sort By
                </label>
                <div className="flex gap-2">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">Default</option>
                    {currentSource.columns
                      .filter((c) => c.sortable)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                  </select>
                  <select
                    value={sortDir}
                    onChange={(e) => setSortDir(e.target.value as any)}
                    className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm"
                  >
                    <option value="desc">Desc</option>
                    <option value="asc">Asc</option>
                  </select>
                </div>
              </div>

              {/* Chart Type */}
              <div className="mb-5">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Visualization
                </label>
                <div className="grid grid-cols-4 gap-1">
                  {CHART_TYPES.map(({ id, name, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => setChartType(id)}
                      className={`flex flex-col items-center gap-1 rounded-lg p-2 text-xs ${chartType === id ? 'bg-[var(--brand-primary)] text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
                    >
                      <Icon className="h-4 w-4" />
                      {name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Export Buttons */}
              {hasRun && (
                <div className="mb-5">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Export
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleExport('csv')}
                      disabled={exporting}
                      className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      CSV
                    </button>
                    <button
                      onClick={() => handleExport('pdf')}
                      disabled={exporting}
                      className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      PDF
                    </button>
                    <button
                      onClick={() => handleExport('xlsx')}
                      disabled={exporting}
                      className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Excel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Main Content — Results */}
        <div className="flex-1 overflow-auto bg-white p-4">
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4" /> {error}
            </div>
          )}

          {!selectedSource && (
            <div className="flex h-full items-center justify-center text-center">
              <div>
                <FileText className="mx-auto h-16 w-16 text-gray-300" />
                <h2 className="mt-4 text-xl font-semibold text-gray-700">Report Builder</h2>
                <p className="mt-2 text-gray-500">
                  Select a data source from the left panel to start building your report
                </p>
              </div>
            </div>
          )}

          {selectedSource && !hasRun && !running && (
            <div className="flex h-full items-center justify-center text-center">
              <div>
                <Play className="mx-auto h-16 w-16 text-gray-300" />
                <h2 className="mt-4 text-xl font-semibold text-gray-700">Configure & Run</h2>
                <p className="mt-2 text-gray-500">
                  Select your columns, filters, and grouping, then click "Run Report"
                </p>
                <button
                  onClick={handleRun}
                  className="mt-4 rounded-lg bg-[var(--brand-primary)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#3d8a66]"
                >
                  <Play className="mr-2 inline h-4 w-4" /> Run Report
                </button>
              </div>
            </div>
          )}

          {running && (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <Loader2 className="mx-auto h-10 w-10 animate-spin text-[var(--brand-primary)]" />
                <p className="mt-4 text-gray-500">Running report...</p>
              </div>
            </div>
          )}

          {hasRun && !running && (
            <>
              {/* Summary Cards */}
              {Object.keys(summary).length > 0 && (
                <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {Object.entries(summary).map(([key, val]) => {
                    const label = key
                      .replace(/([A-Z])/g, ' $1')
                      .replace(/^./, (s) => s.toUpperCase());
                    const isCurrency =
                      key.toLowerCase().includes('revenue') ||
                      key.toLowerCase().includes('commission') ||
                      key.toLowerCase().includes('amount') ||
                      key.toLowerCase().includes('mrr');
                    const isPercent = key.toLowerCase().includes('rate');
                    return (
                      <div key={key} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                        <p className="text-xs font-medium text-gray-500">{label}</p>
                        <p className="mt-1 text-lg font-bold text-gray-900">
                          {isCurrency ? $(val) : isPercent ? `${val}%` : val.toLocaleString()}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Chart */}
              {chartType !== 'table' && chartData.length > 0 && numericCols.length > 0 && (
                <div className="mb-4 rounded-xl border border-gray-100 bg-white p-4">
                  <ResponsiveContainer width="100%" height={300}>
                    {chartType === 'bar' ? (
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        {numericCols.slice(0, 4).map((col, i) => (
                          <Bar key={col.id} dataKey={col.label} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </BarChart>
                    ) : chartType === 'line' ? (
                      <RechartsLine data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        {numericCols.slice(0, 4).map((col, i) => (
                          <Line
                            key={col.id}
                            dataKey={col.label}
                            stroke={COLORS[i % COLORS.length]}
                          />
                        ))}
                      </RechartsLine>
                    ) : (
                      <RechartsPie>
                        <Pie
                          data={chartData}
                          dataKey={numericCols[0]?.label || 'count'}
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          label
                        >
                          {chartData.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </RechartsPie>
                    )}
                  </ResponsiveContainer>
                </div>
              )}

              {/* Data Table */}
              <div className="overflow-hidden rounded-xl border border-gray-200">
                <div className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-500">
                  {totalRows} row{totalRows !== 1 ? 's' : ''}
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {visibleCols.map((col) => (
                          <th
                            key={col.id}
                            className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.map((row, i) => (
                        <tr key={row.id || i} className="hover:bg-gray-50">
                          {visibleCols.map((col) => (
                            <td
                              key={col.id}
                              className={`whitespace-nowrap px-3 py-2 ${col.type === 'currency' ? 'text-right font-medium' : col.type === 'number' ? 'text-right' : ''}`}
                            >
                              {fmtVal(row[col.id], col.type)}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {rows.length === 0 && (
                        <tr>
                          <td
                            colSpan={visibleCols.length}
                            className="py-8 text-center text-gray-500"
                          >
                            No data returned
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
