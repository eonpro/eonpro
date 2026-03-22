'use client';

import { instantToCalendarDate } from '@/lib/utils/platform-calendar';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText,
  Download,
  Plus,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  DollarSign,
  Send,
  Layers,
  Loader2,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';
import { normalizedIncludes } from '@/lib/utils/search';

interface Invoice {
  id: number;
  invoiceNumber: string;
  periodStart: string;
  periodEnd: string;
  periodType: string;
  totalAmountCents: number;
  prescriptionCount: number;
  transmissionCount: number;
  status: string;
  dueDate: string;
  stripeInvoiceUrl: string | null;
  pdfUrl: string | null;
  createdAt: string;
  clinic: { id: number; name: string };
}

interface SummaryBucket { count: number; amount: number }
interface Summary {
  draft: SummaryBucket;
  pending: SummaryBucket;
  sent: SummaryBucket;
  overdue: SummaryBucket;
  paid: SummaryBucket;
  totalInvoices: number;
  totalAmountCents: number;
  paidAmountCents: number;
  outstandingAmountCents: number;
}

interface Clinic { id: number; name: string }

interface PreviewData {
  feeCount: number;
  prescriptionCount: number;
  transmissionCount: number;
  totalAmountCents: number;
  prescriptionFeeTotal: number;
  transmissionFeeTotal: number;
  adminFeeTotal: number;
  hasConfig: boolean;
}

interface BatchResult {
  clinicId: number;
  clinicName: string;
  status: 'created' | 'skipped' | 'error';
  invoiceNumber?: string;
  totalAmountCents?: number;
  feeCount?: number;
  reason?: string;
}

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

