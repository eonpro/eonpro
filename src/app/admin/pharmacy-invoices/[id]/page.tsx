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
  Download,
  FileText,
  Package,
  Truck,
  DollarSign,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Search,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InvoiceSummary {
  upload: {
    id: number;
    fileName: string;
    invoiceNumber: string | null;
    invoiceDate: string | null;
    pharmacyName: string | null;
    amountDueCents: number | null;
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
  description: string | null;
  medicationName: string | null;
  strength: string | null;
  form: string | null;
  vialSize: string | null;
  shippingMethod: string | null;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
  orderSubtotalCents: number | null;
  matchStatus: string;
  matchedOrderId: number | null;
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PharmacyInvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const uploadId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<InvoiceSummary | null>(null);
  const [orderGroups, setOrderGroups] = useState<OrderGroup[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  const fetchDetail = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch(`/api/admin/pharmacy-invoices/${uploadId}`);
      const json = await res.json();
      if (json.success) {
        setSummary(json.data.summary);
        setOrderGroups(json.data.orderGroups ?? []);
        setPdfUrl(json.data.pdfUrl ?? null);
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

  const expandAll = () => {
    setExpandedOrders(new Set(filteredGroups.map((g) => g.lifefileOrderId)));
  };

  const collapseAll = () => {
    setExpandedOrders(new Set());
  };

  // Filter & search
  const filteredGroups = orderGroups.filter((g) => {
    if (filter !== 'all' && g.matchStatus !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const matchesOrder = g.lifefileOrderId?.toLowerCase().includes(q);
      const matchesPatient = g.lineItems.some((li) =>
        li.patientName?.toLowerCase().includes(q)
      );
      const matchesRx = g.lineItems.some((li) =>
        li.rxNumber?.toLowerCase().includes(q)
      );
      const matchesMed = g.lineItems.some((li) =>
        li.medicationName?.toLowerCase().includes(q)
      );
      return matchesOrder || matchesPatient || matchesRx || matchesMed;
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#efece7]">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#efece7] gap-4">
        <p className="text-gray-500">Invoice not found.</p>
        <button onClick={() => router.back()} className="text-emerald-600 hover:underline">
          Go back
        </button>
      </div>
    );
  }

  const up = summary.upload;
  const matchPct = Math.round(summary.matchRate * 100);

  return (
    <div className="min-h-screen bg-[#efece7]">
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Back link */}
        <Link
          href="/admin/pharmacy-invoices"
          className="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to invoices
        </Link>

        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Invoice {up.invoiceNumber ? `#${up.invoiceNumber}` : up.fileName}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {up.pharmacyName ?? 'Pharmacy'} &middot;{' '}
              {up.invoiceDate
                ? new Date(up.invoiceDate).toLocaleDateString()
                : 'Unknown date'}
            </p>
          </div>
          {pdfUrl && (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Download className="h-4 w-4" />
              View PDF
            </a>
          )}
        </div>

        {/* Summary Cards */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryCard
            label="Invoice Total"
            value={formatCurrency(summary.totalCents)}
            color="text-gray-900"
          />
          <SummaryCard
            label="Matched"
            value={`${formatCurrency(summary.matchedCents)} (${matchPct}%)`}
            color="text-emerald-600"
            icon={CheckCircle}
          />
          <SummaryCard
            label="Unmatched"
            value={formatCurrency(summary.unmatchedCents)}
            color="text-red-600"
            icon={XCircle}
          />
          <SummaryCard
            label="Discrepancies"
            value={String(up.discrepancyCount)}
            color="text-amber-600"
            icon={AlertTriangle}
          />
        </div>

        {/* Stats Bar */}
        <div className="mb-6 h-3 overflow-hidden rounded-full bg-gray-200">
          {up.totalLineItems > 0 && (
            <>
              <div
                className="float-left h-full bg-emerald-500 transition-all"
                style={{ width: `${(up.matchedCount / up.totalLineItems) * 100}%` }}
              />
              <div
                className="float-left h-full bg-amber-400 transition-all"
                style={{ width: `${(up.discrepancyCount / up.totalLineItems) * 100}%` }}
              />
              <div
                className="float-left h-full bg-red-400 transition-all"
                style={{ width: `${(up.unmatchedCount / up.totalLineItems) * 100}%` }}
              />
            </>
          )}
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by order, patient, rx, or medication..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-4 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div className="flex gap-1">
            {['all', 'MATCHED', 'UNMATCHED', 'DISCREPANCY'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                  filter === f
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-100'
                }`}
              >
                {f === 'all' ? 'All' : MATCH_STATUS_CONFIG[f]?.label ?? f}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            <button onClick={expandAll} className="rounded-lg bg-white px-3 py-2 text-xs text-gray-500 hover:bg-gray-100">
              Expand all
            </button>
            <button onClick={collapseAll} className="rounded-lg bg-white px-3 py-2 text-xs text-gray-500 hover:bg-gray-100">
              Collapse all
            </button>
          </div>
        </div>

        {/* Order Groups */}
        <div className="space-y-3">
          {filteredGroups.length === 0 && (
            <div className="rounded-xl bg-white py-12 text-center text-sm text-gray-400">
              No orders match your filters.
            </div>
          )}

          {filteredGroups.map((group) => {
            const expanded = expandedOrders.has(group.lifefileOrderId);
            const cfg = MATCH_STATUS_CONFIG[group.matchStatus] ?? MATCH_STATUS_CONFIG.PENDING;
            const patient = group.lineItems.find((li) => li.patientName)?.patientName ?? '—';
            const doctor = group.lineItems.find((li) => li.doctorName)?.doctorName ?? '—';

            return (
              <div
                key={group.lifefileOrderId}
                className={`overflow-hidden rounded-xl border bg-white ${cfg.border}`}
              >
                {/* Order Header */}
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
                      <span className="ml-3 text-xs text-gray-400">Dr. {doctor}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-semibold text-gray-900">
                      {formatCurrency(group.subtotalCents)}
                    </span>
                    {group.matchedOrderId && (
                      <Link
                        href={`/admin/finance/invoices`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-emerald-600 hover:underline"
                      >
                        <ExternalLink className="inline h-3 w-3" /> DB #{group.matchedOrderId}
                      </Link>
                    )}
                    {expanded ? (
                      <ChevronUp className="h-5 w-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-gray-400" />
                    )}
                  </div>
                </button>

                {/* Expanded Line Items */}
                {expanded && (
                  <div className="border-t border-gray-100">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                          <th className="px-6 py-2">Type</th>
                          <th className="px-6 py-2">Rx / Fill ID</th>
                          <th className="px-6 py-2">Description</th>
                          <th className="px-6 py-2 text-right">Qty</th>
                          <th className="px-6 py-2 text-right">Unit Price</th>
                          <th className="px-6 py-2 text-right">Amount</th>
                          <th className="px-6 py-2">Match</th>
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
                              <td className="px-6 py-2.5">
                                <div className="text-xs text-gray-600">
                                  {li.rxNumber && <span>Rx {li.rxNumber}</span>}
                                  {li.fillId && (
                                    <span className="ml-2 text-gray-400">Fill {li.fillId}</span>
                                  )}
                                </div>
                              </td>
                              <td className="max-w-xs truncate px-6 py-2.5 text-xs text-gray-700">
                                {li.medicationName ? (
                                  <span>
                                    <span className="font-medium">{li.medicationName}</span>
                                    {li.strength && ` ${li.strength}`}
                                    {li.vialSize && ` (${li.vialSize})`}
                                  </span>
                                ) : li.shippingMethod ? (
                                  li.shippingMethod
                                ) : li.description ? (
                                  li.description.slice(0, 80)
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td className="px-6 py-2.5 text-right text-xs text-gray-600">
                                {li.quantity}
                              </td>
                              <td className="px-6 py-2.5 text-right text-xs text-gray-600">
                                {formatCurrency(li.unitPriceCents)}
                              </td>
                              <td className="px-6 py-2.5 text-right text-xs font-medium text-gray-900">
                                {formatCurrency(li.amountCents)}
                              </td>
                              <td className="px-6 py-2.5">
                                <span className={`text-xs font-medium ${liCfg.color}`}>
                                  {li.matchConfidence != null
                                    ? `${Math.round(li.matchConfidence * 100)}%`
                                    : liCfg.label}
                                </span>
                                {li.matchNotes && (
                                  <div className="mt-0.5 text-[10px] text-amber-500" title={li.matchNotes}>
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

        {/* Summary footer */}
        <div className="mt-6 flex items-center justify-between text-sm text-gray-500">
          <span>
            Showing {filteredGroups.length} of {orderGroups.length} orders
            ({up.totalLineItems} total line items)
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string;
  value: string;
  color: string;
  icon?: React.ElementType;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-2">
        {Icon && <Icon className={`h-4 w-4 ${color}`} />}
        <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
          {label}
        </span>
      </div>
      <div className={`mt-2 text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}
