'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText, Search, Filter, Download, ChevronLeft, Plus,
  Clock, AlertCircle, CheckCircle, XCircle, DollarSign, Send, Building2
} from 'lucide-react';

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

interface Summary {
  draft: { count: number; amount: number };
  pending: { count: number; amount: number };
  sent: { count: number; amount: number };
  paid: { count: number; amount: number };
  overdue: { count: number; amount: number };
  cancelled: { count: number; amount: number };
  total: { count: number; amount: number };
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
  const [createForm, setCreateForm] = useState({
    clinicId: '',
    periodType: 'MONTHLY' as const,
    periodStart: '',
    periodEnd: '',
    createStripeInvoice: true,
  });

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

      const response = await fetch(`/api/super-admin/clinic-invoices?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

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
      const response = await fetch('/api/super-admin/clinic-fees', {
        headers: { Authorization: `Bearer ${token}` },
      });
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

  const createInvoice = async () => {
    if (!createForm.clinicId || !createForm.periodStart || !createForm.periodEnd) {
      alert('Please fill in all required fields');
      return;
    }

    setCreating(true);
    try {
      const token = localStorage.getItem('auth-token');
      const response = await fetch('/api/super-admin/clinic-invoices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
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
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
        <Icon className="h-3 w-3" />
        {status}
      </span>
    );
  };

  const filteredInvoices = invoices.filter((inv) =>
    inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inv.clinic.name.toLowerCase().includes(searchTerm.toLowerCase())
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
    <div className="p-6 lg:p-8 min-h-screen">
      {/* Page Header */}
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => router.push('/super-admin/clinic-billing')}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ChevronLeft className="h-5 w-5 text-gray-500" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Clinic Invoices</h1>
          <p className="text-gray-500 mt-1">Generate and manage platform fee invoices</p>
        </div>
        <button
          onClick={() => setCreateModalOpen(true)}
          className="px-4 py-2 bg-[#4fa77e] text-white rounded-xl hover:bg-[#3d9268] transition-colors flex items-center gap-2 shadow-sm"
        >
          <Plus className="h-5 w-5" />
          Generate Invoice
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <p className="text-sm text-gray-500 mb-1">Draft</p>
            <p className="text-xl font-bold text-gray-900">{summary.draft.count}</p>
            <p className="text-sm text-gray-500">{formatCurrency(summary.draft.amount)}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <p className="text-sm text-gray-500 mb-1">Pending</p>
            <p className="text-xl font-bold text-yellow-600">{summary.pending.count}</p>
            <p className="text-sm text-gray-500">{formatCurrency(summary.pending.amount)}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <p className="text-sm text-gray-500 mb-1">Sent</p>
            <p className="text-xl font-bold text-blue-600">{summary.sent.count}</p>
            <p className="text-sm text-gray-500">{formatCurrency(summary.sent.amount)}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <p className="text-sm text-gray-500 mb-1">Overdue</p>
            <p className="text-xl font-bold text-red-600">{summary.overdue.count}</p>
            <p className="text-sm text-gray-500">{formatCurrency(summary.overdue.amount)}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <p className="text-sm text-gray-500 mb-1">Paid</p>
            <p className="text-xl font-bold text-green-600">{summary.paid.count}</p>
            <p className="text-sm text-gray-500">{formatCurrency(summary.paid.amount)}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search invoices..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20 focus:border-[#4fa77e]"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20 focus:border-[#4fa77e]"
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
            className="px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20 focus:border-[#4fa77e]"
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
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#4fa77e] border-t-transparent" />
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No invoices found</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Invoice
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Clinic
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Period
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Items
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Due Date
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredInvoices.map((invoice) => (
                <tr
                  key={invoice.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => router.push(`/super-admin/clinic-billing/invoices/${invoice.id}`)}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <p className="font-medium text-gray-900">{invoice.invoiceNumber}</p>
                    <p className="text-xs text-gray-500">{formatDate(invoice.createdAt)}</p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <p className="text-sm text-gray-900">{invoice.clinic.name}</p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDate(invoice.periodStart)} - {formatDate(invoice.periodEnd)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {invoice.prescriptionCount + invoice.transmissionCount} fees
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <p className="font-medium text-gray-900">{formatCurrency(invoice.totalAmountCents)}</p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(invoice.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDate(invoice.dueDate)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      {invoice.pdfUrl && (
                        <a
                          href={invoice.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-gray-500 hover:text-[#4fa77e] hover:bg-[#4fa77e]/10 rounded-lg transition-colors"
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-900">Generate Invoice</h2>
            </div>

            <div className="p-6 space-y-6">
              {/* Clinic Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Clinic
                </label>
                <select
                  value={createForm.clinicId}
                  onChange={(e) => setCreateForm({ ...createForm, clinicId: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20 focus:border-[#4fa77e]"
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
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Period Type
                </label>
                <select
                  value={createForm.periodType}
                  onChange={(e) => setCreateForm({ ...createForm, periodType: e.target.value as 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'CUSTOM' })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20 focus:border-[#4fa77e]"
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
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quick Presets
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPresetDates('this-month')}
                    className="px-3 py-1 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    This Month
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresetDates('last-month')}
                    className="px-3 py-1 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Last Month
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresetDates('this-quarter')}
                    className="px-3 py-1 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    This Quarter
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresetDates('last-quarter')}
                    className="px-3 py-1 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Last Quarter
                  </button>
                </div>
              </div>

              {/* Date Range */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={createForm.periodStart}
                    onChange={(e) => setCreateForm({ ...createForm, periodStart: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20 focus:border-[#4fa77e]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={createForm.periodEnd}
                    onChange={(e) => setCreateForm({ ...createForm, periodEnd: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20 focus:border-[#4fa77e]"
                  />
                </div>
              </div>

              {/* Stripe Invoice Option */}
              <div className="flex items-center justify-between py-3 border-t border-gray-100">
                <div>
                  <p className="font-medium text-gray-900">Create Stripe Invoice</p>
                  <p className="text-sm text-gray-500">Also create in Stripe for payment collection</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createForm.createStripeInvoice}
                    onChange={(e) => setCreateForm({ ...createForm, createStripeInvoice: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#4fa77e]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#4fa77e]"></div>
                </label>
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setCreateModalOpen(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createInvoice}
                disabled={creating}
                className="px-4 py-2 bg-[#4fa77e] text-white rounded-lg hover:bg-[#3d9268] transition-colors disabled:opacity-50"
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
