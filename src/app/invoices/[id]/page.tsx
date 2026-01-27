'use client';

import { useState, useEffect, use } from 'react';
import { formatCurrency } from '@/lib/stripe';
import Link from 'next/link';

interface InvoiceMetadata {
  invoiceNumber?: string;
  source?: string;
  stripePaymentMethodId?: string;
  stripePriceId?: string;
  submissionId?: string;
  orderStatus?: string;
  subscriptionStatus?: string;
  customerName?: string;
  product?: string;
  medicationType?: string;
  plan?: string;
  address?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  paymentDate?: string;
  paymentMethod?: string;
  processedAt?: string;
  summary?: {
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    total: number;
    amountPaid: number;
    amountDue: number;
  };
}

interface InvoiceDetails {
  id: number;
  stripeInvoiceNumber: string | null;
  stripeInvoiceUrl: string | null;
  stripePdfUrl: string | null;
  description: string | null;
  amount: number | null;
  amountDue: number;
  amountPaid: number;
  currency: string;
  status: string;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string;
  lineItems: any[];
  metadata: InvoiceMetadata | null;
  clinic: {
    id: number;
    name: string;
  } | null;
  patient: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  items: Array<{
    id: number;
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    product: {
      id: number;
      name: string;
    } | null;
  }>;
  payments: Array<{
    id: number;
    amount: number;
    status: string;
    createdAt: string;
    paymentMethod: string | null;
  }>;
}

