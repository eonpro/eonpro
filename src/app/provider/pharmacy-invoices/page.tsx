'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { FileText, Loader2, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface InvoiceUpload {
  id: number;
  createdAt: string;
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
}

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

export default function ProviderPharmacyInvoicesPage() {
  const [uploads, setUploads] = useState<InvoiceUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchUploads = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch(`/api/provider/pharmacy-invoices?page=${page}&limit=20`);
      const json = await res.json();
      if (json.success) {
        setUploads(json.data.uploads);
        setTotalPages(json.data.totalPages);
      }
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchUploads();
  }, [fetchUploads]);

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Pharmacy Invoice Reconciliation</h1>
        <p className="mt-1 text-sm text-gray-500">
          View reconciled pharmacy invoices to verify charges for your prescriptions.
        </p>
      </div>

      {/* Invoices Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : uploads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <FileText className="mb-3 h-10 w-10" />
            <span className="text-sm">No reconciled invoices available yet</span>
            <span className="mt-1 text-xs">
              Your clinic admin will upload pharmacy invoices for reconciliation.
            </span>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    <th className="px-6 py-3">Invoice</th>
                    <th className="px-6 py-3">Date</th>
                    <th className="px-6 py-3">Total</th>
                    <th className="px-6 py-3">Matched</th>
                    <th className="px-6 py-3">Unmatched</th>
                    <th className="px-6 py-3">Discrepancies</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {uploads.map((u) => {
                    const matchPct =
                      u.totalLineItems > 0
                        ? Math.round((u.matchedCount / u.totalLineItems) * 100)
                        : 0;

                    return (
                      <tr key={u.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <Link
                            href={`/provider/pharmacy-invoices/${u.id}`}
                            className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
                          >
                            {u.invoiceNumber ? `#${u.invoiceNumber}` : u.fileName}
                          </Link>
                          <div className="text-xs text-gray-400">
                            {u.pharmacyName ?? 'Pharmacy'}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {u.invoiceDate
                            ? new Date(u.invoiceDate).toLocaleDateString()
                            : new Date(u.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          {formatCurrency(u.invoiceTotalCents)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1 text-sm text-emerald-600">
                            <CheckCircle className="h-3.5 w-3.5" />
                            {u.matchedCount}
                            <span className="text-xs text-gray-400">({matchPct}%)</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-red-600">
                          {u.unmatchedCount || '—'}
                        </td>
                        <td className="px-6 py-4 text-sm text-amber-600">
                          {u.discrepancyCount || '—'}
                        </td>
                        <td className="px-6 py-4">
                          <Link
                            href={`/provider/pharmacy-invoices/${u.id}`}
                            className="text-xs font-medium text-gray-500 hover:text-emerald-600"
                          >
                            View Details
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

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
  );
}
