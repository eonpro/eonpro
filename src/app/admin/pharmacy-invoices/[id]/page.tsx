'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  Search,
  Link2,
  MessageSquare,
  Flag,
  ChevronLeft,
  ChevronRight,
  X,
  Check,
  Calendar,
  User,
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
  adminNotes: string | null;
  disputed: boolean;
  adjustedAmountCents: number | null;
}

interface OrderGroup {
  lifefileOrderId: string;
  lineItems: LineItem[];
  subtotalCents: number;
  matchStatus: string;
  matchedOrderId: number | null;
  prescriptionDate: string | null;
}

interface SearchResult {
  id: number;
  lifefileOrderId: string | null;
  createdAt: string;
  status: string | null;
  patientName: string;
  providerName: string;
  medications: string;
  rxCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmt = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  MATCHED: { label: 'Matched', cls: 'bg-emerald-100 text-emerald-700' },
  MANUALLY_MATCHED: { label: 'Manual Match', cls: 'bg-blue-100 text-blue-700' },
  UNMATCHED: { label: 'Unmatched', cls: 'bg-red-100 text-red-700' },
  DISCREPANCY: { label: 'Discrepancy', cls: 'bg-amber-100 text-amber-700' },
  DISPUTED: { label: 'Disputed', cls: 'bg-purple-100 text-purple-700' },
  PENDING: { label: 'Pending', cls: 'bg-gray-100 text-gray-500' },
};

