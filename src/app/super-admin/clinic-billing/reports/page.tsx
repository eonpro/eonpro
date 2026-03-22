'use client';

import { calendarTodayServer, instantToCalendarDate } from '@/lib/utils/platform-calendar';
import { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  DollarSign,
  Clock,
  TrendingUp,
  Download,
  Loader2,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, PieChart, Pie, Cell,
} from 'recharts';

type TabId = 'fees' | 'revenue' | 'aging' | 'collection';

const TABS: { id: TabId; label: string; icon: typeof FileText }[] = [
  { id: 'fees', label: 'Fee Activity', icon: FileText },
  { id: 'revenue', label: 'Revenue', icon: DollarSign },
  { id: 'aging', label: 'AR Aging', icon: Clock },
  { id: 'collection', label: 'Collection', icon: TrendingUp },
];

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);

const formatCurrencyFull = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

const COLORS = ['#4fa77e', '#3b82f6', '#f59e0b', '#f97316', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function BillingReportsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('fees');
  const [loading, setLoading] = useState(true);

  // Shared filters
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return instantToCalendarDate(d);
  });
  const [endDate, setEndDate] = useState(() => calendarTodayServer());

  // Fee Activity state
  const [feeData, setFeeData] = useState<{ summary: Record<string, number>; events: Record<string, unknown>[] } | null>(null);

  // Revenue state
  const [revenueData, setRevenueData] = useState<{ trend: Record<string, number>[]; topClinics: Record<string, unknown>[] } | null>(null);

  // AR Aging state
  const [agingData, setAgingData] = useState<Record<string, unknown>[] | null>(null);

  // Collection state
  const [collectionData, setCollectionData] = useState<{
    collectionRate: number;
    avgDaysToPayment: number;
    totalPaidCents: number;
    totalOutstandingCents: number;
    totalOverdueCents: number;
    paymentMethodBreakdown: { method: string; count: number; amountCents: number }[];
  } | null>(null);

  const fetchFeeData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ startDate, endDate, limit: '100' });
      const res = await apiFetch(`/api/super-admin/clinic-fees/reports?${params}`);
      if (res.ok) setFeeData(await res.json());
    } catch { /* silent */ } finally { setLoading(false); }
  }, [startDate, endDate]);

  const fetchRevenueData = useCallback(async () => {
    setLoading(true);
    try {
      const [trendRes, clinicsRes] = await Promise.all([
        apiFetch('/api/super-admin/billing-analytics?type=revenue-trend&months=12'),
        apiFetch(`/api/super-admin/billing-analytics?type=top-clinics&limit=10&startDate=${startDate}&endDate=${endDate}`),
      ]);
      const trend = trendRes.ok ? (await trendRes.json()).data : [];
      const topClinics = clinicsRes.ok ? (await clinicsRes.json()).data : [];
      setRevenueData({ trend, topClinics });
    } catch { /* silent */ } finally { setLoading(false); }
  }, [startDate, endDate]);

  const fetchAgingData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/super-admin/billing-analytics?type=ar-aging');
      if (res.ok) setAgingData((await res.json()).data);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  const fetchCollectionData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/super-admin/billing-analytics?type=collection&startDate=${startDate}&endDate=${endDate}`);
      if (res.ok) setCollectionData((await res.json()).data);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [startDate, endDate]);

  useEffect(() => {
    switch (activeTab) {
      case 'fees': fetchFeeData(); break;
      case 'revenue': fetchRevenueData(); break;
      case 'aging': fetchAgingData(); break;
      case 'collection': fetchCollectionData(); break;
    }
  }, [activeTab, fetchFeeData, fetchRevenueData, fetchAgingData, fetchCollectionData]);

  const exportCSV = async () => {
    try {
      const res = await apiFetch('/api/super-admin/clinic-fees/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodType: 'CUSTOM', startDate, endDate, format: 'csv' }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `billing-report-${startDate}-to-${endDate}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch { alert('Export failed'); }
  };

  return (
    <div>
      {/* Actions */}
      <div className="mb-6 flex items-center justify-end">
        <button onClick={exportCSV} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-gray-700 shadow-sm hover:bg-gray-50">
          <Download className="h-5 w-5" /> Export CSV
        </button>
      </div>

      {/* Date Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">From</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">To</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20" />
        </div>
        <div className="flex gap-1">
          {[
            { label: 'This Month', fn: () => { const n = new Date(); setStartDate(instantToCalendarDate(new Date(n.getFullYear(), n.getMonth(), 1))); setEndDate(instantToCalendarDate(n)); } },
            { label: 'Last 3M', fn: () => { const n = new Date(); const s = new Date(n); s.setMonth(s.getMonth() - 3); setStartDate(instantToCalendarDate(s)); setEndDate(instantToCalendarDate(n)); } },
            { label: 'This Year', fn: () => { const n = new Date(); setStartDate(instantToCalendarDate(new Date(n.getFullYear(), 0, 1))); setEndDate(instantToCalendarDate(n)); } },
          ].map((p) => (
            <button key={p.label} onClick={p.fn} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-xl bg-gray-100 p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all ${active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Icon className="h-4 w-4" /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#4fa77e]" />
        </div>
      ) : (
        <>
          {activeTab === 'fees' && feeData && <FeeActivityTab data={feeData} />}
          {activeTab === 'revenue' && revenueData && <RevenueTab data={revenueData} />}
          {activeTab === 'aging' && agingData && <ARAgingTab data={agingData} />}
          {activeTab === 'collection' && collectionData && <CollectionTab data={collectionData} />}
        </>
      )}
    </div>
  );
}

function FeeActivityTab({ data }: { data: { summary: Record<string, number>; events: Record<string, unknown>[] } }) {
  const { summary, events } = data;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: 'Prescription Fees', value: summary.totalPrescriptionFees, count: summary.prescriptionCount, color: 'text-[#4fa77e]' },
          { label: 'Transmission Fees', value: summary.totalTransmissionFees, count: summary.transmissionCount, color: 'text-blue-600' },
          { label: 'Admin Fees', value: summary.totalAdminFees, count: summary.adminCount, color: 'text-yellow-600' },
          { label: 'Total Fees', value: summary.totalFees, count: (summary.prescriptionCount ?? 0) + (summary.transmissionCount ?? 0) + (summary.adminCount ?? 0), color: 'text-gray-900' },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">{c.label}</p>
            <p className={`text-xl font-bold ${c.color}`}>{formatCurrency(c.value ?? 0)}</p>
            <p className="text-xs text-gray-400">{c.count ?? 0} events</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              {['Date', 'Clinic', 'Type', 'Provider', 'Status', 'Amount'].map((h) => (
                <th key={h} className={`px-4 py-3 text-xs font-medium uppercase text-gray-500 ${h === 'Amount' ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(events as Record<string, unknown>[]).slice(0, 50).map((e: Record<string, unknown>, i: number) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-600">{new Date(e.createdAt as string).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-sm text-gray-900">{(e.clinic as Record<string, string>)?.name}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${e.feeType === 'PRESCRIPTION' ? 'bg-green-100 text-green-700' : e.feeType === 'TRANSMISSION' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {e.feeType as string}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {(e.provider as Record<string, string>)?.firstName ? `${(e.provider as Record<string, string>).firstName} ${(e.provider as Record<string, string>).lastName}` : '-'}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{e.status as string}</td>
                <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">{formatCurrencyFull(e.amountCents as number)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RevenueTab({ data }: { data: { trend: Record<string, number>[]; topClinics: Record<string, unknown>[] } }) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Monthly Revenue Trend</h3>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data.trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#9ca3af" />
            <YAxis tickFormatter={(v: number) => formatCurrency(v)} tick={{ fontSize: 12 }} stroke="#9ca3af" width={80} />
            <Tooltip formatter={((v: number | undefined, name: string) => [formatCurrency(v ?? 0), name]) as any} contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }} />
            <Legend />
            <Bar dataKey="prescriptionFees" name="Prescription" stackId="a" fill="#4fa77e" radius={[0, 0, 0, 0]} />
            <Bar dataKey="transmissionFees" name="Transmission" stackId="a" fill="#3b82f6" />
            <Bar dataKey="adminFees" name="Admin" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Top Clinics by Revenue</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                {['Rank', 'Clinic', 'Invoiced', 'Paid', 'Outstanding', 'Collection Rate'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(data.topClinics as Record<string, unknown>[]).map((c, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-600">#{i + 1}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{c.clinicName as string}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{formatCurrency(c.totalInvoicedCents as number)}</td>
                  <td className="px-4 py-3 text-sm text-green-600">{formatCurrency(c.totalPaidCents as number)}</td>
                  <td className="px-4 py-3 text-sm text-yellow-600">{formatCurrency(c.outstandingCents as number)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
                        <div className="h-full rounded-full bg-[#4fa77e]" style={{ width: `${c.collectionRate as number}%` }} />
                      </div>
                      <span className="text-xs font-medium text-gray-600">{c.collectionRate as number}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ARAgingTab({ data }: { data: Record<string, unknown>[] }) {
  const totalOutstanding = (data as { amountCents: number }[]).reduce((s, b) => s + b.amountCents, 0);
  const totalInvoices = (data as { invoiceCount: number }[]).reduce((s, b) => s + b.invoiceCount, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Total Outstanding</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalOutstanding)}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Outstanding Invoices</p>
          <p className="text-2xl font-bold text-gray-900">{totalInvoices}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Aging Distribution</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
              <XAxis type="number" tickFormatter={(v: number) => formatCurrency(v)} tick={{ fontSize: 12 }} stroke="#9ca3af" />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 12 }} stroke="#9ca3af" width={60} />
              <Tooltip formatter={((v: number | undefined) => [formatCurrency(v ?? 0), 'Amount']) as any} contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }} />
              <Bar dataKey="amountCents" radius={[0, 6, 6, 0]} barSize={28}>
                {data.map((_e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Aging Breakdown</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={data.filter((d: Record<string, unknown>) => (d.amountCents as number) > 0)} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3} dataKey="amountCents" nameKey="label" stroke="none">
                {data.map((_e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={((v: number | undefined) => formatCurrency(v ?? 0)) as any} contentStyle={{ borderRadius: 12 }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              {['Aging Bucket', 'Description', 'Invoices', 'Amount', '% of Total'].map((h) => (
                <th key={h} className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(data as { label: string; range: string; invoiceCount: number; amountCents: number }[]).map((b, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-6 py-3">
                  <span className="inline-flex items-center gap-2 text-sm font-medium text-gray-900">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    {b.label}
                  </span>
                </td>
                <td className="px-6 py-3 text-sm text-gray-500">{b.range}</td>
                <td className="px-6 py-3 text-sm text-gray-900">{b.invoiceCount}</td>
                <td className="px-6 py-3 text-sm font-medium text-gray-900">{formatCurrency(b.amountCents)}</td>
                <td className="px-6 py-3 text-sm text-gray-600">
                  {totalOutstanding > 0 ? `${Math.round((b.amountCents / totalOutstanding) * 100)}%` : '0%'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CollectionTab({ data }: { data: { collectionRate: number; avgDaysToPayment: number; totalPaidCents: number; totalOutstandingCents: number; totalOverdueCents: number; paymentMethodBreakdown: { method: string; count: number; amountCents: number }[] } }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[
          { label: 'Collection Rate', value: `${data.collectionRate}%`, color: data.collectionRate >= 80 ? 'text-green-600' : 'text-yellow-600' },
          { label: 'Avg Days to Pay', value: `${data.avgDaysToPayment}`, color: 'text-blue-600' },
          { label: 'Collected', value: formatCurrency(data.totalPaidCents), color: 'text-green-600' },
          { label: 'Outstanding', value: formatCurrency(data.totalOutstandingCents), color: 'text-yellow-600' },
          { label: 'Overdue', value: formatCurrency(data.totalOverdueCents), color: 'text-red-600' },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">{c.label}</p>
            <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {data.paymentMethodBreakdown.length > 0 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Payment Method Distribution</h3>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={data.paymentMethodBreakdown} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3} dataKey="amountCents" nameKey="method" stroke="none">
                  {data.paymentMethodBreakdown.map((_e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={((v: number | undefined) => formatCurrency(v ?? 0)) as any} contentStyle={{ borderRadius: 12 }} />
                <Legend formatter={(v: string) => v.replace(/_/g, ' ')} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Payment Methods</h3>
            <div className="space-y-3">
              {data.paymentMethodBreakdown.map((pm) => {
                const pct = data.totalPaidCents > 0 ? Math.round((pm.amountCents / data.totalPaidCents) * 100) : 0;
                return (
                  <div key={pm.method}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="capitalize text-gray-700">{pm.method.replace(/_/g, ' ')}</span>
                      <span className="text-gray-500">{pm.count} payments - {formatCurrency(pm.amountCents)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                      <div className="h-full rounded-full bg-[#4fa77e]" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
