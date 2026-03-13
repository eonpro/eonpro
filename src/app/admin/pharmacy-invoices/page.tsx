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
  GitCompare,
  Download,
  ArrowRight,
  Search,
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

interface DiscrepancyData {
  invoicePatientCount: number;
  systemPatientCount: number;
  onInvoiceOnly: Array<{
    patientName: string;
    orderCount: number;
    totalAmountCents: number;
    lifefileOrderIds: string[];
    systemOrderDates: Array<{ lifefileOrderId: string; createdAt: string; status: string | null }>;
    foundInSystem: boolean;
    lineItems: Array<{
      lifefileOrderId: string | null;
      medicationName: string | null;
      strength: string | null;
      quantity: number;
      unitPriceCents: number;
      amountCents: number;
      description: string | null;
    }>;
  }>;
  inSystemOnly: Array<{
    patientId: number;
    patientName: string;
    orderCount: number;
    lifefileOrderIds: string[];
    medications: string;
    latestOrderDate: string;
  }>;
  matched: Array<{
    patientName: string;
    invoiceName: string;
    systemName: string;
    invoiceOrderCount: number;
    systemOrderCount: number;
  }>;
  summary: {
    onInvoiceOnlyCount: number;
    inSystemOnlyCount: number;
    matchedCount: number;
  };
}

