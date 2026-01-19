'use client';

import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/stripe';
import { BILLING_PLANS, getGroupedPlans, formatPlanPrice, getPlanById } from '@/config/billingPlans';
import { ProcessPaymentForm } from './ProcessPaymentForm';
import { PatientSubscriptionManager } from './PatientSubscriptionManager';
import { logger } from '@/lib/logger';
import { toast } from '@/components/Toast';

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
}

export function PatientBillingView({ patientId, patientName }: PatientBillingViewProps) {
  const [activeTab, setActiveTab] = useState<'invoices' | 'payments' | 'subscriptions' | 'process-payment'>('invoices');
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
    maxAmount: number 
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
    const token = localStorage.getItem('auth-token') ||
                  localStorage.getItem('super_admin-token') ||
                  localStorage.getItem('admin-token') ||
                  localStorage.getItem('provider-token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  };

  const fetchBillingData = async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      
      // Fetch invoices
      const invoicesRes = await fetch(`/api/stripe/invoices?patientId=${patientId}`, {
        credentials: 'include',
        headers,
      });
      if (invoicesRes.ok) {
        const data = await invoicesRes.json();
        setInvoices(data.invoices || []);
      }
      
      // Fetch payments
      const paymentsRes = await fetch(`/api/stripe/payments?patientId=${patientId}`, {
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
      const res = await fetch(`/api/stripe/invoices/${invoiceId}`, {
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
      const res = await fetch(`/api/stripe/invoices/${invoiceId}`, {
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

  const handleRefund = async (paymentId: number | undefined, amount: number, reason: string, stripeInvoiceId?: string | null) => {
    try {
      const headers = getAuthHeaders();
      const res = await fetch('/api/stripe/refunds', {
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

  const handleOpenCustomerPortal = async () => {
    try {
      const headers = getAuthHeaders();
      const res = await fetch('/api/stripe/customer-portal', {
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
      REFUNDED: 'bg-purple-100 text-purple-700',
    };
    
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[status] || 'bg-gray-100 text-gray-700'}`}>
        {status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header with actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Billing & Payments</h2>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={handleOpenCustomerPortal}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap"
          >
            Customer Portal
          </button>
          <button
            onClick={() => setShowCreateInvoice(!showCreateInvoice)}
            className="px-4 py-2 text-sm bg-[#4fa77e] text-white rounded-lg hover:bg-[#3f8660] transition-colors whitespace-nowrap"
          >
            Create Invoice
          </button>
        </div>
      </div>

      {/* Create Invoice Form */}
      {showCreateInvoice && (
        <CreateInvoiceForm
          patientId={patientId}
          onSuccess={() => {
            setShowCreateInvoice(false);
            fetchBillingData();
          }}
          onCancel={() => setShowCreateInvoice(false)}
        />
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex flex-wrap gap-1">
          <button
            onClick={() => setActiveTab('invoices')}
            className={`py-2.5 px-4 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
              activeTab === 'invoices'
                ? 'border-[#4fa77e] text-[#4fa77e]'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Invoices ({invoices.length})
          </button>
          <button
            onClick={() => setActiveTab('payments')}
            className={`py-2.5 px-4 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
              activeTab === 'payments'
                ? 'border-[#4fa77e] text-[#4fa77e]'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Payments ({payments.length})
          </button>
          <button
            onClick={() => setActiveTab('process-payment')}
            className={`py-2.5 px-4 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
              activeTab === 'process-payment'
                ? 'border-[#4fa77e] text-[#4fa77e]'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Process Payment
          </button>
          <button
            onClick={() => setActiveTab('subscriptions')}
            className={`py-2.5 px-4 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
              activeTab === 'subscriptions'
                ? 'border-[#4fa77e] text-[#4fa77e]'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Subscriptions
          </button>
        </nav>
      </div>

      {/* Content */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {activeTab === 'invoices' && (
        <div>
          {invoices.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              No invoices found
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Invoice #</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Due Date</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {invoices.map((invoice: any) => (
                        <tr key={invoice.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{invoice.stripeInvoiceNumber || `INV-${invoice.id}`}</td>
                          <td className="px-4 py-4 text-sm text-gray-600 max-w-[200px] truncate">{invoice.description || 'Medical Services'}</td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                            <div className="font-medium">{formatCurrency(invoice.amountDue)}</div>
                            {invoice.amountPaid > 0 && <div className="text-xs text-green-600">Paid: {formatCurrency(invoice.amountPaid)}</div>}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">{getStatusBadge(invoice.status)}</td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(invoice.dueDate)}</td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm">
                            <div className="flex items-center gap-3">
                              <button onClick={() => handleViewInvoice(invoice)} className="text-[#4fa77e] hover:text-[#3f8660] font-medium">View</button>
                              {invoice.stripePdfUrl && <a href={invoice.stripePdfUrl} target="_blank" rel="noopener noreferrer" className="text-[#4fa77e] hover:text-[#3f8660] font-medium">PDF</a>}
                              {invoice.status === 'DRAFT' && <button onClick={() => handleSendInvoice(invoice.id)} className="text-green-600 hover:text-green-800 font-medium">Send</button>}
                              {invoice.status === 'OPEN' && <button onClick={() => handleVoidInvoice(invoice.id)} className="text-red-600 hover:text-red-800 font-medium">Void</button>}
                              {invoice.status === 'PAID' && invoice.amountPaid > 0 && (
                                <button onClick={() => {
                                  const invoicePayment = payments.find((p: any) => p.invoiceId === invoice.id && p.status === 'SUCCEEDED');
                                  setRefundModal(invoicePayment ? { invoiceId: invoice.id, paymentId: invoicePayment.id, maxAmount: invoice.amountPaid } : { invoiceId: invoice.id, stripeInvoiceId: invoice.stripeInvoiceId, maxAmount: invoice.amountPaid });
                                }} className="text-purple-600 hover:text-purple-800 font-medium">Refund</button>
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
              <div className="md:hidden space-y-3">
                {invoices.map((invoice: any) => (
                  <div key={invoice.id} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold text-gray-900">{invoice.stripeInvoiceNumber || `INV-${invoice.id}`}</p>
                        <p className="text-sm text-gray-500">{invoice.description || 'Medical Services'}</p>
                      </div>
                      {getStatusBadge(invoice.status)}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                      <div>
                        <p className="text-gray-500 text-xs uppercase font-medium">Amount</p>
                        <p className="font-semibold text-gray-900">{formatCurrency(invoice.amountDue)}</p>
                        {invoice.amountPaid > 0 && <p className="text-xs text-green-600">Paid: {formatCurrency(invoice.amountPaid)}</p>}
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs uppercase font-medium">Due Date</p>
                        <p className="text-gray-900">{formatDate(invoice.dueDate)}</p>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100">
                      <button onClick={() => handleViewInvoice(invoice)} className="flex-1 min-w-[80px] py-2 px-3 text-sm font-medium text-[#4fa77e] bg-green-50 rounded-lg hover:bg-green-100 transition-colors">View</button>
                      {invoice.stripePdfUrl && <a href={invoice.stripePdfUrl} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-[80px] py-2 px-3 text-sm font-medium text-center text-[#4fa77e] bg-green-50 rounded-lg hover:bg-green-100 transition-colors">PDF</a>}
                      {invoice.status === 'DRAFT' && <button onClick={() => handleSendInvoice(invoice.id)} className="flex-1 min-w-[80px] py-2 px-3 text-sm font-medium text-green-600 bg-green-50 rounded-lg hover:bg-green-100 transition-colors">Send</button>}
                      {invoice.status === 'OPEN' && <button onClick={() => handleVoidInvoice(invoice.id)} className="flex-1 min-w-[80px] py-2 px-3 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">Void</button>}
                      {invoice.status === 'PAID' && invoice.amountPaid > 0 && (
                        <button onClick={() => {
                          const invoicePayment = payments.find((p: any) => p.invoiceId === invoice.id && p.status === 'SUCCEEDED');
                          setRefundModal(invoicePayment ? { invoiceId: invoice.id, paymentId: invoicePayment.id, maxAmount: invoice.amountPaid } : { invoiceId: invoice.id, stripeInvoiceId: invoice.stripeInvoiceId, maxAmount: invoice.amountPaid });
                        }} className="flex-1 min-w-[80px] py-2 px-3 text-sm font-medium text-purple-600 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors">Refund</button>
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
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              No payments found
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Method</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Invoice</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {payments.map((payment: any) => (
                        <tr key={payment.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">{formatDateTime(payment.createdAt)}</td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{formatCurrency(payment.amount)}</td>
                          <td className="px-4 py-4 whitespace-nowrap">{getStatusBadge(payment.status)}</td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{payment.paymentMethod || '—'}</td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{payment.invoice ? `#${payment.invoice.stripeInvoiceNumber || payment.invoice.id}` : '—'}</td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm">
                            {payment.status === 'SUCCEEDED' && (
                              <button onClick={() => setRefundModal({ invoiceId: payment.invoice?.id || 0, paymentId: payment.id, maxAmount: payment.amount })} className="text-purple-600 hover:text-purple-800 font-medium">Refund</button>
                            )}
                            {payment.status === 'REFUNDED' && <span className="text-gray-400 italic">Refunded</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden space-y-3">
                {payments.map((payment: any) => (
                  <div key={payment.id} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-lg font-semibold text-gray-900">{formatCurrency(payment.amount)}</p>
                        <p className="text-sm text-gray-500">{formatDateTime(payment.createdAt)}</p>
                      </div>
                      {getStatusBadge(payment.status)}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-gray-500 text-xs uppercase font-medium">Method</p>
                        <p className="text-gray-900">{payment.paymentMethod || '—'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs uppercase font-medium">Invoice</p>
                        <p className="text-gray-900">{payment.invoice ? `#${payment.invoice.stripeInvoiceNumber || payment.invoice.id}` : '—'}</p>
                      </div>
                    </div>
                    
                    {(payment.status === 'SUCCEEDED' || payment.status === 'REFUNDED') && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        {payment.status === 'SUCCEEDED' && (
                          <button onClick={() => setRefundModal({ invoiceId: payment.invoice?.id || 0, paymentId: payment.id, maxAmount: payment.amount })} className="w-full py-2 px-3 text-sm font-medium text-purple-600 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors">Refund</button>
                        )}
                        {payment.status === 'REFUNDED' && (
                          <p className="text-center text-gray-400 italic text-sm">Refunded</p>
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
          onSuccess={() => {
            fetchBillingData();
            setActiveTab('payments');
          }}
        />
      )}

      {/* Subscriptions Tab */}
      {activeTab === 'subscriptions' && (
        <PatientSubscriptionManager
          patientId={patientId}
          patientName={patientName}
        />
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
  onConfirm: (paymentId: number | undefined, amount: number, reason: string, stripeInvoiceId?: string | null) => void;
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">Process Refund</h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Refund Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Refund Type
            </label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Refund Amount (max: {formatCurrency(maxAmount)})
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500">$</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                  step="0.01"
                  min="0.01"
                  max={maxAmount / 100}
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            >
              <option value="requested_by_customer">Requested by customer</option>
              <option value="duplicate">Duplicate charge</option>
              <option value="fraudulent">Fraudulent charge</option>
              <option value="service_not_rendered">Service not rendered</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Warning */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
            <strong>Warning:</strong> Refunds cannot be undone. The refund will be processed through Stripe and may take 5-10 business days to appear on the customer&apos;s statement.
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              {submitting ? 'Processing...' : `Refund ${formatCurrency(isPartial ? amount * 100 : maxAmount)}`}
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
  onSuccess,
  onCancel,
}: {
  patientId: number;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [lineItems, setLineItems] = useState([
    { description: '', amount: 0 }
  ]);
  const [autoSend, setAutoSend] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const groupedPlans = getGroupedPlans();

  const handlePlanSelect = (planId: string) => {
    const plan = getPlanById(planId);
    if (plan) {
      setLineItems([{ 
        description: plan.description, 
        amount: plan.price 
      }]);
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

  const handleLineItemChange = (index: number, field: 'description' | 'amount', value: string | number) => {
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
    const token = localStorage.getItem('auth-token') ||
                  localStorage.getItem('super_admin-token') ||
                  localStorage.getItem('admin-token') ||
                  localStorage.getItem('provider-token');
    const authHeaders: HeadersInit = token ? { 'Authorization': `Bearer ${token}` } : {};
    
    try {
      const res = await fetch('/api/stripe/invoices', {
        method: 'POST',
        credentials: 'include',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId,
          lineItems: validItems,
          autoSend,
        }),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        if (data.demoMode) {
          // Show demo mode message
          toast.warning('Invoice created (Demo Mode - Stripe not configured)');
        } else {
          toast.success('Invoice created successfully');
        }
        onSuccess();
      } else {
        const errorMsg = data.demoMode
          ? 'Invoice creation is in demo mode. Stripe payment processing is not configured.'
          : (data.error || 'Failed to create invoice');
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
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <h3 className="text-lg font-semibold mb-4">Create Invoice</h3>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Billing Plans Dropdown */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Billing Plan (Optional)
          </label>
          <select
            value={selectedPlan}
            onChange={(e: any) => handlePlanSelect(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4fa77e] focus:border-[#4fa77e]"
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
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Line Items
          </label>
          {lineItems.map((item, index) => (
            <div key={index} className="flex gap-2 mb-2">
              <input
                type="text"
                placeholder="Description"
                value={item.description}
                onChange={(e: any) => handleLineItemChange(index, 'description', e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <input
                type="number"
                placeholder="Amount"
                value={item.amount / 100 || ''}
                onChange={(e: any) => handleLineItemChange(index, 'amount', e.target.value)}
                step="0.01"
                min="0"
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              {lineItems.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveLineItem(index)}
                  className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
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
            className="h-4 w-4 text-[#4fa77e] focus:ring-[#4fa77e] border-gray-300 border rounded"
          />
          <label htmlFor="autoSend" className="ml-2 block text-sm text-gray-700">
            Send invoice automatically
          </label>
        </div>
        
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-[#4fa77e] text-white rounded-lg hover:bg-[#3f8660] disabled:opacity-50"
          >
            {submitting ? 'Creating...' : 'Create Invoice'}
          </button>
        </div>
      </form>
    </div>
  );
}
