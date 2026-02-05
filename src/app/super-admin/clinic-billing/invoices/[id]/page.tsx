'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  FileText, ChevronLeft, Download, Send, DollarSign, XCircle,
  Clock, AlertCircle, CheckCircle, ExternalLink, Building2, CreditCard, 
  Calendar, Receipt, Trash2
} from 'lucide-react';

interface FeeEvent {
  id: number;
  feeType: string;
  amountCents: number;
  status: string;
  createdAt: string;
  order?: {
    id: number;
    patient?: {
      firstName: string;
      lastName: string;
    };
  };
  provider?: {
    firstName: string;
    lastName: string;
    isEonproProvider: boolean;
  };
}

interface Invoice {
  id: number;
  invoiceNumber: string;
  periodStart: string;
  periodEnd: string;
  periodType: string;
  prescriptionFeeTotal: number;
  transmissionFeeTotal: number;
  adminFeeTotal: number;
  totalAmountCents: number;
  prescriptionCount: number;
  transmissionCount: number;
  status: string;
  dueDate: string;
  paidAt: string | null;
  paidAmountCents: number | null;
  paymentMethod: string | null;
  paymentRef: string | null;
  stripeInvoiceId: string | null;
  stripeInvoiceUrl: string | null;
  stripePdfUrl: string | null;
  pdfUrl: string | null;
  notes: string | null;
  externalNotes: string | null;
  createdAt: string;
  finalizedAt: string | null;
  sentAt: string | null;
  clinic: {
    id: number;
    name: string;
    adminEmail: string;
  };
  config: {
    prescriptionFeeType: string;
    prescriptionFeeAmount: number;
    transmissionFeeType: string;
    transmissionFeeAmount: number;
    adminFeeType: string;
    adminFeeAmount: number;
    billingEmail: string | null;
  };
  feeEvents: FeeEvent[];
}

