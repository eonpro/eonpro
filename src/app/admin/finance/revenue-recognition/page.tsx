'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Loader2,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertTriangle,
  Play,
  RefreshCw,
  BookOpen,
  BarChart3,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { apiFetch } from '@/lib/api/fetch';

const fmt = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(cents / 100);

type Tab = 'waterfall' | 'journals';

export default function RevenueRecognitionPage() {
  const [tab, setTab] = useState<Tab>('waterfall');
  const [loading, setLoading] = useState(true);
  const [waterfall, setWaterfall] = useState<any>(null);
  const [journals, setJournals] = useState<any>(null);
  const [processing, setProcessing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadWaterfall = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/finance/revenue-recognition?type=waterfall&months=12');
      if (res.ok) setWaterfall(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  const loadJournals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/finance/revenue-recognition?type=journals&limit=50');
      if (res.ok) setJournals(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'waterfall') loadWaterfall();
    else loadJournals();
  }, [tab, loadWaterfall, loadJournals]);

  const handleProcess = async () => {
    setProcessing(true);
    setMessage(null);
    try {
      const res = await apiFetch('/api/finance/revenue-recognition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'process' }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(`Processed ${data.processed} entries, recognized ${fmt(data.totalRecognized)} for ${data.period}`);
        loadWaterfall();
      } else {
        setMessage('Processing failed');
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await apiFetch('/api/finance/revenue-recognition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync' }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(`Synced: ${data.created} new entries created, ${data.skipped} already tracked`);
        loadWaterfall();
      }
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <a href="/admin/finance/reports" className="text-sm text-gray-500 hover:text-gray-700">&larr; Report Center</a>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">Revenue Recognition</h1>
          <p className="text-sm text-gray-500">ASC 606 / IFRS 15 compliant deferred revenue tracking</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sync from Stripe
          </button>
          <button
            onClick={handleProcess}
            disabled={processing}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Run Recognition
          </button>
        </div>
      </div>

      {message && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      )}

      {/* Summary Cards */}
      {waterfall?.totals && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-5">
            <div className="mb-2 flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-700">Recognized</span>
            </div>
            <p className="text-2xl font-bold text-emerald-800">{fmt(waterfall.totals.totalRecognized)}</p>
            <p className="mt-1 text-xs text-emerald-600">{waterfall.totals.completeEntries} complete entries</p>
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-5">
            <div className="mb-2 flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-medium text-blue-700">Deferred</span>
            </div>
            <p className="text-2xl font-bold text-blue-800">{fmt(waterfall.totals.totalDeferred)}</p>
            <p className="mt-1 text-xs text-blue-600">{waterfall.totals.pendingEntries + waterfall.totals.partialEntries} pending entries</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-5">
            <div className="mb-2 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">Total Entries</span>
            </div>
            <p className="text-2xl font-bold text-gray-800">{waterfall.totals.totalEntries}</p>
          </div>
          <div className="rounded-xl border border-purple-100 bg-purple-50 p-5">
            <div className="mb-2 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-purple-600" />
              <span className="text-sm font-medium text-purple-700">Total Revenue</span>
            </div>
            <p className="text-2xl font-bold text-purple-800">{fmt(waterfall.totals.totalRecognized + waterfall.totals.totalDeferred)}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {[
          { id: 'waterfall' as Tab, label: 'Revenue Waterfall', icon: BarChart3 },
          { id: 'journals' as Tab, label: 'Journal Entries', icon: BookOpen },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${
              tab === t.id
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        </div>
      ) : tab === 'waterfall' && waterfall?.waterfall ? (
        <div className="space-y-6">
          {/* Stacked Bar Chart */}
          <div className="rounded-xl border bg-white p-6">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Recognized vs Deferred Revenue</h3>
            {waterfall.waterfall.length === 0 ? (
              <div className="flex h-[300px] flex-col items-center justify-center text-gray-400">
                <BarChart3 className="mb-3 h-12 w-12" />
                <p>No recognition data yet</p>
                <p className="mt-1 text-sm">Sync subscriptions from Stripe to create entries</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={waterfall.waterfall}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#6B7280' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#6B7280' }} tickFormatter={(v) => `$${(v / 100).toFixed(0)}`} />
                  <Tooltip
                    formatter={((v: number | undefined, name: string) => [fmt(v ?? 0), name === 'recognized' ? 'Recognized' : name === 'deferred' ? 'Deferred' : name]) as any}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB' }}
                  />
                  <Legend />
                  <Bar dataKey="recognized" name="Recognized" fill="#10B981" stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="deferred" name="Deferred" fill="#3B82F6" stackId="a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Waterfall Table */}
          {waterfall.waterfall.length > 0 && (
            <div className="rounded-xl border bg-white p-6">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">Monthly Breakdown</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-gray-500">
                      <th className="pb-2 pr-4 font-medium">Month</th>
                      <th className="pb-2 pr-4 font-medium text-right">New Deferred</th>
                      <th className="pb-2 pr-4 font-medium text-right">Recognized</th>
                      <th className="pb-2 pr-4 font-medium text-right">Remaining Deferred</th>
                      <th className="pb-2 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {waterfall.waterfall.map((row: any) => (
                      <tr key={row.month} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium text-gray-700">{row.month}</td>
                        <td className="py-2 pr-4 text-right text-blue-600">{row.newDeferredFormatted}</td>
                        <td className="py-2 pr-4 text-right text-emerald-600">{row.recognizedFormatted}</td>
                        <td className="py-2 pr-4 text-right text-orange-600">{row.deferredFormatted}</td>
                        <td className="py-2 text-right font-semibold text-gray-900">{row.totalFormatted}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : tab === 'journals' && journals ? (
        <div className="rounded-xl border bg-white p-6">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Journal Entries ({journals.total})</h3>
          {journals.journals.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              No journal entries yet. Run monthly recognition to generate entries.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-gray-500">
                    <th className="pb-2 pr-4 font-medium">Date</th>
                    <th className="pb-2 pr-4 font-medium">Period</th>
                    <th className="pb-2 pr-4 font-medium">Type</th>
                    <th className="pb-2 pr-4 font-medium text-right">Amount</th>
                    <th className="pb-2 pr-4 font-medium">Description</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {journals.journals.map((j: any) => (
                    <tr key={j.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 text-gray-600">{new Date(j.createdAt).toLocaleDateString()}</td>
                      <td className="py-2 pr-4 text-gray-600">
                        {new Date(j.periodStart).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                          j.journalType === 'recognize_revenue' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {j.journalType === 'recognize_revenue' ? 'Recognize' : 'Defer'}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-right font-medium text-gray-900">{j.amountFormatted}</td>
                      <td className="max-w-[200px] truncate py-2 pr-4 text-gray-600">{j.entry?.description || '-'}</td>
                      <td className="py-2">
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                          j.entry?.status === 'complete' ? 'bg-emerald-100 text-emerald-700' :
                          j.entry?.status === 'partial' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {j.entry?.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
