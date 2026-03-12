'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileText,
  Package,
  Truck,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Search,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface InvoiceSummary {
  upload: {
    id: number;
    fileName: string;
    invoiceNumber: string | null;
    invoiceDate: string | null;
    pharmacyName: string | null;
    status: string;
    totalLineItems: number;
    matchedCount: number;
    unmatchedCount: number;
    discrepancyCount: number;
    invoiceTotalCents: number;
    matchedTotalCents: number;
    unmatchedTotalCents: number;
  };
  matchedCents: number;
  unmatchedCents: number;
  totalCents: number;
  matchRate: number;
}

interface LineItem {
  id: number;
  lineNumber: number;
  lineType: string;
  date: string | null;
  lifefileOrderId: string | null;
  rxNumber: string | null;
  fillId: string | null;
  patientName: string | null;
  doctorName: string | null;
  medicationName: string | null;
  strength: string | null;
  vialSize: string | null;
  shippingMethod: string | null;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
  matchStatus: string;
  matchConfidence: number | null;
  matchNotes: string | null;
}

interface OrderGroup {
  lifefileOrderId: string;
  lineItems: LineItem[];
  subtotalCents: number;
  matchStatus: string;
  matchedOrderId: number | null;
}

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

const MATCH_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  MATCHED: { label: 'Matched', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  UNMATCHED: { label: 'Unmatched', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
  DISCREPANCY: { label: 'Discrepancy', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  PENDING: { label: 'Pending', color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200' },
};

const LINE_TYPE_ICON: Record<string, React.ElementType> = {
  MEDICATION: FileText,
  SUPPLY: Package,
  SHIPPING_CARRIER: Truck,
  SHIPPING_FEE: DollarSign,
};

export default function ProviderPharmacyInvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const uploadId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<InvoiceSummary | null>(null);
  const [orderGroups, setOrderGroups] = useState<OrderGroup[]>([]);
  const [search, setSearch] = useState('');
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  const fetchDetail = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch(`/api/provider/pharmacy-invoices/${uploadId}`);
      const json = await res.json();
      if (json.success) {
        setSummary(json.data.summary);
        setOrderGroups(json.data.orderGroups ?? []);
        // Expand all by default for provider view (typically fewer orders)
        setExpandedOrders(new Set((json.data.orderGroups ?? []).map((g: OrderGroup) => g.lifefileOrderId)));
      }
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  }, [uploadId]);

  useEffect(() => {
    if (uploadId) fetchDetail();
  }, [uploadId, fetchDetail]);

  const toggleOrder = (orderId: string) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const filteredGroups = orderGroups.filter((g) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      g.lifefileOrderId?.toLowerCase().includes(q) ||
      g.lineItems.some((li) =>
        li.patientName?.toLowerCase().includes(q) ||
        li.rxNumber?.toLowerCase().includes(q) ||
        li.medicationName?.toLowerCase().includes(q)
      )
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-gray-500">Invoice not found.</p>
        <button onClick={() => router.back()} className="text-emerald-600 hover:underline">
          Go back
        </button>
      </div>
    );
  }

  const up = summary.upload;
  const providerTotal = orderGroups.reduce((sum, g) => sum + g.subtotalCents, 0);

  return (
    <div className="mx-auto max-w-6xl">
      {/* Back link */}
      <Link
        href="/provider/pharmacy-invoices"
        className="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to invoices
      </Link>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">
          Invoice {up.invoiceNumber ? `#${up.invoiceNumber}` : up.fileName}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {up.pharmacyName ?? 'Pharmacy'} &middot;{' '}
          {up.invoiceDate ? new Date(up.invoiceDate).toLocaleDateString() : 'Unknown date'}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
            Your Orders
          </span>
          <div className="mt-2 text-lg font-bold text-gray-900">
            {orderGroups.length} orders
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
            Your Total
          </span>
          <div className="mt-2 text-lg font-bold text-gray-900">
            {formatCurrency(providerTotal)}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-600" />
            <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
              Match Rate
            </span>
          </div>
          <div className="mt-2 text-lg font-bold text-emerald-600">
            {Math.round(summary.matchRate * 100)}%
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search by order, patient, rx, or medication..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-4 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </div>

      {/* Order Groups */}
      <div className="space-y-3">
        {filteredGroups.length === 0 && (
          <div className="rounded-xl bg-white py-12 text-center text-sm text-gray-400">
            No orders match your search.
          </div>
        )}

        {filteredGroups.map((group) => {
          const expanded = expandedOrders.has(group.lifefileOrderId);
          const cfg = MATCH_STATUS_CONFIG[group.matchStatus] ?? MATCH_STATUS_CONFIG.PENDING;
          const patient = group.lineItems.find((li) => li.patientName)?.patientName ?? '—';

          return (
            <div
              key={group.lifefileOrderId}
              className={`overflow-hidden rounded-xl border bg-white ${cfg.border}`}
            >
              <button
                onClick={() => toggleOrder(group.lifefileOrderId)}
                className={`flex w-full items-center justify-between px-6 py-4 text-left hover:bg-gray-50 ${cfg.bg}`}
              >
                <div className="flex items-center gap-4">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.color} ${cfg.bg}`}>
                    {cfg.label}
                  </span>
                  <div>
                    <span className="text-sm font-semibold text-gray-900">
                      Order #{group.lifefileOrderId}
                    </span>
                    <span className="ml-3 text-sm text-gray-500">{patient}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-semibold text-gray-900">
                    {formatCurrency(group.subtotalCents)}
                  </span>
                  {expanded ? (
                    <ChevronUp className="h-5 w-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-gray-400" />
                  )}
                </div>
              </button>

              {expanded && (
                <div className="border-t border-gray-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        <th className="px-6 py-2">Type</th>
                        <th className="px-6 py-2">Rx #</th>
                        <th className="px-6 py-2">Medication</th>
                        <th className="px-6 py-2 text-right">Qty</th>
                        <th className="px-6 py-2 text-right">Amount</th>
                        <th className="px-6 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {group.lineItems.map((li) => {
                        const Icon = LINE_TYPE_ICON[li.lineType] ?? FileText;
                        const liCfg = MATCH_STATUS_CONFIG[li.matchStatus] ?? MATCH_STATUS_CONFIG.PENDING;

                        return (
                          <tr key={li.id} className="hover:bg-gray-50">
                            <td className="px-6 py-2.5">
                              <div className="flex items-center gap-1.5 text-gray-500">
                                <Icon className="h-3.5 w-3.5" />
                                <span className="text-xs">
                                  {li.lineType === 'MEDICATION'
                                    ? 'Rx'
                                    : li.lineType === 'SUPPLY'
                                      ? 'Supply'
                                      : li.lineType === 'SHIPPING_CARRIER'
                                        ? 'Shipping'
                                        : 'Fee'}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-2.5 text-xs text-gray-600">
                              {li.rxNumber ?? '—'}
                            </td>
                            <td className="px-6 py-2.5 text-xs text-gray-700">
                              {li.medicationName ? (
                                <span>
                                  <span className="font-medium">{li.medicationName}</span>
                                  {li.strength && ` ${li.strength}`}
                                  {li.vialSize && ` (${li.vialSize})`}
                                </span>
                              ) : li.shippingMethod ? (
                                li.shippingMethod
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-6 py-2.5 text-right text-xs text-gray-600">
                              {li.quantity}
                            </td>
                            <td className="px-6 py-2.5 text-right text-xs font-medium text-gray-900">
                              {formatCurrency(li.amountCents)}
                            </td>
                            <td className="px-6 py-2.5">
                              <span className={`text-xs font-medium ${liCfg.color}`}>
                                {liCfg.label}
                              </span>
                              {li.matchNotes && (
                                <div className="mt-0.5 text-[10px] text-amber-500">
                                  {li.matchNotes.slice(0, 50)}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