const LINE_ICON: Record<string, React.ElementType> = {
  MEDICATION: FileText,
  SUPPLY: Package,
  SHIPPING_CARRIER: Truck,
  SHIPPING_FEE: DollarSign,
};

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function PharmacyInvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const uploadId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<InvoiceSummary | null>(null);
  const [orderGroups, setOrderGroups] = useState<OrderGroup[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // Filters & pagination
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalGroups, setTotalGroups] = useState(0);

  // Expanded orders
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  // Manual match modal
  const [matchModalGroup, setMatchModalGroup] = useState<OrderGroup | null>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [filter]);

  // Fetch data
  const fetchDetail = useCallback(async () => {
    try {
      setLoading(true);
      const p = new URLSearchParams();
      p.set('page', String(page));
      p.set('limit', '30');
      if (filter !== 'all') p.set('matchStatus', filter);
      if (debouncedSearch) p.set('search', debouncedSearch);

      const res = await apiFetch(`/api/admin/pharmacy-invoices/${uploadId}?${p}`);
      const json = await res.json();
      if (json.success) {
        setSummary(json.data.summary);
        setOrderGroups(json.data.orderGroups ?? []);
        setTotalPages(json.data.totalPages ?? 1);
        setTotalGroups(json.data.totalGroups ?? 0);
        setPdfUrl(json.data.pdfUrl ?? null);
      }
    } catch { /* handled */ } finally {
      setLoading(false);
    }
  }, [uploadId, page, filter, debouncedSearch]);

  useEffect(() => { if (uploadId) fetchDetail(); }, [uploadId, fetchDetail]);

  const toggleOrder = (id: string) =>
    setExpandedOrders((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  // Inline save for line items
  const saveLineItem = async (lineItemId: number, data: Record<string, unknown>) => {
    await apiFetch(`/api/admin/pharmacy-invoices/${uploadId}/line-items/${lineItemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    fetchDetail();
  };

  if (loading && !summary) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#efece7]">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#efece7]">
        <p className="text-gray-500">Invoice not found.</p>
        <button onClick={() => router.back()} className="text-emerald-600 hover:underline">Go back</button>
      </div>
    );
  }

  const up = summary.upload;
  const matchPct = Math.round(summary.matchRate * 100);

  return (
    <div className="min-h-screen bg-[#efece7]">
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Back */}
        <Link href="/admin/pharmacy-invoices" className="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" /> Back to invoices
        </Link>

        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Invoice {up.invoiceNumber ? `#${up.invoiceNumber}` : up.fileName}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {up.pharmacyName ?? 'Pharmacy'} &middot; {fmtDate(up.invoiceDate) ?? fmtDate(up.createdAt ?? null) ?? ''}
            </p>
          </div>
          {pdfUrl && (
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <Download className="h-4 w-4" /> View Original
            </a>
          )}
        </div>

        {/* Summary Cards */}
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Card label="Invoice Total" value={fmt(summary.totalCents)} color="text-gray-900" />
          <Card label="Matched" value={`${fmt(summary.matchedCents)}`} sub={`${up.matchedCount} items (${matchPct}%)`} color="text-emerald-600" icon={CheckCircle} />
          <Card label="Unmatched" value={fmt(summary.unmatchedCents)} sub={`${up.unmatchedCount} items`} color="text-red-600" icon={XCircle} />
          <Card label="Disputed" value={String(up.discrepancyCount)} color="text-purple-600" icon={Flag} />
          <Card label="Match Rate" value={`${matchPct}%`} color="text-blue-600" />
        </div>

        {/* Progress bar */}
        <div className="mb-8 h-2.5 overflow-hidden rounded-full bg-gray-200">
          {up.totalLineItems > 0 && (
            <>
              <div className="float-left h-full bg-emerald-500" style={{ width: `${(up.matchedCount / up.totalLineItems) * 100}%` }} />
              <div className="float-left h-full bg-blue-400" style={{ width: `${(up.discrepancyCount / up.totalLineItems) * 100}%` }} />
            </>
          )}
        </div>

        {/* Filter bar */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search order, patient, rx, medication..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-4 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
          </div>
          {['all', 'MATCHED', 'MANUALLY_MATCHED', 'UNMATCHED', 'DISPUTED'].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                filter === f ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}>
              {f === 'all' ? 'All' : STATUS_BADGE[f]?.label ?? f}
            </button>
          ))}
        </div>

        {/* Order groups */}
        <div className="space-y-2">
          {loading && (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
          )}
          {!loading && orderGroups.length === 0 && (
            <div className="rounded-xl bg-white py-12 text-center text-sm text-gray-400">No orders match your filters.</div>
          )}
          {!loading && orderGroups.map((g) => (
            <OrderGroupRow key={g.lifefileOrderId} group={g} expanded={expandedOrders.has(g.lifefileOrderId)}
              onToggle={() => toggleOrder(g.lifefileOrderId)}
              onMatch={() => setMatchModalGroup(g)}
              onSaveItem={saveLineItem}
              uploadId={uploadId} />
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between text-sm text-gray-500">
            <span>Page {page} of {totalPages} ({totalGroups} orders)</span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                className="rounded-md border border-gray-300 px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="rounded-md border border-gray-300 px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Manual Match Modal */}
      {matchModalGroup && (
        <ManualMatchModal
          uploadId={uploadId}
          group={matchModalGroup}
          onClose={() => setMatchModalGroup(null)}
          onMatched={() => { setMatchModalGroup(null); fetchDetail(); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function Card({ label, value, sub, color, icon: Icon }: {
  label: string; value: string; sub?: string; color: string; icon?: React.ElementType;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2">
        {Icon && <Icon className={`h-4 w-4 ${color}`} />}
        <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">{label}</span>
      </div>
      <div className={`mt-1.5 text-lg font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Order Group Row
// ---------------------------------------------------------------------------

function OrderGroupRow({ group: g, expanded, onToggle, onMatch, onSaveItem, uploadId }: {
  group: OrderGroup; expanded: boolean; onToggle: () => void;
  onMatch: () => void; onSaveItem: (id: number, data: Record<string, unknown>) => void; uploadId: string;
}) {
  const badge = STATUS_BADGE[g.matchStatus] ?? STATUS_BADGE.PENDING;
  const patient = g.lineItems.find((li) => li.patientName)?.patientName ?? '—';
  const doctor = g.lineItems.find((li) => li.doctorName)?.doctorName;
  const medItems = g.lineItems.filter((li) => li.lineType === 'MEDICATION' || li.lineType === 'SUPPLY');
  const isUnmatched = g.matchStatus === 'UNMATCHED' || g.matchStatus === 'PENDING';

  return (
    <div className={`overflow-hidden rounded-xl border bg-white ${
      isUnmatched ? 'border-red-200' : g.matchStatus === 'DISPUTED' ? 'border-purple-200' : 'border-gray-200'
    }`}>
      {/* Header */}
      <button onClick={onToggle} className="flex w-full items-center gap-4 px-5 py-3.5 text-left hover:bg-gray-50">
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badge.cls}`}>{badge.label}</span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">#{g.lifefileOrderId}</span>
            <span className="truncate text-sm text-gray-600">{patient}</span>
            {doctor && <span className="hidden text-xs text-gray-400 sm:inline">Dr. {doctor}</span>}
          </div>
          {g.prescriptionDate && (
            <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
              <Calendar className="h-3 w-3" /> Rx sent {fmtDate(g.prescriptionDate)}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{medItems.length} items</span>
          <span className="text-sm font-semibold text-gray-900">{fmt(g.subtotalCents)}</span>
          {isUnmatched && (
            <button onClick={(e) => { e.stopPropagation(); onMatch(); }}
              className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700">
              <Link2 className="mr-1 inline h-3 w-3" /> Match
            </button>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-[11px] font-medium uppercase tracking-wider text-gray-400">
                <th className="px-5 py-2 w-16">Type</th>
                <th className="px-5 py-2">Rx / Fill</th>
                <th className="px-5 py-2">Medication</th>
                <th className="px-5 py-2 text-right w-12">Qty</th>
                <th className="px-5 py-2 text-right w-24">Price</th>
                <th className="px-5 py-2 text-right w-24">Amount</th>
                <th className="px-5 py-2 w-48">Notes</th>
                <th className="px-5 py-2 w-20">Dispute</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {g.lineItems.map((li) => (
                <LineItemRow key={li.id} li={li} onSave={(data) => onSaveItem(li.id, data)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Line Item Row (with inline editing)
// ---------------------------------------------------------------------------

function LineItemRow({ li, onSave }: { li: LineItem; onSave: (data: Record<string, unknown>) => void }) {
  const Icon = LINE_ICON[li.lineType] ?? FileText;
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(li.adminNotes ?? '');
  const [editingAmount, setEditingAmount] = useState(false);
  const [adjAmount, setAdjAmount] = useState(li.adjustedAmountCents != null ? String(li.adjustedAmountCents / 100) : '');
  const notesRef = useRef<HTMLInputElement>(null);

  const effectiveAmount = li.adjustedAmountCents ?? li.amountCents;

  return (
    <tr className={`hover:bg-gray-50 ${li.disputed ? 'bg-purple-50/50' : ''}`}>
      <td className="px-5 py-2">
        <div className="flex items-center gap-1 text-gray-400">
          <Icon className="h-3.5 w-3.5" />
          <span className="text-[11px]">
            {li.lineType === 'MEDICATION' ? 'Rx' : li.lineType === 'SUPPLY' ? 'Supply' : li.lineType === 'SHIPPING_CARRIER' ? 'Ship' : 'Fee'}
          </span>
        </div>
      </td>
      <td className="px-5 py-2 text-xs text-gray-500">
        {li.rxNumber && <span>Rx {li.rxNumber}</span>}
        {li.fillId && <span className="ml-1 text-gray-300">/ {li.fillId}</span>}
      </td>
      <td className="max-w-xs truncate px-5 py-2 text-xs text-gray-700">
        {li.medicationName ? (
          <><span className="font-medium">{li.medicationName}</span>{li.strength && ` ${li.strength}`}{li.vialSize && ` (${li.vialSize})`}</>
        ) : li.shippingMethod ?? '—'}
      </td>
      <td className="px-5 py-2 text-right text-xs text-gray-500">{li.quantity}</td>
      <td className="px-5 py-2 text-right text-xs text-gray-500">{fmt(li.unitPriceCents)}</td>
      {/* Editable amount */}
      <td className="px-5 py-2 text-right">
        {editingAmount ? (
          <div className="flex items-center justify-end gap-1">
            <span className="text-xs text-gray-400">$</span>
            <input type="number" step="0.01" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)}
              className="w-20 rounded border border-gray-300 px-1.5 py-0.5 text-right text-xs" autoFocus />
            <button onClick={() => { onSave({ adjustedAmountCents: adjAmount ? Math.round(parseFloat(adjAmount) * 100) : null }); setEditingAmount(false); }}
              className="text-emerald-600"><Check className="h-3.5 w-3.5" /></button>
            <button onClick={() => setEditingAmount(false)} className="text-gray-400"><X className="h-3.5 w-3.5" /></button>
          </div>
        ) : (
          <button onClick={() => setEditingAmount(true)}
            className={`text-xs font-medium ${li.adjustedAmountCents != null ? 'text-blue-600 underline decoration-dashed' : 'text-gray-900'}`}
            title={li.adjustedAmountCents != null ? `Original: ${fmt(li.amountCents)}` : 'Click to adjust'}>
            {fmt(effectiveAmount)}
          </button>
        )}
      </td>
      {/* Inline notes */}
      <td className="px-5 py-2">
        {editingNotes ? (
          <div className="flex items-center gap-1">
            <input ref={notesRef} value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded border border-gray-300 px-1.5 py-0.5 text-xs" autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') { onSave({ adminNotes: notes || null }); setEditingNotes(false); } }} />
            <button onClick={() => { onSave({ adminNotes: notes || null }); setEditingNotes(false); }}
              className="text-emerald-600"><Check className="h-3.5 w-3.5" /></button>
          </div>
        ) : (
          <button onClick={() => setEditingNotes(true)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700">
            <MessageSquare className="h-3 w-3" />
            {li.adminNotes ? <span className="text-gray-600">{li.adminNotes.slice(0, 30)}</span> : 'Add note'}
          </button>
        )}
      </td>
      {/* Dispute toggle */}
      <td className="px-5 py-2 text-center">
        <button onClick={() => onSave({ disputed: !li.disputed, matchStatus: !li.disputed ? 'DISPUTED' : 'UNMATCHED' })}
          className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
            li.disputed ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-400 hover:bg-red-50 hover:text-red-500'
          }`}>
          <Flag className="mr-0.5 inline h-3 w-3" />{li.disputed ? 'Disputed' : 'Flag'}
        </button>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Manual Match Modal
// ---------------------------------------------------------------------------

function ManualMatchModal({ uploadId, group, onClose, onMatched }: {
  uploadId: string; group: OrderGroup; onClose: () => void; onMatched: () => void;
}) {
  // Default to Order ID tab with the lifefileOrderId pre-filled
  const [tab, setTab] = useState<'search' | 'orderId'>('orderId');
  const [query, setQuery] = useState('');
  const [orderIdInput, setOrderIdInput] = useState(group.lifefileOrderId ?? '');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doSearch = useCallback(async (q: string, lifefileOrderId?: string) => {
    setSearching(true);
    setError(null);
    try {
      const p = new URLSearchParams();
      if (lifefileOrderId) p.set('lifefileOrderId', lifefileOrderId);
      else if (q) p.set('q', q);
      const res = await apiFetch(`/api/admin/pharmacy-invoices/${uploadId}/search-orders?${p}`);
      const json = await res.json();
      setResults(json.data ?? []);
    } catch {
      setError('Search failed');
    } finally {
      setSearching(false);
    }
  }, [uploadId]);

  // Auto-search: try lifefileOrderId first, fall back to recent orders
  useEffect(() => {
    if (group.lifefileOrderId) {
      doSearch('', group.lifefileOrderId);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMatch = async (orderId: number) => {
    setMatching(true);
    setError(null);
    try {
      const lineItemIds = group.lineItems.map((li) => li.id);
      const res = await apiFetch(`/api/admin/pharmacy-invoices/${uploadId}/manual-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineItemIds, orderId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Match failed');
      } else {
        onMatched();
      }
    } catch {
      setError('Match failed');
    } finally {
      setMatching(false);
    }
  };

  const handleMatchByOrderId = async () => {
    if (!orderIdInput.trim()) return;
    setMatching(true);
    setError(null);
    try {
      const lineItemIds = group.lineItems.map((li) => li.id);
      const res = await apiFetch(`/api/admin/pharmacy-invoices/${uploadId}/manual-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineItemIds, lifefileOrderId: orderIdInput.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Match failed');
      } else {
        onMatched();
      }
    } catch {
      setError('Match failed');
    } finally {
      setMatching(false);
    }
  };

  const patient = group.lineItems.find((li) => li.patientName)?.patientName ?? 'Unknown';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Modal header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Manual Match</h2>
            <p className="text-sm text-gray-500">
              Order #{group.lifefileOrderId} &middot; {patient} &middot; {fmt(group.subtotalCents)}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100"><X className="h-5 w-5 text-gray-400" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-6">
          <button onClick={() => setTab('search')}
            className={`border-b-2 px-4 py-3 text-sm font-medium ${tab === 'search' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500'}`}>
            <User className="mr-1.5 inline h-4 w-4" /> Search by Patient
          </button>
          <button onClick={() => setTab('orderId')}
            className={`border-b-2 px-4 py-3 text-sm font-medium ${tab === 'orderId' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500'}`}>
            <Link2 className="mr-1.5 inline h-4 w-4" /> Enter Order ID
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
              <AlertTriangle className="h-4 w-4" /> {error}
            </div>
          )}

          {tab === 'search' && (
            <>
              <p className="mb-3 text-xs text-gray-400">
                Search by order number, medication name, or provider last name.
                Patient names are encrypted and cannot be searched directly.
              </p>
              <div className="mb-4 flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                    placeholder="Order number, medication, or provider name..."
                    className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-4 text-sm focus:border-emerald-500 focus:outline-none"
                    onKeyDown={(e) => { if (e.key === 'Enter') doSearch(query); }} />
                </div>
                <button onClick={() => doSearch(query)} disabled={searching}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
                </button>
              </div>

              <div className="max-h-72 space-y-2 overflow-y-auto">
                {results.length === 0 && !searching && (
                  <p className="py-8 text-center text-sm text-gray-400">No orders found. Try a different search term.</p>
                )}
                {results.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">{r.patientName}</span>
                        <span className="text-xs text-gray-400">#{r.lifefileOrderId ?? r.id}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-gray-500">
                        {fmtDate(r.createdAt)} &middot; Dr. {r.providerName} &middot; {r.rxCount} Rx
                      </div>
                      {r.medications && <div className="mt-0.5 text-xs text-gray-400 truncate max-w-md">{r.medications}</div>}
                    </div>
                    <button onClick={() => handleMatch(r.id)} disabled={matching}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                      {matching ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Match'}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'orderId' && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Lifefile Order ID</label>
                <div className="flex gap-2">
                  <input type="text" value={orderIdInput} onChange={(e) => setOrderIdInput(e.target.value)}
                    placeholder="e.g. 101127010"
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleMatchByOrderId(); }} />
                  <button onClick={handleMatchByOrderId} disabled={matching || !orderIdInput.trim()}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                    {matching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Match'}
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-400">
                Enter the Lifefile order number to match all {group.lineItems.length} line items in this group to that order.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
