'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  Download,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  DollarSign,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface StatementData {
  statement: {
    id: number;
    createdAt: string;
    title: string;
    totalCents: number;
    invoiceIds: number[];
    notes: string | null;
  };
  invoices: Array<{
    id: number;
    fileName: string;
    invoiceNumber: string | null;
    invoiceDate: string | null;
    invoiceTotalCents: number;
    matchedCount: number;
    unmatchedCount: number;
    totalLineItems: number;
    paymentStatus: string;
    paidAmountCents: number;
    paymentReference: string | null;
    paidAt: string | null;
  }>;
}

const fmt = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

const PAY_BADGE: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  PAID: { label: 'Paid', cls: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  PARTIAL: { label: 'Partial', cls: 'bg-amber-100 text-amber-700', icon: Clock },
  UNPAID: { label: 'Unpaid', cls: 'bg-red-100 text-red-700', icon: XCircle },
};

export default function StatementDetailPage() {
  const params = useParams();
  const stmtId = params?.id as string;
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<StatementData | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch(`/api/admin/pharmacy-invoices/statements/${stmtId}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch {
      /* */
    } finally {
      setLoading(false);
    }
  }, [stmtId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExportCsv = () => {
    window.open(`/api/admin/pharmacy-invoices/statements/${stmtId}/export`, '_blank');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#efece7]">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#efece7]">
        <p className="text-gray-500">Statement not found.</p>
        <a
          href="/admin/pharmacy-invoices"
          onClick={(e) => {
            e.preventDefault();
            window.location.href = '/admin/pharmacy-invoices';
          }}
          className="text-emerald-600 hover:underline"
        >
          Back to invoices
        </a>
      </div>
    );
  }

  const { statement: s, invoices } = data;
  const totalPaid = invoices.reduce((sum, inv) => sum + inv.paidAmountCents, 0);
  const totalUnpaid = s.totalCents - totalPaid;
  const allPaid = invoices.every((inv) => inv.paymentStatus === 'PAID');

  return (
    <div className="min-h-screen bg-[#efece7]">
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Back */}
        <a
          href="/admin/pharmacy-invoices"
          onClick={(e) => {
            e.preventDefault();
            window.location.href = '/admin/pharmacy-invoices';
          }}
          className="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" /> Back to invoices
        </a>

        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{s.title}</h1>
            <p className="mt-1 text-sm text-gray-500">
              Created {fmtDate(s.createdAt)} &middot; {invoices.length} invoices
              {s.notes && <> &middot; {s.notes}</>}
            </p>
          </div>
          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>

        {/* Summary Cards */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-gray-400" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
                Statement Total
              </span>
            </div>
            <div className="mt-1.5 text-xl font-bold text-gray-900">{fmt(s.totalCents)}</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
                Paid
              </span>
            </div>
            <div className="mt-1.5 text-xl font-bold text-emerald-600">{fmt(totalPaid)}</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-red-500" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
                Outstanding
              </span>
            </div>
            <div className="mt-1.5 text-xl font-bold text-red-600">{fmt(totalUnpaid)}</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
                Status
              </span>
            </div>
            <div
              className={`mt-1.5 text-xl font-bold ${allPaid ? 'text-emerald-600' : 'text-red-600'}`}
            >
              {allPaid ? 'Fully Paid' : 'Outstanding'}
            </div>
          </div>
        </div>

        {/* Invoices Table */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Included Invoices</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-6 py-3">Invoice</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Amount</th>
                  <th className="px-6 py-3">Items</th>
                  <th className="px-6 py-3">Matched</th>
                  <th className="px-6 py-3">Payment</th>
                  <th className="px-6 py-3">Paid Amount</th>
                  <th className="px-6 py-3">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((inv) => {
                  const payBadge = PAY_BADGE[inv.paymentStatus] ?? PAY_BADGE.UNPAID;
                  const PayIcon = payBadge.icon;
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3">
                        <a
                          href={`/admin/pharmacy-invoices/${inv.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            window.location.href = `/admin/pharmacy-invoices/${inv.id}`;
                          }}
                          className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
                        >
                          {inv.invoiceNumber ? `#${inv.invoiceNumber}` : inv.fileName}
                        </a>
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-600">
                        {fmtDate(inv.invoiceDate)}
                      </td>
                      <td className="px-6 py-3 text-sm font-semibold text-gray-900">
                        {fmt(inv.invoiceTotalCents)}
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-600">{inv.totalLineItems}</td>
                      <td className="px-6 py-3 text-sm text-emerald-600">
                        {inv.matchedCount} / {inv.totalLineItems}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${payBadge.cls}`}
                        >
                          <PayIcon className="h-3 w-3" />
                          {payBadge.label}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-900">
                        {inv.paidAmountCents > 0 ? fmt(inv.paidAmountCents) : '—'}
                      </td>
                      <td className="px-6 py-3 text-xs text-gray-400">
                        {inv.paymentReference ?? '—'}
                        {inv.paidAt && <div className="text-[10px]">{fmtDate(inv.paidAt)}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                  <td className="px-6 py-3 text-sm text-gray-900">TOTAL</td>
                  <td />
                  <td className="px-6 py-3 text-sm text-gray-900">{fmt(s.totalCents)}</td>
                  <td className="px-6 py-3 text-sm text-gray-600">
                    {invoices.reduce((s, i) => s + i.totalLineItems, 0)}
                  </td>
                  <td className="px-6 py-3 text-sm text-emerald-600">
                    {invoices.reduce((s, i) => s + i.matchedCount, 0)}
                  </td>
                  <td />
                  <td className="px-6 py-3 text-sm text-emerald-600">{fmt(totalPaid)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
