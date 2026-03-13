'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Trash2,
  RefreshCw,
  DollarSign,
  CreditCard,
  FileStack,
  Check,
  X,
  SquareStack,
  ChevronDown,
  ChevronUp,
  Pill,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InvoiceUpload {
  id: number;
  createdAt: string;
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
  paymentStatus: string;
  paidAmountCents: number;
  paidAt: string | null;
  paymentReference: string | null;
}

interface Statement {
  id: number;
  createdAt: string;
  title: string;
  totalCents: number;
  invoiceIds: number[];
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmt = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  PENDING: { label: 'Pending', color: 'bg-gray-100 text-gray-700', icon: Clock },
  PARSING: { label: 'Parsing...', color: 'bg-blue-100 text-blue-700', icon: Loader2 },
  PARSED: { label: 'Parsed', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  MATCHING: { label: 'Matching...', color: 'bg-blue-100 text-blue-700', icon: Loader2 },
  RECONCILED: { label: 'Reconciled', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  ERROR: { label: 'Error', color: 'bg-red-100 text-red-700', icon: XCircle },
};

const PAYMENT_BADGE: Record<string, { label: string; cls: string }> = {
  UNPAID: { label: 'Unpaid', cls: 'bg-red-100 text-red-700' },
  PARTIAL: { label: 'Partial', cls: 'bg-amber-100 text-amber-700' },
  PAID: { label: 'Paid', cls: 'bg-emerald-100 text-emerald-700' },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PharmacyInvoicesPage() {
  const [tab, setTab] = useState<'invoices' | 'statements' | 'unmatched'>('invoices');
  const [uploads, setUploads] = useState<InvoiceUpload[]>([]);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Multi-select for statements
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Unmatched Rx tab
  const [unmatchedOrders, setUnmatchedOrders] = useState<Array<{
    id: number; lifefileOrderId: string | null; createdAt: string; status: string | null;
    patientName: string; providerName: string; medications: string; rxCount: number;
    rxs: Array<{ id: number; medName: string; strength: string; form: string; quantity: string; sig: string }>;
  }>>([]);
  const [expandedUnmatched, setExpandedUnmatched] = useState<Set<number>>(new Set());
  const [unmatchedTotal, setUnmatchedTotal] = useState(0);
  const [unmatchedStartDate, setUnmatchedStartDate] = useState('2026-03-04');
  const [unmatchedPage, setUnmatchedPage] = useState(1);
  const [unmatchedLoading, setUnmatchedLoading] = useState(false);

  // Mark Paid modal
  const [payModal, setPayModal] = useState<InvoiceUpload | null>(null);

  // Create Statement modal
  const [showCreateStmt, setShowCreateStmt] = useState(false);
  const [stmtTitle, setStmtTitle] = useState('');

  const fetchUploads = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch(`/api/admin/pharmacy-invoices?page=${page}&limit=20`);
      const json = await res.json();
      if (json.success) {
        setUploads(json.data.uploads);
        setTotalPages(json.data.totalPages);
      }
    } catch { /* */ } finally {
      setLoading(false);
    }
  }, [page]);

