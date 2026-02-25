'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

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

export default function AdminOrdersPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [orders, setOrders] = useState<OrderWithTracking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [hasMore, setHasMore] = useState(false);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
  }, []);

  useEffect(() => {
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        hasTrackingNumber: 'true',
        page: String(page),
        pageSize: String(pageSize),
      });
      if (debouncedSearch.trim()) {
        params.set('search', debouncedSearch.trim());
      }
      const response = await apiFetch(`/api/orders/list?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch orders');
      }
      const data = await response.json();
      setOrders(data.orders || []);
      setTotal(data.total ?? 0);
      setHasMore(data.hasMore ?? false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, pageSize]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const getStatusIcon = (status: string | null) => {
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
  };

  const getStatusColor = (status: string | null) => {
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
  };

  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${mm}/${dd}/${yy}`;
  };

  // Search is now server-side; only filter by status client-side
  const filteredOrders = orders.filter((order) => {
    const orderStatus = order.shippingStatus || order.status || '';
    return statusFilter === 'all' || orderStatus.toLowerCase() === statusFilter.toLowerCase();
  });

  return (
    <div className="mx-auto w-full max-w-[1600px] p-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
          <p className="mt-1 text-gray-600">Prescriptions with active tracking</p>
        </div>
        <Link
          href="/admin/orders/new"
          className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2 text-white shadow-md transition-all hover:from-emerald-600 hover:to-teal-700 hover:shadow-lg"
        >
          <Plus className="h-5 w-5" />
          New Order
        </Link>
      </div>

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
            onClick={fetchOrders}
            className="mt-2 text-sm text-red-600 underline hover:text-red-700"
          >
            Try again
          </button>
        </div>
      )}

      {/* Orders Table */}
      {!loading && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full">
            <thead className="bg-gray-50">
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
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <Package className="mx-auto mb-4 h-12 w-12 text-gray-300" />
                    <p className="text-sm text-gray-500">No orders found</p>
                    <p className="mt-1 text-xs text-gray-400">
                      Orders with tracking numbers will appear here
                    </p>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr
                    key={order._isShipmentOnly ? `ship-${order._shipmentId}` : order.id}
                    className="cursor-pointer transition-colors hover:bg-gray-50 focus:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500"
                    tabIndex={0}
                    role="link"
                    onClick={() => (window.location.href = `/patients/${order.patient.id}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter') window.location.href = `/patients/${order.patient.id}`; }}
                  >
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-emerald-600">
                      {order._isShipmentOnly ? (
                        <span
                          className="text-gray-500"
                          title="Shipment from Lifefile (no linked order)"
                        >
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
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm">
                      {order.trackingNumber && (order.lastWebhookAt || order.updatedAt) ? (
                        <>
                          <div className="text-gray-900">
                            Tracked {formatDate((order.lastWebhookAt || order.updatedAt)!)}
                          </div>
                          <div className="mt-0.5 text-xs text-gray-400">
                            Rx {formatDate(order.createdAt)}
                          </div>
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
    </div>
  );
}
