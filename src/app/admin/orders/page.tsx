'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import {
  Package,
  Filter,
  Eye,
  CheckCircle,
  Clock,
  XCircle,
  Plus,
  Truck,
  ExternalLink,
  Loader2,
  MessageSquare,
  MessageSquareX,
  Send,
  ChevronLeft,
  ChevronRight,
  Hourglass,
  AlertTriangle,
  BarChart3,
  Timer,
  MoreVertical,
  PackagePlus,
  Ban,
  PackageCheck,
  Lock,
  X,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

type ActiveTab = 'tracked' | 'awaiting';

interface OrderWithTracking {
  id: number;
  patient: {
    id: number;
    firstName: string;
    lastName: string;
  };
  primaryMedName: string | null;
  primaryMedStrength: string | null;
  status: string | null;
  shippingStatus: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  createdAt: string;
  updatedAt?: string;
  lastWebhookAt?: string | null;
  lifefileOrderId?: string | null;
  smsStatus?: string | null;
  _isShipmentOnly?: boolean;
  _shipmentId?: number;
}

interface AwaitingStats {
  totalAwaiting: number;
  avgWaitDays: number;
  maxWaitDays: number;
}

type DispositionAction = 'add_tracking' | 'cancel' | 'completed';

interface DispositionTarget {
  orderId: number;
  action: DispositionAction;
  patientName: string;
  medName: string | null;
}

function getAgingDays(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
}

function getAgingColor(days: number): string {
  if (days <= 3) return 'bg-green-100 text-green-800';
  if (days <= 7) return 'bg-yellow-100 text-yellow-800';
  if (days <= 14) return 'bg-orange-100 text-orange-800';
  return 'bg-red-100 text-red-800';
}

function getAgingLabel(days: number): string {
  if (days <= 3) return 'Normal';
  if (days <= 7) return 'Watch';
  if (days <= 14) return 'Delayed';
  return 'Critical';
}

function getStatusIcon(status: string | null) {
  const s = status?.toLowerCase() || '';
  switch (s) {
    case 'delivered':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'processing':
    case 'shipped':
    case 'in_transit':
      return <Truck className="h-4 w-4 text-blue-500" />;
    case 'pending':
    case 'sent':
      return <Clock className="h-4 w-4 text-yellow-500" />;
    case 'cancelled':
    case 'error':
      return <XCircle className="h-4 w-4 text-red-500" />;
    default:
      return <Package className="h-4 w-4 text-gray-500" />;
  }
}

