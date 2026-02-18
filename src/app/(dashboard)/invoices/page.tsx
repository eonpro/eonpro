'use client';

/**
 * COMPREHENSIVE INVOICE DASHBOARD
 * ================================
 * Full invoice management with Stripe-level capabilities
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api/fetch';
import { useRouter } from 'next/navigation';
import {
  FileText,
  Plus,
  Filter,
  Download,
  Send,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  DollarSign,
  Calendar,
  ChevronDown,
  MoreVertical,
  Eye,
  Mail,
  MessageSquare,
  CreditCard,
  Trash2,
  RefreshCw,
  TrendingUp,
  Users,
  Receipt,
} from 'lucide-react';

// Types
interface Invoice {
  id: number;
  patientId: number;
  amount: number | null;
  amountDue: number | null;
  amountPaid: number;
  status: 'DRAFT' | 'OPEN' | 'PAID' | 'VOID' | 'UNCOLLECTIBLE';
  description: string | null;
  dueDate: string | null;
  createdAt: string;
  stripeInvoiceUrl: string | null;
  stripePdfUrl: string | null;
  patient: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  clinic: {
    id: number;
    name: string;
  } | null;
  lineItems: Array<{
    description: string;
    quantity?: number;
    unitPrice?: number;
    amount?: number;
  }> | null;
  metadata: any;
}

interface InvoiceSummary {
  summary: {
    totalInvoiced: number;
    totalPaid: number;
    totalOutstanding: number;
    overdueAmount: number;
    collectionRate: number;
    avgPaymentDays: number;
  };
  counts: {
    total: number;
    draft: number;
    open: number;
    paid: number;
    void: number;
    overdue: number;
  };
}

// Status config
const statusConfig = {
  DRAFT: { label: 'Draft', color: 'bg-gray-100 text-gray-700', icon: FileText },
  OPEN: { label: 'Open', color: 'bg-blue-100 text-blue-700', icon: Clock },
  PAID: { label: 'Paid', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  VOID: { label: 'Void', color: 'bg-red-100 text-red-700', icon: XCircle },
  UNCOLLECTIBLE: {
    label: 'Uncollectible',
    color: 'bg-orange-100 text-orange-700',
    icon: AlertTriangle,
  },
};

export default function InvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState<InvoiceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState('this_month');
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState<number | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);

  // Debounce search input
  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
  }, []);

  useEffect(() => {
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, []);

  // Fetch invoices
  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        ...(statusFilter !== 'all' && { status: statusFilter }),
        ...(showOverdueOnly && { overdue: 'true' }),
      });
      if (debouncedSearch.trim()) {
        params.set('search', debouncedSearch.trim());
      }

      const response = await apiFetch(`/api/v2/invoices?${params}`, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) throw new Error('Failed to fetch invoices');

      const data = await response.json();
      setInvoices(data.invoices || []);
      setTotalPages(data.totalPages || 1);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, showOverdueOnly, debouncedSearch]);

  // Fetch summary
  const fetchSummary = useCallback(async () => {
    try {
      const response = await apiFetch(`/api/v2/invoices/summary?range=${dateRange}`, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) throw new Error('Failed to fetch summary');

      const data = await response.json();
      setSummary(data);
    } catch (err: any) {
      console.error('Failed to fetch summary:', err);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchInvoices();
    fetchSummary();
  }, [fetchInvoices, fetchSummary]);

  // Invoice actions
  const handleSendInvoice = async (invoiceId: number, channel: 'email' | 'sms' | 'both') => {
    try {
      const response = await apiFetch(`/api/v2/invoices/${invoiceId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', channel }),
      });

      if (!response.ok) throw new Error('Failed to send invoice');

      const result = await response.json();
      alert(result.success ? 'Invoice sent successfully!' : 'Failed to send invoice');
      setShowSendModal(false);
      setSelectedInvoice(null);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleVoidInvoice = async (invoiceId: number) => {
    if (!confirm('Are you sure you want to void this invoice?')) return;

    try {
      const response = await apiFetch(`/api/v2/invoices/${invoiceId}?reason=Voided by user`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) throw new Error('Failed to void invoice');

      fetchInvoices();
      alert('Invoice voided successfully');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRecordPayment = async (invoiceId: number, amount: number, method: string) => {
    try {
      const response = await apiFetch(`/api/v2/invoices/${invoiceId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pay', amount, paymentMethod: method }),
      });

      if (!response.ok) throw new Error('Failed to record payment');

      const result = await response.json();
      alert(
        result.isPaid
          ? 'Invoice paid in full!'
          : `Payment recorded. Remaining: $${(result.remainingBalance / 100).toFixed(2)}`
      );
      setShowPaymentModal(false);
      setSelectedInvoice(null);
      fetchInvoices();
      fetchSummary();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Format currency
  const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) return '$0.00';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
      amount / 100
    );
  };

  // Format date
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Search is now server-side; use invoices directly
  const filteredInvoices = invoices;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600">
                <Receipt className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Invoices</h1>
                <p className="text-sm text-slate-500">Manage billing and payments</p>
              </div>
            </div>

            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2 font-medium text-white shadow-lg shadow-emerald-500/25 transition-all hover:from-emerald-600 hover:to-teal-700"
            >
              <Plus className="h-4 w-4" />
              New Invoice
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats Cards */}
        {summary && (
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-2 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
                  <DollarSign className="h-5 w-5 text-blue-600" />
                </div>
                <span className="text-sm font-medium text-slate-500">Total Invoiced</span>
              </div>
              <p className="text-2xl font-bold text-slate-900">
                {formatCurrency(summary.summary.totalInvoiced)}
              </p>
              <p className="mt-1 text-xs text-slate-400">{summary.counts.total} invoices</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-2 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
                <span className="text-sm font-medium text-slate-500">Collected</span>
              </div>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(summary.summary.totalPaid)}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {summary.summary.collectionRate.toFixed(1)}% rate
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-2 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
                <span className="text-sm font-medium text-slate-500">Outstanding</span>
              </div>
              <p className="text-2xl font-bold text-amber-600">
                {formatCurrency(summary.summary.totalOutstanding)}
              </p>
              <p className="mt-1 text-xs text-slate-400">{summary.counts.open} open invoices</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-2 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <span className="text-sm font-medium text-slate-500">Overdue</span>
              </div>
              <p className="text-2xl font-bold text-red-600">
                {formatCurrency(summary.summary.overdueAmount)}
              </p>
              <p className="mt-1 text-xs text-slate-400">{summary.counts.overdue} overdue</p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-4">
            {/* Search */}
            <div className="min-w-[200px] flex-1">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search invoices..."
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 py-2 pl-4 pr-4 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="all">All Status</option>
              <option value="DRAFT">Draft</option>
              <option value="OPEN">Open</option>
              <option value="PAID">Paid</option>
              <option value="VOID">Void</option>
              <option value="UNCOLLECTIBLE">Uncollectible</option>
            </select>

            {/* Date Range */}
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="today">Today</option>
              <option value="this_week">This Week</option>
              <option value="this_month">This Month</option>
              <option value="this_quarter">This Quarter</option>
              <option value="this_year">This Year</option>
            </select>

            {/* Overdue Filter */}
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={showOverdueOnly}
                onChange={(e) => setShowOverdueOnly(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500"
              />
              <span className="text-sm text-slate-600">Overdue only</span>
            </label>

            {/* Refresh */}
            <button
              onClick={() => {
                fetchInvoices();
                fetchSummary();
              }}
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Invoice List */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="p-12 text-center">
              <RefreshCw className="mx-auto mb-3 h-8 w-8 animate-spin text-slate-300" />
              <p className="text-slate-500">Loading invoices...</p>
            </div>
          ) : error ? (
            <div className="p-12 text-center">
              <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-red-400" />
              <p className="text-red-600">{error}</p>
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="mx-auto mb-3 h-12 w-12 text-slate-300" />
              <p className="mb-4 text-slate-500">No invoices found</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
              >
                Create First Invoice
              </button>
            </div>
          ) : (
            <>
              {/* Table Header */}
              <div className="grid grid-cols-12 gap-4 border-b border-slate-200 bg-slate-50 px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                <div className="col-span-1">#</div>
                <div className="col-span-3">Patient</div>
                <div className="col-span-2">Amount</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-2">Due Date</div>
                <div className="col-span-2 text-right">Actions</div>
              </div>

              {/* Table Body */}
              {filteredInvoices.map((invoice) => {
                const StatusIcon = statusConfig[invoice.status].icon;
                const isOverdue =
                  invoice.status === 'OPEN' &&
                  invoice.dueDate &&
                  new Date(invoice.dueDate) < new Date();

                return (
                  <div
                    key={invoice.id}
                    className="grid grid-cols-12 items-center gap-4 border-b border-slate-100 px-6 py-4 transition-colors hover:bg-slate-50/50"
                  >
                    <div className="col-span-1 text-sm font-medium text-slate-900">
                      #{invoice.id}
                    </div>

                    <div className="col-span-3">
                      <p className="text-sm font-medium text-slate-900">
                        {invoice.patient.firstName} {invoice.patient.lastName}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {invoice.description || 'No description'}
                      </p>
                    </div>

                    <div className="col-span-2">
                      <p className="text-sm font-bold text-slate-900">
                        {formatCurrency(invoice.amount)}
                      </p>
                      {invoice.amountPaid > 0 && invoice.status !== 'PAID' && (
                        <p className="text-xs text-emerald-600">
                          Paid: {formatCurrency(invoice.amountPaid)}
                        </p>
                      )}
                    </div>

                    <div className="col-span-2">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${statusConfig[invoice.status].color}`}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {statusConfig[invoice.status].label}
                      </span>
                      {isOverdue && (
                        <span className="ml-2 text-xs font-medium text-red-600">Overdue</span>
                      )}
                    </div>

                    <div className="col-span-2 text-sm text-slate-600">
                      {formatDate(invoice.dueDate)}
                    </div>

                    <div className="col-span-2 flex items-center justify-end gap-2">
                      {/* View */}
                      <button
                        onClick={() => {
                          setSelectedInvoice(invoice);
                          setShowDetailModal(true);
                        }}
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                        title="View Details"
                      >
                        <Eye className="h-4 w-4" />
                      </button>

                      {/* Send */}
                      {invoice.status === 'OPEN' && (
                        <button
                          onClick={() => {
                            setSelectedInvoice(invoice);
                            setShowSendModal(true);
                          }}
                          className="rounded-lg p-2 text-blue-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                          title="Send Invoice"
                        >
                          <Send className="h-4 w-4" />
                        </button>
                      )}

                      {/* Record Payment */}
                      {invoice.status === 'OPEN' && (
                        <button
                          onClick={() => {
                            setSelectedInvoice(invoice);
                            setShowPaymentModal(true);
                          }}
                          className="rounded-lg p-2 text-emerald-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600"
                          title="Record Payment"
                        >
                          <CreditCard className="h-4 w-4" />
                        </button>
                      )}

                      {/* PDF Download */}
                      {invoice.stripePdfUrl && (
                        <a
                          href={invoice.stripePdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                          title="Download PDF"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      )}

                      {/* More Actions */}
                      <div className="relative">
                        <button
                          onClick={() =>
                            setShowActionMenu(showActionMenu === invoice.id ? null : invoice.id)
                          }
                          className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>

                        {showActionMenu === invoice.id && (
                          <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                            {invoice.status === 'OPEN' && (
                              <button
                                onClick={() => {
                                  handleVoidInvoice(invoice.id);
                                  setShowActionMenu(null);
                                }}
                                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                                Void Invoice
                              </button>
                            )}
                            {invoice.stripeInvoiceUrl && (
                              <a
                                href={invoice.stripeInvoiceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                              >
                                <FileText className="h-4 w-4" />
                                View in Stripe
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
                  <p className="text-sm text-slate-500">
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="rounded-lg border border-slate-200 px-3 py-1 text-sm hover:bg-slate-100 disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="rounded-lg border border-slate-200 px-3 py-1 text-sm hover:bg-slate-100 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Create Invoice Modal */}
      {showCreateModal && (
        <CreateInvoiceModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            fetchInvoices();
            fetchSummary();
          }}
        />
      )}

      {/* Invoice Detail Modal */}
      {showDetailModal && selectedInvoice && (
        <InvoiceDetailModal
          invoice={selectedInvoice}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedInvoice(null);
          }}
          onRecordPayment={() => {
            setShowDetailModal(false);
            setShowPaymentModal(true);
          }}
          onSend={() => {
            setShowDetailModal(false);
            setShowSendModal(true);
          }}
        />
      )}

      {/* Send Invoice Modal */}
      {showSendModal && selectedInvoice && (
        <SendInvoiceModal
          invoice={selectedInvoice}
          onClose={() => {
            setShowSendModal(false);
            setSelectedInvoice(null);
          }}
          onSend={handleSendInvoice}
        />
      )}

      {/* Record Payment Modal */}
      {showPaymentModal && selectedInvoice && (
        <RecordPaymentModal
          invoice={selectedInvoice}
          onClose={() => {
            setShowPaymentModal(false);
            setSelectedInvoice(null);
          }}
          onSubmit={handleRecordPayment}
        />
      )}
    </div>
  );
}

// Create Invoice Modal Component
function CreateInvoiceModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [patientId, setPatientId] = useState('');
  const [description, setDescription] = useState('');
  const [lineItems, setLineItems] = useState([{ description: '', quantity: 1, unitPrice: 0 }]);
  const [discount, setDiscount] = useState({ type: 'percentage', value: 0 });
  const [dueInDays, setDueInDays] = useState(14);
  const [autoSend, setAutoSend] = useState(false);
  const [isDraft, setIsDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [patients, setPatients] = useState<any[]>([]);

  useEffect(() => {
    // Fetch patients for dropdown
    apiFetch('/api/patients?limit=100')
      .then((res) => res.json())
      .then((data) => setPatients(data.patients || []))
      .catch(console.error);
  }, []);

  const addLineItem = () => {
    setLineItems([...lineItems, { description: '', quantity: 1, unitPrice: 0 }]);
  };

  const removeLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const updateLineItem = (index: number, field: string, value: any) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
  };

  const calculateTotal = () => {
    const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const discountAmount =
      discount.type === 'percentage' ? subtotal * (discount.value / 100) : discount.value * 100;
    return Math.max(0, subtotal - discountAmount);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId) {
      alert('Please select a patient');
      return;
    }
    if (lineItems.length === 0 || !lineItems.some((i) => i.description && i.unitPrice > 0)) {
      alert('Please add at least one line item');
      return;
    }

    setSubmitting(true);
    try {
      const response = await apiFetch('/api/v2/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: parseInt(patientId),
          description,
          lineItems: lineItems
            .filter((i) => i.description && i.unitPrice > 0)
            .map((i) => ({
              description: i.description,
              quantity: i.quantity,
              unitPrice: Math.round(i.unitPrice * 100), // Convert to cents
            })),
          discount:
            discount.value > 0
              ? {
                  type: discount.type,
                  value: discount.value,
                }
              : undefined,
          dueInDays,
          autoSend,
          isDraft,
        }),
      });

      if (!response.ok) throw new Error('Failed to create invoice');

      onSuccess();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="border-b border-slate-200 p-6">
          <h2 className="text-xl font-bold text-slate-900">Create Invoice</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 p-6">
          {/* Patient Selection */}
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Patient *</label>
            <select
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="">Select patient...</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.firstName} {p.lastName} ({p.email})
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Monthly treatment invoice"
              className="w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          {/* Line Items */}
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Line Items *</label>
            <div className="space-y-3">
              {lineItems.map((item, index) => (
                <div key={index} className="flex items-start gap-3">
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                    placeholder="Item description"
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) =>
                      updateLineItem(index, 'quantity', parseInt(e.target.value) || 1)
                    }
                    min="1"
                    className="w-20 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="Qty"
                  />
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                      $
                    </span>
                    <input
                      type="number"
                      value={item.unitPrice || ''}
                      onChange={(e) =>
                        updateLineItem(index, 'unitPrice', parseFloat(e.target.value) || 0)
                      }
                      min="0"
                      step="0.01"
                      className="w-28 rounded-lg border border-slate-200 py-2 pl-7 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      placeholder="Price"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLineItem(index)}
                    className="rounded-lg p-2 text-red-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addLineItem}
              className="mt-3 flex items-center gap-2 text-sm text-emerald-600 hover:text-emerald-700"
            >
              <Plus className="h-4 w-4" />
              Add Item
            </button>
          </div>

          {/* Discount */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Discount Type</label>
              <select
                value={discount.type}
                onChange={(e) => setDiscount({ ...discount, type: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed Amount ($)</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Discount Value
              </label>
              <input
                type="number"
                value={discount.value || ''}
                onChange={(e) =>
                  setDiscount({ ...discount, value: parseFloat(e.target.value) || 0 })
                }
                min="0"
                className="w-full rounded-lg border border-slate-200 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                placeholder={discount.type === 'percentage' ? '10' : '50'}
              />
            </div>
          </div>

          {/* Due Date */}
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Due in (days)</label>
            <input
              type="number"
              value={dueInDays}
              onChange={(e) => setDueInDays(parseInt(e.target.value) || 14)}
              min="1"
              max="365"
              className="w-32 rounded-lg border border-slate-200 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          {/* Options */}
          <div className="flex gap-6">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={autoSend}
                onChange={(e) => setAutoSend(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500"
              />
              <span className="text-sm text-slate-600">Send immediately</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={isDraft}
                onChange={(e) => setIsDraft(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500"
              />
              <span className="text-sm text-slate-600">Save as draft</span>
            </label>
          </div>

          {/* Total */}
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="flex justify-between text-lg font-bold">
              <span>Total:</span>
              <span className="text-emerald-600">${(calculateTotal() / 100).toFixed(2)}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-emerald-500 px-6 py-2 font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              {submitting ? 'Creating...' : isDraft ? 'Save Draft' : 'Create Invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Invoice Detail Modal
function InvoiceDetailModal({
  invoice,
  onClose,
  onRecordPayment,
  onSend,
}: {
  invoice: Invoice;
  onClose: () => void;
  onRecordPayment: () => void;
  onSend: () => void;
}) {
  const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) return '$0.00';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
      amount / 100
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-6">
          <h2 className="text-xl font-bold text-slate-900">Invoice #{invoice.id}</h2>
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${statusConfig[invoice.status].color}`}
          >
            {statusConfig[invoice.status].label}
          </span>
        </div>

        <div className="space-y-6 p-6">
          {/* Patient */}
          <div>
            <h3 className="mb-1 text-sm font-medium text-slate-500">Patient</h3>
            <p className="text-lg font-medium text-slate-900">
              {invoice.patient.firstName} {invoice.patient.lastName}
            </p>
            <p className="text-sm text-slate-500">{invoice.patient.email}</p>
          </div>

          {/* Amounts */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <h3 className="mb-1 text-sm font-medium text-slate-500">Total</h3>
              <p className="text-lg font-bold text-slate-900">{formatCurrency(invoice.amount)}</p>
            </div>
            <div>
              <h3 className="mb-1 text-sm font-medium text-slate-500">Paid</h3>
              <p className="text-lg font-bold text-emerald-600">
                {formatCurrency(invoice.amountPaid)}
              </p>
            </div>
            <div>
              <h3 className="mb-1 text-sm font-medium text-slate-500">Due</h3>
              <p className="text-lg font-bold text-amber-600">
                {formatCurrency(invoice.amountDue)}
              </p>
            </div>
          </div>

          {/* Line Items */}
          {invoice.lineItems && invoice.lineItems.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-slate-500">Line Items</h3>
              <div className="space-y-2 rounded-lg bg-slate-50 p-3">
                {invoice.lineItems.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-slate-700">
                      {item.description}
                      {item.quantity && item.quantity > 1 && ` (x${item.quantity})`}
                    </span>
                    <span className="font-medium text-slate-900">
                      {formatCurrency((item.unitPrice || item.amount || 0) * (item.quantity || 1))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {invoice.description && (
            <div>
              <h3 className="mb-1 text-sm font-medium text-slate-500">Description</h3>
              <p className="text-slate-700">{invoice.description}</p>
            </div>
          )}

          {/* Due Date */}
          {invoice.dueDate && (
            <div>
              <h3 className="mb-1 text-sm font-medium text-slate-500">Due Date</h3>
              <p className="text-slate-700">{new Date(invoice.dueDate).toLocaleDateString()}</p>
            </div>
          )}

          {/* Links */}
          <div className="flex gap-3">
            {invoice.stripeInvoiceUrl && (
              <a
                href={invoice.stripeInvoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
              >
                <FileText className="h-4 w-4" />
                View in Stripe
              </a>
            )}
            {invoice.stripePdfUrl && (
              <a
                href={invoice.stripePdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
              >
                <Download className="h-4 w-4" />
                Download PDF
              </a>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 border-t border-slate-200 p-6">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-slate-600 hover:bg-slate-100"
          >
            Close
          </button>
          {invoice.status === 'OPEN' && (
            <>
              <button
                onClick={onSend}
                className="flex items-center gap-2 rounded-lg border border-blue-200 px-4 py-2 text-blue-600 hover:bg-blue-50"
              >
                <Send className="h-4 w-4" />
                Send
              </button>
              <button
                onClick={onRecordPayment}
                className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-white hover:bg-emerald-600"
              >
                <CreditCard className="h-4 w-4" />
                Record Payment
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Send Invoice Modal
function SendInvoiceModal({
  invoice,
  onClose,
  onSend,
}: {
  invoice: Invoice;
  onClose: () => void;
  onSend: (id: number, channel: 'email' | 'sms' | 'both') => void;
}) {
  const [channel, setChannel] = useState<'email' | 'sms' | 'both'>('email');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="border-b border-slate-200 p-6">
          <h2 className="text-xl font-bold text-slate-900">Send Invoice</h2>
          <p className="mt-1 text-sm text-slate-500">
            Send invoice #{invoice.id} to {invoice.patient.firstName} {invoice.patient.lastName}
          </p>
        </div>

        <div className="space-y-4 p-6">
          <div>
            <label className="mb-3 block text-sm font-medium text-slate-700">Send via</label>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                <input
                  type="radio"
                  name="channel"
                  value="email"
                  checked={channel === 'email'}
                  onChange={() => setChannel('email')}
                  className="h-4 w-4 text-emerald-500 focus:ring-emerald-500"
                />
                <Mail className="h-5 w-5 text-slate-400" />
                <div>
                  <p className="font-medium text-slate-700">Email</p>
                  <p className="text-xs text-slate-500">{invoice.patient.email}</p>
                </div>
              </label>

              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                <input
                  type="radio"
                  name="channel"
                  value="sms"
                  checked={channel === 'sms'}
                  onChange={() => setChannel('sms')}
                  className="h-4 w-4 text-emerald-500 focus:ring-emerald-500"
                />
                <MessageSquare className="h-5 w-5 text-slate-400" />
                <div>
                  <p className="font-medium text-slate-700">SMS</p>
                  <p className="text-xs text-slate-500">{invoice.patient.phone}</p>
                </div>
              </label>

              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                <input
                  type="radio"
                  name="channel"
                  value="both"
                  checked={channel === 'both'}
                  onChange={() => setChannel('both')}
                  className="h-4 w-4 text-emerald-500 focus:ring-emerald-500"
                />
                <Send className="h-5 w-5 text-slate-400" />
                <div>
                  <p className="font-medium text-slate-700">Both Email & SMS</p>
                  <p className="text-xs text-slate-500">Maximum visibility</p>
                </div>
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 p-6">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            onClick={() => onSend(invoice.id, channel)}
            className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
          >
            <Send className="h-4 w-4" />
            Send Invoice
          </button>
        </div>
      </div>
    </div>
  );
}

// Record Payment Modal
function RecordPaymentModal({
  invoice,
  onClose,
  onSubmit,
}: {
  invoice: Invoice;
  onClose: () => void;
  onSubmit: (id: number, amount: number, method: string) => void;
}) {
  const remaining = (invoice.amountDue || invoice.amount || 0) - (invoice.amountPaid || 0);
  const [amount, setAmount] = useState(remaining / 100);
  const [method, setMethod] = useState('card');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="border-b border-slate-200 p-6">
          <h2 className="text-xl font-bold text-slate-900">Record Payment</h2>
          <p className="mt-1 text-sm text-slate-500">
            Invoice #{invoice.id} • Balance: ${(remaining / 100).toFixed(2)}
          </p>
        </div>

        <div className="space-y-4 p-6">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                min="0.01"
                max={remaining / 100}
                step="0.01"
                className="w-full rounded-lg border border-slate-200 py-2 pl-7 pr-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setAmount(remaining / 100)}
                className="text-xs text-emerald-600 hover:text-emerald-700"
              >
                Full Amount
              </button>
              <button
                type="button"
                onClick={() => setAmount(remaining / 200)}
                className="text-xs text-emerald-600 hover:text-emerald-700"
              >
                50%
              </button>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Payment Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="card">Credit/Debit Card</option>
              <option value="cash">Cash</option>
              <option value="check">Check</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 p-6">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit(invoice.id, Math.round(amount * 100), method)}
            className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-white hover:bg-emerald-600"
          >
            <CreditCard className="h-4 w-4" />
            Record ${amount.toFixed(2)}
          </button>
        </div>
      </div>
    </div>
  );
}