export default function InvoiceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const invoiceId = params.id as string;
  
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amountCents: 0,
    paymentMethod: 'bank_transfer',
    paymentRef: '',
  });

  const fetchInvoice = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth-token');
      if (!token) {
        router.push('/login');
        return;
      }

      const response = await fetch(`/api/super-admin/clinic-invoices/${invoiceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setInvoice(data.invoice);
        setPaymentForm((prev) => ({
          ...prev,
          amountCents: data.invoice.totalAmountCents,
        }));
      } else if (response.status === 404) {
        router.push('/super-admin/clinic-billing/invoices');
      }
    } catch (error) {
      console.error('Failed to fetch invoice:', error);
    } finally {
      setLoading(false);
    }
  }, [invoiceId, router]);

  useEffect(() => {
    fetchInvoice();
  }, [fetchInvoice]);

  const performAction = async (action: string, extraData?: Record<string, unknown>) => {
    setActionLoading(action);
    try {
      const token = localStorage.getItem('auth-token');
      const response = await fetch(`/api/super-admin/clinic-invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action, ...extraData }),
      });

      if (response.ok) {
        fetchInvoice();
        if (action === 'mark_paid') {
          setPaymentModalOpen(false);
        }
      } else {
        const error = await response.json();
        alert(error.error || `Failed to ${action.replace('_', ' ')}`);
      }
    } catch (error) {
      console.error(`Failed to ${action}:`, error);
      alert(`Failed to ${action.replace('_', ' ')}`);
    } finally {
      setActionLoading(null);
    }
  };

  const deleteInvoice = async () => {
    if (!confirm('Are you sure you want to delete this draft invoice? This action cannot be undone.')) {
      return;
    }

    setActionLoading('delete');
    try {
      const token = localStorage.getItem('auth-token');
      const response = await fetch(`/api/super-admin/clinic-invoices/${invoiceId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        router.push('/super-admin/clinic-billing/invoices');
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to delete invoice');
      }
    } catch (error) {
      console.error('Failed to delete invoice:', error);
      alert('Failed to delete invoice');
    } finally {
      setActionLoading(null);
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

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
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
      <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium ${style.bg} ${style.text}`}>
        <Icon className="h-4 w-4" />
        {status}
      </span>
    );
  };

  const getFeeTypeBadge = (feeType: string) => {
    if (feeType === 'PRESCRIPTION') {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-700">
          Medical Prescription
        </span>
      );
    }
    if (feeType === 'TRANSMISSION') {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700">
          Transmission
        </span>
      );
    }
    if (feeType === 'ADMIN') {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-orange-100 text-orange-700">
          Admin Fee
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700">
        {feeType}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="p-6 lg:p-8 min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#4fa77e] border-t-transparent" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="p-6 lg:p-8 min-h-screen">
        <div className="text-center py-12">
          <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Invoice not found</p>
        </div>
      </div>
    );
  }

  const canFinalize = invoice.status === 'DRAFT';
  const canCreateStripe = invoice.status === 'PENDING' && !invoice.stripeInvoiceId;
  const canSend = ['PENDING', 'SENT'].includes(invoice.status) && invoice.stripeInvoiceId;
  const canMarkPaid = ['PENDING', 'SENT', 'OVERDUE'].includes(invoice.status);
  const canCancel = ['DRAFT', 'PENDING', 'SENT', 'OVERDUE'].includes(invoice.status);
  const canDelete = invoice.status === 'DRAFT';

  return (
    <div className="p-6 lg:p-8 min-h-screen">
      {/* Page Header */}
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => router.push('/super-admin/clinic-billing/invoices')}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ChevronLeft className="h-5 w-5 text-gray-500" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{invoice.invoiceNumber}</h1>
            {getStatusBadge(invoice.status)}
          </div>
          <p className="text-gray-500 mt-1">
            {invoice.clinic.name} &bull; {formatDate(invoice.periodStart)} - {formatDate(invoice.periodEnd)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(invoice.stripePdfUrl || invoice.pdfUrl) && (
            <a
              href={invoice.stripePdfUrl || invoice.pdfUrl || ''}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <Download className="h-5 w-5" />
              PDF
            </a>
          )}
          {invoice.stripeInvoiceUrl && (
            <a
              href={invoice.stripeInvoiceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <ExternalLink className="h-5 w-5" />
              Stripe
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Summary Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Invoice Summary</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-600">Medical Prescription Fees ({invoice.prescriptionCount})</span>
                <span className="font-medium">{formatCurrency(invoice.prescriptionFeeTotal)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-600">Transmission Fees ({invoice.transmissionCount})</span>
                <span className="font-medium">{formatCurrency(invoice.transmissionFeeTotal)}</span>
              </div>
              {invoice.adminFeeTotal > 0 && (
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-gray-600">Admin Fees</span>
                  <span className="font-medium">{formatCurrency(invoice.adminFeeTotal)}</span>
                </div>
              )}
              <div className="flex justify-between items-center py-3">
                <span className="text-lg font-semibold text-gray-900">Total</span>
                <span className="text-xl font-bold text-gray-900">{formatCurrency(invoice.totalAmountCents)}</span>
              </div>
            </div>
          </div>

          {/* Fee Events Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Fee Line Items</h2>
            </div>
            {invoice.feeEvents.length === 0 ? (
              <div className="text-center py-8">
                <Receipt className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No fee events</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {invoice.feeEvents.map((event) => (
                      <tr key={event.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">{getFeeTypeBadge(event.feeType)}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {event.order?.patient ? (
                            <span>
                              {event.order.patient.firstName} {event.order.patient.lastName}
                              {event.provider && (
                                <span className="text-gray-500">
                                  {' '}
                                  (Dr. {event.provider.firstName} {event.provider.lastName}
                                  {event.provider.isEonproProvider && ' - EONPRO'})
                                </span>
                              )}
                            </span>
                          ) : event.feeType === 'ADMIN' ? (
                            <span className="text-gray-500">Weekly admin fee</span>
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">{formatDate(event.createdAt)}</td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                          {formatCurrency(event.amountCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Actions */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions</h2>
            <div className="space-y-3">
              {canFinalize && (
                <button
                  onClick={() => performAction('finalize')}
                  disabled={actionLoading === 'finalize'}
                  className="w-full px-4 py-2.5 bg-[#4fa77e] text-white rounded-lg hover:bg-[#3d9268] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <CheckCircle className="h-5 w-5" />
                  {actionLoading === 'finalize' ? 'Finalizing...' : 'Finalize Invoice'}
                </button>
              )}

              {canCreateStripe && (
                <button
                  onClick={() => performAction('create_stripe')}
                  disabled={actionLoading === 'create_stripe'}
                  className="w-full px-4 py-2.5 bg-[#635bff] text-white rounded-lg hover:bg-[#5851e0] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <CreditCard className="h-5 w-5" />
                  {actionLoading === 'create_stripe' ? 'Creating...' : 'Create Stripe Invoice'}
                </button>
              )}

              {canSend && (
                <button
                  onClick={() => performAction('send')}
                  disabled={actionLoading === 'send'}
                  className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Send className="h-5 w-5" />
                  {actionLoading === 'send' ? 'Sending...' : 'Send Invoice'}
                </button>
              )}

              {canMarkPaid && (
                <button
                  onClick={() => setPaymentModalOpen(true)}
                  className="w-full px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                >
                  <DollarSign className="h-5 w-5" />
                  Mark as Paid
                </button>
              )}

              {canCancel && (
                <button
                  onClick={() => {
                    if (confirm('Are you sure you want to cancel this invoice?')) {
                      performAction('cancel', { reason: 'Cancelled by admin' });
                    }
                  }}
                  disabled={actionLoading === 'cancel'}
                  className="w-full px-4 py-2.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <XCircle className="h-5 w-5" />
                  {actionLoading === 'cancel' ? 'Cancelling...' : 'Cancel Invoice'}
                </button>
              )}

              {canDelete && (
                <button
                  onClick={deleteInvoice}
                  disabled={actionLoading === 'delete'}
                  className="w-full px-4 py-2.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Trash2 className="h-5 w-5" />
                  {actionLoading === 'delete' ? 'Deleting...' : 'Delete Draft'}
                </button>
              )}
            </div>
          </div>

          {/* Clinic Info */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Clinic Details</h2>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Building2 className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900">{invoice.clinic.name}</p>
                  <p className="text-sm text-gray-500">{invoice.clinic.adminEmail}</p>
                </div>
              </div>
              {invoice.config.billingEmail && (
                <div className="flex items-start gap-3">
                  <Receipt className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">Billing Email</p>
                    <p className="font-medium text-gray-900">{invoice.config.billingEmail}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Timeline</h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-gray-400 mt-2" />
                <div>
                  <p className="text-sm text-gray-900">Created</p>
                  <p className="text-xs text-gray-500">{formatDateTime(invoice.createdAt)}</p>
                </div>
              </div>
              {invoice.finalizedAt && (
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-yellow-500 mt-2" />
                  <div>
                    <p className="text-sm text-gray-900">Finalized</p>
                    <p className="text-xs text-gray-500">{formatDateTime(invoice.finalizedAt)}</p>
                  </div>
                </div>
              )}
              {invoice.stripeInvoiceId && (
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-purple-500 mt-2" />
                  <div>
                    <p className="text-sm text-gray-900">Stripe Invoice Created</p>
                    <p className="text-xs text-gray-500">{invoice.stripeInvoiceId}</p>
                  </div>
                </div>
              )}
              {invoice.sentAt && (
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-blue-500 mt-2" />
                  <div>
                    <p className="text-sm text-gray-900">Sent</p>
                    <p className="text-xs text-gray-500">{formatDateTime(invoice.sentAt)}</p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-orange-500 mt-2" />
                <div>
                  <p className="text-sm text-gray-900">Due Date</p>
                  <p className="text-xs text-gray-500">{formatDate(invoice.dueDate)}</p>
                </div>
              </div>
              {invoice.paidAt && (
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-500 mt-2" />
                  <div>
                    <p className="text-sm text-gray-900">Paid</p>
                    <p className="text-xs text-gray-500">
                      {formatDateTime(invoice.paidAt)}
                      {invoice.paymentMethod && ` via ${invoice.paymentMethod}`}
                    </p>
                    {invoice.paymentRef && (
                      <p className="text-xs text-gray-400">Ref: {invoice.paymentRef}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mark as Paid Modal */}
      {paymentModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-900">Mark as Paid</h2>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amount Paid
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={paymentForm.amountCents / 100}
                    onChange={(e) =>
                      setPaymentForm({
                        ...paymentForm,
                        amountCents: Math.round(parseFloat(e.target.value) * 100),
                      })
                    }
                    className="w-full pl-8 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Method
                </label>
                <select
                  value={paymentForm.paymentMethod}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })
                  }
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
                >
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="check">Check</option>
                  <option value="stripe">Stripe</option>
                  <option value="cash">Cash</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Reference (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g., Check #1234"
                  value={paymentForm.paymentRef}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, paymentRef: e.target.value })
                  }
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setPaymentModalOpen(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  performAction('mark_paid', {
                    paidAmountCents: paymentForm.amountCents,
                    paymentMethod: paymentForm.paymentMethod,
                    paymentRef: paymentForm.paymentRef || undefined,
                  })
                }
                disabled={actionLoading === 'mark_paid'}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {actionLoading === 'mark_paid' ? 'Processing...' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
