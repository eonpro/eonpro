'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ChevronLeft,
  BadgeDollarSign,
  TrendingUp,
  DollarSign,
  MousePointer,
  Target,
  Download,
  Calendar,
  Building2,
  RefreshCw,
  Mail,
  Clock,
  UserCheck,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface RepDetail {
  id: number;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  clinicId: number;
  clinicName: string | null;
  createdAt: string;
  lastLogin: string | null;
  currentPlan: string | null;
}

interface Stats {
  totalClicks: number;
  totalConversions: number;
  patientsAssigned: number;
  commissionEarnedCents: number;
  revenueCents: number;
  commissionEvents: number;
  conversionRate: number;
}

interface DailyRow { date: string; clicks: number; conversions: number; commissionCents: number; }
interface CodePerformance { id: number; refCode: string; isActive: boolean; clicks: number; conversions: number; conversionRate: number; }

interface DetailResponse {
  rep: RepDetail;
  stats: Stats;
  dailyBreakdown: DailyRow[];
  codePerformance: CodePerformance[];
  dateRange: { startDate: string; endDate: string };
}

const PRESETS = [
  { value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' },
  { value: 'this-week', label: 'This Week' }, { value: 'last-week', label: 'Last Week' },
  { value: 'last7', label: 'Last 7 Days' }, { value: 'this-month', label: 'This Month' },
  { value: 'last-month', label: 'Last Month' }, { value: 'last30', label: 'Last 30 Days' },
  { value: 'this-quarter', label: 'This Quarter' }, { value: 'last-quarter', label: 'Last Quarter' },
  { value: 'this-semester', label: 'This Semester' }, { value: 'last-semester', label: 'Last Semester' },
  { value: 'this-year', label: 'This Year' }, { value: 'last-year', label: 'Last Year' },
  { value: 'all-time', label: 'All Time' }, { value: 'custom', label: 'Custom Range' },
] as const;

function fmtUSD(c: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(c / 100); }
function fmtPct(v: number) { return `${v.toFixed(1)}%`; }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
function fmtFullDate(d: string) { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
function fmtDateRange(s: string, e: string) {
  const o: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  return `${new Date(s).toLocaleDateString('en-US', o)} — ${new Date(e).toLocaleDateString('en-US', o)}`;
}

export default function SalesRepDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<string>('last30');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (preset === 'custom' && customStart && customEnd) { p.set('startDate', customStart); p.set('endDate', customEnd); }
      else if (preset !== 'custom') { p.set('preset', preset); }
      const res = await apiFetch(`/api/super-admin/sales-reps/${id}?${p}`);
      if (res.ok) setData(await res.json());
    } catch (e) {
      process.env.NODE_ENV === 'development' && console.error('Failed:', e);
    } finally { setLoading(false); }
  }, [id, preset, customStart, customEnd]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const maxConv = useMemo(() => Math.max(...(data?.dailyBreakdown.map((d) => d.conversions) ?? [0]), 1), [data?.dailyBreakdown]);
  const sortedCodes = useMemo(() => [...(data?.codePerformance ?? [])].sort((a, b) => b.conversions - a.conversions), [data?.codePerformance]);

  const handleExportCsv = () => {
    if (!data) return;
    const r = data.rep;
    const dl = fmtDateRange(data.dateRange.startDate, data.dateRange.endDate);
    let csv = `Sales Rep Payroll Detail\nRep: ${r.name}\nEmail: ${r.email}\nClinic: ${r.clinicName}\nPlan: ${r.currentPlan || 'None'}\nPeriod: ${dl}\nGenerated: ${new Date().toLocaleString()}\n\n`;
    csv += `Summary\nClicks,${data.stats.totalClicks}\nConversions,${data.stats.totalConversions}\nPatients Assigned,${data.stats.patientsAssigned}\nRevenue,$${(data.stats.revenueCents / 100).toFixed(2)}\nCommission Earned,$${(data.stats.commissionEarnedCents / 100).toFixed(2)}\nCommission Events,${data.stats.commissionEvents}\nConv. Rate,${data.stats.conversionRate.toFixed(1)}%\n\n`;
    csv += `Daily Breakdown\nDate,Clicks,Conversions\n`;
    data.dailyBreakdown.forEach((d) => { csv += `${new Date(d.date).toISOString().slice(0, 10)},${d.clicks},${d.conversions}\n`; });
    csv += `\nRef Code Performance\nCode,Active,Clicks,Conversions,Conv Rate\n`;
    data.codePerformance.forEach((c) => { csv += `${c.refCode},${c.isActive ? 'Yes' : 'No'},${c.clicks},${c.conversions},${c.conversionRate.toFixed(1)}%\n`; });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sales-rep-${r.name.replace(/\s+/g, '-')}-payroll-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link); window.URL.revokeObjectURL(url);
  };

  if (loading && !data) return (<div className="flex h-96 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--brand-primary)] border-t-transparent" /></div>);
  if (!data) return (<div className="p-6"><button onClick={() => router.push('/super-admin/sales-reps')} className="mb-4 flex items-center gap-1 text-gray-600 hover:text-gray-900"><ChevronLeft className="h-5 w-5" />Back</button><div className="py-16 text-center"><p className="text-gray-500">Sales rep not found.</p></div></div>);

  const rep = data.rep;
  const st = data.stats;
  const isRefetching = loading && data !== null;

  return (
    <div className="p-6">
      <div className="mb-6">
        <button onClick={() => router.push('/super-admin/sales-reps')} className="mb-4 flex items-center gap-1 text-gray-600 hover:text-gray-900"><ChevronLeft className="h-5 w-5" />Back to Sales Reps</button>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{rep.name}</h1>
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${rep.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{rep.status}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-4 text-sm text-gray-500">
              <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{rep.clinicName}</span>
              <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{rep.email}</span>
              {rep.currentPlan && <span className="flex items-center gap-1"><BadgeDollarSign className="h-3.5 w-3.5" />{rep.currentPlan}</span>}
              {rep.lastLogin && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />Last: {fmtFullDate(rep.lastLogin)}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchData} disabled={loading} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
            <button onClick={handleExportCsv} className="flex items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[#3d8a66]"><Download className="h-4 w-4" />Export CSV</button>
          </div>
        </div>
      </div>

      {/* Period Filter */}
      <div className="mb-6 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-700"><Calendar className="h-4 w-4" />Period</div>
        <div className="flex flex-wrap items-end gap-4">
          <div><label className="mb-1 block text-xs font-medium text-gray-500">Time Period</label><select value={preset} onChange={(e) => setPreset(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--brand-primary)] focus:outline-none">{PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
          {preset === 'custom' && (<><div><label className="mb-1 block text-xs font-medium text-gray-500">Start</label><input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" /></div><div><label className="mb-1 block text-xs font-medium text-gray-500">End</label><input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" /></div></>)}
        </div>
        {data.dateRange && <div className="mt-2 text-xs text-gray-500">Showing: {fmtDateRange(data.dateRange.startDate, data.dateRange.endDate)}</div>}
      </div>

      {/* Stats Cards */}
      <div className={`relative mb-6 transition-opacity ${isRefetching ? 'opacity-60' : ''}`}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-xl bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><div className="rounded-lg bg-blue-100 p-2 text-blue-600"><MousePointer className="h-5 w-5" /></div><div><p className="text-2xl font-bold text-gray-900">{st.totalClicks.toLocaleString()}</p><p className="text-sm text-gray-500">Clicks</p></div></div></div>
          <div className="rounded-xl bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><div className="rounded-lg bg-green-100 p-2 text-green-600"><TrendingUp className="h-5 w-5" /></div><div><p className="text-2xl font-bold text-gray-900">{st.totalConversions.toLocaleString()}</p><p className="text-sm text-gray-500">Conversions</p></div></div></div>
          <div className="rounded-xl bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><div className="rounded-lg bg-yellow-100 p-2 text-yellow-600"><UserCheck className="h-5 w-5" /></div><div><p className="text-2xl font-bold text-gray-900">{st.patientsAssigned.toLocaleString()}</p><p className="text-sm text-gray-500">Patients</p></div></div></div>
          <div className="rounded-xl bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><div className="rounded-lg bg-indigo-100 p-2 text-indigo-600"><DollarSign className="h-5 w-5" /></div><div><p className="text-2xl font-bold text-gray-900">{fmtUSD(st.revenueCents)}</p><p className="text-sm text-gray-500">Revenue</p></div></div></div>
          <div className="rounded-xl bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><div className="rounded-lg bg-emerald-100 p-2 text-emerald-600"><BadgeDollarSign className="h-5 w-5" /></div><div><p className="text-2xl font-bold text-emerald-700">{fmtUSD(st.commissionEarnedCents)}</p><p className="text-sm text-gray-500">Earned ({st.commissionEvents} events)</p></div></div></div>
          <div className="rounded-xl bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><div className="rounded-lg bg-purple-100 p-2 text-purple-600"><Target className="h-5 w-5" /></div><div><p className="text-2xl font-bold text-gray-900">{fmtPct(st.conversionRate)}</p><p className="text-sm text-gray-500">Conv. Rate</p></div></div></div>
        </div>
        {isRefetching && <div className="absolute inset-0 flex items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--brand-primary)] border-t-transparent" /></div>}
      </div>

      <div className={`grid gap-6 transition-opacity lg:grid-cols-3 ${isRefetching ? 'opacity-60' : ''}`}>
        {/* Daily chart */}
        <div className="rounded-xl bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Daily Performance</h2>
          {data.dailyBreakdown.length > 0 ? (
            <div className="max-h-[400px] space-y-1.5 overflow-y-auto">
              {data.dailyBreakdown.map((day, i) => {
                const w = (day.conversions / maxConv) * 100;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-14 flex-shrink-0 text-xs text-gray-500">{fmtDate(day.date)}</span>
                    <div className="flex-1"><div className="h-4 rounded-r bg-[var(--brand-primary)] transition-all" style={{ width: `${Math.max(w, 2)}%` }} /></div>
                    <span className="w-10 text-right text-xs font-medium text-gray-700">{day.conversions}</span>
                    <span className="w-16 text-right text-xs text-emerald-600">{fmtUSD(day.commissionCents)}</span>
                  </div>
                );
              })}
            </div>
          ) : (<div className="flex h-48 items-center justify-center text-gray-500">No data for this period</div>)}
        </div>

        {/* Ref Code Performance */}
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Ref Code Performance</h2>
          {sortedCodes.length > 0 ? (
            <div className="space-y-3">
              {sortedCodes.map((code) => (
                <div key={code.id} className="rounded-lg border border-gray-100 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-gray-900">{code.refCode}</span>
                      {!code.isActive && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">Inactive</span>}
                    </div>
                    <span className="text-sm font-medium text-[var(--brand-primary)]">{code.conversions} conv.</span>
                  </div>
                  <div className="mt-2 flex items-center gap-4 text-xs text-gray-500"><span>{code.clicks} clicks</span><span>{fmtPct(code.conversionRate)} rate</span></div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-[var(--brand-primary)]" style={{ width: `${Math.min(code.conversionRate * 2, 100)}%` }} /></div>
                </div>
              ))}
            </div>
          ) : (<div className="py-8 text-center text-gray-500">No ref codes</div>)}
        </div>
      </div>
    </div>
  );
}
