'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api/fetch';
import {
  Package,
  Truck,
  CheckCircle2,
  AlertTriangle,
  Search,
  RefreshCw,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Tag,
  PackageCheck,
  MapPin,
  Download,
  Clock,
  TrendingUp,
  BarChart3,
  ShieldAlert,
} from 'lucide-react';

type Tab = 'label_created' | 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'issues';

interface Shipment {
  id: number;
  trackingNumber: string;
  carrier: string;
  status: string;
  statusNote: string | null;
  lifefileOrderId: string | null;
  shippedAt: string | null;
  estimatedDelivery: string | null;
  actualDelivery: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
  clinicName: string | null;
  clinicId: number;
  patientId: number | null;
  orderId: number | null;
  patientName: string | null;
  signedBy: string | null;
  deliveryPhotoUrl: string | null;
  deliveryDetails: Record<string, unknown> | null;
}

interface Pagination { page: number; limit: number; total: number; totalPages: number }
type Counts = Record<Tab, number>;
interface Analytics {
  avgDeliveryDays: number | null;
  onTimeRate: number | null;
  shippedThisWeek: number;
  issueRate: number;
  totalShipments: number;
}
interface ClinicOption { id: number; name: string }

const STATUS_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  PENDING: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Pending' },
  LABEL_CREATED: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Label Created' },
  SHIPPED: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Shipped' },
  IN_TRANSIT: { bg: 'bg-yellow-50', text: 'text-yellow-800', label: 'In Transit' },
  OUT_FOR_DELIVERY: { bg: 'bg-orange-50', text: 'text-orange-800', label: 'Out for Delivery' },
  DELIVERED: { bg: 'bg-emerald-50', text: 'text-emerald-800', label: 'Delivered' },
  RETURNED: { bg: 'bg-red-50', text: 'text-red-700', label: 'Returned' },
  EXCEPTION: { bg: 'bg-red-100', text: 'text-red-800', label: 'Exception' },
  CANCELLED: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Cancelled' },
};

const TAB_CONFIG: { key: Tab; label: string; icon: typeof Package; borderColor: string; iconColor: string; bgHover: string }[] = [
  { key: 'label_created', label: 'Label Created', icon: Tag, borderColor: 'border-l-blue-500', iconColor: 'text-blue-500', bgHover: 'hover:bg-blue-50/50' },
  { key: 'shipped', label: 'Shipped', icon: Package, borderColor: 'border-l-indigo-500', iconColor: 'text-indigo-500', bgHover: 'hover:bg-indigo-50/50' },
  { key: 'in_transit', label: 'In Transit', icon: Truck, borderColor: 'border-l-yellow-500', iconColor: 'text-yellow-600', bgHover: 'hover:bg-yellow-50/50' },
  { key: 'out_for_delivery', label: 'Out for Delivery', icon: MapPin, borderColor: 'border-l-orange-500', iconColor: 'text-orange-500', bgHover: 'hover:bg-orange-50/50' },
  { key: 'delivered', label: 'Delivered', icon: CheckCircle2, borderColor: 'border-l-emerald-500', iconColor: 'text-emerald-500', bgHover: 'hover:bg-emerald-50/50' },
  { key: 'issues', label: 'Issues', icon: AlertTriangle, borderColor: 'border-l-red-500', iconColor: 'text-red-500', bgHover: 'hover:bg-red-50/50' },
];

const DATE_RANGES = [
  { value: '', label: 'All Time' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '90d', label: 'Last 90 Days' },
];

function getTrackingUrl(carrier: string, trackingNumber: string): string | null {
  const c = carrier.toLowerCase();
  if (c.includes('fedex')) return `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`;
  if (c.includes('ups')) return `https://www.ups.com/track?tracknum=${trackingNumber}`;
  if (c.includes('usps')) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`;
  if (c.includes('dhl')) return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${trackingNumber}`;
  return null;
}