export default function PharmacyInvoicesPage() {
  const [tab, setTab] = useState<'invoices' | 'statements' | 'unmatched' | 'discrepancy'>('invoices');
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

  // Patient Discrepancy tab
  const [discrepancyInvoiceIds, setDiscrepancyInvoiceIds] = useState<Set<number>>(new Set());
  const [discrepancyStartDate, setDiscrepancyStartDate] = useState('2026-03-09');
  const [discrepancyEndDate, setDiscrepancyEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [discrepancyData, setDiscrepancyData] = useState<DiscrepancyData | null>(null);
  const [discrepancyLoading, setDiscrepancyLoading] = useState(false);
  const [discrepancyError, setDiscrepancyError] = useState<string | null>(null);
  const [discrepancyView, setDiscrepancyView] = useState<'invoiceOnly' | 'systemOnly' | 'matched'>('invoiceOnly');
  const [discrepancySearch, setDiscrepancySearch] = useState('');
  const [expandedDiscrepancy, setExpandedDiscrepancy] = useState<Set<number>>(new Set());

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

  const fetchDiscrepancy = useCallback(async () => {
    if (discrepancyInvoiceIds.size === 0) return;
    try {
      setDiscrepancyLoading(true);
      setDiscrepancyError(null);
      const ids = Array.from(discrepancyInvoiceIds).join(',');
      const res = await apiFetch(
        `/api/admin/pharmacy-invoices/patient-discrepancy?invoiceIds=${ids}&startDate=${discrepancyStartDate}&endDate=${discrepancyEndDate}`
      );
      const json = await res.json();
      if (json.success) {
        setDiscrepancyData(json.data);
      } else {
        setDiscrepancyError(json.error ?? 'Failed to load discrepancy data');
      }
    } catch {
      setDiscrepancyError('Failed to load discrepancy data');
    } finally {
      setDiscrepancyLoading(false);
    }
  }, [discrepancyInvoiceIds, discrepancyStartDate, discrepancyEndDate]);

  const exportDiscrepancyCsv = useCallback(() => {
    if (!discrepancyData) return;
    const rows: string[] = ['Section,Patient Name,Order Count,Rx Written Date,Status,Details'];

    for (const p of discrepancyData.onInvoiceOnly) {
      const rxDate = p.foundInSystem
        ? p.systemOrderDates.map((d) => new Date(d.createdAt).toLocaleDateString()).join('; ')
        : 'NOT IN SYSTEM';
      const rxStatus = p.foundInSystem
        ? p.systemOrderDates.map((d) => d.status ?? 'sent').join('; ')
        : 'missing';
      rows.push(`On Invoice Only,"${p.patientName.replace(/"/g, '""')}",${p.orderCount},"${rxDate}","${rxStatus}","$${(p.totalAmountCents / 100).toFixed(2)} | Orders: ${p.lifefileOrderIds.join('; ')}"`);
    }
    for (const p of discrepancyData.inSystemOnly) {
      rows.push(`In System Only,"${p.patientName.replace(/"/g, '""')}",${p.orderCount},"${p.medications} | Orders: ${p.lifefileOrderIds.join('; ')}"`);
    }
    for (const p of discrepancyData.matched) {
      rows.push(`Matched,"${p.invoiceName.replace(/"/g, '""')}",${p.invoiceOrderCount},"Invoice orders: ${p.invoiceOrderCount} | System orders: ${p.systemOrderCount}"`);
    }

    const csv = rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `patient-discrepancy-${discrepancyStartDate}-to-${discrepancyEndDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [discrepancyData, discrepancyStartDate, discrepancyEndDate]);

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
          <button onClick={() => setTab('discrepancy')}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium flex items-center gap-1.5 ${tab === 'discrepancy' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500'}`}>
            <GitCompare className="h-3.5 w-3.5" /> Patient Discrepancy
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

        {/* Patient Discrepancy Tab */}
        {tab === 'discrepancy' && (
          <div className="space-y-4">
            {/* Controls */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Patient Discrepancy Report</h2>
              <p className="text-xs text-gray-500 mb-4">
                Compare patients on selected invoices against prescriptions sent in the system for a date range.
                This identifies patients billed by the pharmacy but not in your system, and vice versa.
              </p>

              {/* Invoice Selection */}
              <div className="mb-4">
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Select Invoices to Compare</label>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {uploads.filter((u) => u.status === 'RECONCILED').map((u) => (
                    <label key={u.id}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ${
                        discrepancyInvoiceIds.has(u.id)
                          ? 'border-emerald-500 bg-emerald-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}>
                      <input type="checkbox"
                        checked={discrepancyInvoiceIds.has(u.id)}
                        onChange={() => {
                          setDiscrepancyInvoiceIds((prev) => {
                            const n = new Set(prev);
                            n.has(u.id) ? n.delete(u.id) : n.add(u.id);
                            return n;
                          });
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-emerald-600" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {u.invoiceNumber ? `#${u.invoiceNumber}` : u.fileName}
                        </div>
                        <div className="text-[11px] text-gray-400">
                          {fmtDate(u.invoiceDate) ?? fmtDate(u.createdAt)} &middot; {fmt(u.invoiceTotalCents)} &middot; {u.matchedCount} matched
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
                {uploads.filter((u) => u.status === 'RECONCILED').length === 0 && (
                  <p className="text-sm text-gray-400 mt-2">No reconciled invoices available. Upload and reconcile an invoice first.</p>
                )}
              </div>

              {/* Date Range */}
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Prescriptions From</label>
                  <input type="date" value={discrepancyStartDate}
                    onChange={(e) => setDiscrepancyStartDate(e.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">To</label>
                  <input type="date" value={discrepancyEndDate}
                    onChange={(e) => setDiscrepancyEndDate(e.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </div>
                <button onClick={fetchDiscrepancy}
                  disabled={discrepancyInvoiceIds.size === 0 || discrepancyLoading}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                  {discrepancyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitCompare className="h-4 w-4" />}
                  Run Comparison
                </button>
                {discrepancyData && (
                  <button onClick={exportDiscrepancyCsv}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
                    <Download className="h-4 w-4" /> Export CSV
                  </button>
                )}
              </div>

              {discrepancyError && (
                <div className="mt-3 flex items-center gap-2 text-sm text-red-600">
                  <AlertTriangle className="h-4 w-4" /> {discrepancyError}
                </div>
              )}
            </div>

            {/* Results */}
            {discrepancyData && (
              <>
                {/* Summary Cards */}
                {(() => {
                  const invoiceOnlyTotal = discrepancyData.onInvoiceOnly.reduce((s, p) => s + p.totalAmountCents, 0);
                  const matchedInvoiceTotal = discrepancyData.matched.reduce((s, p) => s + (
                    discrepancyData.onInvoiceOnly.find((x) => x.patientName === p.invoiceName)?.totalAmountCents ?? 0
                  ), 0);
                  return (
                    <>
                      <div className="grid gap-3 sm:grid-cols-4">
                        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                          <div className="text-xs font-medium text-gray-500">Invoice Patients</div>
                          <div className="mt-1 text-2xl font-bold text-gray-900">{discrepancyData.invoicePatientCount}</div>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                          <div className="text-xs font-medium text-gray-500">System Patients</div>
                          <div className="mt-1 text-2xl font-bold text-gray-900">{discrepancyData.systemPatientCount}</div>
                        </div>
                        <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm">
                          <div className="text-xs font-medium text-red-600">On Invoice Only</div>
                          <div className="mt-1 text-2xl font-bold text-red-700">{discrepancyData.summary.onInvoiceOnlyCount}</div>
                          <div className="text-sm font-bold text-red-600 mt-0.5">{fmt(invoiceOnlyTotal)}</div>
                          <div className="text-[11px] text-red-500">Billed but no Rx sent</div>
                        </div>
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                          <div className="text-xs font-medium text-amber-600">In System Only</div>
                          <div className="mt-1 text-2xl font-bold text-amber-700">{discrepancyData.summary.inSystemOnlyCount}</div>
                          <div className="text-[11px] text-amber-500">Rx sent but not on invoice</div>
                        </div>
                      </div>

                      {/* Monetary + patient difference */}
                      {(discrepancyData.summary.onInvoiceOnlyCount > 0 || discrepancyData.summary.inSystemOnlyCount > 0) && (
                        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
                          <div className="flex items-center gap-2 text-sm font-medium text-blue-800">
                            <GitCompare className="h-4 w-4" />
                            Net difference: {Math.abs(discrepancyData.invoicePatientCount - discrepancyData.systemPatientCount)} patients
                            {discrepancyData.invoicePatientCount > discrepancyData.systemPatientCount
                              ? ' (invoice has more)'
                              : discrepancyData.invoicePatientCount < discrepancyData.systemPatientCount
                              ? ' (system has more)'
                              : ''}
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-blue-600">
                            <span>{discrepancyData.summary.matchedCount} patients match</span>
                            <span>&middot; {discrepancyData.summary.onInvoiceOnlyCount} on invoice only</span>
                            <span>&middot; {discrepancyData.summary.inSystemOnlyCount} in system only</span>
                          </div>
                          {invoiceOnlyTotal > 0 && (
                            <div className="mt-2 flex items-center gap-3 rounded-lg bg-white/60 px-3 py-2">
                              <DollarSign className="h-4 w-4 text-red-500" />
                              <div>
                                <div className="text-sm font-bold text-red-700">
                                  {fmt(invoiceOnlyTotal)} billed for patients not in date range
                                </div>
                                <div className="text-[11px] text-gray-500">
                                  {discrepancyData.summary.onInvoiceOnlyCount} patients &middot; across {discrepancyData.onInvoiceOnly.reduce((s, p) => s + p.lineItems.length, 0)} line items
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* Sub-tabs + Search */}
                <div className="flex items-center justify-between">
                  <div className="flex border-b border-gray-200">
                    <button onClick={() => setDiscrepancyView('invoiceOnly')}
                      className={`border-b-2 px-3 py-2 text-sm font-medium ${
                        discrepancyView === 'invoiceOnly' ? 'border-red-500 text-red-600' : 'border-transparent text-gray-500'
                      }`}>
                      On Invoice Only ({discrepancyData.summary.onInvoiceOnlyCount})
                    </button>
                    <button onClick={() => setDiscrepancyView('systemOnly')}
                      className={`border-b-2 px-3 py-2 text-sm font-medium ${
                        discrepancyView === 'systemOnly' ? 'border-amber-500 text-amber-600' : 'border-transparent text-gray-500'
                      }`}>
                      In System Only ({discrepancyData.summary.inSystemOnlyCount})
                    </button>
                    <button onClick={() => setDiscrepancyView('matched')}
                      className={`border-b-2 px-3 py-2 text-sm font-medium ${
                        discrepancyView === 'matched' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500'
                      }`}>
                      Matched ({discrepancyData.summary.matchedCount})
                    </button>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                    <input type="text" value={discrepancySearch}
                      onChange={(e) => setDiscrepancySearch(e.target.value)}
                      placeholder="Search patients..."
                      className="w-56 rounded-lg border border-gray-300 py-1.5 pl-8 pr-3 text-sm" />
                  </div>
                </div>

                {/* On Invoice Only list */}
                {discrepancyView === 'invoiceOnly' && (
                  <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                    {discrepancyData.onInvoiceOnly.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                        <CheckCircle className="mb-2 h-8 w-8 text-emerald-400" />
                        <span className="text-sm font-medium text-emerald-600">No discrepancies</span>
                        <span className="text-xs">All invoice patients have matching prescriptions in the system</span>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {discrepancyData.onInvoiceOnly
                          .filter((p) => !discrepancySearch || p.patientName.toLowerCase().includes(discrepancySearch.toLowerCase()))
                          .map((p, i) => {
                            const isExpanded = expandedDiscrepancy.has(i);
                            return (
                              <div key={i}>
                                <button
                                  onClick={() => setExpandedDiscrepancy((prev) => {
                                    const n = new Set(prev);
                                    n.has(i) ? n.delete(i) : n.add(i);
                                    return n;
                                  })}
                                  className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-red-50/50 transition-colors"
                                >
                                  <span className="text-xs text-gray-400 w-6 text-right shrink-0">{i + 1}</span>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-sm font-semibold text-gray-900">{p.patientName}</span>
                                      <span className="text-sm font-bold text-red-600">{fmt(p.totalAmountCents)}</span>
                                      <span className="text-xs text-gray-400">{p.lineItems.length} item{p.lineItems.length !== 1 ? 's' : ''}</span>
                                    </div>
                                    <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                                      {p.foundInSystem ? (
                                        <>
                                          <span className="text-[11px] text-blue-600 font-medium">
                                            Rx written: {p.systemOrderDates.map((d) => fmtDate(d.createdAt)).join(', ')}
                                          </span>
                                          {p.systemOrderDates.map((d) => (
                                            <span key={d.lifefileOrderId} className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                                              {d.status ?? 'sent'}
                                            </span>
                                          ))}
                                        </>
                                      ) : (
                                        <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-600">
                                          Not in system
                                        </span>
                                      )}
                                      <span className="text-[11px] text-gray-400 font-mono">
                                        {p.lifefileOrderIds.join(', ')}
                                      </span>
                                    </div>
                                  </div>
                                  {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />}
                                </button>

                                {isExpanded && p.lineItems.length > 0 && (
                                  <div className="border-t border-gray-100 bg-gray-50 px-5 py-2">
                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className="text-left text-[11px] font-medium uppercase tracking-wider text-gray-400">
                                          <th className="py-1.5 pr-4"><Pill className="inline h-3 w-3" /> Medication</th>
                                          <th className="py-1.5 pr-4">Strength</th>
                                          <th className="py-1.5 pr-4">Qty</th>
                                          <th className="py-1.5 pr-4 text-right">Unit Price</th>
                                          <th className="py-1.5 pr-4 text-right">Amount</th>
                                          <th className="py-1.5">Order ID</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100">
                                        {p.lineItems.map((li, j) => (
                                          <tr key={j}>
                                            <td className="py-1.5 pr-4 text-xs font-medium text-gray-700">
                                              {li.medicationName || li.description || '—'}
                                            </td>
                                            <td className="py-1.5 pr-4 text-xs text-gray-500">{li.strength || '—'}</td>
                                            <td className="py-1.5 pr-4 text-xs text-gray-500">{li.quantity}</td>
                                            <td className="py-1.5 pr-4 text-xs text-gray-500 text-right">{fmt(li.unitPriceCents)}</td>
                                            <td className="py-1.5 pr-4 text-xs font-semibold text-red-600 text-right">{fmt(li.amountCents)}</td>
                                            <td className="py-1.5 text-xs text-gray-400 font-mono">{li.lifefileOrderId ?? '—'}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                      <tfoot>
                                        <tr className="border-t border-gray-200">
                                          <td colSpan={4} className="py-1.5 pr-4 text-xs font-semibold text-gray-700 text-right">Total</td>
                                          <td className="py-1.5 pr-4 text-xs font-bold text-red-700 text-right">{fmt(p.totalAmountCents)}</td>
                                          <td />
                                        </tr>
                                      </tfoot>
                                    </table>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                )}

                {/* In System Only list */}
                {discrepancyView === 'systemOnly' && (
                  <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                    {discrepancyData.inSystemOnly.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                        <CheckCircle className="mb-2 h-8 w-8 text-emerald-400" />
                        <span className="text-sm font-medium text-emerald-600">No discrepancies</span>
                        <span className="text-xs">All system prescriptions appear on the selected invoices</span>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                              <th className="px-5 py-3">#</th>
                              <th className="px-5 py-3">Patient Name (System)</th>
                              <th className="px-5 py-3">Orders</th>
                              <th className="px-5 py-3">Medications</th>
                              <th className="px-5 py-3">Latest Order</th>
                              <th className="px-5 py-3">Lifefile Order IDs</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {discrepancyData.inSystemOnly
                              .filter((p) => !discrepancySearch || p.patientName.toLowerCase().includes(discrepancySearch.toLowerCase()))
                              .map((p, i) => (
                              <tr key={i} className="hover:bg-amber-50/50">
                                <td className="px-5 py-2.5 text-xs text-gray-400">{i + 1}</td>
                                <td className="px-5 py-2.5 text-sm font-medium text-gray-900">{p.patientName}</td>
                                <td className="px-5 py-2.5 text-sm text-gray-600">{p.orderCount}</td>
                                <td className="px-5 py-2.5 text-xs text-gray-500 max-w-xs truncate">{p.medications}</td>
                                <td className="px-5 py-2.5 text-sm text-gray-500">{fmtDate(p.latestOrderDate)}</td>
                                <td className="px-5 py-2.5 text-xs text-gray-400 font-mono">{p.lifefileOrderIds.join(', ')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Matched list */}
                {discrepancyView === 'matched' && (
                  <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                    {discrepancyData.matched.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                        <AlertTriangle className="mb-2 h-8 w-8" />
                        <span className="text-sm">No matching patients found</span>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                              <th className="px-5 py-3">#</th>
                              <th className="px-5 py-3">Invoice Name</th>
                              <th className="px-5 py-3"><ArrowRight className="inline h-3 w-3" /></th>
                              <th className="px-5 py-3">System Name</th>
                              <th className="px-5 py-3">Invoice Orders</th>
                              <th className="px-5 py-3">System Orders</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {discrepancyData.matched
                              .filter((p) => !discrepancySearch || p.invoiceName.toLowerCase().includes(discrepancySearch.toLowerCase()) || p.systemName.toLowerCase().includes(discrepancySearch.toLowerCase()))
                              .map((p, i) => (
                              <tr key={i} className="hover:bg-gray-50">
                                <td className="px-5 py-2.5 text-xs text-gray-400">{i + 1}</td>
                                <td className="px-5 py-2.5 text-sm text-gray-700">{p.invoiceName}</td>
                                <td className="px-5 py-2.5 text-emerald-400"><ArrowRight className="h-3.5 w-3.5" /></td>
                                <td className="px-5 py-2.5 text-sm text-gray-700">{p.systemName}</td>
                                <td className="px-5 py-2.5 text-sm text-gray-600">{p.invoiceOrderCount}</td>
                                <td className="px-5 py-2.5 text-sm text-gray-600">{p.systemOrderCount}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </>
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
