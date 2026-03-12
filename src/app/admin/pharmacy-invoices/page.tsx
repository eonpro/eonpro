'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
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
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

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
  errorMessage: string | null;
}

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  PENDING: { label: 'Pending', color: 'bg-gray-100 text-gray-700', icon: Clock },
  PARSING: { label: 'Parsing...', color: 'bg-blue-100 text-blue-700', icon: Loader2 },
  PARSED: { label: 'Parsed', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  MATCHING: { label: 'Matching...', color: 'bg-blue-100 text-blue-700', icon: Loader2 },
  RECONCILED: { label: 'Reconciled', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  ERROR: { label: 'Error', color: 'bg-red-100 text-red-700', icon: XCircle },
};

export default function PharmacyInvoicesPage() {
  const [uploads, setUploads] = useState<InvoiceUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchUploads = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch(`/api/admin/pharmacy-invoices?page=${page}&limit=20`);
      const json = await res.json();
      if (json.success) {
        setUploads(json.data.uploads);
        setTotalPages(json.data.totalPages);
      }
    } catch {
      // Error handled silently
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchUploads();
  }, [fetchUploads]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isCsv = file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv') || file.type === 'application/vnd.ms-excel';
    if (!isPdf && !isCsv) {
      setUploadError('Only PDF and CSV files are accepted.');
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await apiFetch('/api/admin/pharmacy-invoices', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) {
        setUploadError(json.error ?? 'Upload failed');
      } else {
        fetchUploads();
      }
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this invoice upload and all its data?')) return;
    setDeletingId(id);
    try {
      await apiFetch(`/api/admin/pharmacy-invoices/${id}`, { method: 'DELETE' });
      fetchUploads();
    } finally {
      setDeletingId(null);
    }
  };

  const handleRerun = async (id: number) => {
    try {
      await apiFetch(`/api/admin/pharmacy-invoices/${id}`, { method: 'PATCH' });
      fetchUploads();
    } catch {
      // handled
    }
  };

  return (
    <div className="min-h-screen bg-[#efece7]">
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Pharmacy Invoice Reconciliation</h1>
          <p className="mt-1 text-sm text-gray-500">
            Upload WellMedR/Lifefile pharmacy invoices to reconcile charges against your prescriptions.
          </p>
        </div>

        {/* Upload Area */}
        <div className="mb-8 rounded-xl border-2 border-dashed border-gray-300 bg-white p-8 text-center transition-colors hover:border-emerald-400">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.csv,application/pdf,text/csv"
            onChange={handleUpload}
            className="hidden"
            id="invoice-upload"
            disabled={uploading}
          />
          <label
            htmlFor="invoice-upload"
            className="flex cursor-pointer flex-col items-center gap-3"
          >
            {uploading ? (
              <>
                <Loader2 className="h-10 w-10 animate-spin text-emerald-500" />
                <span className="text-sm font-medium text-gray-700">
                  Uploading and parsing invoice...
                </span>
                <span className="text-xs text-gray-400">
                  This may take a moment for large files.
                </span>
              </>
            ) : (
              <>
                <Upload className="h-10 w-10 text-gray-400" />
                <span className="text-sm font-medium text-gray-700">
                  Drop a pharmacy invoice PDF or CSV here, or click to upload
                </span>
                <span className="text-xs text-gray-400">
                  WellMedR/Lifefile invoice PDFs or CSV exports up to 50 MB
                </span>
              </>
            )}
          </label>
          {uploadError && (
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-red-600">
              <AlertTriangle className="h-4 w-4" />
              {uploadError}
            </div>
          )}
        </div>

        {/* Invoices Table */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Uploaded Invoices</h2>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : uploads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <FileText className="mb-3 h-10 w-10" />
              <span className="text-sm">No invoices uploaded yet</span>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      <th className="px-6 py-3">Invoice</th>
                      <th className="px-6 py-3">Date</th>
                      <th className="px-6 py-3">Amount</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3">Matched</th>
                      <th className="px-6 py-3">Unmatched</th>
                      <th className="px-6 py-3">Discrepancies</th>
                      <th className="px-6 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {uploads.map((u) => {
                      const cfg = STATUS_CONFIG[u.status] ?? STATUS_CONFIG.PENDING;
                      const StatusIcon = cfg.icon;
                      const matchPct =
                        u.totalLineItems > 0
                          ? Math.round((u.matchedCount / u.totalLineItems) * 100)
                          : 0;

                      return (
                        <tr key={u.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <Link
                              href={`/admin/pharmacy-invoices/${u.id}`}
                              className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
                            >
                              {u.invoiceNumber ? `#${u.invoiceNumber}` : u.fileName}
                            </Link>
                            <div className="text-xs text-gray-400">
                              {u.pharmacyName ?? 'Unknown pharmacy'}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {u.invoiceDate
                              ? new Date(u.invoiceDate).toLocaleDateString()
                              : new Date(u.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">
                            {u.invoiceTotalCents
                              ? formatCurrency(u.invoiceTotalCents)
                              : u.amountDueCents
                                ? formatCurrency(u.amountDueCents)
                                : '—'}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.color}`}
                            >
                              <StatusIcon className="h-3 w-3" />
                              {cfg.label}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-emerald-600">
                              {u.matchedCount}
                              <span className="ml-1 text-xs text-gray-400">
                                ({matchPct}%)
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-red-600">
                            {u.unmatchedCount || '—'}
                          </td>
                          <td className="px-6 py-4 text-sm text-amber-600">
                            {u.discrepancyCount || '—'}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/admin/pharmacy-invoices/${u.id}`}
                                className="text-xs font-medium text-gray-500 hover:text-emerald-600"
                              >
                                View
                              </Link>
                              <button
                                onClick={() => handleRerun(u.id)}
                                className="text-gray-400 hover:text-blue-500"
                                title="Re-run reconciliation"
                              >
                                <RefreshCw className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(u.id)}
                                disabled={deletingId === u.id}
                                className="text-gray-400 hover:text-red-500 disabled:opacity-50"
                                title="Delete"
                              >
                                {deletingId === u.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-gray-100 px-6 py-3">
                  <span className="text-sm text-gray-500">
                    Page {page} of {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="rounded-md border border-gray-300 p-1.5 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="rounded-md border border-gray-300 p-1.5 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
