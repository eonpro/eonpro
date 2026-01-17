'use client';

import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/stripe';
import { BILLING_PLANS, getGroupedPlans, formatPlanPrice, getPlanById } from '@/config/billingPlans';
import { ProcessPaymentForm } from './ProcessPaymentForm';
import { PatientSubscriptionManager } from './PatientSubscriptionManager';
import { logger } from '@/lib/logger';

// Helper to format dates only on client to avoid hydration mismatch
function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  if (typeof window === 'undefined') return ''; // Server: return empty
  return new Date(dateString).toLocaleDateString();
}

function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  if (typeof window === 'undefined') return ''; // Server: return empty
  return new Date(dateString).toLocaleString();
}

interface Invoice {
  id: number;
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

  // Track client mount for hydration-safe rendering
  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch invoices and payments
  useEffect(() => {
    fetchBillingData();
  }, [patientId]);

  const fetchBillingData = async () => {
    try {
      setLoading(true);
      
      // Fetch invoices
      const invoicesRes = await fetch(`/api/stripe/invoices?patientId=${patientId}`);
      if (invoicesRes.ok) {
        const data = await invoicesRes.json();
        setInvoices(data.invoices || []);
      }
      
      // Fetch payments
      const paymentsRes = await fetch(`/api/stripe/payments?patientId=${patientId}`);
      if (paymentsRes.ok) {
        const data = await paymentsRes.json();
        setPayments(data.payments || []);
      }
    } catch (err: any) {
    // @ts-ignore
   
      logger.error('Error fetching billing data:', err);
      setError('Failed to load billing information');
    } finally {
      setLoading(false);
    }
  };

  const handleSendInvoice = async (invoiceId: number) => {
    try {
      const res = await fetch(`/api/stripe/invoices/${invoiceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send' }),
      });
      
      if (res.ok) {
        alert('Invoice sent successfully');
        fetchBillingData();
      } else {
        alert('Failed to send invoice');
      }
    } catch (err: any) {
    // @ts-ignore
   
      logger.error('Error sending invoice:', err);
      alert('Failed to send invoice');
    }
  };

  const handleVoidInvoice = async (invoiceId: number) => {
    if (!confirm('Are you sure you want to void this invoice?')) return;
    
    try {
      const res = await fetch(`/api/stripe/invoices/${invoiceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'void' }),
      });
      
      if (res.ok) {
        alert('Invoice voided successfully');
        fetchBillingData();
      } else {
        alert('Failed to void invoice');
      }
    } catch (err: any) {
    // @ts-ignore
   
      logger.error('Error voiding invoice:', err);
      alert('Failed to void invoice');
    }
  };

  const handleOpenCustomerPortal = async () => {
    try {
      const res = await fetch('/api/stripe/customer-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId,
          returnUrl: window.location.href,
        }),
      });
      
      if (res.ok) {
        const data = await res.json();
        window.open(data.url, '_blank');
      } else {
        alert('Failed to open customer portal');
      }
    } catch (err: any) {
    // @ts-ignore
   
      logger.error('Error opening customer portal:', err);
      alert('Failed to open customer portal');
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
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Billing & Payments</h2>
        <div className="flex gap-2">
          <button
            onClick={handleOpenCustomerPortal}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            Customer Portal
          </button>
          <button
            onClick={() => setShowCreateInvoice(!showCreateInvoice)}
            className="px-4 py-2 text-sm bg-[#4fa77e] text-white rounded-lg hover:bg-[#3f8660]"
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
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('invoices')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'invoices'
                ? 'border-[#4fa77e] text-[#4fa77e]'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Invoices ({invoices.length})
          </button>
          <button
            onClick={() => setActiveTab('payments')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'payments'
                ? 'border-[#4fa77e] text-[#4fa77e]'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Payments ({payments.length})
          </button>
          <button
            onClick={() => setActiveTab('process-payment')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'process-payment'
                ? 'border-[#4fa77e] text-[#4fa77e]'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Process Payment
          </button>
          <button
            onClick={() => setActiveTab('subscriptions')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
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
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {invoices.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No invoices found
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Invoice #
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {invoices.map((invoice: any) => (
                  <tr key={invoice.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {invoice.stripeInvoiceNumber || `INV-${invoice.id}`}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {invoice.description || 'Medical Services'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div>
                        <div>{formatCurrency(invoice.amountDue)}</div>
                        {invoice.amountPaid > 0 && (
                          <div className="text-xs text-green-600">
                            Paid: {formatCurrency(invoice.amountPaid)}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(invoice.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {mounted ? formatDate(invoice.dueDate) : ''}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex gap-2">
                        {invoice.stripeInvoiceUrl && (
                          <a
                            href={invoice.stripeInvoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#4fa77e] hover:text-[#3f8660]"
                          >
                            View
                          </a>
                        )}
                        {invoice.stripePdfUrl && (
                          <a
                            href={invoice.stripePdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#4fa77e] hover:text-[#3f8660]"
                          >
                            PDF
                          </a>
                        )}
                        {invoice.status === 'DRAFT' && (
                          <button
                            onClick={() => handleSendInvoice(invoice.id)}
                            className="text-green-600 hover:text-green-800"
                          >
                            Send
                          </button>
                        )}
                        {invoice.status === 'OPEN' && (
                          <button
                            onClick={() => handleVoidInvoice(invoice.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            Void
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'payments' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {payments.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No payments found
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Method
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Invoice
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {payments.map((payment: any) => (
                  <tr key={payment.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {mounted ? formatDateTime(payment.createdAt) : ''}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatCurrency(payment.amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(payment.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {payment.paymentMethod || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {payment.invoice
                        ? `#${payment.invoice.stripeInvoiceNumber || payment.invoice.id}`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
    
    // Validate line items
    const validItems = lineItems.filter((item: any) => item.description && item.amount > 0);
    if (validItems.length === 0) {
      alert('Please add at least one line item');
      return;
    }
    
    setSubmitting(true);
    
    try {
      const res = await fetch('/api/stripe/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
          alert('Invoice created successfully (Demo Mode - Stripe not configured)');
        }
        onSuccess();
      } else {
        const errorMsg = data.demoMode 
          ? 'Invoice creation is in demo mode. Stripe payment processing is not configured.' 
          : (data.error || 'Failed to create invoice');
        alert(errorMsg);
      }
    } catch (err: any) {
    // @ts-ignore
   
      logger.error('Error creating invoice:', err);
      alert('Failed to create invoice');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-medium mb-4">Create Invoice</h3>
      
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
