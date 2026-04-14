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
  Camera,
  X,
  ChevronDown,
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
  patientId: number | null;
  patientName: string | null;
  orderId: number | null;
  signedBy: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
type Counts = Record<Tab, number>;
interface Analytics {
  avgDeliveryDays: number | null;
  onTimeRate: number | null;
  shippedThisWeek: number;
  issueRate: number;
  totalShipments: number;
}

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

const TAB_CONFIG: {
  key: Tab;
  label: string;
  mobileLabel: string;
  icon: typeof Package;
  borderColor: string;
  iconColor: string;
  bgHover: string;
  activeBg: string;
  dotColor: string;
}[] = [
  {
    key: 'label_created',
    label: 'Label Created',
    mobileLabel: 'Label',
    icon: Tag,
    borderColor: 'border-l-blue-500',
    iconColor: 'text-blue-500',
    bgHover: 'hover:bg-blue-50/50',
    activeBg: 'bg-blue-50 text-blue-700 ring-blue-200',
    dotColor: 'bg-blue-500',
  },
  {
    key: 'shipped',
    label: 'Shipped',
    mobileLabel: 'Shipped',
    icon: Package,
    borderColor: 'border-l-indigo-500',
    iconColor: 'text-indigo-500',
    bgHover: 'hover:bg-indigo-50/50',
    activeBg: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
    dotColor: 'bg-indigo-500',
  },
  {
    key: 'in_transit',
    label: 'In Transit',
    mobileLabel: 'Transit',
    icon: Truck,
    borderColor: 'border-l-yellow-500',
    iconColor: 'text-yellow-600',
    bgHover: 'hover:bg-yellow-50/50',
    activeBg: 'bg-yellow-50 text-yellow-700 ring-yellow-200',
    dotColor: 'bg-yellow-500',
  },
  {
    key: 'out_for_delivery',
    label: 'Out for Delivery',
    mobileLabel: 'Out',
    icon: MapPin,
    borderColor: 'border-l-orange-500',
    iconColor: 'text-orange-500',
    bgHover: 'hover:bg-orange-50/50',
    activeBg: 'bg-orange-50 text-orange-700 ring-orange-200',
    dotColor: 'bg-orange-500',
  },
  {
    key: 'delivered',
    label: 'Delivered',
    mobileLabel: 'Done',
    icon: CheckCircle2,
    borderColor: 'border-l-emerald-500',
    iconColor: 'text-emerald-500',
    bgHover: 'hover:bg-emerald-50/50',
    activeBg: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    dotColor: 'bg-emerald-500',
  },
  {
    key: 'issues',
    label: 'Issues',
    mobileLabel: 'Issues',
    icon: AlertTriangle,
    borderColor: 'border-l-red-500',
    iconColor: 'text-red-500',
    bgHover: 'hover:bg-red-50/50',
    activeBg: 'bg-red-50 text-red-700 ring-red-200',
    dotColor: 'bg-red-500',
  },
];

const DATE_RANGES = [
  { value: '', label: 'All Time' },
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
];