function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isSameDay(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function timeSince(d: string): string {
  const ms = Date.now() - new Date(d).getTime();
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function ShipmentMonitorPage() {
  const [tab, setTab] = useState<Tab>('label_created');
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [counts, setCounts] = useState<Counts>({ label_created: 0, shipped: 0, in_transit: 0, out_for_delivery: 0, delivered: 0, issues: 0 });
  const [analytics, setAnalytics] = useState<Analytics>({ avgDeliveryDays: null, onTimeRate: null, shippedThisWeek: 0, issueRate: 0, totalShipments: 0 });
  const [clinics, setClinics] = useState<ClinicOption[]>([]);
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState('');
  const [selectedClinicId, setSelectedClinicId] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bulkRefreshing, setBulkRefreshing] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ totalUpdated: number; totalDelivered: number; totalPolled: number; totalNoData: number } | null>(null);

  const fetchData = useCallback(async (currentTab: Tab, currentPage: number, currentSearch: string, currentDateRange: string, currentClinicId: string) => {
    try {
      const params = new URLSearchParams({ tab: currentTab, page: String(currentPage), limit: '25' });
      if (currentSearch.trim()) params.set('search', currentSearch.trim());
      if (currentDateRange) params.set('dateRange', currentDateRange);
      if (currentClinicId) params.set('clinicId', currentClinicId);
      const res = await apiFetch(`/api/super-admin/shipment-monitor?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setShipments(data.shipments || []);
      setPagination(data.pagination || { page: 1, limit: 25, total: 0, totalPages: 0 });
      setCounts(data.counts || { label_created: 0, shipped: 0, in_transit: 0, out_for_delivery: 0, delivered: 0, issues: 0 });
      setAnalytics(data.analytics || { avgDeliveryDays: null, onTimeRate: null, shippedThisWeek: 0, issueRate: 0, totalShipments: 0 });
      if (data.clinics) setClinics(data.clinics);
    } catch {
      setShipments([]);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchData(tab, 1, search, dateRange, selectedClinicId).finally(() => setLoading(false));
  }, [tab, dateRange, selectedClinicId, fetchData]);

  const handleSearch = () => {
    setLoading(true);
    fetchData(tab, 1, search, dateRange, selectedClinicId).finally(() => setLoading(false));
  };
  const handlePageChange = (p: number) => {
    setLoading(true);
    fetchData(tab, p, search, dateRange, selectedClinicId).finally(() => setLoading(false));
  };
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData(tab, pagination.page, search, dateRange, selectedClinicId);
    setRefreshing(false);
  };
  const handleBulkRefresh = async () => {
    if (bulkRefreshing) return;
    setBulkRefreshing(true);
    setBulkResult(null);
    try {
      const res = await apiFetch('/api/super-admin/shipment-monitor/refresh-all', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setBulkResult({ totalUpdated: data.totalUpdated, totalDelivered: data.totalDelivered, totalPolled: data.totalPolled, totalNoData: data.totalNoData || 0 });
        await fetchData(tab, pagination.page, search, dateRange, selectedClinicId);
      }
    } catch { /* non-blocking */ } finally {
      setBulkRefreshing(false);
    }
  };
  const handleExport = () => {
    const params = new URLSearchParams();
    if (tab) params.set('tab', tab);
    if (search.trim()) params.set('search', search.trim());
    if (dateRange) params.set('dateRange', dateRange);
    if (selectedClinicId) params.set('clinicId', selectedClinicId);
    window.open(`/api/super-admin/shipment-monitor/export?${params}`, '_blank');
  };

  const dateColumnLabel = tab === 'delivered' ? 'Delivered' : tab === 'issues' ? 'Last Update' : 'Shipped';
  const dateColumnValue = (s: Shipment) => tab === 'delivered' ? formatDate(s.actualDelivery) : tab === 'issues' ? timeSince(s.updatedAt) : formatDate(s.shippedAt || s.createdAt);
  const totalAll = Object.values(counts).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Shipment Monitor</h1>
          <p className="mt-1 text-sm text-gray-500">Track every shipment from label creation through delivery across all clinics</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleBulkRefresh} disabled={bulkRefreshing} className="flex items-center gap-2 rounded-xl bg-[#4fa77e] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#429468] disabled:opacity-60">
            {bulkRefreshing ? (<><div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Refreshing...</>) : (<><Truck className="h-4 w-4" />Refresh All Tracking</>)}
          </button>
          <button onClick={handleExport} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50">
            <Download className="h-4 w-4" />Export CSV
          </button>
          <button onClick={handleRefresh} disabled={refreshing} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Reload
          </button>
        </div>
      </div>

      {/* Bulk refresh banners */}
      {bulkResult && (
        <div className={`mb-4 flex items-center justify-between rounded-xl border px-4 py-3 ${bulkResult.totalNoData > 0 && bulkResult.totalUpdated === 0 ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
          <div className={`flex items-center gap-2 text-sm ${bulkResult.totalNoData > 0 && bulkResult.totalUpdated === 0 ? 'text-amber-800' : 'text-emerald-800'}`}>
            {bulkResult.totalNoData > 0 && bulkResult.totalUpdated === 0 ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            <span>FedEx tracking: <strong>{bulkResult.totalPolled}</strong> sent, <strong>{bulkResult.totalUpdated}</strong> updated, <strong>{bulkResult.totalDelivered}</strong> newly delivered{bulkResult.totalNoData > 0 && (<> · <strong>{bulkResult.totalNoData}</strong> no data from FedEx</>)}</span>
          </div>
          <button onClick={() => setBulkResult(null)} className="text-xs hover:underline">Dismiss</button>
        </div>
      )}
      {bulkRefreshing && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
          Contacting FedEx Track API for up to 500 shipments...
        </div>
      )}

      {/* Status Cards — Large 3x2 Grid */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {TAB_CONFIG.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.key;
          const count = counts[t.key] || 0;
          const pct = ((count / totalAll) * 100).toFixed(1);
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex flex-col rounded-xl border-l-4 bg-white p-4 text-left shadow-sm transition-all ${t.borderColor} ${t.bgHover} ${
                isActive ? 'ring-2 ring-[#4fa77e] shadow-md' : 'border border-r border-t border-b border-gray-100'
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <Icon className={`h-5 w-5 ${t.iconColor}`} />
                {t.key === 'issues' && count > 0 && (
                  <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">!</span>
                )}
              </div>
              <span className="text-2xl font-bold text-gray-900">{count.toLocaleString()}</span>
              <span className="mt-0.5 text-xs font-medium text-gray-500">{t.label}</span>
              <span className="mt-1 text-[11px] text-gray-400">{pct}% of total</span>
            </button>
          );
        })}
      </div>

      {/* KPI Analytics Row */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
            <Clock className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500">Avg Delivery Time</p>
            <p className="text-lg font-bold text-gray-900">{analytics.avgDeliveryDays != null ? `${analytics.avgDeliveryDays} days` : '—'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${analytics.onTimeRate != null && analytics.onTimeRate >= 90 ? 'bg-emerald-50' : 'bg-amber-50'}`}>
            <TrendingUp className={`h-5 w-5 ${analytics.onTimeRate != null && analytics.onTimeRate >= 90 ? 'text-emerald-600' : 'text-amber-600'}`} />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500">On-Time Rate</p>
            <p className={`text-lg font-bold ${analytics.onTimeRate != null && analytics.onTimeRate >= 90 ? 'text-emerald-700' : 'text-amber-700'}`}>
              {analytics.onTimeRate != null ? `${analytics.onTimeRate}%` : '—'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
            <BarChart3 className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500">Shipped This Week</p>
            <p className="text-lg font-bold text-gray-900">{analytics.shippedThisWeek.toLocaleString()}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${analytics.issueRate > 1 ? 'bg-red-50' : 'bg-gray-50'}`}>
            <ShieldAlert className={`h-5 w-5 ${analytics.issueRate > 1 ? 'text-red-600' : 'text-gray-500'}`} />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500">Issue Rate</p>
            <p className={`text-lg font-bold ${analytics.issueRate > 1 ? 'text-red-700' : 'text-gray-900'}`}>{analytics.issueRate}%</p>
          </div>
        </div>
      </div>

      {/* Filters Row */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
        >
          {DATE_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <select
          value={selectedClinicId}
          onChange={(e) => setSelectedClinicId(e.target.value)}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
        >
          <option value="">All Clinics</option>
          {clinics.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
        </select>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search by tracking number or Lifefile order ID..."
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm transition-all focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
          />
        </div>
        <button onClick={handleSearch} className="rounded-xl bg-[#4fa77e] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-[#429468]">Search</button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-4 py-3 font-semibold text-gray-600">Lifefile ID</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Tracking Number</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Carrier</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Patient</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Clinic</th>
                <th className="px-4 py-3 font-semibold text-gray-600">{dateColumnLabel}</th>
                {(tab === 'in_transit' || tab === 'shipped') && <th className="px-4 py-3 font-semibold text-gray-600">Est. Delivery</th>}
                {tab === 'delivered' && <th className="px-4 py-3 font-semibold text-gray-600">Delivery Proof</th>}
                <th className="px-4 py-3 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={10} className="py-16 text-center"><div className="inline-flex items-center gap-3 text-gray-400"><div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-[#4fa77e]" />Loading shipments...</div></td></tr>
              ) : shipments.length === 0 ? (
                <tr><td colSpan={10} className="py-16 text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100"><PackageCheck className="h-6 w-6 text-gray-400" /></div><p className="font-medium text-gray-500">No shipments found</p><p className="mt-1 text-xs text-gray-400">{search ? 'Try a different search term' : 'No shipments match this filter'}</p></td></tr>
              ) : (
                shipments.map((s) => {
                  const badge = STATUS_BADGES[s.status] || STATUS_BADGES.PENDING;
                  const trackingUrl = getTrackingUrl(s.carrier, s.trackingNumber);
                  const isIssue = ['RETURNED', 'EXCEPTION', 'CANCELLED'].includes(s.status);
                  return (
                    <tr key={s.id} className={`transition-colors hover:bg-gray-50/50 ${isIssue ? 'bg-red-50/30' : ''}`}>
                      <td className="px-4 py-3"><span className="font-mono text-xs font-medium text-gray-800">{s.lifefileOrderId || '—'}</span></td>
                      <td className="px-4 py-3">
                        {trackingUrl ? (
                          <a href={trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-[#4fa77e] hover:underline">{s.trackingNumber}<ExternalLink className="h-3 w-3" /></a>
                        ) : (
                          <span className="font-mono text-xs text-gray-700">{s.trackingNumber}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.bg} ${badge.text}`}>{badge.label}</span>
                          {s.statusNote && <p className="mt-1 max-w-[200px] truncate text-[11px] text-gray-500" title={s.statusNote}>{s.statusNote}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700">{s.carrier}</td>
                      <td className="px-4 py-3">
                        {s.patientName ? (
                          s.patientId ? (
                            <a href={`/patients/${s.patientId}`} className="text-xs font-medium text-gray-800 hover:text-[#4fa77e] hover:underline">{s.patientName}</a>
                          ) : (
                            <span className="text-xs font-medium text-gray-800">{s.patientName}</span>
                          )
                        ) : <span className="text-xs text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">{s.clinicName || `Clinic #${s.clinicId}`}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{dateColumnValue(s)}</td>
                      {(tab === 'in_transit' || tab === 'shipped') && (
                        <td className="px-4 py-3 text-xs text-gray-600">
                          {s.estimatedDelivery && !isSameDay(s.estimatedDelivery, s.shippedAt) && !isSameDay(s.estimatedDelivery, s.createdAt) ? formatDate(s.estimatedDelivery) : '—'}
                        </td>
                      )}
                      {tab === 'delivered' && (
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            {s.signedBy && <span className="block text-xs text-gray-600">Received by: <span className="font-medium">{s.signedBy}</span></span>}
                            {s.deliveryPhotoUrl ? (
                              <a href={s.deliveryPhotoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-[#4fa77e] hover:underline">View Photo <ExternalLink className="h-3 w-3" /></a>
                            ) : s.deliveryDetails ? (
                              <span className="text-[11px] text-gray-400">Details captured</span>
                            ) : <span className="text-[11px] text-gray-400">—</span>}
                          </div>
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {s.patientId && <a href={`/patients/${s.patientId}`} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#4fa77e] hover:bg-[#4fa77e]/10">Patient</a>}
                          {s.orderId && <a href={`/admin/orders?id=${s.orderId}`} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100">Order</a>}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
            <span className="text-xs text-gray-500">Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total.toLocaleString()}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => handlePageChange(pagination.page - 1)} disabled={pagination.page <= 1} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
              {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => {
                const startPage = Math.max(1, Math.min(pagination.page - 2, pagination.totalPages - 4));
                const p = startPage + i;
                if (p > pagination.totalPages) return null;
                return <button key={p} onClick={() => handlePageChange(p)} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${p === pagination.page ? 'bg-[#4fa77e] text-white' : 'text-gray-500 hover:bg-gray-100'}`}>{p}</button>;
              })}
              <button onClick={() => handlePageChange(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