function getStatusColor(status: string | null) {
  const s = status?.toLowerCase() || '';
  switch (s) {
    case 'delivered':
      return 'bg-green-100 text-green-800';
    case 'processing':
      return 'bg-blue-100 text-blue-800';
    case 'shipped':
    case 'in_transit':
      return 'bg-[var(--brand-primary-light)] text-[var(--brand-primary)]';
    case 'pending':
    case 'sent':
      return 'bg-yellow-100 text-yellow-800';
    case 'cancelled':
    case 'error':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

function formatDate(dateString: string) {
  const d = new Date(dateString);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

export default function AdminOrdersPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('tracked');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pageSize, setPageSize] = useState(20);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Tracked tab state
  const [trackedOrders, setTrackedOrders] = useState<OrderWithTracking[]>([]);
  const [trackedLoading, setTrackedLoading] = useState(true);
  const [trackedError, setTrackedError] = useState<string | null>(null);
  const [trackedPage, setTrackedPage] = useState(1);
  const [trackedTotal, setTrackedTotal] = useState(0);
  const [trackedHasMore, setTrackedHasMore] = useState(false);

  // Awaiting tab state
  const [awaitingOrders, setAwaitingOrders] = useState<OrderWithTracking[]>([]);
  const [awaitingLoading, setAwaitingLoading] = useState(true);
  const [awaitingError, setAwaitingError] = useState<string | null>(null);
  const [awaitingPage, setAwaitingPage] = useState(1);
  const [awaitingTotal, setAwaitingTotal] = useState(0);
  const [awaitingHasMore, setAwaitingHasMore] = useState(false);
  const [awaitingStats, setAwaitingStats] = useState<AwaitingStats | null>(null);

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  // Reset pages when search or pageSize change
  useEffect(() => {
    setTrackedPage(1);
    setAwaitingPage(1);
  }, [debouncedSearch, pageSize]);

  // Fetch tracked orders
  const fetchTrackedOrders = useCallback(async () => {
    try {
      setTrackedLoading(true);
      setTrackedError(null);
      const params = new URLSearchParams({
        hasTrackingNumber: 'true',
        page: String(trackedPage),
        pageSize: String(pageSize),
      });
      if (debouncedSearch.trim()) {
        params.set('search', debouncedSearch.trim());
      }
      const response = await apiFetch(`/api/orders/list?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch tracked orders');
      const data = await response.json();
      setTrackedOrders(data.orders || []);
      setTrackedTotal(data.total ?? 0);
      setTrackedHasMore(data.hasMore ?? false);
    } catch (err) {
      setTrackedError(err instanceof Error ? err.message : 'Failed to load tracked orders');
    } finally {
      setTrackedLoading(false);
    }
  }, [debouncedSearch, trackedPage, pageSize]);

  // Fetch awaiting orders
  const fetchAwaitingOrders = useCallback(async () => {
    try {
      setAwaitingLoading(true);
      setAwaitingError(null);
      const params = new URLSearchParams({
        awaitingFulfillment: 'true',
        page: String(awaitingPage),
        pageSize: String(pageSize),
      });
      if (debouncedSearch.trim()) {
        params.set('search', debouncedSearch.trim());
      }
      const response = await apiFetch(`/api/orders/list?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch awaiting orders');
      const data = await response.json();
      setAwaitingOrders(data.orders || []);
      setAwaitingTotal(data.total ?? 0);
      setAwaitingHasMore(data.hasMore ?? false);
      setAwaitingStats(data.stats ?? null);
    } catch (err) {
      setAwaitingError(err instanceof Error ? err.message : 'Failed to load awaiting orders');
    } finally {
      setAwaitingLoading(false);
    }
  }, [debouncedSearch, awaitingPage, pageSize]);

  // Fetch both on mount and when dependencies change
  useEffect(() => {
    fetchTrackedOrders();
  }, [fetchTrackedOrders]);

  useEffect(() => {
    fetchAwaitingOrders();
  }, [fetchAwaitingOrders]);

  // Client-side status filter for tracked orders
  const filteredTrackedOrders = useMemo(
    () =>
      trackedOrders.filter((order) => {
        const orderStatus = order.shippingStatus || order.status || '';
        return statusFilter === 'all' || orderStatus.toLowerCase() === statusFilter.toLowerCase();
      }),
    [trackedOrders, statusFilter]
  );

  // Active tab state shortcuts
  const orders = activeTab === 'tracked' ? filteredTrackedOrders : awaitingOrders;
  const loading = activeTab === 'tracked' ? trackedLoading : awaitingLoading;
  const error = activeTab === 'tracked' ? trackedError : awaitingError;
  const page = activeTab === 'tracked' ? trackedPage : awaitingPage;
  const total = activeTab === 'tracked' ? trackedTotal : awaitingTotal;
  const hasMore = activeTab === 'tracked' ? trackedHasMore : awaitingHasMore;
  const setPage = activeTab === 'tracked' ? setTrackedPage : setAwaitingPage;
  const refetch = activeTab === 'tracked' ? fetchTrackedOrders : fetchAwaitingOrders;

  // Disposition modal state
  const [dispositionTarget, setDispositionTarget] = useState<DispositionTarget | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleTabChange = (tab: ActiveTab) => {
    setActiveTab(tab);
    setStatusFilter('all');
  };

  const handleDispositionRequest = (target: DispositionTarget) => {
    setDispositionTarget(target);
  };

  const handleDispositionSuccess = (message: string) => {
    setDispositionTarget(null);
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 4000);
    fetchAwaitingOrders();
    fetchTrackedOrders();
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] p-6">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
          <p className="mt-1 text-gray-600">Manage prescriptions and pharmacy fulfillment</p>
        </div>
        <Link
          href="/admin/orders/new"
          className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2 text-white shadow-md transition-all hover:from-emerald-600 hover:to-teal-700 hover:shadow-lg"
        >
          <Plus className="h-5 w-5" />
          New Order
        </Link>
      </div>

      {/* Tab Switcher */}
      <div className="mb-6 flex gap-1 rounded-xl border border-gray-200 bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => handleTabChange('tracked')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
            activeTab === 'tracked'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Truck className="h-4 w-4" />
          With Tracking
          {!trackedLoading && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                activeTab === 'tracked'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-gray-200 text-gray-600'
              }`}
            >
              {trackedTotal}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('awaiting')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
            activeTab === 'awaiting'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Hourglass className="h-4 w-4" />
          Awaiting Fulfillment
          {!awaitingLoading && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                activeTab === 'awaiting'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-gray-200 text-gray-600'
              }`}
            >
              {awaitingTotal}
            </span>
          )}
        </button>
      </div>

      {/* Awaiting Stats Bar */}
      {activeTab === 'awaiting' && awaitingStats && !awaitingLoading && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
              <Package className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Awaiting</p>
              <p className="text-xl font-bold text-gray-900">{awaitingStats.totalAwaiting}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
              <BarChart3 className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Avg Wait Time</p>
              <p className="text-xl font-bold text-gray-900">
                {awaitingStats.avgWaitDays} <span className="text-sm font-normal text-gray-500">days</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                awaitingStats.maxWaitDays >= 14 ? 'bg-red-100' : 'bg-gray-100'
              }`}
            >
              <Timer
                className={`h-5 w-5 ${
                  awaitingStats.maxWaitDays >= 14 ? 'text-red-600' : 'text-gray-600'
                }`}
              />
            </div>
            <div>
              <p className="text-sm text-gray-500">Longest Wait</p>
              <p
                className={`text-xl font-bold ${
                  awaitingStats.maxWaitDays >= 14 ? 'text-red-600' : 'text-gray-900'
                }`}
              >
                {awaitingStats.maxWaitDays}{' '}
                <span
                  className={`text-sm font-normal ${
                    awaitingStats.maxWaitDays >= 14 ? 'text-red-400' : 'text-gray-500'
                  }`}
                >
                  days
                </span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search orders..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full rounded-lg border border-gray-300 py-2 pl-4 pr-4 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          {activeTab === 'tracked' && (
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="shipped">Shipped</option>
                <option value="in_transit">In Transit</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-emerald-500" />
          <p className="text-gray-500">Loading orders...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-red-700">{error}</p>
          <button
            onClick={refetch}
            className="mt-2 text-sm text-red-600 underline hover:text-red-700"
          >
            Try again
          </button>
        </div>
      )}

      {/* Table */}
      {!loading && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full">
            <thead className="bg-gray-50">
              {activeTab === 'tracked' ? (
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Order ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Patient
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Medication
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Tracking
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    SMS
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              ) : (
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Order ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Patient
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Medication
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Submitted
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Aging
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-gray-200">
              {orders.length === 0 ? (
                <tr>
                  <td
                    colSpan={activeTab === 'tracked' ? 8 : 7}
                    className="px-6 py-12 text-center"
                  >
                    {activeTab === 'tracked' ? (
                      <>
                        <Package className="mx-auto mb-4 h-12 w-12 text-gray-300" />
                        <p className="text-sm text-gray-500">No orders found</p>
                        <p className="mt-1 text-xs text-gray-400">
                          Orders with tracking numbers will appear here
                        </p>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="mx-auto mb-4 h-12 w-12 text-green-300" />
                        <p className="text-sm text-gray-500">No prescriptions awaiting fulfillment</p>
                        <p className="mt-1 text-xs text-gray-400">
                          All sent prescriptions have tracking numbers
                        </p>
                      </>
                    )}
                  </td>
                </tr>
              ) : activeTab === 'tracked' ? (
                filteredTrackedOrders.map((order) => (
                  <TrackedOrderRow key={order._isShipmentOnly ? `ship-${order._shipmentId}` : order.id} order={order} />
                ))
              ) : (
                awaitingOrders.map((order) => (
                  <AwaitingOrderRow key={order.id} order={order} onDisposition={handleDispositionRequest} />
                ))
              )}
            </tbody>
          </table>

          {/* Pagination */}
          {!loading && total > 0 && (
            <div className="flex flex-col gap-4 border-t border-gray-200 bg-gray-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600">
                  Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
                </span>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  Per page
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {[10, 20, 50, 100].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </button>
                <span className="text-sm text-gray-600">
                  Page {page} of {Math.max(1, Math.ceil(total / pageSize))}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!hasMore}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Success Toast */}
      {successMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 shadow-lg">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <span className="text-sm font-medium text-green-800">{successMessage}</span>
        </div>
      )}

      {/* Disposition Modal */}
      {dispositionTarget && (
        <DispositionModal
          target={dispositionTarget}
          onClose={() => setDispositionTarget(null)}
          onSuccess={handleDispositionSuccess}
        />
      )}
    </div>
  );
}

// =============================================================================
// Disposition Modal
// =============================================================================

function DispositionModal({
  target,
  onClose,
  onSuccess,
}: {
  target: DispositionTarget;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [password, setPassword] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [carrier, setCarrier] = useState('');
  const [carrierAutoDetected, setCarrierAutoDetected] = useState(false);
  const [trackingUrl, setTrackingUrl] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detectCarrier = useCallback((num: string) => {
    const t = num.trim().replace(/\s/g, '');
    if (!t) return;
    // UPS: starts with 1Z, 18-25 alphanumeric
    if (/^1Z[A-Z0-9]{16,22}$/i.test(t)) {
      setCarrier('UPS');
      setCarrierAutoDetected(true);
      setTrackingUrl(`https://www.ups.com/track?tracknum=${t}`);
      return;
    }
    // FedEx: 12, 15, 20, or 22 digits
    if (/^\d{12}$|^\d{15}$|^\d{20}$|^\d{22}$/.test(t)) {
      setCarrier('FedEx');
      setCarrierAutoDetected(true);
      setTrackingUrl(`https://www.fedex.com/fedextrack/?trknbr=${t}`);
      return;
    }
    // USPS: 20-22 digits, or starts with 94/93/92 + 20-22 digits
    if (/^(94|93|92|42)\d{18,28}$/.test(t) || /^\d{20,22}$/.test(t)) {
      setCarrier('USPS');
      setCarrierAutoDetected(true);
      setTrackingUrl(`https://tools.usps.com/go/TrackConfirmAction?tLabels=${t}`);
      return;
    }
    // DHL: 10 digits or starts with JD/JJD + 18 digits
    if (/^\d{10}$/.test(t) || /^(JD|JJD)\d{18,}$/i.test(t)) {
      setCarrier('DHL');
      setCarrierAutoDetected(true);
      setTrackingUrl(`https://www.dhl.com/us-en/home/tracking.html?tracking-id=${t}`);
      return;
    }
    setCarrierAutoDetected(false);
  }, []);

  const handleTrackingNumberChange = useCallback((value: string) => {
    setTrackingNumber(value);
    detectCarrier(value);
  }, [detectCarrier]);

  const titles: Record<DispositionAction, string> = {
    add_tracking: 'Add Tracking Number',
    cancel: 'Cancel Order',
    completed: 'Mark as Completed',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password.trim()) {
      setError('Admin password is required');
      return;
    }

    if (target.action === 'add_tracking' && (!trackingNumber.trim() || !carrier.trim())) {
      setError('Tracking number and carrier are required');
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, string> = {
        action: target.action,
        password,
      };

      if (target.action === 'add_tracking') {
        body.trackingNumber = trackingNumber.trim();
        body.carrier = carrier.trim();
        if (trackingUrl.trim()) body.trackingUrl = trackingUrl.trim();
      }

      if (reason.trim()) body.reason = reason.trim();
      if (notes.trim()) body.notes = notes.trim();

      const response = await apiFetch(`/api/orders/${target.orderId}/disposition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to process action');
        return;
      }

      const messages: Record<DispositionAction, string> = {
        add_tracking: `Tracking added for order #${target.orderId}`,
        cancel: `Order #${target.orderId} cancelled`,
        completed: `Order #${target.orderId} marked completed`,
      };

      onSuccess(data.warning ? `${messages[target.action]} — ${data.warning}` : messages[target.action]);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{titles[target.action]}</h3>
            <p className="mt-0.5 text-sm text-gray-500">
              Order #{target.orderId} &middot; {target.patientName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-4">
          {target.medName && (
            <div className="mb-4 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
              {target.medName}
            </div>
          )}

          {/* Action-specific fields */}
          {target.action === 'add_tracking' && (
            <div className="mb-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Tracking Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={trackingNumber}
                  onChange={(e) => handleTrackingNumberChange(e.target.value)}
                  placeholder="e.g., 1ZV948J10332806643"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Carrier <span className="text-red-500">*</span>
                  {carrierAutoDetected && carrier && (
                    <span className="ml-2 text-xs font-normal text-emerald-600">Auto-detected</span>
                  )}
                </label>
                <select
                  value={carrier}
                  onChange={(e) => { setCarrier(e.target.value); setCarrierAutoDetected(false); }}
                  className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                    carrierAutoDetected ? 'border-emerald-300 bg-emerald-50' : 'border-gray-300'
                  }`}
                >
                  <option value="">Select carrier...</option>
                  <option value="UPS">UPS</option>
                  <option value="FedEx">FedEx</option>
                  <option value="USPS">USPS</option>
                  <option value="DHL">DHL</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              {trackingUrl && (
                <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                  Tracking URL auto-generated: <span className="font-mono text-gray-700">{trackingUrl.length > 50 ? trackingUrl.slice(0, 50) + '...' : trackingUrl}</span>
                </div>
              )}
            </div>
          )}

          {(target.action === 'cancel' || target.action === 'completed') && (
            <div className="mb-4 space-y-3">
              {target.action === 'cancel' && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
                  <p className="text-sm text-red-700">
                    This will cancel the order in LifeFile and void any associated compensation and fees.
                  </p>
                </div>
              )}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Reason</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Select a reason...</option>
                  {target.action === 'cancel' ? (
                    <>
                      <option value="patient_request">Patient request</option>
                      <option value="provider_request">Provider request</option>
                      <option value="duplicate_order">Duplicate order</option>
                      <option value="pharmacy_issue">Pharmacy issue</option>
                      <option value="other">Other</option>
                    </>
                  ) : (
                    <>
                      <option value="picked_up">Picked up in person</option>
                      <option value="fulfilled_externally">Fulfilled externally</option>
                      <option value="tracking_not_needed">Tracking not needed</option>
                      <option value="other">Other</option>
                    </>
                  )}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes..."
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          )}

          {/* Password confirmation */}
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Lock className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-800">Admin Verification Required</span>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password to confirm"
              className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              autoFocus={target.action !== 'add_tracking'}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-50 ${
                target.action === 'cancel'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Lock className="h-4 w-4" />
              )}
              {submitting
                ? 'Processing...'
                : target.action === 'add_tracking'
                  ? 'Add Tracking'
                  : target.action === 'cancel'
                    ? 'Cancel Order'
                    : 'Mark Completed'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =============================================================================
// Table Row Components
// =============================================================================

function TrackedOrderRow({ order }: { order: OrderWithTracking }) {
  return (
    <tr
      className="cursor-pointer transition-colors hover:bg-gray-50 focus:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500"
      tabIndex={0}
      role="link"
      onClick={() => (window.location.href = `/patients/${order.patient.id}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') window.location.href = `/patients/${order.patient.id}`;
      }}
    >
      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-emerald-600">
        {order._isShipmentOnly ? (
          <span className="text-gray-500" title="Shipment from Lifefile (no linked order)">
            {order.lifefileOrderId
              ? `LF-${order.lifefileOrderId.slice(-6)}`
              : `S-${order._shipmentId}`}
          </span>
        ) : (
          `#${order.id}`
        )}
      </td>
      <td className="whitespace-nowrap px-6 py-4">
        <Link
          href={`/patients/${order.patient.id}`}
          className="text-sm font-medium text-gray-900 hover:text-emerald-600 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {order.patient.firstName} {order.patient.lastName}
        </Link>
      </td>
      <td className="max-w-xs truncate px-6 py-4 text-sm text-gray-600">
        {order.primaryMedName ? (
          <>
            {order.primaryMedName}
            {order.primaryMedStrength && (
              <span className="ml-1 text-gray-400">{order.primaryMedStrength}</span>
            )}
          </>
        ) : (
          <span className="text-gray-400">-</span>
        )}
      </td>
      <td className="whitespace-nowrap px-6 py-4">
        <div className="flex flex-col gap-1">
          <span
            className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(order.shippingStatus || order.status)}`}
          >
            {getStatusIcon(order.shippingStatus || order.status)}
            {(order.shippingStatus || order.status || 'Unknown').replace('_', ' ')}
          </span>
          {(order._isShipmentOnly || order.lifefileOrderId) && (
            <span
              className="inline-flex w-fit rounded bg-orange-50 px-1.5 py-0.5 text-xs text-orange-600"
              title={
                order._isShipmentOnly
                  ? 'Tracking from Lifefile webhook - order record pending'
                  : 'Order sent to Lifefile pharmacy'
              }
            >
              Lifefile
            </span>
          )}
        </div>
      </td>
      <td className="whitespace-nowrap px-6 py-4">
        {order.trackingNumber && (
          <div className="flex items-center gap-2">
            <code className="rounded bg-gray-100 px-2 py-1 font-mono text-xs">
              {order.trackingNumber}
            </code>
            {order.trackingUrl && (
              <a
                href={order.trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-600 hover:text-emerald-700"
                title="Track shipment"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        )}
      </td>
      <td className="whitespace-nowrap px-6 py-4">
        {order.smsStatus ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
              order.smsStatus === 'delivered'
                ? 'bg-green-100 text-green-700'
                : order.smsStatus === 'sent' || order.smsStatus === 'queued'
                  ? 'bg-blue-100 text-blue-700'
                  : order.smsStatus === 'failed' || order.smsStatus === 'undelivered'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-600'
            }`}
            title={`SMS ${order.smsStatus}`}
          >
            {order.smsStatus === 'delivered' ? (
              <CheckCircle className="h-3 w-3" />
            ) : order.smsStatus === 'sent' || order.smsStatus === 'queued' ? (
              <Send className="h-3 w-3" />
            ) : order.smsStatus === 'failed' || order.smsStatus === 'undelivered' ? (
              <MessageSquareX className="h-3 w-3" />
            ) : (
              <MessageSquare className="h-3 w-3" />
            )}
            {order.smsStatus === 'queued' ? 'Sent' : order.smsStatus}
          </span>
        ) : (
          <span className="text-xs text-gray-400">&mdash;</span>
        )}
      </td>
      <td className="whitespace-nowrap px-6 py-4 text-sm">
        {order.trackingNumber && (order.lastWebhookAt || order.updatedAt) ? (
          <>
            <div className="text-gray-900">
              Tracked {formatDate((order.lastWebhookAt || order.updatedAt)!)}
            </div>
            <div className="mt-0.5 text-xs text-gray-400">Rx {formatDate(order.createdAt)}</div>
          </>
        ) : (
          <div className="text-gray-900">Rx {formatDate(order.createdAt)}</div>
        )}
      </td>
      <td className="whitespace-nowrap px-6 py-4">
        <Link
          href={`/patients/${order.patient.id}`}
          className="text-emerald-600 hover:text-emerald-700"
          title="View patient"
          onClick={(e) => e.stopPropagation()}
        >
          <Eye className="h-5 w-5" />
        </Link>
      </td>
    </tr>
  );
}

