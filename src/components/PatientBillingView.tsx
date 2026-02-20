'use client';

import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/stripe';
import {
  getGroupedPlans,
  formatPlanPrice,
  getPlanById,
} from '@/config/billingPlans';
import { ProcessPaymentForm } from './ProcessPaymentForm';
import { PatientSubscriptionManager } from './PatientSubscriptionManager';
import { logger } from '@/lib/logger';
import { toast } from '@/components/Toast';
import { apiFetch } from '@/lib/api/fetch';

interface Invoice {
  id: number;
  stripeInvoiceId: string | null;
  stripeInvoiceNumber: string | null;
  stripeInvoiceUrl: string | null;
  stripePdfUrl: string | null;
  description: string | null;
  amountDue: number;
  amountPaid: number;
  currency: string;
  status: string;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string;
}

interface Payment {
  id: number;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string | null;
  failureReason: string | null;
  createdAt: string;
  invoiceId: number | null;
  invoice: Invoice | null;
}

interface PatientBillingViewProps {
  patientId: number;
  patientName: string;
  clinicSubdomain?: string | null;
}

export function PatientBillingView({ patientId, patientName, clinicSubdomain }: PatientBillingViewProps) {
  const [activeTab, setActiveTab] = useState<
    'invoices' | 'payments' | 'subscriptions' | 'process-payment'
  >('invoices');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const [showProcessPayment, setShowProcessPayment] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [refundModal, setRefundModal] = useState<{
    invoiceId: number;
    paymentId?: number;
    stripeInvoiceId?: string | null;
    maxAmount: number;
  } | null>(null);
  const [markPaidModal, setMarkPaidModal] = useState<{
    invoiceId: number;
    amount: number;
  } | null>(null);

  // Track client mount for hydration-safe rendering
  useEffect(() => {
    setMounted(true);
  }, []);

  // Helper to format dates only after mount to avoid hydration mismatch
  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return '—';
    if (!mounted) return '—'; // Return placeholder until mounted
    return new Date(dateString).toLocaleDateString();
  };

  const formatDateTime = (dateString: string | null | undefined): string => {
    if (!dateString) return '—';
    if (!mounted) return '—'; // Return placeholder until mounted
    return new Date(dateString).toLocaleString();
  };

  // Fetch invoices and payments
  useEffect(() => {
    fetchBillingData();
  }, [patientId]);

  // Helper to get auth headers for API calls
  const getAuthHeaders = (): HeadersInit => {
    const token =
      localStorage.getItem('auth-token') ||
      localStorage.getItem('super_admin-token') ||
      localStorage.getItem('admin-token') ||
      localStorage.getItem('provider-token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchBillingData = async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();

      // Fetch invoices
      const invoicesRes = await apiFetch(`/api/stripe/invoices?patientId=${patientId}`, {
        credentials: 'include',
        headers,
      });
      if (invoicesRes.ok) {
        const data = await invoicesRes.json();
        setInvoices(data.invoices || []);
      }

      // Fetch payments
      const paymentsRes = await apiFetch(`/api/stripe/payments?patientId=${patientId}`, {
        credentials: 'include',
        headers,
      });
      if (paymentsRes.ok) {
        const data = await paymentsRes.json();
        setPayments(data.payments || []);
      }
    } catch (err: any) {
      logger.error('Error fetching billing data:', err);
      setError('Failed to load billing information');
    } finally {
      setLoading(false);
    }
  };

  const handleSendInvoice = async (invoiceId: number) => {
    try {
      const headers = getAuthHeaders();
      const res = await apiFetch(`/api/stripe/invoices/${invoiceId}`, {
        method: 'POST',
        credentials: 'include',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send' }),
      });

      if (res.ok) {
        toast.success('Invoice sent successfully');
        fetchBillingData();
      } else {
        toast.error('Failed to send invoice');
      }
    } catch (err: any) {
      logger.error('Error sending invoice:', err);
      toast.error('Failed to send invoice');
    }
  };

  const handleVoidInvoice = async (invoiceId: number) => {
    if (!confirm('Are you sure you want to void this invoice?')) return;

    try {
      const headers = getAuthHeaders();
      const res = await apiFetch(`/api/stripe/invoices/${invoiceId}`, {
        method: 'POST',
        credentials: 'include',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'void' }),
      });

      if (res.ok) {
        toast.success('Invoice voided successfully');
        fetchBillingData();
      } else {
        toast.error('Failed to void invoice');
      }
    } catch (err: any) {
      logger.error('Error voiding invoice:', err);
      toast.error('Failed to void invoice');
    }
  };

  const handleDeleteInvoice = async (invoiceId: number) => {
    if (
      !confirm(
        'Are you sure you want to permanently delete this invoice? This action cannot be undone.'
      )
    )
      return;

    try {
      const headers = getAuthHeaders();
      const res = await apiFetch(`/api/stripe/invoices/${invoiceId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers,
      });

      if (res.ok) {
        toast.success('Invoice deleted successfully');
        fetchBillingData();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to delete invoice');
      }
    } catch (err: any) {
      logger.error('Error deleting invoice:', err);
      toast.error('Failed to delete invoice');
    }
  };

  const handleCancelInvoice = async (invoiceId: number) => {
    const reason = prompt('Please provide a reason for cancelling this invoice (optional):');
    if (reason === null) return; // User clicked cancel on prompt

    try {
      const headers = getAuthHeaders();
      const res = await apiFetch(`/api/v2/invoices/${invoiceId}/actions`, {
        method: 'POST',
        credentials: 'include',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', reason: reason || undefined }),
      });

      if (res.ok) {
        toast.success('Invoice cancelled successfully');
        fetchBillingData();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to cancel invoice');
      }
    } catch (err: any) {
      logger.error('Error cancelling invoice:', err);
      toast.error('Failed to cancel invoice');
    }
  };

  const handleRefund = async (
    paymentId: number | undefined,
    amount: number,
    reason: string,
    stripeInvoiceId?: string | null
  ) => {
    try {
      const headers = getAuthHeaders();
      const res = await apiFetch('/api/stripe/refunds', {
        method: 'POST',
        credentials: 'include',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentId,
          stripeInvoiceId, // For invoice-based refunds
          amount, // Amount in cents
          reason,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(`Refund of ${formatCurrency(amount)} processed successfully`);
        setRefundModal(null);
        fetchBillingData();
      } else {
        toast.error(data.error || 'Failed to process refund');
      }
    } catch (err: any) {
      logger.error('Error processing refund:', err);
      toast.error('Failed to process refund');
    }
  };

  const handleViewInvoice = (invoice: Invoice) => {
    // Open invoice in modal or new tab
    if (invoice.stripeInvoiceUrl) {
      window.open(invoice.stripeInvoiceUrl, '_blank');
    } else {
      // Open internal invoice view
      window.open(`/invoices/${invoice.id}`, '_blank');
    }
  };

  const handleMarkAsPaid = async (
    invoiceId: number,
    amount: number,
    paymentMethod: string,
    paymentNotes: string,
    paymentDate: string
  ) => {
    try {
      const headers = getAuthHeaders();
      const res = await apiFetch(`/api/stripe/invoices/${invoiceId}`, {
        method: 'POST',
        credentials: 'include',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark_paid',
          paymentMethod,
          paymentNotes,
          paymentDate,
          amount: Math.round(amount * 100), // Convert to cents
        }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success('Invoice marked as paid');
        setMarkPaidModal(null);
        fetchBillingData();
      } else {
        toast.error(data.error || 'Failed to mark invoice as paid');
      }
    } catch (err: any) {
      logger.error('Error marking invoice as paid:', err);
      toast.error('Failed to mark invoice as paid');
    }
  };

  const handleOpenCustomerPortal = async () => {
    try {
      const headers = getAuthHeaders();
      const res = await apiFetch('/api/stripe/customer-portal', {
        method: 'POST',
        credentials: 'include',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId,
          returnUrl: window.location.href,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        window.open(data.url, '_blank');
      } else {
        toast.error('Failed to open customer portal');
      }
    } catch (err: any) {
      logger.error('Error opening customer portal:', err);
      toast.error('Failed to open customer portal');
    }
  };

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      DRAFT: 'bg-gray-100 text-gray-700',
      OPEN: 'bg-green-100 text-[#4fa77e]',
      PAID: 'bg-green-100 text-green-700',
      VOID: 'bg-red-100 text-red-700',
      UNCOLLECTIBLE: 'bg-orange-100 text-orange-700',
      PENDING: 'bg-yellow-100 text-yellow-700',
      PROCESSING: 'bg-green-100 text-[#4fa77e]',
      SUCCEEDED: 'bg-green-100 text-green-700',
      FAILED: 'bg-red-100 text-red-700',
      CANCELED: 'bg-gray-100 text-gray-700',
      REFUNDED: 'bg-[var(--brand-primary-light)] text-[var(--brand-primary)]',
    };

    return (
      <span
        className={`rounded-full px-2 py-1 text-xs font-medium ${statusColors[status] || 'bg-gray-100 text-gray-700'}`}
      >
        {status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header with actions */}
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <h2 className="text-xl font-semibold text-gray-900">Billing & Payments</h2>
        <div className="flex flex-shrink-0 gap-2">
          <button
            onClick={handleOpenCustomerPortal}
            className="whitespace-nowrap rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-200"
          >
            Customer Portal
          </button>
          <button
            onClick={() => setShowCreateInvoice(!showCreateInvoice)}
            className="whitespace-nowrap rounded-lg bg-[#4fa77e] px-4 py-2 text-sm text-white transition-colors hover:bg-[#3f8660]"
          >
            Create Invoice
          </button>
        </div>
      </div>

      {/* Create Invoice Form */}
      {showCreateInvoice && (
        <CreateInvoiceForm
          patientId={patientId}
          clinicSubdomain={clinicSubdomain}
          onSuccess={() => {
            setShowCreateInvoice(false);
            fetchBillingData();
          }}
          onCancel={() => setShowCreateInvoice(false)}
        />
      )}

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex flex-wrap gap-1">
          <button
            onClick={() => setActiveTab('invoices')}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'invoices'
                ? 'border-[#4fa77e] text-[#4fa77e]'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            Invoices ({invoices.length})
          </button>
          <button
            onClick={() => setActiveTab('payments')}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'payments'
                ? 'border-[#4fa77e] text-[#4fa77e]'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            Payments ({payments.length})
          </button>
          <button
            onClick={() => setActiveTab('process-payment')}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'process-payment'
                ? 'border-[#4fa77e] text-[#4fa77e]'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            Process Payment
          </button>
          <button
            onClick={() => setActiveTab('subscriptions')}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'subscriptions'
                ? 'border-[#4fa77e] text-[#4fa77e]'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            Subscriptions
          </button>
        </nav>
      </div>

      {/* Content */}
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
      )}

      {activeTab === 'invoices' && (
        <div>
          {invoices.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">
              <svg
                className="mx-auto mb-3 h-12 w-12 text-gray-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              No invoices found
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white md:block">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-gray-200 bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                          Invoice #
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                          Description
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                          Amount
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                          Due Date
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {invoices.map((invoice: any) => (
                        <tr key={invoice.id} className="transition-colors hover:bg-gray-50">
                          <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-gray-900">
                            {invoice.stripeInvoiceNumber || `INV-${invoice.id}`}
                          </td>
                          <td className="max-w-[200px] truncate px-4 py-4 text-sm text-gray-600">
                            {invoice.description || 'Medical Services'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-900">
                            <div className="font-medium">{formatCurrency(invoice.amountDue)}</div>
                            {invoice.amountPaid > 0 && (
                              <div className="text-xs text-green-600">
                                Paid: {formatCurrency(invoice.amountPaid)}
                              </div>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4">
                            {getStatusBadge(invoice.status)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-500">
                            {formatDate(invoice.dueDate)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-sm">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => handleViewInvoice(invoice)}
                                className="font-medium text-[#4fa77e] hover:text-[#3f8660]"
                              >
                                View
                              </button>
                              {invoice.stripePdfUrl && (
                                <a
                                  href={invoice.stripePdfUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium text-[#4fa77e] hover:text-[#3f8660]"
                                >
                                  PDF
                                </a>
                              )}
                              {invoice.status === 'DRAFT' && (
                                <button
                                  onClick={() => handleSendInvoice(invoice.id)}
                                  className="font-medium text-green-600 hover:text-green-800"
                                >
                                  Send
                                </button>
                              )}
                              {(invoice.status === 'DRAFT' || invoice.status === 'OPEN') && (
                                <button
                                  onClick={() =>
                                    setMarkPaidModal({
                                      invoiceId: invoice.id,
                                      amount: invoice.amountDue,
                                    })
                                  }
                                  className="font-medium text-blue-600 hover:text-blue-800"
                                >
                                  Mark Paid
                                </button>
                              )}
                              {invoice.status === 'OPEN' && (
                                <button
                                  onClick={() => handleVoidInvoice(invoice.id)}
                                  className="font-medium text-amber-600 hover:text-amber-800"
                                >
                                  Void
                                </button>
                              )}
                              {invoice.status === 'PAID' && invoice.amountPaid > 0 && (
                                <>
                                  <button
                                    onClick={() => {
                                      const invoicePayment = payments.find(
                                        (p: any) =>
                                          p.invoiceId === invoice.id && p.status === 'SUCCEEDED'
                                      );
                                      setRefundModal(
                                        invoicePayment
                                          ? {
                                              invoiceId: invoice.id,
                                              paymentId: invoicePayment.id,
                                              maxAmount: invoice.amountPaid,
                                            }
                                          : {
                                              invoiceId: invoice.id,
                                              stripeInvoiceId: invoice.stripeInvoiceId,
                                              maxAmount: invoice.amountPaid,
                                            }
                                      );
                                    }}
                                    className="font-medium text-[var(--brand-primary)] hover:text-[var(--brand-primary)]"
                                  >
                                    Refund
                                  </button>
                                  <button
                                    onClick={() => handleCancelInvoice(invoice.id)}
                                    className="font-medium text-red-600 hover:text-red-800"
                                  >
                                    Cancel
                                  </button>
                                </>
                              )}
                              {/* Edit and Delete for unpaid invoices */}
                              {(invoice.status === 'DRAFT' ||
                                invoice.status === 'OPEN' ||
                                invoice.status === 'VOID') && (
                                <>
                                  <button
                                    onClick={() =>
                                      window.open(`/invoices/${invoice.id}?edit=true`, '_blank')
                                    }
                                    className="font-medium text-blue-600 hover:text-blue-800"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleDeleteInvoice(invoice.id)}
                                    className="font-medium text-red-600 hover:text-red-800"
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Card View */}
              <div className="space-y-3 md:hidden">
                {invoices.map((invoice: any) => (
                  <div key={invoice.id} className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="mb-3 flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-gray-900">
                          {invoice.stripeInvoiceNumber || `INV-${invoice.id}`}
                        </p>
                        <p className="text-sm text-gray-500">
                          {invoice.description || 'Medical Services'}
                        </p>
                      </div>
                      {getStatusBadge(invoice.status)}
                    </div>

                    <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs font-medium uppercase text-gray-500">Amount</p>
                        <p className="font-semibold text-gray-900">
                          {formatCurrency(invoice.amountDue)}
                        </p>
                        {invoice.amountPaid > 0 && (
                          <p className="text-xs text-green-600">
                            Paid: {formatCurrency(invoice.amountPaid)}
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase text-gray-500">Due Date</p>
                        <p className="text-gray-900">{formatDate(invoice.dueDate)}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                      <button
                        onClick={() => handleViewInvoice(invoice)}
                        className="min-w-[60px] flex-1 rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-[#4fa77e] transition-colors hover:bg-green-100"
                      >
                        View
                      </button>
                      {invoice.stripePdfUrl && (
                        <a
                          href={invoice.stripePdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-w-[60px] flex-1 rounded-lg bg-green-50 px-3 py-2 text-center text-sm font-medium text-[#4fa77e] transition-colors hover:bg-green-100"
                        >
                          PDF
                        </a>
                      )}
                      {invoice.status === 'DRAFT' && (
                        <button
                          onClick={() => handleSendInvoice(invoice.id)}
                          className="min-w-[60px] flex-1 rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-600 transition-colors hover:bg-green-100"
                        >
                          Send
                        </button>
                      )}
                      {(invoice.status === 'DRAFT' || invoice.status === 'OPEN') && (
                        <button
                          onClick={() =>
                            setMarkPaidModal({ invoiceId: invoice.id, amount: invoice.amountDue })
                          }
                          className="min-w-[60px] flex-1 rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-100"
                        >
                          Mark Paid
                        </button>
                      )}
                      {invoice.status === 'OPEN' && (
                        <button
                          onClick={() => handleVoidInvoice(invoice.id)}
                          className="min-w-[60px] flex-1 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-600 transition-colors hover:bg-amber-100"
                        >
                          Void
                        </button>
                      )}
                      {invoice.status === 'PAID' && invoice.amountPaid > 0 && (
                        <>
                          <button
                            onClick={() => {
                              const invoicePayment = payments.find(
                                (p: any) => p.invoiceId === invoice.id && p.status === 'SUCCEEDED'
                              );
                              setRefundModal(
                                invoicePayment
                                  ? {
                                      invoiceId: invoice.id,
                                      paymentId: invoicePayment.id,
                                      maxAmount: invoice.amountPaid,
                                    }
                                  : {
                                      invoiceId: invoice.id,
                                      stripeInvoiceId: invoice.stripeInvoiceId,
                                      maxAmount: invoice.amountPaid,
                                    }
                              );
                            }}
                            className="min-w-[60px] flex-1 rounded-lg bg-[var(--brand-primary-light)] px-3 py-2 text-sm font-medium text-[var(--brand-primary)] transition-colors hover:bg-[var(--brand-primary-light)]"
                          >
                            Refund
                          </button>
                          <button
                            onClick={() => handleCancelInvoice(invoice.id)}
                            className="min-w-[60px] flex-1 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      {/* Edit and Delete for unpaid invoices */}
                      {(invoice.status === 'DRAFT' ||
                        invoice.status === 'OPEN' ||
                        invoice.status === 'VOID') && (
                        <>
                          <button
                            onClick={() =>
                              window.open(`/invoices/${invoice.id}?edit=true`, '_blank')
                            }
                            className="min-w-[60px] flex-1 rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-100"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteInvoice(invoice.id)}
                            className="min-w-[60px] flex-1 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'payments' && (
        <div>
          {payments.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">
              <svg
                className="mx-auto mb-3 h-12 w-12 text-gray-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              No payments found
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white md:block">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-gray-200 bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                          Date
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                          Amount
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                          Method
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                          Invoice
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {payments.map((payment: any) => (
                        <tr key={payment.id} className="transition-colors hover:bg-gray-50">
                          <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-600">
                            {formatDateTime(payment.createdAt)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-gray-900">
                            {formatCurrency(payment.amount)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4">
                            {getStatusBadge(payment.status)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-500">
                            {payment.paymentMethod || '—'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-500">
                            {payment.invoice
                              ? `#${payment.invoice.stripeInvoiceNumber || payment.invoice.id}`
                              : '—'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-sm">
                            {payment.status === 'SUCCEEDED' && (
                              <button
                                onClick={() =>
                                  setRefundModal({
                                    invoiceId: payment.invoice?.id || 0,
                                    paymentId: payment.id,
                                    maxAmount: payment.amount,
                                  })
                                }
                                className="font-medium text-[var(--brand-primary)] hover:text-[var(--brand-primary)]"
                              >
                                Refund
                              </button>
                            )}
                            {payment.status === 'REFUNDED' && (
                              <span className="italic text-gray-400">Refunded</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Card View */}
              <div className="space-y-3 md:hidden">
                {payments.map((payment: any) => (
                  <div key={payment.id} className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="mb-3 flex items-start justify-between">
                      <div>
                        <p className="text-lg font-semibold text-gray-900">
                          {formatCurrency(payment.amount)}
                        </p>
                        <p className="text-sm text-gray-500">{formatDateTime(payment.createdAt)}</p>
                      </div>
                      {getStatusBadge(payment.status)}
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs font-medium uppercase text-gray-500">Method</p>
                        <p className="text-gray-900">{payment.paymentMethod || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase text-gray-500">Invoice</p>
                        <p className="text-gray-900">
                          {payment.invoice
                            ? `#${payment.invoice.stripeInvoiceNumber || payment.invoice.id}`
                            : '—'}
                        </p>
                      </div>
                    </div>

                    {(payment.status === 'SUCCEEDED' || payment.status === 'REFUNDED') && (
                      <div className="mt-3 border-t border-gray-100 pt-3">
                        {payment.status === 'SUCCEEDED' && (
                          <button
                            onClick={() =>
                              setRefundModal({
                                invoiceId: payment.invoice?.id || 0,
                                paymentId: payment.id,
                                maxAmount: payment.amount,
                              })
                            }
                            className="w-full rounded-lg bg-[var(--brand-primary-light)] px-3 py-2 text-sm font-medium text-[var(--brand-primary)] transition-colors hover:bg-[var(--brand-primary-light)]"
                          >
                            Refund
                          </button>
                        )}
                        {payment.status === 'REFUNDED' && (
                          <p className="text-center text-sm italic text-gray-400">Refunded</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Process Payment Tab */}
      {activeTab === 'process-payment' && (
        <ProcessPaymentForm
          patientId={patientId}
          patientName={patientName}
          clinicSubdomain={clinicSubdomain}
          onSuccess={() => {
            fetchBillingData();
            setActiveTab('payments');
          }}
        />
      )}

      {/* Subscriptions Tab */}
      {activeTab === 'subscriptions' && (
        <PatientSubscriptionManager patientId={patientId} patientName={patientName} clinicSubdomain={clinicSubdomain} />
      )}

      {/* Refund Modal */}
      {refundModal && (
        <RefundModal
          maxAmount={refundModal.maxAmount}
          paymentId={refundModal.paymentId}
          stripeInvoiceId={refundModal.stripeInvoiceId}
          onConfirm={handleRefund}
          onClose={() => setRefundModal(null)}
        />
      )}

      {/* Mark as Paid Modal */}
      {markPaidModal && (
        <MarkPaidModal
          amount={markPaidModal.amount}
          onConfirm={(amount, paymentMethod, paymentNotes, paymentDate) =>
            handleMarkAsPaid(
              markPaidModal.invoiceId,
              amount,
              paymentMethod,
              paymentNotes,
              paymentDate
            )
          }
          onClose={() => setMarkPaidModal(null)}
        />
      )}
    </div>
  );
}

// Refund Modal Component
function RefundModal({
  maxAmount,
  paymentId,
  stripeInvoiceId,
  onConfirm,
  onClose,
}: {
  maxAmount: number;
  paymentId?: number;
  stripeInvoiceId?: string | null;
  onConfirm: (
    paymentId: number | undefined,
    amount: number,
    reason: string,
    stripeInvoiceId?: string | null
  ) => void;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(maxAmount / 100); // Convert from cents to dollars
  const [reason, setReason] = useState('requested_by_customer');
  const [isPartial, setIsPartial] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Need either paymentId or stripeInvoiceId
    if (!paymentId && !stripeInvoiceId) {
      toast.error('Unable to process refund - no payment or invoice reference found');
      return;
    }

    const amountInCents = Math.round(amount * 100);
    if (amountInCents <= 0 || amountInCents > maxAmount) {
      toast.error(`Amount must be between $0.01 and ${formatCurrency(maxAmount)}`);
      return;
    }

    setSubmitting(true);
    await onConfirm(paymentId, amountInCents, reason, stripeInvoiceId);
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold">Process Refund</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Refund Type */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Refund Type</label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={!isPartial}
                  onChange={() => {
                    setIsPartial(false);
                    setAmount(maxAmount / 100);
                  }}
                  className="mr-2"
                />
                Full Refund ({formatCurrency(maxAmount)})
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={isPartial}
                  onChange={() => setIsPartial(true)}
                  className="mr-2"
                />
                Partial Refund
              </label>
            </div>
          </div>

          {/* Amount (for partial refunds) */}
          {isPartial && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Refund Amount (max: {formatCurrency(maxAmount)})
              </label>
              <div className="relative">
                <span className="absolute left-4 top-2 text-gray-500">$</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                  step="0.01"
                  min="0.01"
                  max={maxAmount / 100}
                  className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 focus:ring-2 focus:ring-[var(--brand-primary)]"
                  required
                />
              </div>
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[var(--brand-primary)]"
            >
              <option value="requested_by_customer">Requested by customer</option>
              <option value="duplicate">Duplicate charge</option>
              <option value="fraudulent">Fraudulent charge</option>
              <option value="service_not_rendered">Service not rendered</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Warning */}
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
            <strong>Warning:</strong> Refunds cannot be undone. The refund will be processed through
            Stripe and may take 5-10 business days to appear on the customer&apos;s statement.
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-white hover:brightness-90 disabled:opacity-50"
            >
              {submitting
                ? 'Processing...'
                : `Refund ${formatCurrency(isPartial ? amount * 100 : maxAmount)}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Mark as Paid Modal Component
function MarkPaidModal({
  amount,
  onConfirm,
  onClose,
}: {
  amount: number;
  onConfirm: (
    amount: number,
    paymentMethod: string,
    paymentNotes: string,
    paymentDate: string
  ) => void;
  onClose: () => void;
}) {
  const [paymentAmount, setPaymentAmount] = useState(amount / 100); // Convert from cents
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (paymentAmount <= 0) {
      toast.error('Payment amount must be greater than $0');
      return;
    }

    setSubmitting(true);
    await onConfirm(paymentAmount, paymentMethod, paymentNotes, paymentDate);
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold">Mark Invoice as Paid</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Amount */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Payment Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500">$</span>
              <input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                step="0.01"
                min="0.01"
                className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          {/* Payment Method */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Payment Method</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500"
            >
              <option value="cash">Cash</option>
              <option value="check">Check</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="external_stripe">Paid on Stripe (not synced)</option>
              <option value="credit_card">Credit Card (manual)</option>
              <option value="insurance">Insurance Payment</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Payment Date */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Payment Date</label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Reference / Notes (optional)
            </label>
            <input
              type="text"
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
              placeholder="e.g., Check #1234, Stripe payment ID, etc."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Info */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            <strong>Note:</strong> Use this to record payments received outside EonPro (e.g., cash,
            check, or payments made directly on Stripe that were not synced).
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting
                ? 'Processing...'
                : `Mark as Paid (${formatCurrency(paymentAmount * 100)})`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Create Invoice Form Component
function CreateInvoiceForm({
  patientId,
  clinicSubdomain,
  onSuccess,
  onCancel,
}: {
  patientId: number;
  clinicSubdomain?: string | null;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [lineItems, setLineItems] = useState([{ description: '', amount: 0 }]);
  const [autoSend, setAutoSend] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const groupedPlans = getGroupedPlans(clinicSubdomain);

  // Mark as Paid Externally fields
  const [markAsPaidExternally, setMarkAsPaidExternally] = useState(false);
  const [externalPaymentMethod, setExternalPaymentMethod] = useState('external_stripe');
  const [externalPaymentNotes, setExternalPaymentNotes] = useState('');
  const [externalPaymentDate, setExternalPaymentDate] = useState(
    new Date().toISOString().split('T')[0]
  );

  const handlePlanSelect = (planId: string) => {
    const plan = getPlanById(planId, clinicSubdomain);
    if (plan) {
      setLineItems([
        {
          description: plan.description,
          amount: plan.price,
        },
      ]);
      setSelectedPlan(planId);
    } else {
      // Clear selection for custom entry
      setSelectedPlan('');
      setLineItems([{ description: '', amount: 0 }]);
    }
  };

  const handleAddLineItem = () => {
    setLineItems([...lineItems, { description: '', amount: 0 }]);
  };

  const handleRemoveLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const handleLineItemChange = (
    index: number,
    field: 'description' | 'amount',
    value: string | number
  ) => {
    const updated = [...lineItems];
    if (field === 'amount') {
      updated[index][field] = typeof value === 'string' ? parseFloat(value) * 100 : value * 100; // Convert to cents
    } else {
      updated[index][field] = value as string;
    }
    setLineItems(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent double submission
    if (submitting) {
      return;
    }

    // Validate line items
    const validItems = lineItems.filter((item: any) => item.description && item.amount > 0);
    if (validItems.length === 0) {
      toast.error('Please add at least one line item');
      return;
    }

    setSubmitting(true);

    // Get auth token for API calls
    const token =
      localStorage.getItem('auth-token') ||
      localStorage.getItem('super_admin-token') ||
      localStorage.getItem('admin-token') ||
      localStorage.getItem('provider-token');
    const authHeaders: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

    const createPayload = {
      patientId,
      lineItems: validItems,
      autoSend: markAsPaidExternally ? false : autoSend, // Don't auto-send if marking as paid
      // External payment fields
      markAsPaidExternally,
      ...(markAsPaidExternally && {
        externalPaymentMethod,
        externalPaymentNotes,
        externalPaymentDate,
      }),
    };

    const doFetch = () =>
      apiFetch('/api/stripe/invoices', {
        method: 'POST',
        credentials: 'include',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(createPayload),
      });

    try {
      let res = await doFetch();

      // Retry once on 503 (connection pool busy) per Retry-After header
      if (res.status === 503) {
        const retryAfterSec = parseInt(res.headers.get('Retry-After') || '10', 10) || 10;
        await new Promise((r) => setTimeout(r, Math.min(retryAfterSec, 15) * 1000));
        res = await doFetch();
      }

      const data = await res.json();

      if (res.ok) {
        if (markAsPaidExternally) {
          toast.success('Invoice created and marked as paid externally');
        } else if (data.demoMode) {
          // Show demo mode message
          toast.warning('Invoice created (Demo Mode - Stripe not configured)');
        } else {
          toast.success('Invoice created successfully');
        }
        onSuccess();
      } else {
        const errorMsg = data.demoMode
          ? 'Invoice creation is in demo mode. Stripe payment processing is not configured.'
          : data.error || 'Failed to create invoice';
        toast.error(errorMsg);
      }
    } catch (err: any) {
      logger.error('Error creating invoice:', err);
      toast.error('Failed to create invoice');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
      <h3 className="mb-4 text-lg font-semibold">Create Invoice</h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Billing Plans Dropdown */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Select Billing Plan (Optional)
          </label>
          <select
            value={selectedPlan}
            onChange={(e: any) => handlePlanSelect(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:ring-2 focus:ring-[#4fa77e]"
          >
            <option value="">-- Custom Invoice --</option>
            {Object.entries(groupedPlans).map(([groupName, group]) => (
              <optgroup key={groupName} label={group.label}>
                {group.plans.map((plan: any) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} - {formatPlanPrice(plan.price)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Line Items</label>
          {lineItems.map((item, index) => (
            <div key={index} className="mb-2 flex gap-2">
              <input
                type="text"
                placeholder="Description"
                value={item.description}
                onChange={(e: any) => handleLineItemChange(index, 'description', e.target.value)}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <input
                type="number"
                placeholder="Amount"
                value={item.amount / 100 || ''}
                onChange={(e: any) => handleLineItemChange(index, 'amount', e.target.value)}
                step="0.01"
                min="0"
                className="w-32 rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              {lineItems.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveLineItem(index)}
                  className="rounded-lg px-3 py-2 text-red-600 hover:bg-red-50"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={handleAddLineItem}
            className="text-sm text-[#4fa77e] hover:text-[#3f8660]"
          >
            + Add Line Item
          </button>
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="autoSend"
            checked={autoSend}
            onChange={(e: any) => setAutoSend(e.target.checked)}
            disabled={markAsPaidExternally}
            className="h-4 w-4 rounded border border-gray-300 text-[#4fa77e] focus:ring-[#4fa77e] disabled:opacity-50"
          />
          <label htmlFor="autoSend" className="ml-2 block text-sm text-gray-700">
            Send invoice automatically
          </label>
        </div>

        {/* Mark as Paid Externally Section */}
        <div className="mt-4 border-t border-gray-200 pt-4">
          <div className="mb-3 flex items-center">
            <input
              type="checkbox"
              id="markAsPaidExternally"
              checked={markAsPaidExternally}
              onChange={(e: any) => setMarkAsPaidExternally(e.target.checked)}
              className="h-4 w-4 rounded border border-gray-300 text-[#4fa77e] focus:ring-[#4fa77e]"
            />
            <label
              htmlFor="markAsPaidExternally"
              className="ml-2 block text-sm font-medium text-gray-700"
            >
              Mark as Paid Externally
            </label>
          </div>

          {markAsPaidExternally && (
            <div className="ml-6 space-y-3 rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="mb-3 text-sm text-green-700">
                Use this if payment was received outside EonPro (e.g., cash, check, or paid directly
                on Stripe).
              </p>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Payment Method
                  </label>
                  <select
                    value={externalPaymentMethod}
                    onChange={(e: any) => setExternalPaymentMethod(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:ring-2 focus:ring-[#4fa77e]"
                  >
                    <option value="cash">Cash</option>
                    <option value="check">Check</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="external_stripe">Paid on Stripe (not synced)</option>
                    <option value="credit_card">Credit Card (manual)</option>
                    <option value="insurance">Insurance Payment</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Payment Date
                  </label>
                  <input
                    type="date"
                    value={externalPaymentDate}
                    onChange={(e: any) => setExternalPaymentDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:ring-2 focus:ring-[#4fa77e]"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Reference / Notes (optional)
                </label>
                <input
                  type="text"
                  value={externalPaymentNotes}
                  onChange={(e: any) => setExternalPaymentNotes(e.target.value)}
                  placeholder="e.g., Check #1234, Stripe payment ID, etc."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:ring-2 focus:ring-[#4fa77e]"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-[#4fa77e] px-4 py-2 text-white hover:bg-[#3f8660] disabled:opacity-50"
          >
            {submitting ? 'Creating...' : 'Create Invoice'}
          </button>
        </div>
      </form>
    </div>
  );
}
