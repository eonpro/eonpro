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
  medicationName: string | null;
  medicationStrength: string | null;
  signedBy: string | null;
  deliveryPhotoUrl: string | null;
  deliveryDetails: Record<string, unknown> | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

type Counts = Record<Tab, number>;

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

const TAB_CONFIG: { key: Tab; label: string; icon: typeof Package; color: string; activeColor: string }[] = [
  { key: 'label_created', label: 'Label Created', icon: Tag, color: 'text-blue-600', activeColor: 'bg-blue-600' },
  { key: 'shipped', label: 'Shipped', icon: Package, color: 'text-indigo-600', activeColor: 'bg-indigo-600' },
  { key: 'in_transit', label: 'In Transit', icon: Truck, color: 'text-yellow-600', activeColor: 'bg-yellow-600' },
  { key: 'out_for_delivery', label: 'Out for Delivery', icon: MapPin, color: 'text-orange-600', activeColor: 'bg-orange-600' },
  { key: 'delivered', label: 'Delivered', icon: CheckCircle2, color: 'text-emerald-600', activeColor: 'bg-emerald-600' },
  { key: 'issues', label: 'Issues', icon: AlertTriangle, color: 'text-red-600', activeColor: 'bg-red-600' },
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
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ShipmentMonitorPage() {
  const [tab, setTab] = useState<Tab>('label_created');
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [counts, setCounts] = useState<Counts>({ label_created: 0, shipped: 0, in_transit: 0, out_for_delivery: 0, delivered: 0, issues: 0 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bulkRefreshing, setBulkRefreshing] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ totalUpdated: number; totalDelivered: number; totalPolled: number; totalNoData: number } | null>(null);

  const fetchData = useCallback(async (currentTab: Tab, currentPage: number, currentSearch: string) => {
    try {
      const params = new URLSearchParams({ tab: currentTab, page: String(currentPage), limit: '25' });
      if (currentSearch.trim()) params.set('search', currentSearch.trim());
      const res = await apiFetch(`/api/super-admin/shipment-monitor?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setShipments(data.shipments || []);
      setPagination(data.pagination || { page: 1, limit: 25, total: 0, totalPages: 0 });
      setCounts(data.counts || { label_created: 0, shipped: 0, in_transit: 0, out_for_delivery: 0, delivered: 0, issues: 0 });
    } catch {
      setShipments([]);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchData(tab, 1, search).finally(() => setLoading(false));
  }, [tab, fetchData]);

  const handleSearch = () => {
    setLoading(true);
    fetchData(tab, 1, search).finally(() => setLoading(false));
  };

  const handlePageChange = (newPage: number) => {
    setLoading(true);
    fetchData(tab, newPage, search).finally(() => setLoading(false));
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData(tab, pagination.page, search);
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
        await fetchData(tab, pagination.page, search);
      }
    } catch {
      // Non-blocking
    } finally {
      setBulkRefreshing(false);
    }
  };

  const dateColumnLabel = (() => {
    switch (tab) {
      case 'delivered': return 'Delivered';
      case 'issues': return 'Last Update';
      default: return 'Shipped';
    }
  })();

  const dateColumnValue = (s: Shipment) => {
    switch (tab) {
      case 'delivered': return formatDate(s.actualDelivery);
      case 'issues': return timeSince(s.updatedAt);
      default: return formatDate(s.shippedAt || s.createdAt);
    }
  };

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Shipment Monitor</h1>
          <p className="mt-1 text-sm text-gray-500">Track every shipment from label creation through delivery across all clinics</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleBulkRefresh}
            disabled={bulkRefreshing}
            className="flex items-center gap-2 rounded-xl bg-[#4fa77e] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#429468] disabled:opacity-60"
          >
            {bulkRefreshing ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Refreshing...
              </>
            ) : (
              <>
                <Truck className="h-4 w-4" />
                Refresh All Tracking
              </>
            )}
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Reload
          </button>
        </div>
      </div>

      {/* Bulk refresh banners */}
      {bulkResult && (
        <div className={`mb-4 flex items-center justify-between rounded-xl border px-4 py-3 ${
          bulkResult.totalNoData > 0 && bulkResult.totalUpdated === 0
            ? 'border-amber-200 bg-amber-50'
            : 'border-emerald-200 bg-emerald-50'
        }`}>
          <div className={`flex items-center gap-2 text-sm ${
            bulkResult.totalNoData > 0 && bulkResult.totalUpdated === 0 ? 'text-amber-800' : 'text-emerald-800'
          }`}>
            {bulkResult.totalNoData > 0 && bulkResult.totalUpdated === 0 ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            <span>
              FedEx tracking: <strong>{bulkResult.totalPolled}</strong> sent to FedEx,{' '}
              <strong>{bulkResult.totalUpdated}</strong> updated,{' '}
              <strong>{bulkResult.totalDelivered}</strong> newly delivered
              {bulkResult.totalNoData > 0 && (
                <> · <strong>{bulkResult.totalNoData}</strong> returned no data from FedEx (tracking may not be available yet)</>
              )}
            </span>
          </div>
          <button onClick={() => setBulkResult(null)} className="text-xs hover:underline">Dismiss</button>
        </div>
      )}
      {bulkRefreshing && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
          Contacting FedEx Track API for up to 500 shipments... This may take 15–30 seconds.
        </div>
      )}

      {/* Tabs — individual per status */}
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm">
        {TAB_CONFIG.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.key;
          const count = counts[t.key] || 0;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                isActive
                  ? `${t.activeColor} text-white shadow-sm`
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? 'text-white' : t.color}`} />
              {t.label}
              <span
                className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : t.key === 'issues' && count > 0
                      ? 'bg-red-100 text-red-700'
                      : 'bg-gray-100 text-gray-600'
                }`}
              >
                {count.toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="mb-4 flex gap-3">
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
        <button onClick={handleSearch} className="rounded-xl bg-[#4fa77e] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-[#429468]">
          Search
        </button>
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
                <th className="px-4 py-3 font-semibold text-gray-600">Medication</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Clinic</th>
                <th className="px-4 py-3 font-semibold text-gray-600">{dateColumnLabel}</th>
                {(tab === 'in_transit' || tab === 'shipped') && (
                  <th className="px-4 py-3 font-semibold text-gray-600">Est. Delivery</th>
                )}
                {tab === 'delivered' && (
                  <th className="px-4 py-3 font-semibold text-gray-600">Delivery Proof</th>
                )}
                <th className="px-4 py-3 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center">
                    <div className="inline-flex items-center gap-3 text-gray-400">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-[#4fa77e]" />
                      Loading shipments...
                    </div>
                  </td>
                </tr>
              ) : shipments.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                      <PackageCheck className="h-6 w-6 text-gray-400" />
                    </div>
                    <p className="font-medium text-gray-500">No shipments found</p>
                    <p className="mt-1 text-xs text-gray-400">
                      {search ? 'Try a different search term' : 'No shipments match this filter'}
                    </p>
                  </td>
                </tr>
              ) : (
                shipments.map((s) => {
                  const badge = STATUS_BADGES[s.status] || STATUS_BADGES.PENDING;
                  const trackingUrl = getTrackingUrl(s.carrier, s.trackingNumber);
                  const isIssue = ['RETURNED', 'EXCEPTION', 'CANCELLED'].includes(s.status);

                  return (
                    <tr key={s.id} className={`transition-colors hover:bg-gray-50/50 ${isIssue ? 'bg-red-50/30' : ''}`}>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-medium text-gray-800">{s.lifefileOrderId || '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        {trackingUrl ? (
                          <a href={trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-[#4fa77e] hover:underline">
                            {s.trackingNumber}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="font-mono text-xs text-gray-700">{s.trackingNumber}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.bg} ${badge.text}`}>
                            {badge.label}
                          </span>
                          {s.statusNote && (
                            <p className="mt-1 max-w-[200px] truncate text-[11px] text-gray-500" title={s.statusNote}>{s.statusNote}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700">{s.carrier}</td>
                      <td className="px-4 py-3">
                        {s.medicationName ? (
                          <div>
                            <span className="text-xs font-medium text-gray-800">{s.medicationName}</span>
                            {s.medicationStrength && <span className="ml-1 text-xs text-gray-500">{s.medicationStrength}</span>}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">{s.clinicName || `Clinic #${s.clinicId}`}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{dateColumnValue(s)}</td>
                      {(tab === 'in_transit' || tab === 'shipped') && (
                        <td className="px-4 py-3 text-xs text-gray-600">
                          {s.estimatedDelivery && !isSameDay(s.estimatedDelivery, s.shippedAt) && !isSameDay(s.estimatedDelivery, s.createdAt)
                            ? formatDate(s.estimatedDelivery)
                            : '—'}
                        </td>
                      )}
                      {tab === 'delivered' && (
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            {s.signedBy && (
                              <span className="block text-xs text-gray-600">
                                Received by: <span className="font-medium">{s.signedBy}</span>
                              </span>
                            )}
                            {s.deliveryPhotoUrl ? (
                              <a href={s.deliveryPhotoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-[#4fa77e] hover:underline">
                                View Photo <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : s.deliveryDetails ? (
                              <span className="text-[11px] text-gray-400">Details captured</span>
                            ) : (
                              <span className="text-[11px] text-gray-400">—</span>
                            )}
                          </div>
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {s.patientId && (
                            <a href={`/patients/${s.patientId}`} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#4fa77e] hover:bg-[#4fa77e]/10">Patient</a>
                          )}
                          {s.orderId && (
                            <a href={`/admin/orders?id=${s.orderId}`} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100">Order</a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
            <span className="text-xs text-gray-500">
              Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total.toLocaleString()}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => handlePageChange(pagination.page - 1)} disabled={pagination.page <= 1} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-30">
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => {
                const startPage = Math.max(1, Math.min(pagination.page - 2, pagination.totalPages - 4));
                const p = startPage + i;
                if (p > pagination.totalPages) return null;
                return (
                  <button key={p} onClick={() => handlePageChange(p)} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${p === pagination.page ? 'bg-[#4fa77e] text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                    {p}
                  </button>
                );
              })}
              <button onClick={() => handlePageChange(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-30">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