function AwaitingOrderRow({
  order,
  onDisposition,
}: {
  order: OrderWithTracking;
  onDisposition: (target: DispositionTarget) => void;
}) {
  const days = getAgingDays(order.createdAt);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const patientName = `${order.patient.firstName} ${order.patient.lastName}`;
  const medName = order.primaryMedName
    ? `${order.primaryMedName}${order.primaryMedStrength ? ` ${order.primaryMedStrength}` : ''}`
    : null;

  const openDisposition = (action: DispositionAction) => {
    setMenuOpen(false);
    onDisposition({ orderId: order.id, action, patientName, medName });
  };

  return (
    <tr className="transition-colors hover:bg-gray-50">
      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-emerald-600">
        #{order.id}
      </td>
      <td className="whitespace-nowrap px-6 py-4">
        <Link
          href={`/patients/${order.patient.id}`}
          className="text-sm font-medium text-gray-900 hover:text-emerald-600 hover:underline"
        >
          {order.patient.firstName} {order.patient.lastName}
        </Link>
      </td>
      <td className="max-w-xs truncate px-6 py-4 text-sm text-gray-600">
        {order.primaryMedName ? (
          <>
            {order.primaryMedName}
            {order.primaryMedStrength && (
              <span className="ml-1 text-gray-400">{order.primaryMedStrength}</span>
            )}
          </>
        ) : (
          <span className="text-gray-400">-</span>
        )}
      </td>
      <td className="whitespace-nowrap px-6 py-4">
        <div className="flex flex-col gap-1">
          <span
            className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(order.status)}`}
          >
            {getStatusIcon(order.status)}
            {(order.status || 'Unknown').replace('_', ' ')}
          </span>
          <span className="inline-flex w-fit rounded bg-orange-50 px-1.5 py-0.5 text-xs text-orange-600">
            Lifefile
          </span>
        </div>
      </td>
      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
        {formatDate(order.createdAt)}
      </td>
      <td className="whitespace-nowrap px-6 py-4">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${getAgingColor(days)}`}
          >
            {days >= 15 && <AlertTriangle className="h-3 w-3" />}
            {days}d
          </span>
          <span className="text-xs text-gray-400">{getAgingLabel(days)}</span>
        </div>
      </td>
      <td className="whitespace-nowrap px-6 py-4">
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Actions"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                onClick={() => openDisposition('add_tracking')}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                <PackagePlus className="h-4 w-4 text-emerald-500" />
                Add Tracking
              </button>
              <button
                type="button"
                onClick={() => openDisposition('completed')}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                <PackageCheck className="h-4 w-4 text-blue-500" />
                Mark Completed
              </button>
              <div className="my-1 border-t border-gray-100" />
              <button
                type="button"
                onClick={() => openDisposition('cancel')}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              >
                <Ban className="h-4 w-4" />
                Cancel Order
              </button>
              <div className="my-1 border-t border-gray-100" />
              <Link
                href={`/patients/${order.patient.id}`}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => setMenuOpen(false)}
              >
                <Eye className="h-4 w-4 text-gray-400" />
                View Patient
              </Link>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}