export default function InvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [clinicFilter, setClinicFilter] = useState('');

  // Single invoice creation
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    clinicId: '',
    periodType: 'MONTHLY' as 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'CUSTOM',
    periodStart: '',
    periodEnd: '',
    createStripeInvoice: true,
  });
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Batch generation
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchForm, setBatchForm] = useState({
    periodType: 'MONTHLY' as 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'CUSTOM',
    periodStart: '',
    periodEnd: '',
    createStripeInvoice: true,
  });
  const [batchResults, setBatchResults] = useState<{
    summary: { total: number; created: number; skipped: number; errors: number; totalAmountCents: number };
    results: BatchResult[];
  } | null>(null);

  const fetchInvoices = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth-token');
      if (!token) { router.push('/login'); return; }
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (clinicFilter) params.set('clinicId', clinicFilter);
      const response = await apiFetch(`/api/super-admin/clinic-invoices?${params}`);
      if (response.ok) {
        const data = await response.json();
        setInvoices(data.invoices || []);
        setSummary(data.summary || null);
      }
    } catch { /* silent */ } finally { setLoading(false); }
  }, [router, statusFilter, clinicFilter]);

  const fetchClinics = async () => {
    try {
      const response = await apiFetch('/api/super-admin/clinic-fees');
      if (response.ok) {
        const data = await response.json();
        setClinics(data.clinics?.map((c: { clinic: Clinic }) => c.clinic) || []);
      }
    } catch { /* silent */ }
  };

  useEffect(() => { fetchInvoices(); fetchClinics(); }, [fetchInvoices]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('create') === '1' && params.get('clinicId')) {
      setCreateForm((f) => ({ ...f, clinicId: params.get('clinicId')! }));
      setCreateModalOpen(true);
      window.history.replaceState({}, '', '/super-admin/clinic-billing/invoices');
    }
  }, []);

  // Auto-fetch preview when clinic + dates are set
  useEffect(() => {
    if (!createForm.clinicId || !createForm.periodStart || !createForm.periodEnd) {
      setPreview(null);
      return;
    }
    const controller = new AbortController();
    const fetchPreview = async () => {
      setPreviewLoading(true);
      try {
        const params = new URLSearchParams({
          clinicId: createForm.clinicId,
          periodStart: createForm.periodStart,
          periodEnd: createForm.periodEnd,
        });
        const res = await apiFetch(`/api/super-admin/clinic-invoices/preview?${params}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const json = await res.json();
          setPreview(json);
        }
      } catch { /* aborted or error */ } finally {
        setPreviewLoading(false);
      }
    };
    const timer = setTimeout(fetchPreview, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [createForm.clinicId, createForm.periodStart, createForm.periodEnd]);

  const createInvoice = async () => {
    if (!createForm.clinicId || !createForm.periodStart || !createForm.periodEnd) {
      alert('Please fill in all required fields');
      return;
    }
    setCreating(true);
    try {
      const response = await apiFetch('/api/super-admin/clinic-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId: parseInt(createForm.clinicId),
          periodType: createForm.periodType,
          periodStart: createForm.periodStart,
          periodEnd: createForm.periodEnd,
          createStripeInvoice: createForm.createStripeInvoice,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setCreateModalOpen(false);
        setCreateForm({ clinicId: '', periodType: 'MONTHLY', periodStart: '', periodEnd: '', createStripeInvoice: true });
        setPreview(null);
        fetchInvoices();
        router.push(`/super-admin/clinic-billing/invoices/${data.invoice.id}`);
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to create invoice');
      }
    } catch {
      alert('Failed to create invoice');
    } finally { setCreating(false); }
  };

  const runBatchGeneration = async () => {
    if (!batchForm.periodStart || !batchForm.periodEnd) {
      alert('Please select a date range');
      return;
    }
    setBatchRunning(true);
    setBatchResults(null);
    try {
      const response = await apiFetch('/api/super-admin/clinic-invoices/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batchForm),
      });
      if (response.ok) {
        const data = await response.json();
        setBatchResults(data);
        fetchInvoices();
      } else {
        const error = await response.json();
        alert(error.error || 'Batch generation failed');
      }
    } catch {
      alert('Batch generation failed');
    } finally { setBatchRunning(false); }
  };

  const setPresetDates = (preset: string, target: 'create' | 'batch' = 'create') => {
    const now = new Date();
    let start: Date;
    let end: Date;
    let periodType: typeof createForm.periodType = 'MONTHLY';
    switch (preset) {
      case 'this-month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'last-month':
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'this-quarter': {
        const q = Math.floor(now.getMonth() / 3);
        start = new Date(now.getFullYear(), q * 3, 1);
        end = new Date(now.getFullYear(), q * 3 + 3, 0);
        periodType = 'QUARTERLY';
        break;
      }
      case 'last-quarter': {
        const lq = Math.floor(now.getMonth() / 3) - 1;
        const y = lq < 0 ? now.getFullYear() - 1 : now.getFullYear();
        const qn = lq < 0 ? 3 : lq;
        start = new Date(y, qn * 3, 1);
        end = new Date(y, qn * 3 + 3, 0);
        periodType = 'QUARTERLY';
        break;
      }
      default:
        return;
    }
    const s = instantToCalendarDate(start);
    const e = instantToCalendarDate(end);
    if (target === 'create') {
      setCreateForm((f) => ({ ...f, periodType, periodStart: s, periodEnd: e }));
    } else {
      setBatchForm((f) => ({ ...f, periodType, periodStart: s, periodEnd: e }));
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; text: string; icon: typeof Clock }> = {
      DRAFT: { bg: 'bg-gray-100', text: 'text-gray-700', icon: Clock },
      PENDING: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: AlertCircle },
      SENT: { bg: 'bg-blue-100', text: 'text-blue-700', icon: Send },
      PAID: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle },
      PARTIALLY_PAID: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: DollarSign },
      OVERDUE: { bg: 'bg-red-100', text: 'text-red-700', icon: AlertCircle },
      CANCELLED: { bg: 'bg-gray-100', text: 'text-gray-500', icon: XCircle },
    };
    const style = styles[status] || styles.DRAFT;
    const Icon = style.icon;
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${style.bg} ${style.text}`}>
        <Icon className="h-3 w-3" />
        {status.replace('_', ' ')}
      </span>
    );
  };

  const filteredInvoices = invoices.filter(
    (inv) => normalizedIncludes(inv.invoiceNumber, searchTerm) || normalizedIncludes(inv.clinic.name, searchTerm)
  );

  return (
    <div>
      {/* Action Buttons */}
      <div className="mb-6 flex items-center justify-end">
        <div className="flex gap-2">
          <button
            onClick={() => { setBatchResults(null); setBatchModalOpen(true); }}
            className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          >
            <Layers className="h-5 w-5" />
            Batch Generate
          </button>
          <button
            onClick={() => { setPreview(null); setCreateModalOpen(true); }}
            className="flex items-center gap-2 rounded-xl bg-[#4fa77e] px-4 py-2 text-white shadow-sm transition-colors hover:bg-[#3d9268]"
          >
            <Plus className="h-5 w-5" />
            Generate Invoice
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
          {[
            { label: 'Draft', data: summary.draft, color: 'text-gray-900' },
            { label: 'Pending', data: summary.pending, color: 'text-yellow-600' },
            { label: 'Sent', data: summary.sent, color: 'text-blue-600' },
            { label: 'Overdue', data: summary.overdue, color: 'text-red-600' },
            { label: 'Paid', data: summary.paid, color: 'text-green-600' },
          ].map(({ label, data: d, color }) => (
            <div key={label} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <p className="mb-1 text-sm text-gray-500">{label}</p>
              <p className={`text-xl font-bold ${color}`}>{d.count}</p>
              <p className="text-sm text-gray-500">{formatCurrency(d.amount)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search invoices..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-gray-200 py-2.5 pl-4 pr-4 focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-gray-200 px-4 py-2.5 focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20">
            <option value="">All Statuses</option>
            {['DRAFT', 'PENDING', 'SENT', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'CANCELLED'].map((s) => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
          <select value={clinicFilter} onChange={(e) => setClinicFilter(e.target.value)} className="rounded-xl border border-gray-200 px-4 py-2.5 focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20">
            <option value="">All Clinics</option>
            {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {/* Invoice Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#4fa77e] border-t-transparent" />
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="py-12 text-center">
            <FileText className="mx-auto mb-4 h-12 w-12 text-gray-300" />
            <p className="text-gray-500">No invoices found</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                {['Invoice', 'Clinic', 'Period', 'Items', 'Amount', 'Status', 'Due Date', ''].map((h, i) => (
                  <th key={i} className={`px-6 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 ${i === 7 ? 'text-right' : 'text-left'}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredInvoices.map((inv) => (
                <tr key={inv.id} className="cursor-pointer hover:bg-gray-50" onClick={() => router.push(`/super-admin/clinic-billing/invoices/${inv.id}`)}>
                  <td className="whitespace-nowrap px-6 py-4">
                    <p className="font-medium text-gray-900">{inv.invoiceNumber}</p>
                    <p className="text-xs text-gray-500">{formatDate(inv.createdAt)}</p>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">{inv.clinic.name}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">{formatDate(inv.periodStart)} - {formatDate(inv.periodEnd)}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">{inv.prescriptionCount + inv.transmissionCount} fees</td>
                  <td className="whitespace-nowrap px-6 py-4 font-medium text-gray-900">{formatCurrency(inv.totalAmountCents)}</td>
                  <td className="whitespace-nowrap px-6 py-4">{getStatusBadge(inv.status)}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">{formatDate(inv.dueDate)}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                    {inv.pdfUrl && (
                      <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg p-2 text-gray-500 hover:bg-[#4fa77e]/10 hover:text-[#4fa77e]">
                        <Download className="inline h-4 w-4" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Invoice Modal (with Preview) */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="border-b border-gray-100 p-6">
              <h2 className="text-xl font-bold text-gray-900">Generate Invoice</h2>
            </div>
            <div className="space-y-5 p-6">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Clinic</label>
                <select value={createForm.clinicId} onChange={(e) => setCreateForm({ ...createForm, clinicId: e.target.value })} className="w-full rounded-lg border border-gray-200 px-4 py-2.5 focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20">
                  <option value="">Select clinic...</option>
                  {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Period Type</label>
                <select value={createForm.periodType} onChange={(e) => setCreateForm({ ...createForm, periodType: e.target.value as typeof createForm.periodType })} className="w-full rounded-lg border border-gray-200 px-4 py-2.5 focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20">
                  {['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM'].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Quick Presets</label>
                <div className="flex flex-wrap gap-2">
                  {['this-month', 'last-month', 'this-quarter', 'last-quarter'].map((p) => (
                    <button key={p} type="button" onClick={() => setPresetDates(p, 'create')} className="rounded-lg border border-gray-200 px-3 py-1 text-sm hover:bg-gray-50">
                      {p.replace('-', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Start Date</label>
                  <input type="date" value={createForm.periodStart} onChange={(e) => setCreateForm({ ...createForm, periodStart: e.target.value })} className="w-full rounded-lg border border-gray-200 px-4 py-2.5 focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">End Date</label>
                  <input type="date" value={createForm.periodEnd} onChange={(e) => setCreateForm({ ...createForm, periodEnd: e.target.value })} className="w-full rounded-lg border border-gray-200 px-4 py-2.5 focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20" />
                </div>
              </div>

              {/* Live Preview */}
              {(preview || previewLoading) && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="mb-2 text-sm font-medium text-gray-700">Invoice Preview</p>
                  {previewLoading ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading preview...
                    </div>
                  ) : preview && preview.feeCount > 0 ? (
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-gray-600">Prescription fees ({preview.prescriptionCount})</span><span className="font-medium">{formatCurrency(preview.prescriptionFeeTotal ?? 0)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">Transmission fees ({preview.transmissionCount})</span><span className="font-medium">{formatCurrency(preview.transmissionFeeTotal ?? 0)}</span></div>
                      {(preview.adminFeeTotal ?? 0) > 0 && (
                        <div className="flex justify-between"><span className="text-gray-600">Admin fees</span><span className="font-medium">{formatCurrency(preview.adminFeeTotal)}</span></div>
                      )}
                      <div className="flex justify-between border-t border-gray-200 pt-1 font-semibold"><span>Total ({preview.feeCount} fees)</span><span>{formatCurrency(preview.totalAmountCents)}</span></div>
                    </div>
                  ) : (
                    <p className="text-sm text-yellow-600">No pending fees found for this clinic/period.</p>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                <div>
                  <p className="font-medium text-gray-900">Create Stripe Invoice</p>
                  <p className="text-sm text-gray-500">Also create in Stripe for payment collection</p>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input type="checkbox" checked={createForm.createStripeInvoice} onChange={(e) => setCreateForm({ ...createForm, createStripeInvoice: e.target.checked })} className="peer sr-only" />
                  <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-[#4fa77e] peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#4fa77e]/20" />
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-100 p-6">
              <button onClick={() => setCreateModalOpen(false)} className="rounded-lg px-4 py-2 text-gray-700 hover:bg-gray-100">Cancel</button>
              <button onClick={createInvoice} disabled={creating || !preview || preview.feeCount === 0} className="rounded-lg bg-[#4fa77e] px-4 py-2 text-white hover:bg-[#3d9268] disabled:opacity-50">
                {creating ? 'Creating...' : 'Generate Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Generate Modal */}
      {batchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="border-b border-gray-100 p-6">
              <h2 className="text-xl font-bold text-gray-900">Batch Invoice Generation</h2>
              <p className="mt-1 text-sm text-gray-500">Generate invoices for all clinics with pending fees</p>
            </div>
            <div className="space-y-5 p-6">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Period Type</label>
                <select value={batchForm.periodType} onChange={(e) => setBatchForm({ ...batchForm, periodType: e.target.value as typeof batchForm.periodType })} className="w-full rounded-lg border border-gray-200 px-4 py-2.5 focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20">
                  {['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM'].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Quick Presets</label>
                <div className="flex flex-wrap gap-2">
                  {['this-month', 'last-month', 'this-quarter', 'last-quarter'].map((p) => (
                    <button key={p} type="button" onClick={() => setPresetDates(p, 'batch')} className="rounded-lg border border-gray-200 px-3 py-1 text-sm hover:bg-gray-50">
                      {p.replace('-', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Start Date</label>
                  <input type="date" value={batchForm.periodStart} onChange={(e) => setBatchForm({ ...batchForm, periodStart: e.target.value })} className="w-full rounded-lg border border-gray-200 px-4 py-2.5 focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">End Date</label>
                  <input type="date" value={batchForm.periodEnd} onChange={(e) => setBatchForm({ ...batchForm, periodEnd: e.target.value })} className="w-full rounded-lg border border-gray-200 px-4 py-2.5 focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20" />
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                <div>
                  <p className="font-medium text-gray-900">Create Stripe Invoices</p>
                  <p className="text-sm text-gray-500">Create Stripe invoices for each clinic</p>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input type="checkbox" checked={batchForm.createStripeInvoice} onChange={(e) => setBatchForm({ ...batchForm, createStripeInvoice: e.target.checked })} className="peer sr-only" />
                  <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-[#4fa77e] peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#4fa77e]/20" />
                </label>
              </div>

              {/* Results */}
              {batchResults && (
                <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="grid grid-cols-4 gap-3 text-center text-sm">
                    <div><p className="text-gray-500">Total</p><p className="text-lg font-bold">{batchResults.summary.total}</p></div>
                    <div><p className="text-gray-500">Created</p><p className="text-lg font-bold text-green-600">{batchResults.summary.created}</p></div>
                    <div><p className="text-gray-500">Skipped</p><p className="text-lg font-bold text-yellow-600">{batchResults.summary.skipped}</p></div>
                    <div><p className="text-gray-500">Errors</p><p className="text-lg font-bold text-red-600">{batchResults.summary.errors}</p></div>
                  </div>
                  {batchResults.summary.created > 0 && (
                    <p className="text-center text-sm font-medium text-gray-700">
                      Total invoiced: {formatCurrency(batchResults.summary.totalAmountCents)}
                    </p>
                  )}
                  <div className="max-h-48 overflow-y-auto">
                    {batchResults.results.map((r, i) => (
                      <div key={i} className="flex items-center justify-between border-b border-gray-200 py-2 text-sm last:border-0">
                        <span className="text-gray-700">{r.clinicName}</span>
                        {r.status === 'created' ? (
                          <span className="text-green-600">{r.invoiceNumber} - {formatCurrency(r.totalAmountCents ?? 0)}</span>
                        ) : r.status === 'skipped' ? (
                          <span className="text-yellow-600">{r.reason}</span>
                        ) : (
                          <span className="text-red-600">{r.reason}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-100 p-6">
              <button onClick={() => setBatchModalOpen(false)} className="rounded-lg px-4 py-2 text-gray-700 hover:bg-gray-100">
                {batchResults ? 'Close' : 'Cancel'}
              </button>
              {!batchResults && (
                <button onClick={runBatchGeneration} disabled={batchRunning} className="flex items-center gap-2 rounded-lg bg-[#4fa77e] px-4 py-2 text-white hover:bg-[#3d9268] disabled:opacity-50">
                  {batchRunning ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</> : <><Layers className="h-4 w-4" /> Generate All</>}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