  const fetchStatements = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/pharmacy-invoices/statements');
      const json = await res.json();
      if (json.success) setStatements(json.data ?? []);
    } catch { /* */ }
  }, []);

  const fetchUnmatched = useCallback(async () => {
    try {
      setUnmatchedLoading(true);
      const res = await apiFetch(`/api/admin/pharmacy-invoices/unmatched-orders?startDate=${unmatchedStartDate}&page=${unmatchedPage}&limit=50`);
      const json = await res.json();
      if (json.success) {
        setUnmatchedOrders(json.data.orders ?? []);
        setUnmatchedTotal(json.data.total ?? 0);
      }
    } catch { /* */ } finally { setUnmatchedLoading(false); }
  }, [unmatchedStartDate, unmatchedPage]);

  useEffect(() => {
    fetchUploads();
    fetchStatements();
  }, [fetchUploads, fetchStatements]);

  useEffect(() => {
    if (tab === 'unmatched') fetchUnmatched();
  }, [tab, fetchUnmatched]);

  // Upload handler
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isCsv = file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv') || file.type === 'application/vnd.ms-excel';
    if (!isPdf && !isCsv) { setUploadError('Only PDF and CSV files are accepted.'); return; }

    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiFetch('/api/admin/pharmacy-invoices', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) {
        setUploadError(json.error ?? 'Upload failed');
      } else {
        fetchUploads();
        const uploadId = json.data?.upload?.id;
        if (uploadId) {
          apiFetch(`/api/admin/pharmacy-invoices/${uploadId}`, { method: 'PATCH' })
            .then(() => fetchUploads()).catch(() => fetchUploads());
        }
      }
    } catch { setUploadError('Upload failed. Please try again.'); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  // Delete requires super admin password
  const [deleteModal, setDeleteModal] = useState<number | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const handleDelete = async () => {
    if (!deleteModal || !deletePassword) return;
    setDeletingId(deleteModal);
    setDeleteError('');
    try {
      const res = await apiFetch(`/api/admin/pharmacy-invoices/${deleteModal}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword }),
      });
      const json = await res.json();
      if (!res.ok) {
        setDeleteError(json.error ?? 'Delete failed');
        return;
      }
      setDeleteModal(null);
      setDeletePassword('');
      fetchUploads();
    } catch {
      setDeleteError('Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const handleRerun = async (id: number) => {
    try { await apiFetch(`/api/admin/pharmacy-invoices/${id}`, { method: 'PATCH' }); fetchUploads(); } catch { /* */ }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const handleCreateStatement = async () => {
    if (selectedIds.size === 0 || !stmtTitle.trim()) return;
    try {
      const res = await apiFetch('/api/admin/pharmacy-invoices/statements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: stmtTitle, invoiceUploadIds: Array.from(selectedIds) }),
      });
      if (res.ok) {
        setShowCreateStmt(false);
        setSelectMode(false);
        setSelectedIds(new Set());
        setStmtTitle('');
        fetchStatements();
        setTab('statements');
      }
    } catch { /* */ }
  };

  // Payment summary
  const totalUnpaid = uploads.filter((u) => u.paymentStatus === 'UNPAID').reduce((s, u) => s + u.invoiceTotalCents, 0);
  const totalPaid = uploads.filter((u) => u.paymentStatus === 'PAID').reduce((s, u) => s + u.paidAmountCents, 0);

  return (
    <div className="min-h-screen bg-[#efece7]">
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Pharmacy Invoice Reconciliation</h1>
          <p className="mt-1 text-sm text-gray-500">Upload, reconcile, track payments, and create consolidated statements.</p>
        </div>

        {/* Upload Area */}
        <div className="mb-6 rounded-xl border-2 border-dashed border-gray-300 bg-white p-6 text-center transition-colors hover:border-emerald-400">
          <input ref={fileInputRef} type="file" accept=".pdf,.csv,application/pdf,text/csv" onChange={handleUpload} className="hidden" id="invoice-upload" disabled={uploading} />
          <label htmlFor="invoice-upload" className="flex cursor-pointer flex-col items-center gap-2">
            {uploading ? (
              <><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /><span className="text-sm text-gray-700">Uploading and parsing...</span></>
            ) : (
              <><Upload className="h-8 w-8 text-gray-400" /><span className="text-sm font-medium text-gray-700">Drop a pharmacy invoice PDF or CSV here, or click to upload</span><span className="text-xs text-gray-400">WellMedR/Lifefile invoice PDFs or CSV exports up to 50 MB</span></>
            )}
          </label>
          {uploadError && <div className="mt-3 flex items-center justify-center gap-2 text-sm text-red-600"><AlertTriangle className="h-4 w-4" />{uploadError}</div>}
        </div>

        {/* Payment Summary Bar */}
        {uploads.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-4">
            <div className="flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 border border-gray-200">
              <DollarSign className="h-4 w-4 text-red-500" />
              <span className="text-xs text-gray-500">Total Unpaid</span>
              <span className="text-sm font-bold text-red-600">{fmt(totalUnpaid)}</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 border border-gray-200">
              <CreditCard className="h-4 w-4 text-emerald-500" />
              <span className="text-xs text-gray-500">Total Paid</span>
              <span className="text-sm font-bold text-emerald-600">{fmt(totalPaid)}</span>
            </div>
            <div className="ml-auto flex gap-2">
              {!selectMode ? (
                <button onClick={() => setSelectMode(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">
                  <SquareStack className="h-4 w-4" /> Create Statement
                </button>
              ) : (
                <>
                  <button onClick={() => { setShowCreateStmt(true); }}
                    disabled={selectedIds.size === 0}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                    <FileStack className="h-4 w-4" /> Combine {selectedIds.size} Selected
                  </button>
                  <button onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-500 hover:bg-gray-50">
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-4 flex border-b border-gray-200">
          <button onClick={() => setTab('invoices')}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium ${tab === 'invoices' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500'}`}>
            Invoices ({uploads.length})
          </button>
          <button onClick={() => setTab('statements')}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium ${tab === 'statements' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500'}`}>
            Statements ({statements.length})
          </button>
          <button onClick={() => setTab('unmatched')}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium ${tab === 'unmatched' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500'}`}>
            Unmatched Rx {unmatchedTotal > 0 && <span className="ml-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-600">{unmatchedTotal}</span>}
          </button>
        </div>

        {/* Invoices Tab */}
        {tab === 'invoices' && (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            {loading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
            ) : uploads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <FileText className="mb-3 h-10 w-10" /><span className="text-sm">No invoices uploaded yet</span>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        {selectMode && <th className="px-4 py-3 w-10" />}
                        <th className="px-5 py-3">Invoice</th>
                        <th className="px-5 py-3">Date</th>
                        <th className="px-5 py-3">Amount</th>
                        <th className="px-5 py-3">Reconciliation</th>
                        <th className="px-5 py-3">Matched</th>
                        <th className="px-5 py-3">Payment</th>
                        <th className="px-5 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {uploads.map((u) => {
                        const cfg = STATUS_CONFIG[u.status] ?? STATUS_CONFIG.PENDING;
                        const StatusIcon = cfg.icon;
                        const payBadge = PAYMENT_BADGE[u.paymentStatus] ?? PAYMENT_BADGE.UNPAID;
                        const matchPct = u.totalLineItems > 0 ? Math.round((u.matchedCount / u.totalLineItems) * 100) : 0;

                        return (
                          <tr key={u.id} className={`hover:bg-gray-50 ${selectMode && selectedIds.has(u.id) ? 'bg-emerald-50' : ''}`}>
                            {selectMode && (
                              <td className="px-4 py-3">
                                <input type="checkbox" checked={selectedIds.has(u.id)} onChange={() => toggleSelect(u.id)}
                                  className="h-4 w-4 rounded border-gray-300 text-emerald-600" />
                              </td>
                            )}
                            <td className="px-5 py-3">
                              <a href={`/admin/pharmacy-invoices/${u.id}`}
                                onClick={(e) => { e.preventDefault(); window.location.href = `/admin/pharmacy-invoices/${u.id}`; }}
                                className="text-sm font-medium text-emerald-600 hover:text-emerald-700">
                                {u.invoiceNumber ? `#${u.invoiceNumber}` : u.fileName}
                              </a>
                              <div className="text-xs text-gray-400">{u.pharmacyName ?? ''}</div>
                            </td>
                            <td className="px-5 py-3 text-sm text-gray-600">
                              {fmtDate(u.invoiceDate) ?? fmtDate(u.createdAt)}
                            </td>
                            <td className="px-5 py-3 text-sm font-semibold text-gray-900">{fmt(u.invoiceTotalCents)}</td>
                            <td className="px-5 py-3">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cfg.color}`}>
                                <StatusIcon className="h-3 w-3" />{cfg.label}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-sm text-emerald-600">
                              {u.matchedCount} <span className="text-xs text-gray-400">({matchPct}%)</span>
                            </td>
                            <td className="px-5 py-3">
                              <button onClick={() => setPayModal(u)}
                                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${payBadge.cls} hover:opacity-80`}>
                                {u.paymentStatus === 'PAID' && <CheckCircle className="h-3 w-3" />}
                                {payBadge.label}
                              </button>
                              {u.paymentReference && <div className="mt-0.5 text-[10px] text-gray-400">Ref: {u.paymentReference}</div>}
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-1.5">
                                <a href={`/admin/pharmacy-invoices/${u.id}`}
                                  onClick={(e) => { e.preventDefault(); window.location.href = `/admin/pharmacy-invoices/${u.id}`; }}
                                  className="text-xs font-medium text-gray-500 hover:text-emerald-600">View</a>
                                <button onClick={() => handleRerun(u.id)} className="text-gray-400 hover:text-blue-500" title="Re-run"><RefreshCw className="h-3.5 w-3.5" /></button>
                                <button onClick={() => { setDeleteModal(u.id); setDeletePassword(''); setDeleteError(''); }} disabled={deletingId === u.id}
                                  className="text-gray-400 hover:text-red-500 disabled:opacity-50" title="Delete (Super Admin only)">
                                  {deletingId === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
                    <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
                    <div className="flex gap-2">
                      <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded-md border border-gray-300 p-1.5 hover:bg-gray-50 disabled:opacity-50"><ChevronLeft className="h-4 w-4" /></button>
                      <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="rounded-md border border-gray-300 p-1.5 hover:bg-gray-50 disabled:opacity-50"><ChevronRight className="h-4 w-4" /></button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Statements Tab */}
        {tab === 'statements' && (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            {statements.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <FileStack className="mb-3 h-10 w-10" /><span className="text-sm">No consolidated statements yet</span>
                <span className="mt-1 text-xs">Select invoices from the Invoices tab and click &quot;Create Statement&quot;</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      <th className="px-5 py-3">Title</th>
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3">Invoices</th>
                      <th className="px-5 py-3">Total</th>
                      <th className="px-5 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {statements.map((s) => (
                      <tr key={s.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3">
                          <a href={`/admin/pharmacy-invoices/statements/${s.id}`}
                            onClick={(e) => { e.preventDefault(); window.location.href = `/admin/pharmacy-invoices/statements/${s.id}`; }}
                            className="text-sm font-medium text-emerald-600 hover:text-emerald-700">{s.title}</a>
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-600">{fmtDate(s.createdAt)}</td>
                        <td className="px-5 py-3 text-sm text-gray-600">{(s.invoiceIds as number[]).length} invoices</td>
                        <td className="px-5 py-3 text-sm font-semibold text-gray-900">{fmt(s.totalCents)}</td>
                        <td className="px-5 py-3">
                          <a href={`/admin/pharmacy-invoices/statements/${s.id}`}
                            onClick={(e) => { e.preventDefault(); window.location.href = `/admin/pharmacy-invoices/statements/${s.id}`; }}
                            className="text-xs font-medium text-gray-500 hover:text-emerald-600">View</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Unmatched Rx Tab */}
        {tab === 'unmatched' && (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Unmatched Prescriptions</h2>
                <p className="text-xs text-gray-500">Orders sent that do not appear on any uploaded pharmacy invoice</p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">From:</label>
                <input type="date" value={unmatchedStartDate} onChange={(e) => { setUnmatchedStartDate(e.target.value); setUnmatchedPage(1); }}
                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
              </div>
            </div>

            {unmatchedLoading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
            ) : unmatchedOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <CheckCircle className="mb-3 h-10 w-10 text-emerald-400" />
                <span className="text-sm font-medium text-emerald-600">All prescriptions accounted for</span>
                <span className="mt-1 text-xs">Every order from {fmtDate(unmatchedStartDate)} onward appears on an uploaded invoice.</span>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {unmatchedOrders.map((o) => {
                  const isExpanded = expandedUnmatched.has(o.id);
                  return (
                    <div key={o.id}>
                      <button
                        onClick={() => setExpandedUnmatched((prev) => {
                          const n = new Set(prev);
                          n.has(o.id) ? n.delete(o.id) : n.add(o.id);
                          return n;
                        })}
                        className="flex w-full items-center gap-4 px-6 py-3 text-left hover:bg-gray-50"
                      >
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                          {o.status ?? 'sent'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900">#{o.lifefileOrderId ?? o.id}</span>
                            <span className="text-sm text-gray-600">{o.patientName}</span>
                            <span className="hidden text-xs text-gray-400 sm:inline">Dr. {o.providerName}</span>
                          </div>
                          <div className="mt-0.5 text-xs text-gray-400">
                            Sent {fmtDate(o.createdAt)} &middot; {o.rxCount} Rx
                          </div>
                        </div>
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                      </button>

                      {isExpanded && o.rxs && o.rxs.length > 0 && (
                        <div className="border-t border-gray-100 bg-gray-50 px-6 py-2">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-[11px] font-medium uppercase tracking-wider text-gray-400">
                                <th className="py-1.5 pr-4"><Pill className="inline h-3 w-3" /> Medication</th>
                                <th className="py-1.5 pr-4">Strength</th>
                                <th className="py-1.5 pr-4">Form</th>
                                <th className="py-1.5 pr-4">Qty</th>
                                <th className="py-1.5">Directions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {o.rxs.map((rx) => (
                                <tr key={rx.id}>
                                  <td className="py-1.5 pr-4 text-xs font-medium text-gray-700">{rx.medName}</td>
                                  <td className="py-1.5 pr-4 text-xs text-gray-500">{rx.strength}</td>
                                  <td className="py-1.5 pr-4 text-xs text-gray-500">{rx.form}</td>
                                  <td className="py-1.5 pr-4 text-xs text-gray-500">{rx.quantity}</td>
                                  <td className="py-1.5 text-xs text-gray-400">{rx.sig}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {isExpanded && (!o.rxs || o.rxs.length === 0) && (
                        <div className="border-t border-gray-100 bg-gray-50 px-6 py-4 text-xs text-gray-400">
                          No prescription details available
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {unmatchedTotal > 50 && (
              <div className="flex items-center justify-between border-t border-gray-100 px-6 py-3">
                <span className="text-sm text-gray-500">{unmatchedTotal} unmatched orders</span>
                <div className="flex gap-2">
                  <button onClick={() => setUnmatchedPage((p) => Math.max(1, p - 1))} disabled={unmatchedPage <= 1}
                    className="rounded-md border border-gray-300 p-1.5 hover:bg-gray-50 disabled:opacity-50"><ChevronLeft className="h-4 w-4" /></button>
                  <button onClick={() => setUnmatchedPage((p) => p + 1)} disabled={unmatchedOrders.length < 50}
                    className="rounded-md border border-gray-300 p-1.5 hover:bg-gray-50 disabled:opacity-50"><ChevronRight className="h-4 w-4" /></button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mark Paid Modal */}
      {payModal && <MarkPaidModal invoice={payModal} onClose={() => setPayModal(null)} onSaved={() => { setPayModal(null); fetchUploads(); }} />}

      {/* Create Statement Modal */}
      {showCreateStmt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCreateStmt(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-bold text-gray-900">Create Consolidated Statement</h2>
            <p className="mb-4 text-sm text-gray-500">{selectedIds.size} invoices selected totaling {fmt(uploads.filter((u) => selectedIds.has(u.id)).reduce((s, u) => s + u.invoiceTotalCents, 0))}</p>
            <label className="mb-1 block text-sm font-medium text-gray-700">Statement Title</label>
            <input type="text" value={stmtTitle} onChange={(e) => setStmtTitle(e.target.value)}
              placeholder="e.g. WellMedR Statement - March 2026"
              className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreateStmt(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleCreateStatement} disabled={!stmtTitle.trim()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">Create Statement</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (Super Admin Password Required) */}
      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeleteModal(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-2 text-lg font-bold text-red-600">Delete Invoice</h2>
            <p className="mb-4 text-sm text-gray-500">
              This will permanently delete the invoice and all its line items. Enter your super admin password to confirm.
            </p>
            {deleteError && (
              <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{deleteError}</div>
            )}
            <label className="mb-1 block text-sm font-medium text-gray-700">Password</label>
            <input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="Enter your password"
              className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
              onKeyDown={(e) => { if (e.key === 'Enter') handleDelete(); }} autoFocus />
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteModal(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleDelete} disabled={!deletePassword || deletingId !== null}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                {deletingId ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mark Paid Modal
// ---------------------------------------------------------------------------

function MarkPaidModal({ invoice, onClose, onSaved }: {
  invoice: InvoiceUpload; onClose: () => void; onSaved: () => void;
}) {
  const [status, setStatus] = useState(invoice.paymentStatus || 'PAID');
  const [amount, setAmount] = useState(String((invoice.paidAmountCents || invoice.invoiceTotalCents) / 100));
  const [reference, setReference] = useState(invoice.paymentReference ?? '');
  const [notes, setNotes] = useState('');
  const [paidAt, setPaidAt] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/admin/pharmacy-invoices/${invoice.id}/payment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentStatus: status,
          paidAmountCents: Math.round(parseFloat(amount) * 100),
          paymentReference: reference || undefined,
          paymentNotes: notes || undefined,
          paidAt,
        }),
      });
      if (res.ok) onSaved();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Payment Status</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100"><X className="h-5 w-5 text-gray-400" /></button>
        </div>
        <p className="mb-4 text-sm text-gray-500">
          {invoice.invoiceNumber ? `Invoice #${invoice.invoiceNumber}` : invoice.fileName} &middot; {fmt(invoice.invoiceTotalCents)}
        </p>

        {/* Status */}
        <div className="mb-4 flex gap-2">
          {['PAID', 'PARTIAL', 'UNPAID'].map((s) => (
            <button key={s} onClick={() => setStatus(s)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                status === s ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-300 text-gray-500 hover:bg-gray-50'
              }`}>{s === 'PAID' ? 'Paid' : s === 'PARTIAL' ? 'Partial' : 'Unpaid'}</button>
          ))}
        </div>

        {status !== 'UNPAID' && (
          <>
            <div className="mb-3">
              <label className="mb-1 block text-sm font-medium text-gray-700">Payment Date</label>
              <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div className="mb-3">
              <label className="mb-1 block text-sm font-medium text-gray-700">Amount Paid</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 py-2 pl-7 pr-3 text-sm" />
              </div>
            </div>
            <div className="mb-3">
              <label className="mb-1 block text-sm font-medium text-gray-700">Reference # (check, wire, etc.)</label>
              <input type="text" value={reference} onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. Check #4521"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-gray-700">Notes (optional)</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="mr-1 inline h-4 w-4" />Save</>}
          </button>
        </div>
      </div>
    </div>
  );
}