function getTrackingUrl(carrier: string, tn: string): string | null {
  const c = carrier.toLowerCase();
  if (c.includes('fedex')) return `https://www.fedex.com/fedextrack/?trknbr=${tn}`;
  if (c.includes('ups')) return `https://www.ups.com/track?tracknum=${tn}`;
  if (c.includes('usps')) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${tn}`;
  return null;
}

function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
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

export default function AdminShipmentMonitorPage() {
  const [tab, setTab] = useState<Tab>('label_created');
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0,
  });
  const [counts, setCounts] = useState<Counts>({
    label_created: 0,
    shipped: 0,
    in_transit: 0,
    out_for_delivery: 0,
    delivered: 0,
    issues: 0,
  });
  const [analytics, setAnalytics] = useState<Analytics>({
    avgDeliveryDays: null,
    onTimeRate: null,
    shippedThisWeek: 0,
    issueRate: 0,
    totalShipments: 0,
  });
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showStats, setShowStats] = useState(false);

  const fetchData = useCallback(
    async (
      currentTab: Tab,
      currentPage: number,
      currentSearch: string,
      currentDateRange: string
    ) => {
      try {
        const params = new URLSearchParams({
          tab: currentTab,
          page: String(currentPage),
          limit: '25',
        });
        if (currentSearch.trim()) params.set('search', currentSearch.trim());
        if (currentDateRange) params.set('dateRange', currentDateRange);
        const res = await apiFetch(`/api/admin/shipment-monitor?${params}`);
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        setShipments(data.shipments || []);
        setPagination(data.pagination || { page: 1, limit: 25, total: 0, totalPages: 0 });
        setCounts(data.counts || ({} as Counts));
        setAnalytics(data.analytics || ({} as Analytics));
      } catch {
        setShipments([]);
      }
    },
    []
  );

  useEffect(() => {
    setLoading(true);
    fetchData(tab, 1, search, dateRange).finally(() => setLoading(false));
  }, [tab, dateRange, fetchData]);

  const handleSearch = () => {
    setLoading(true);
    fetchData(tab, 1, search, dateRange).finally(() => setLoading(false));
  };
  const handlePageChange = (p: number) => {
    setLoading(true);
    fetchData(tab, p, search, dateRange).finally(() => setLoading(false));
  };
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData(tab, pagination.page, search, dateRange);
    setRefreshing(false);
  };
  const handleExport = () => {
    const params = new URLSearchParams();
    if (tab) params.set('tab', tab);
    if (search.trim()) params.set('search', search.trim());
    if (dateRange) params.set('dateRange', dateRange);
    window.open(`/api/admin/shipment-monitor/export?${params}`, '_blank');
  };

  const dateColumnLabel =
    tab === 'delivered' ? 'Delivered' : tab === 'issues' ? 'Last Update' : 'Shipped';
  const dateColumnValue = (s: Shipment) =>
    tab === 'delivered'
      ? formatDate(s.actualDelivery)
      : tab === 'issues'
        ? timeSince(s.updatedAt)
        : formatDate(s.shippedAt || s.createdAt);
  const totalAll = Object.values(counts).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="p-4 pb-24 md:p-6 lg:p-8 lg:pb-8">
      {/* ──── MOBILE LAYOUT (< md) ──── */}
      <div className="md:hidden">
        {/* Mobile Header */}
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">Shipments</h1>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleExport}
              className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm active:bg-gray-50"
            >
              <Download className="h-4 w-4 text-gray-600" />
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm active:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 text-gray-600 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Mobile Pill Tabs — compact horizontal scroll */}
        <div className="-mx-4 mb-3">
          <div
            className="flex gap-1.5 overflow-x-auto px-4 pb-1"
            style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
          >
            {TAB_CONFIG.map((t) => {
              const isActive = tab === t.key;
              const count = counts[t.key] || 0;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                    isActive
                      ? `${t.activeBg} ring-1`
                      : 'bg-white text-gray-500 ring-1 ring-gray-200 active:bg-gray-50'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${isActive ? t.dotColor : 'bg-gray-300'}`}
                  />
                  {t.mobileLabel}
                  <span className={`tabular-nums ${isActive ? 'opacity-100' : 'opacity-60'}`}>
                    {count.toLocaleString()}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Mobile Search — inline with date filter */}
        <div className="mb-3 flex gap-2">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="w-[90px] shrink-0 rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs text-gray-600 shadow-sm"
          >
            {DATE_RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search..."
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-3 text-xs shadow-sm focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]/30"
            />
          </div>
          <button
            onClick={handleSearch}
            className="shrink-0 rounded-lg bg-[#4fa77e] px-3 py-2 text-xs font-semibold text-white shadow-sm active:bg-[#429468]"
          >
            Go
          </button>
        </div>

        {/* Collapsible Stats */}
        <button
          onClick={() => setShowStats(!showStats)}
          className="mb-3 flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm active:bg-gray-50"
        >
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-gray-400" />
            <span className="text-xs font-medium text-gray-600">Stats & Analytics</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">
              {analytics.avgDeliveryDays != null ? `${analytics.avgDeliveryDays}d avg` : ''}
            </span>
            <ChevronDown
              className={`h-4 w-4 text-gray-400 transition-transform ${showStats ? 'rotate-180' : ''}`}
            />
          </div>
        </button>

        {showStats && (
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-50">
                  <Clock className="h-3.5 w-3.5 text-blue-600" />
                </div>
                <div>
                  <p className="text-[10px] font-medium text-gray-400">Avg Delivery</p>
                  <p className="text-sm font-bold text-gray-900">
                    {analytics.avgDeliveryDays != null ? `${analytics.avgDeliveryDays}d` : '—'}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-md ${analytics.onTimeRate != null && analytics.onTimeRate >= 90 ? 'bg-emerald-50' : 'bg-amber-50'}`}
                >
                  <TrendingUp
                    className={`h-3.5 w-3.5 ${analytics.onTimeRate != null && analytics.onTimeRate >= 90 ? 'text-emerald-600' : 'text-amber-600'}`}
                  />
                </div>
                <div>
                  <p className="text-[10px] font-medium text-gray-400">On-Time</p>
                  <p
                    className={`text-sm font-bold ${analytics.onTimeRate != null && analytics.onTimeRate >= 90 ? 'text-emerald-700' : 'text-amber-700'}`}
                  >
                    {analytics.onTimeRate != null ? `${analytics.onTimeRate}%` : '—'}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-50">
                  <Package className="h-3.5 w-3.5 text-indigo-600" />
                </div>
                <div>
                  <p className="text-[10px] font-medium text-gray-400">This Week</p>
                  <p className="text-sm font-bold text-gray-900">
                    {analytics.shippedThisWeek.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-md ${analytics.issueRate > 1 ? 'bg-red-50' : 'bg-gray-50'}`}
                >
                  <ShieldAlert
                    className={`h-3.5 w-3.5 ${analytics.issueRate > 1 ? 'text-red-600' : 'text-gray-500'}`}
                  />
                </div>
                <div>
                  <p className="text-[10px] font-medium text-gray-400">Issue Rate</p>
                  <p
                    className={`text-sm font-bold ${analytics.issueRate > 1 ? 'text-red-700' : 'text-gray-900'}`}
                  >
                    {analytics.issueRate}%
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Result count */}
        {!loading && shipments.length > 0 && (
          <p className="mb-2 text-[11px] text-gray-400">
            {pagination.total.toLocaleString()} shipments
          </p>
        )}

        {/* Mobile Shipment Cards */}
        <div className="space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex items-center gap-3 text-gray-400">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-[#4fa77e]" />
                <span className="text-sm">Loading...</span>
              </div>
            </div>
          ) : shipments.length === 0 ? (
            <div className="py-20 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                <PackageCheck className="h-6 w-6 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-500">No shipments found</p>
              <p className="mt-1 text-xs text-gray-400">Try changing the filter or search</p>
            </div>
          ) : (
            shipments.map((s) => {
              const badge = STATUS_BADGES[s.status] || STATUS_BADGES.PENDING;
              const trackingUrl = getTrackingUrl(s.carrier, s.trackingNumber);
              const isIssue = ['RETURNED', 'EXCEPTION', 'CANCELLED'].includes(s.status);
              return (
                <div
                  key={s.id}
                  className={`rounded-xl border bg-white shadow-sm ${isIssue ? 'border-red-200' : 'border-gray-100'}`}
                >
                  {/* Card header */}
                  <div className="flex items-center justify-between px-3.5 pb-0 pt-3">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span
                        className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.bg} ${badge.text}`}
                      >
                        {badge.label}
                      </span>
                      <span className="truncate text-[11px] text-gray-400">{s.carrier}</span>
                    </div>
                    <span className="shrink-0 text-[11px] text-gray-400">{dateColumnValue(s)}</span>
                  </div>

                  {/* Card body */}
                  <div className="px-3.5 py-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="min-w-0 truncate font-mono text-[13px] font-semibold text-gray-900">
                        {s.trackingNumber}
                      </p>
                      {trackingUrl && (
                        <a
                          href={trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-[#4fa77e] active:underline"
                        >
                          Track
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    {s.statusNote && (
                      <p className="mt-0.5 truncate text-[11px] text-gray-400">{s.statusNote}</p>
                    )}

                    <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-500">
                      {s.lifefileOrderId && (
                        <span className="font-mono">ID: {s.lifefileOrderId}</span>
                      )}
                      {s.patientName && (
                        <>
                          <span className="text-gray-300">·</span>
                          {s.patientId ? (
                            <a
                              href={`/patients/${s.patientId}`}
                              className="font-medium text-gray-700 active:text-[#4fa77e]"
                            >
                              {s.patientName}
                            </a>
                          ) : (
                            <span className="font-medium text-gray-700">{s.patientName}</span>
                          )}
                        </>
                      )}
                      {(tab === 'in_transit' || tab === 'shipped') &&
                        s.estimatedDelivery &&
                        !isSameDay(s.estimatedDelivery, s.shippedAt) && (
                          <>
                            <span className="text-gray-300">·</span>
                            <span>ETA {formatDate(s.estimatedDelivery)}</span>
                          </>
                        )}
                    </div>
                  </div>

                  {/* Card footer — actions */}
                  {(s.patientId || s.orderId || tab === 'delivered') && (
                    <div className="flex items-center gap-1.5 border-t border-gray-50 px-3.5 py-2">
                      {s.patientId && (
                        <a
                          href={`/patients/${s.patientId}`}
                          className="rounded-md bg-[#4fa77e]/10 px-2.5 py-1 text-[11px] font-semibold text-[#4fa77e] active:bg-[#4fa77e]/20"
                        >
                          Patient
                        </a>
                      )}
                      {s.orderId && (
                        <a
                          href={`/admin/orders?id=${s.orderId}`}
                          className="rounded-md bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600 active:bg-gray-200"
                        >
                          Order
                        </a>
                      )}
                      {tab === 'delivered' && (
                        <a
                          href={`https://www.fedex.com/fedextrack/?trknbr=${s.trackingNumber}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-auto flex items-center gap-1 rounded-md bg-[#4fa77e]/10 px-2.5 py-1 text-[11px] font-semibold text-[#4fa77e] active:bg-[#4fa77e]/20"
                        >
                          <Camera className="h-3 w-3" />
                          Photo
                        </a>
                      )}
                      {tab === 'delivered' && s.signedBy && s.signedBy !== 'Signature Not Req' && (
                        <span className="ml-auto text-[10px] text-gray-400">
                          Signed: {s.signedBy}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Mobile Pagination */}
        {pagination.totalPages > 1 && (
          <div className="mt-3 flex items-center justify-between">
            <button
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium text-gray-500 active:bg-white disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </button>
            <span className="text-[11px] tabular-nums text-gray-400">
              {(pagination.page - 1) * pagination.limit + 1}–
              {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
              {pagination.total.toLocaleString()}
            </span>
            <button
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium text-gray-500 active:bg-white disabled:opacity-30"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* ──── DESKTOP LAYOUT (md+) ──── */}
      <div className="hidden md:block">
        {/* Desktop Header */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Shipments</h1>
            <p className="mt-1 text-sm text-gray-500">
              Track shipments from label creation through delivery
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50"
            >
              <Download className="h-4 w-4" />
              Export CSV
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

        {/* Desktop Status Cards */}
        <div className="mb-6 grid grid-cols-3 gap-3 xl:grid-cols-6">
          {TAB_CONFIG.map((t) => {
            const Icon = t.icon;
            const isActive = tab === t.key;
            const count = counts[t.key] || 0;
            const pct = ((count / totalAll) * 100).toFixed(1);
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex flex-col rounded-xl border-l-4 bg-white p-4 text-left shadow-sm transition-all ${t.borderColor} ${t.bgHover} ${isActive ? 'shadow-md ring-2 ring-[#4fa77e]' : 'border border-b border-r border-t border-gray-100'}`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <Icon className={`h-5 w-5 ${t.iconColor}`} />
                  {t.key === 'issues' && count > 0 && (
                    <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                      !
                    </span>
                  )}
                </div>
                <span className="text-2xl font-bold text-gray-900">{count.toLocaleString()}</span>
                <span className="mt-0.5 text-xs font-medium text-gray-500">{t.label}</span>
                <span className="mt-1 text-[11px] text-gray-400">{pct}% of total</span>
              </button>
            );
          })}
        </div>

        {/* Desktop KPI Row */}
        <div className="mb-6 grid grid-cols-4 gap-3">
          <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
              <Clock className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Avg Delivery Time</p>
              <p className="text-lg font-bold text-gray-900">
                {analytics.avgDeliveryDays != null ? `${analytics.avgDeliveryDays} days` : '—'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-lg ${analytics.onTimeRate != null && analytics.onTimeRate >= 90 ? 'bg-emerald-50' : 'bg-amber-50'}`}
            >
              <TrendingUp
                className={`h-5 w-5 ${analytics.onTimeRate != null && analytics.onTimeRate >= 90 ? 'text-emerald-600' : 'text-amber-600'}`}
              />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">On-Time Rate</p>
              <p
                className={`text-lg font-bold ${analytics.onTimeRate != null && analytics.onTimeRate >= 90 ? 'text-emerald-700' : 'text-amber-700'}`}
              >
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
              <p className="text-lg font-bold text-gray-900">
                {analytics.shippedThisWeek.toLocaleString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-lg ${analytics.issueRate > 1 ? 'bg-red-50' : 'bg-gray-50'}`}
            >
              <ShieldAlert
                className={`h-5 w-5 ${analytics.issueRate > 1 ? 'text-red-600' : 'text-gray-500'}`}
              />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Issue Rate</p>
              <p
                className={`text-lg font-bold ${analytics.issueRate > 1 ? 'text-red-700' : 'text-gray-900'}`}
              >
                {analytics.issueRate}%
              </p>
            </div>
          </div>
        </div>

        {/* Desktop Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
          >
            {DATE_RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
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
          <button
            onClick={handleSearch}
            className="rounded-xl bg-[#4fa77e] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-[#429468]"
          >
            Search
          </button>
        </div>

        {/* Desktop Table */}
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
                    <td colSpan={9} className="py-16 text-center">
                      <div className="inline-flex items-center gap-3 text-gray-400">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-[#4fa77e]" />
                        Loading...
                      </div>
                    </td>
                  </tr>
                ) : shipments.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-16 text-center">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                        <PackageCheck className="h-6 w-6 text-gray-400" />
                      </div>
                      <p className="font-medium text-gray-500">No shipments found</p>
                    </td>
                  </tr>
                ) : (
                  shipments.map((s) => {
                    const badge = STATUS_BADGES[s.status] || STATUS_BADGES.PENDING;
                    const trackingUrl = getTrackingUrl(s.carrier, s.trackingNumber);
                    const isIssue = ['RETURNED', 'EXCEPTION', 'CANCELLED'].includes(s.status);
                    return (
                      <tr
                        key={s.id}
                        className={`transition-colors hover:bg-gray-50/50 ${isIssue ? 'bg-red-50/30' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-medium text-gray-800">
                            {s.lifefileOrderId || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {trackingUrl ? (
                            <a
                              href={trackingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-mono text-xs text-[#4fa77e] hover:underline"
                            >
                              {s.trackingNumber}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="font-mono text-xs text-gray-700">
                              {s.trackingNumber}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.bg} ${badge.text}`}
                          >
                            {badge.label}
                          </span>
                          {s.statusNote && (
                            <p
                              className="mt-1 max-w-[200px] truncate text-[11px] text-gray-500"
                              title={s.statusNote}
                            >
                              {s.statusNote}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-700">{s.carrier}</td>
                        <td className="px-4 py-3">
                          {s.patientName ? (
                            s.patientId ? (
                              <a
                                href={`/patients/${s.patientId}`}
                                className="text-xs font-medium text-gray-800 hover:text-[#4fa77e] hover:underline"
                              >
                                {s.patientName}
                              </a>
                            ) : (
                              <span className="text-xs font-medium text-gray-800">
                                {s.patientName}
                              </span>
                            )
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">{dateColumnValue(s)}</td>
                        {(tab === 'in_transit' || tab === 'shipped') && (
                          <td className="px-4 py-3 text-xs text-gray-600">
                            {s.estimatedDelivery && !isSameDay(s.estimatedDelivery, s.shippedAt)
                              ? formatDate(s.estimatedDelivery)
                              : '—'}
                          </td>
                        )}
                        {tab === 'delivered' && (
                          <td className="px-4 py-3">
                            <div className="space-y-1">
                              {s.signedBy && s.signedBy !== 'Signature Not Req' && (
                                <span className="block text-xs text-gray-600">
                                  Signed: <span className="font-medium">{s.signedBy}</span>
                                </span>
                              )}
                              <a
                                href={`https://www.fedex.com/fedextrack/?trknbr=${s.trackingNumber}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-lg bg-[#4fa77e]/10 px-2.5 py-1.5 text-xs font-medium text-[#4fa77e] transition-all hover:bg-[#4fa77e]/20"
                              >
                                <Camera className="h-3.5 w-3.5" />
                                View Photo
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {s.patientId && (
                              <a
                                href={`/patients/${s.patientId}`}
                                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#4fa77e] hover:bg-[#4fa77e]/10"
                              >
                                Patient
                              </a>
                            )}
                            {s.orderId && (
                              <a
                                href={`/admin/orders?id=${s.orderId}`}
                                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                              >
                                Order
                              </a>
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
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
              <span className="text-xs text-gray-500">
                Showing {(pagination.page - 1) * pagination.limit + 1}–
                {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                {pagination.total.toLocaleString()}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => {
                  const startPage = Math.max(
                    1,
                    Math.min(pagination.page - 2, pagination.totalPages - 4)
                  );
                  const p = startPage + i;
                  if (p > pagination.totalPages) return null;
                  return (
                    <button
                      key={p}
                      onClick={() => handlePageChange(p)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium ${p === pagination.page ? 'bg-[#4fa77e] text-white' : 'text-gray-500 hover:bg-gray-100'}`}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
