'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
// Link removed — patient detail pages use plain <a> tags to avoid RSC fetch hangs
import {
  Truck,
  Package,
  Search,
  ExternalLink,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Download,
  Ban,
  CheckCircle,
  Clock,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';
import { prefetchRoute } from '@/lib/navigation/prefetchRoute';

interface ShippingRecord {
  id: number;
  trackingNumber: string;
  carrier: string;
  trackingUrl: string | null;
  status: string;
  statusNote: string | null;
  patientId: number | null;
  patientName: string | null;
  medicationName: string | null;
  medicationStrength: string | null;
  shippedAt: string | null;
  estimatedDelivery: string | null;
  actualDelivery: string | null;
  source: string;
  orderId: number | null;
  lifefileOrderId: string | null;
  labelId: number | null;
  labelStatus: string | null;
  hasLabel: boolean;
  labelFormat: string | null;
  createdAt: string;
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'DELIVERED':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'SHIPPED':
    case 'IN_TRANSIT':
      return <Truck className="h-4 w-4 text-blue-500" />;
    case 'OUT_FOR_DELIVERY':
      return <Truck className="h-4 w-4 text-orange-500" />;
    case 'LABEL_CREATED':
    case 'PENDING':
      return <Clock className="h-4 w-4 text-yellow-500" />;
    case 'CANCELLED':
    case 'RETURNED':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'EXCEPTION':
      return <AlertTriangle className="h-4 w-4 text-red-500" />;
    default:
      return <Package className="h-4 w-4 text-gray-500" />;
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'DELIVERED':
      return 'bg-green-100 text-green-800';
    case 'SHIPPED':
    case 'IN_TRANSIT':
      return 'bg-blue-100 text-blue-800';
    case 'OUT_FOR_DELIVERY':
      return 'bg-orange-100 text-orange-800';
    case 'LABEL_CREATED':
    case 'PENDING':
      return 'bg-yellow-100 text-yellow-800';
    case 'CANCELLED':
    case 'RETURNED':
      return 'bg-red-100 text-red-800';
    case 'EXCEPTION':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

function getSourceLabel(source: string) {
  switch (source) {
    case 'fedex_label':
      return 'FedEx Label';
    case 'lifefile':
      return 'Lifefile';
    case 'manual':
      return 'Manual';
    case 'pharmacy':
      return 'Pharmacy';
    default:
      return source;
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'LABEL_CREATED', label: 'Label Created' },
  { value: 'SHIPPED', label: 'Shipped' },
  { value: 'IN_TRANSIT', label: 'In Transit' },
  { value: 'OUT_FOR_DELIVERY', label: 'Out for Delivery' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'RETURNED', label: 'Returned' },
  { value: 'EXCEPTION', label: 'Exception' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const CARRIER_OPTIONS = [
  { value: 'all', label: 'All Carriers' },
  { value: 'FedEx', label: 'FedEx' },
  { value: 'UPS', label: 'UPS' },
  { value: 'USPS', label: 'USPS' },
  { value: 'DHL', label: 'DHL' },
];

const SOURCE_OPTIONS = [
  { value: 'all', label: 'All Sources' },
  { value: 'fedex_label', label: 'FedEx Label' },
  { value: 'lifefile', label: 'Lifefile' },
  { value: 'manual', label: 'Manual' },
];

export default function AdminShippingPage() {
  const [records, setRecords] = useState<ShippingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [carrierFilter, setCarrierFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');

  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const debounceTimer = useRef<number | null>(null);

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
  }, []);

  useEffect(() => {
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, []);


  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, carrierFilter, sourceFilter, pageSize]);

  const fetchRecords = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (carrierFilter !== 'all') params.set('carrier', carrierFilter);
      if (sourceFilter !== 'all') params.set('source', sourceFilter);

      const res = await apiFetch(`/api/admin/shipping?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch shipping records');
      const data = await res.json();
      setRecords(data.records || []);
      setTotal(data.total ?? 0);
      setHasMore(data.hasMore ?? false);
    } catch (err) {
      setError(err instanceof Error ? (err instanceof Error ? err.message : String(err)) : 'Failed to load shipping data');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, statusFilter, carrierFilter, sourceFilter]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const handleDownloadLabel = async (rec: ShippingRecord) => {
    if (!rec.labelId) return;
    setActionLoading(rec.id);
    try {
      const res = await apiFetch(`/api/shipping/fedex/label?id=${rec.labelId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Download failed');
      const format = data.labelFormat || 'PDF';
      const ext = format === 'ZPLII' ? 'zpl' : format === 'PNG' ? 'png' : 'pdf';
      const mimeType = format === 'ZPLII' ? 'application/octet-stream' : format === 'PNG' ? 'image/png' : 'application/pdf';
      const raw = format === 'ZPLII'
        ? new Blob([atob(data.labelData)], { type: mimeType })
        : new Blob([Uint8Array.from(atob(data.labelData), (c) => c.charCodeAt(0))], { type: mimeType });
      const url = URL.createObjectURL(raw);
      const a = document.createElement('a');
      a.href = url;
      a.download = `FedEx-Label-${rec.trackingNumber}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError('Failed to download label');
      setTimeout(() => setError(null), 4000);
    } finally {
      setActionLoading(null);
    }
  };

  const handleVoidLabel = async (rec: ShippingRecord) => {
    if (!rec.labelId || !confirm(`Void FedEx label for tracking ${rec.trackingNumber}? This cannot be undone.`)) return;
    setActionLoading(rec.id);
    try {
      const res = await apiFetch(`/api/shipping/fedex/label?id=${rec.labelId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Void failed');
      setSuccessMsg(`Label ${rec.trackingNumber} voided`);
      setTimeout(() => setSuccessMsg(null), 4000);
      fetchRecords();
    } catch (err: unknown) {
      setError((err instanceof Error ? err.message : String(err)) || 'Failed to void label');
      setTimeout(() => setError(null), 4000);
    } finally {
      setActionLoading(null);
    }
  };

  const startIdx = (page - 1) * pageSize + 1;
  const endIdx = Math.min(page * pageSize, total);
  const selectCls = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]';

  return (
    <div className="mx-auto w-full max-w-[1600px] p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Shipping & Labels
        </h1>
        <p className="mt-1 text-gray-600">
          All tracking numbers and shipping labels across patients
        </p>
      </div>

      {/* Success / Error banners */}
      {successMsg && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {successMsg}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1" style={{ minWidth: '220px' }}>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search patient, tracking, medication, carrier..."
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls}>
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={carrierFilter} onChange={(e) => setCarrierFilter(e.target.value)} className={selectCls}>
          {CARRIER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className={selectCls}>
          {SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <th className="px-4 py-3">Tracking</th>
              <th className="px-4 py-3">Patient</th>
              <th className="px-4 py-3">Medication</th>
              <th className="px-4 py-3">Carrier</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Shipped</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-16 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-gray-400" />
                  <p className="mt-2 text-sm text-gray-500">Loading shipping records...</p>
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-16 text-center">
                  <Package className="mx-auto h-10 w-10 text-gray-300" />
                  <p className="mt-2 text-sm text-gray-500">No shipping records found</p>
                </td>
              </tr>
            ) : (
              records.map((rec) => (
                <tr key={rec.id} className="transition-colors hover:bg-gray-50">
                  {/* Tracking */}
                  <td className="px-4 py-3">
                    {rec.trackingUrl ? (
                      <a
                        href={rec.trackingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-sm text-[#4fa77e] hover:underline"
                      >
                        {rec.trackingNumber}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="font-mono text-sm">{rec.trackingNumber}</span>
                    )}
                    {rec.lifefileOrderId && (
                      <p className="mt-0.5 text-xs text-gray-400">LF# {rec.lifefileOrderId}</p>
                    )}
                  </td>

                  {/* Patient */}
                  <td className="px-4 py-3">
                    {rec.patientId ? (
                      <a
                        href={`/admin/patients/${rec.patientId}`}
                        onMouseEnter={() => prefetchRoute(`/admin/patients/${rec.patientId}`)}
                        className="text-sm font-medium text-gray-900 hover:text-[#4fa77e] hover:underline"
                      >
                        {rec.patientName || `Patient #${rec.patientId}`}
                      </a>
                    ) : (
                      <span className="text-sm text-gray-400">Unmatched</span>
                    )}
                  </td>

                  {/* Medication */}
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-700">
                      {rec.medicationName || '--'}
                      {rec.medicationStrength && (
                        <span className="text-gray-500"> {rec.medicationStrength}</span>
                      )}
                    </span>
                  </td>

                  {/* Carrier */}
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-gray-700">{rec.carrier}</span>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(rec.status)}`}>
                      {getStatusIcon(rec.status)}
                      {rec.status.replace(/_/g, ' ')}
                    </span>
                  </td>

                  {/* Source */}
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-500">{getSourceLabel(rec.source)}</span>
                  </td>

                  {/* Shipped date */}
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-600">{formatDate(rec.shippedAt || rec.createdAt)}</span>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {rec.hasLabel && rec.labelStatus !== 'VOIDED' && (
                        <button
                          onClick={() => handleDownloadLabel(rec)}
                          disabled={actionLoading === rec.id}
                          title="Download label"
                          className="rounded p-1.5 text-gray-500 transition hover:bg-purple-50 hover:text-[#4D148C] disabled:opacity-50"
                        >
                          {actionLoading === rec.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </button>
                      )}
                      {rec.labelId && rec.labelStatus === 'CREATED' && (
                        <button
                          onClick={() => handleVoidLabel(rec)}
                          disabled={actionLoading === rec.id}
                          title="Void label"
                          className="rounded p-1.5 text-gray-500 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        >
                          <Ban className="h-4 w-4" />
                        </button>
                      )}
                      {rec.labelStatus === 'VOIDED' && (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-600">Voided</span>
                      )}
                      {rec.patientId && (
                        <a
                          href={`/admin/patients/${rec.patientId}?tab=prescriptions`}
                          onMouseEnter={() => prefetchRoute(`/admin/patients/${rec.patientId}?tab=prescriptions`)}
                          title="View patient"
                          className="rounded p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!loading && total > 0 && (
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <span>
              {startIdx}–{endIdx} of {total}
            </span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(parseInt(e.target.value, 10))}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
            >
              {[10, 20, 50, 100].map((size) => (
                <option key={size} value={size}>{size} per page</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <span className="text-sm text-gray-500">
              Page {page}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasMore}
              className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
