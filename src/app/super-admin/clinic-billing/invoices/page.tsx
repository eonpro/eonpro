'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText,
  Filter,
  Download,
  ChevronLeft,
  Plus,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  DollarSign,
  Send,
  Building2,
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
  clinic: {
    id: number;
    name: string;
  };
}

interface SummaryBucket {
  count: number;
  amount: number;
}

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

interface Clinic {
  id: number;
  name: string;
}

export default function InvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [clinicFilter, setClinicFilter] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<{
    clinicId: string;
    periodType: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'CUSTOM';
    periodStart: string;
    periodEnd: string;
    notes: string;
    externalNotes: string;
    createStripeInvoice: boolean;
  }>({
    clinicId: '',
    periodType: 'MONTHLY',
    periodStart: '',
    periodEnd: '',
    notes: '',
    externalNotes: '',
    createStripeInvoice: true,
  });
  const [preview, setPreview] = useState<{
    feeCount: number;
    prescriptionCount: number;
    transmissionCount: number;
    totalAmountCents: number;
    hasConfig: boolean;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const fetchInvoices = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth-token');
      if (!token) {
        router.push('/login');
        return;
      }

      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (clinicFilter) params.set('clinicId', clinicFilter);

      const response = await apiFetch(`/api/super-admin/clinic-invoices?${params}`);

      if (response.ok) {
        const data = await response.json();
        setInvoices(data.invoices || []);
        setSummary(data.summary || null);
      }
    } catch (error) {
      console.error('Failed to fetch invoices:', error);
    } finally {
      setLoading(false);
    }
  }, [router, statusFilter, clinicFilter]);

  const fetchClinics = async () => {
    try {
      const token = localStorage.getItem('auth-token');
      const response = await apiFetch('/api/super-admin/clinic-fees');
      if (response.ok) {
        const data = await response.json();
        setClinics(data.clinics?.map((c: { clinic: Clinic }) => c.clinic) || []);
      }
    } catch (error) {
      console.error('Failed to fetch clinics:', error);
    }
  };

  useEffect(() => {
    fetchInvoices();
    fetchClinics();
  }, [fetchInvoices]);

  // Open create modal from URL (e.g. from clinic-billing "Create invoice")
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const create = params.get('create');
    const clinicId = params.get('clinicId');
    if (create === '1' && clinicId) {
      setCreateForm((f) => ({ ...f, clinicId }));
      setCreateModalOpen(true);
      // Clear URL params without full navigation
      window.history.replaceState({}, '', '/super-admin/clinic-billing/invoices');
    }
  }, []);

  const createInvoice = async () => {
    if (!createForm.clinicId || !createForm.periodStart || !createForm.periodEnd) {
      alert('Please fill in all required fields');
      return;
    }

    setCreating(true);
    try {
      const token = localStorage.getItem('auth-token');
      const response = await apiFetch('/api/super-admin/clinic-invoices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
        setCreateForm({
          clinicId: '',
          periodType: 'MONTHLY',
          periodStart: '',
          periodEnd: '',
          notes: '',
          externalNotes: '',
          createStripeInvoice: true,
        });
        fetchInvoices();
        router.push(`/super-admin/clinic-billing/invoices/${data.invoice.id}`);
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to create invoice');
      }
    } catch (error) {
      console.error('Failed to create invoice:', error);
      alert('Failed to create invoice');
    } finally {
      setCreating(false);
    }
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; text: string; icon: typeof Clock }> = {
      DRAFT: { bg: 'bg-gray-100', text: 'text-gray-700', icon: Clock },
      PENDING: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: AlertCircle },
      SENT: { bg: 'bg-blue-100', text: 'text-blue-700', icon: Send },
      PAID: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle },
      OVERDUE: { bg: 'bg-red-100', text: 'text-red-700', icon: AlertCircle },
      CANCELLED: { bg: 'bg-gray-100', text: 'text-gray-500', icon: XCircle },
    };

    const style = styles[status] || styles.DRAFT;
    const Icon = style.icon;

    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${style.bg} ${style.text}`}
      >
        <Icon className="h-3 w-3" />
        {status}
      </span>
    );
  };

  const filteredInvoices = invoices.filter(
    (inv) =>
      normalizedIncludes(inv.invoiceNumber, searchTerm) ||
      normalizedIncludes(inv.clinic.name, searchTerm)
  );

  // Preset date ranges
  const setPresetDates = (preset: string) => {
    const now = new Date();
    let start: Date;
    let end: Date;

    switch (preset) {
      case 'this-month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        setCreateForm({
          ...createForm,
          periodType: 'MONTHLY',
          periodStart: start.toISOString().split('T')[0],
          periodEnd: end.toISOString().split('T')[0],
        });
        break;
      case 'last-month':
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
        setCreateForm({
          ...createForm,
          periodType: 'MONTHLY',
          periodStart: start.toISOString().split('T')[0],
          periodEnd: end.toISOString().split('T')[0],
        });
        break;
      case 'this-quarter':
        const quarter = Math.floor(now.getMonth() / 3);
        start = new Date(now.getFullYear(), quarter * 3, 1);
        end = new Date(now.getFullYear(), quarter * 3 + 3, 0);
        setCreateForm({
          ...createForm,
          periodType: 'QUARTERLY',
          periodStart: start.toISOString().split('T')[0],
          periodEnd: end.toISOString().split('T')[0],
        });
        break;
      case 'last-quarter':
        const lastQuarter = Math.floor(now.getMonth() / 3) - 1;
        const year = lastQuarter < 0 ? now.getFullYear() - 1 : now.getFullYear();
        const q = lastQuarter < 0 ? 3 : lastQuarter;
        start = new Date(year, q * 3, 1);
        end = new Date(year, q * 3 + 3, 0);
        setCreateForm({
          ...createForm,
          periodType: 'QUARTERLY',
          periodStart: start.toISOString().split('T')[0],
          periodEnd: end.toISOString().split('T')[0],
        });
        break;
    }
  };

  return (
    <div className="min-h-screen p-6 lg:p-8">
      {/* Page Header */}
      <div className="mb-8 flex items-center gap-4">
        <button
          onClick={() => router.push('/super-admin/clinic-billing')}
          className="rounded-lg p-2 transition-colors hover:bg-gray-100"
        >
          <ChevronLeft className="h-5 w-5 text-gray-500" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Clinic Invoices</h1>
          <p className="mt-1 text-gray-500">Generate and manage platform fee invoices</p>
        </div>
        <button
          onClick={() => setCreateModalOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-[#4fa77e] px-4 py-2 text-white shadow-sm transition-colors hover:bg-[#3d9268]"
        >
          <Plus className="h-5 w-5" />
          Generate Invoice
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="mb-1 text-sm text-gray-500">Draft</p>
            <p className="text-xl font-bold text-gray-900">{summary.draft.count}</p>
            <p className="text-sm text-gray-500">{formatCurrency(summary.draft.amount)}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="mb-1 text-sm text-gray-500">Pending</p>
            <p className="text-xl font-bold text-yellow-600">{summary.pending.count}</p>
            <p className="text-sm text-gray-500">{formatCurrency(summary.pending.amount)}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="mb-1 text-sm text-gray-500">Sent</p>
            <p className="text-xl font-bold text-blue-600">{summary.sent.count}</p>
            <p className="text-sm text-gray-500">{formatCurrency(summary.sent.amount)}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="mb-1 text-sm text-gray-500">Overdue</p>
            <p className="text-xl font-bold text-red-600">{summary.overdue.count}</p>
            <p className="text-sm text-gray-500">{formatCurrency(summary.overdue.amount)}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="mb-1 text-sm text-gray-500">Paid</p>
            <p className="text-xl font-bold text-green-600">{summary.paid.count}</p>
            <p className="text-sm text-gray-500">{formatCurrency(summary.paid.amount)}</p>
          </div>
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
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-gray-200 px-4 py-2.5 focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
          >
            <option value="">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="PENDING">Pending</option>
            <option value="SENT">Sent</option>
            <option value="PAID">Paid</option>
            <option value="OVERDUE">Overdue</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <select
            value={clinicFilter}
            onChange={(e) => setClinicFilter(e.target.value)}
            className="rounded-xl border border-gray-200 px-4 py-2.5 focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
          >
            <option value="">All Clinics</option>
            {clinics.map((clinic) => (
              <option key={clinic.id} value={clinic.id}>
                {clinic.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Invoices List */}
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
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Invoice
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Clinic
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Period
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Items
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Due Date
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredInvoices.map((invoice) => (
                <tr
                  key={invoice.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => router.push(`/super-admin/clinic-billing/invoices/${invoice.id}`)}
                >
                  <td className="whitespace-nowrap px-6 py-4">
                    <p className="font-medium text-gray-900">{invoice.invoiceNumber}</p>
                    <p className="text-xs text-gray-500">{formatDate(invoice.createdAt)}</p>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <p className="text-sm text-gray-900">{invoice.clinic.name}</p>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                    {formatDate(invoice.periodStart)} - {formatDate(invoice.periodEnd)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                    {invoice.prescriptionCount + invoice.transmissionCount} fees
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <p className="font-medium text-gray-900">
                      {formatCurrency(invoice.totalAmountCents)}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">{getStatusBadge(invoice.status)}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                    {formatDate(invoice.dueDate)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right">
                    <div
                      className="flex items-center justify-end gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {invoice.pdfUrl && (
                        <a
                          href={invoice.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-[#4fa77e]/10 hover:text-[#4fa77e]"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Invoice Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="border-b border-gray-100 p-6">
              <h2 className="text-xl font-bold text-gray-900">Generate Invoice</h2>
            </div>

            <div className="space-y-6 p-6">
              {/* Clinic Selection */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Clinic</label>
                <select
                  value={createForm.clinicId}
                  onChange={(e) => setCreateForm({ ...createForm, clinicId: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-4 py-2.5 focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
                >
                  <option value="">Select clinic...</option>
                  {clinics.map((clinic) => (
                    <option key={clinic.id} value={clinic.id}>
                      {clinic.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Period Type */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Period Type</label>
                <select
                  value={createForm.periodType}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      periodType: e.target.value as
                        | 'WEEKLY'
                        | 'MONTHLY'
                        | 'QUARTERLY'
                        | 'YEARLY'
                        | 'CUSTOM',
                    })
                  }
                  className="w-full rounded-lg border border-gray-200 px-4 py-2.5 focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
                >
                  <option value="WEEKLY">Weekly</option>
                  <option value="MONTHLY">Monthly</option>
                  <option value="QUARTERLY">Quarterly</option>
                  <option value="YEARLY">Yearly</option>
                  <option value="CUSTOM">Custom</option>
                </select>
              </div>

              {/* Quick Presets */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Quick Presets
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPresetDates('this-month')}
                    className="rounded-lg border border-gray-200 px-3 py-1 text-sm transition-colors hover:bg-gray-50"
                  >
                    This Month
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresetDates('last-month')}
                    className="rounded-lg border border-gray-200 px-3 py-1 text-sm transition-colors hover:bg-gray-50"
                  >
                    Last Month
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresetDates('this-quarter')}
                    className="rounded-lg border border-gray-200 px-3 py-1 text-sm transition-colors hover:bg-gray-50"
                  >
                    This Quarter
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresetDates('last-quarter')}
                    className="rounded-lg border border-gray-200 px-3 py-1 text-sm transition-colors hover:bg-gray-50"
                  >
                    Last Quarter
                  </button>
                </div>
              </div>

              {/* Date Range */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Start Date</label>
                  <input
                    type="date"
                    value={createForm.periodStart}
                    onChange={(e) => setCreateForm({ ...createForm, periodStart: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-4 py-2.5 focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">End Date</label>
                  <input
                    type="date"
                    value={createForm.periodEnd}
                    onChange={(e) => setCreateForm({ ...createForm, periodEnd: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-4 py-2.5 focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
                  />
                </div>
              </div>

              {/* Stripe Invoice Option */}
              <div className="flex items-center justify-between border-t border-gray-100 py-3">
                <div>
                  <p className="font-medium text-gray-900">Create Stripe Invoice</p>
                  <p className="text-sm text-gray-500">
                    Also create in Stripe for payment collection
                  </p>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={createForm.createStripeInvoice}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, createStripeInvoice: e.target.checked })
                    }
                    className="peer sr-only"
                  />
                  <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-[#4fa77e] peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#4fa77e]/20"></div>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-100 p-6">
              <button
                onClick={() => setCreateModalOpen(false)}
                className="rounded-lg px-4 py-2 text-gray-700 transition-colors hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={createInvoice}
                disabled={creating}
                className="rounded-lg bg-[#4fa77e] px-4 py-2 text-white transition-colors hover:bg-[#3d9268] disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Generate Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