export default function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const [invoice, setInvoice] = useState<InvoiceDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetchInvoice();
  }, [resolvedParams.id]);

  const fetchInvoice = async () => {
    try {
      const res = await fetch(`/api/stripe/invoices/${resolvedParams.id}`);
      const data = await res.json();
      
      if (res.ok) {
        setInvoice(data.invoice);
      } else {
        setError(data.error || 'Failed to load invoice');
      }
    } catch (err) {
      setError('Failed to load invoice');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString || !mounted) return '—';
    return new Date(dateString).toLocaleDateString();
  };

  const formatDateTime = (dateString: string | null | undefined): string => {
    if (!dateString || !mounted) return '—';
    return new Date(dateString).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      DRAFT: 'bg-gray-100 text-gray-700',
      OPEN: 'bg-blue-100 text-blue-700',
      PAID: 'bg-green-100 text-green-700',
      VOID: 'bg-red-100 text-red-700',
      UNCOLLECTIBLE: 'bg-orange-100 text-orange-700',
      REFUNDED: 'bg-purple-100 text-purple-700',
      PARTIALLY_REFUNDED: 'bg-purple-100 text-purple-700',
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#4fa77e]"></div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Invoice Not Found</h1>
          <p className="text-gray-600 mb-4">{error || 'The requested invoice could not be found.'}</p>
          <Link href="/patients" className="text-[#4fa77e] hover:underline">
            ← Back to Patients
          </Link>
        </div>
      </div>
    );
  }

  const lineItems = invoice.items?.length > 0 
    ? invoice.items 
    : (invoice.lineItems || []).map((item: any, idx: number) => ({
        id: idx,
        description: item.description,
        quantity: item.quantity || 1,
        unitPrice: item.amount,
        amount: item.amount * (item.quantity || 1),
        product: null,
      }));

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="mb-6">
          <Link 
            href={`/patients/${invoice.patient.id}?tab=billing`} 
            className="text-[#4fa77e] hover:underline text-sm"
          >
            ← Back to Patient Billing
          </Link>
        </div>

        {/* Invoice Card */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          {/* Invoice Header */}
          <div className="bg-gradient-to-r from-[#4fa77e] to-[#3f8660] px-8 py-6 text-white">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-2xl font-bold">INVOICE</h1>
                <p className="text-white/80 mt-1">
                  #{invoice.stripeInvoiceNumber || `INV-${invoice.id.toString().padStart(6, '0')}`}
                </p>
              </div>
              <div className="text-right">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(invoice.status)}`}>
                  {invoice.status}
                </span>
              </div>
            </div>
          </div>

          {/* Invoice Body */}
          <div className="p-8">
            {/* Patient & Dates */}
            <div className="grid grid-cols-2 gap-8 mb-8">
              <div>
                <h3 className="text-sm font-medium text-gray-500 uppercase mb-2">Bill To</h3>
                <p className="font-medium text-gray-900">
                  {invoice.metadata?.customerName || `${invoice.patient.firstName} ${invoice.patient.lastName}`}
                </p>
                <p className="text-gray-600">{invoice.patient.email}</p>
                <p className="text-gray-600">{invoice.patient.phone}</p>
                {/* Address from metadata */}
                {invoice.metadata?.address && (
                  <div className="mt-2 text-gray-600">
                    <p>{invoice.metadata.addressLine1 || invoice.metadata.address}</p>
                    {invoice.metadata.addressLine2 && <p>{invoice.metadata.addressLine2}</p>}
                    <p>
                      {invoice.metadata.city && `${invoice.metadata.city}, `}
                      {invoice.metadata.state} {invoice.metadata.zipCode}
                    </p>
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="mb-4">
                  <p className="text-sm text-gray-500">Issue Date</p>
                  <p className="font-medium">{formatDate(invoice.createdAt)}</p>
                </div>
                <div className="mb-4">
                  <p className="text-sm text-gray-500">Due Date</p>
                  <p className="font-medium">{formatDate(invoice.dueDate)}</p>
                </div>
                {invoice.paidAt && (
                  <div className="mb-4">
                    <p className="text-sm text-gray-500">Paid On</p>
                    <p className="font-medium text-green-600">{formatDateTime(invoice.paidAt)}</p>
                  </div>
                )}
                {invoice.clinic && (
                  <div>
                    <p className="text-sm text-gray-500">Clinic</p>
                    <p className="font-medium">{invoice.clinic.name}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Treatment Details (for WellMedR/Airtable invoices) */}
            {invoice.metadata?.source === 'wellmedr-airtable' && (
              <div className="bg-emerald-50 rounded-lg p-4 mb-8">
                <h3 className="text-sm font-medium text-emerald-800 uppercase mb-3">Treatment Details</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  {invoice.metadata.product && (
                    <div>
                      <p className="text-emerald-600">Product</p>
                      <p className="font-medium text-emerald-900 capitalize">{invoice.metadata.product}</p>
                    </div>
                  )}
                  {invoice.metadata.medicationType && (
                    <div>
                      <p className="text-emerald-600">Type</p>
                      <p className="font-medium text-emerald-900 capitalize">{invoice.metadata.medicationType}</p>
                    </div>
                  )}
                  {invoice.metadata.plan && (
                    <div>
                      <p className="text-emerald-600">Plan</p>
                      <p className="font-medium text-emerald-900 capitalize">{invoice.metadata.plan}</p>
                    </div>
                  )}
                  {invoice.metadata.submissionId && (
                    <div>
                      <p className="text-emerald-600">Order ID</p>
                      <p className="font-medium text-emerald-900 text-xs">{invoice.metadata.submissionId.substring(0, 18)}...</p>
                    </div>
                  )}
                </div>
                {invoice.metadata.stripePaymentMethodId && (
                  <div className="mt-3 pt-3 border-t border-emerald-200">
                    <p className="text-xs text-emerald-600">
                      Payment Method: <span className="font-mono">{invoice.metadata.stripePaymentMethodId}</span>
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Line Items */}
            <table className="w-full mb-8">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 text-sm font-medium text-gray-500">Description</th>
                  <th className="text-right py-3 text-sm font-medium text-gray-500">Qty</th>
                  <th className="text-right py-3 text-sm font-medium text-gray-500">Unit Price</th>
                  <th className="text-right py-3 text-sm font-medium text-gray-500">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item: any) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="py-4">
                      <p className="font-medium text-gray-900">{item.description}</p>
                      {item.product && (
                        <p className="text-sm text-gray-500">{item.product.name}</p>
                      )}
                    </td>
                    <td className="py-4 text-right text-gray-600">{item.quantity}</td>
                    <td className="py-4 text-right text-gray-600">{formatCurrency(item.unitPrice)}</td>
                    <td className="py-4 text-right font-medium text-gray-900">{formatCurrency(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-64">
                <div className="flex justify-between py-2">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-medium">{formatCurrency(invoice.amountDue)}</span>
                </div>
                <div className="flex justify-between py-2 border-t border-gray-200">
                  <span className="text-gray-600">Amount Due</span>
                  <span className="font-bold text-lg">{formatCurrency(invoice.amountDue - invoice.amountPaid)}</span>
                </div>
                {invoice.amountPaid > 0 && (
                  <div className="flex justify-between py-2 text-green-600">
                    <span>Amount Paid</span>
                    <span className="font-medium">{formatCurrency(invoice.amountPaid)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Payment History */}
            {invoice.payments && invoice.payments.length > 0 && (
              <div className="mt-8 pt-8 border-t border-gray-200">
                <h3 className="text-lg font-semibold mb-4">Payment History</h3>
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-sm text-gray-500">
                      <th className="py-2">Date</th>
                      <th className="py-2">Amount</th>
                      <th className="py-2">Method</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.payments.map((payment) => (
                      <tr key={payment.id} className="border-b border-gray-100">
                        <td className="py-3">{formatDateTime(payment.createdAt)}</td>
                        <td className="py-3">{formatCurrency(payment.amount)}</td>
                        <td className="py-3">{payment.paymentMethod || '—'}</td>
                        <td className="py-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            payment.status === 'SUCCEEDED' ? 'bg-green-100 text-green-700' :
                            payment.status === 'REFUNDED' ? 'bg-purple-100 text-purple-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {payment.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Actions */}
            <div className="mt-8 pt-6 border-t border-gray-200 flex gap-4 justify-end">
              {invoice.stripePdfUrl && (
                <a
                  href={invoice.stripePdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  Download PDF
                </a>
              )}
              {invoice.stripeInvoiceUrl && (
                <a
                  href={invoice.stripeInvoiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-[#4fa77e] text-white rounded-lg hover:bg-[#3f8660]"
                >
                  View on Stripe
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
