'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FileText,
  Plus,
  Play,
  Download,
  Clock,
  Pencil,
  Trash2,
  Share2,
  DollarSign,
  Users,
  Truck,
  Stethoscope,
  Link,
  Repeat,
  BadgeDollarSign,
  BarChart3,
  Loader2,
  Search,
  Calendar,
  Star,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface TemplateSummary {
  id: number;
  name: string;
  description: string | null;
  dataSource: string;
  isShared: boolean;
  isSystemTemplate: boolean;
  lastRunAt: string | null;
  updatedAt: string;
  createdBy: { id: number; firstName: string; lastName: string; email: string };
  schedules: { id: number; frequency: string; nextRunAt: string | null }[];
}

const DS_ICONS: Record<string, any> = {
  revenue: DollarSign,
  commissions: BadgeDollarSign,
  patients: Users,
  fulfillment: Truck,
  provider: Stethoscope,
  affiliates: Link,
  subscriptions: Repeat,
};

const DS_COLORS: Record<string, string> = {
  revenue: 'bg-blue-100 text-blue-600',
  commissions: 'bg-emerald-100 text-emerald-600',
  patients: 'bg-purple-100 text-purple-600',
  fulfillment: 'bg-orange-100 text-orange-600',
  provider: 'bg-cyan-100 text-cyan-600',
  affiliates: 'bg-pink-100 text-pink-600',
  subscriptions: 'bg-indigo-100 text-indigo-600',
};

const DS_LABELS: Record<string, string> = {
  revenue: 'Revenue',
  commissions: 'Commissions',
  patients: 'Patients',
  fulfillment: 'Fulfillment',
  provider: 'Provider',
  affiliates: 'Affiliates',
  subscriptions: 'Subscriptions',
};

export default function ReportCatalogPage() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSource, setFilterSource] = useState('');

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (filterSource) p.set('dataSource', filterSource);
      const res = await apiFetch(`/api/reports/templates?${p}`);
      if (res.ok) {
        const json = await res.json();
        setTemplates(json.templates || []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [filterSource]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete report "${name}"? This cannot be undone.`)) return;
    try {
      const res = await apiFetch(`/api/reports/templates/${id}`, { method: 'DELETE' });
      if (res.ok) fetchTemplates();
      else alert('Failed to delete');
    } catch {
      alert('Failed to delete');
    }
  };

  const filtered = templates.filter((t) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !t.name.toLowerCase().includes(q) &&
        !t.dataSource.toLowerCase().includes(q) &&
        !(t.description || '').toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const systemTemplates = filtered.filter((t) => t.isSystemTemplate);
  const myTemplates = filtered.filter((t) => !t.isSystemTemplate && !t.isShared);
  const sharedTemplates = filtered.filter((t) => !t.isSystemTemplate && t.isShared);

  const TemplateCard = ({ t }: { t: TemplateSummary }) => {
    const Icon = DS_ICONS[t.dataSource] || FileText;
    const color = DS_COLORS[t.dataSource] || 'bg-gray-100 text-gray-600';
    return (
      <div className="group relative flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
        <div className="mb-3 flex items-start justify-between">
          <div className={`rounded-lg p-2 ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <a
              href={`/admin/finance/reports/builder?templateId=${t.id}`}
              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
              title="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </a>
            {!t.isSystemTemplate && (
              <button
                onClick={() => handleDelete(t.id, t.name)}
                className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <h3 className="mb-1 font-semibold text-gray-900">{t.name}</h3>
        {t.description && (
          <p className="mb-3 line-clamp-2 text-sm text-gray-500">{t.description}</p>
        )}
        <div className="mt-auto flex items-center gap-2 pt-3">
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            {DS_LABELS[t.dataSource] || t.dataSource}
          </span>
          {t.isShared && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Share2 className="h-3 w-3" /> Shared
            </span>
          )}
          {t.schedules.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-emerald-600">
              <Clock className="h-3 w-3" /> Scheduled
            </span>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
          <a
            href={`/admin/finance/reports/builder?templateId=${t.id}`}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--brand-primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[#3d8a66]"
          >
            <Play className="h-3.5 w-3.5" /> Run
          </a>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Report Center</h1>
          <p className="text-gray-500">
            Create, save, and schedule reports across all data sources
          </p>
        </div>
        <a
          href="/admin/finance/reports/builder"
          className="flex items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#3d8a66]"
        >
          <Plus className="h-4 w-4" /> New Report
        </a>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search reports..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <select
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
        >
          <option value="">All Data Sources</option>
          {Object.entries(DS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--brand-primary)]" />
        </div>
      ) : (
        <>
          {/* System Templates */}
          {systemTemplates.length > 0 && (
            <div className="mb-8">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900">
                <Star className="h-5 w-5 text-amber-500" /> System Reports
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {systemTemplates.map((t) => (
                  <TemplateCard key={t.id} t={t} />
                ))}
              </div>
            </div>
          )}

          {/* My Reports */}
          <div className="mb-8">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900">
              <FileText className="h-5 w-5 text-blue-500" /> My Reports
            </h2>
            {myTemplates.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {myTemplates.map((t) => (
                  <TemplateCard key={t.id} t={t} />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 py-12 text-center">
                <BarChart3 className="mx-auto h-10 w-10 text-gray-300" />
                <p className="mt-2 text-gray-500">No saved reports yet</p>
                <a
                  href="/admin/finance/reports/builder"
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[var(--brand-primary)] hover:underline"
                >
                  <Plus className="h-4 w-4" /> Create your first report
                </a>
              </div>
            )}
          </div>

          {/* Shared Reports */}
          {sharedTemplates.length > 0 && (
            <div className="mb-8">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900">
                <Share2 className="h-5 w-5 text-purple-500" /> Shared Reports
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {sharedTemplates.map((t) => (
                  <TemplateCard key={t.id} t={t} />
                ))}
              </div>
            </div>
          )}

          {filtered.length === 0 && !loading && (
            <div className="py-16 text-center">
              <FileText className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-2 text-gray-500">
                {searchQuery ? 'No reports match your search' : 'No reports yet'}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
