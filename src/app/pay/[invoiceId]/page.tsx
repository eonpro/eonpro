'use client';

/**
 * PATIENT PAYMENT PAGE
 * ====================
 * Public page for patients to pay their invoices
 * Redirects to Stripe if available, otherwise shows payment form
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface InvoiceData {
  id: number;
  amount: number;
  amountDue: number;
  amountPaid: number;
  status: string;
  description: string | null;
  dueDate: string | null;
  stripeInvoiceUrl: string | null;
  lineItems: Array<{ description: string; amount: number; quantity?: number }>;
  patient: {
    firstName: string;
    lastName: string;
  };
  clinic: {
    name: string;
  } | null;
}

export default function PaymentPage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params.invoiceId as string;
  
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    async function fetchInvoice() {
      try {
        const res = await fetch(`/api/pay/${invoiceId}`);
        const data = await res.json();
        
        if (!res.ok) {
          setError(data.error || 'Invoice not found');
          return;
        }
        
        setInvoice(data.invoice);
        
        // If Stripe URL exists and invoice is still payable, redirect
        if (data.invoice.stripeInvoiceUrl && data.invoice.status === 'OPEN') {
          window.location.href = data.invoice.stripeInvoiceUrl;
        }
        
      } catch (err: any) {
        setError(err.message || 'Failed to load invoice');
      } finally {
        setLoading(false);
      }
    }
    
    if (invoiceId) {
      fetchInvoice();
    }
  }, [invoiceId]);

  const formatCurrency = (cents: number) => {
    return '$' + (cents / 100).toFixed(2);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading invoice...</p>
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Invoice Not Found</h1>
          <p className="text-gray-600">{error || 'This invoice may have been paid or is no longer available.'}</p>
        </div>
      </div>
    );
  }

  if (invoice.status === 'PAID') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Payment Complete</h1>
          <p className="text-gray-600 mb-4">Thank you! This invoice has been paid.</p>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-500">Amount Paid</p>
            <p className="text-2xl font-bold text-emerald-600">{formatCurrency(invoice.amountPaid || invoice.amount)}</p>
          </div>
        </div>
      </div>
    );
  }

  if (invoice.status === 'VOID' || invoice.status === 'UNCOLLECTIBLE') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Invoice Cancelled</h1>
          <p className="text-gray-600">This invoice is no longer valid.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 py-12 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800">
            {invoice.clinic?.name || 'EON Medical'}
          </h1>
          <p className="text-gray-600 mt-2">Secure Payment</p>
        </div>

        {/* Invoice Card */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Amount Header */}
          <div className="bg-gradient-to-r from-emerald-500 to-teal-500 p-6 text-white text-center">
            <p className="text-emerald-100 text-sm mb-1">Amount Due</p>
            <p className="text-4xl font-bold">{formatCurrency(invoice.amountDue || invoice.amount)}</p>
            {invoice.dueDate && (
              <p className="text-emerald-100 text-sm mt-2">
                Due {formatDate(invoice.dueDate)}
              </p>
            )}
          </div>

          {/* Patient Info */}
          <div className="p-6 border-b">
            <p className="text-sm text-gray-500">Invoice for</p>
            <p className="text-lg font-semibold text-gray-800">
              {invoice.patient.firstName} {invoice.patient.lastName}
            </p>
            {invoice.description && (
              <p className="text-gray-600 mt-1">{invoice.description}</p>
            )}
          </div>

          {/* Line Items */}
          {invoice.lineItems && invoice.lineItems.length > 0 && (
            <div className="p-6 border-b">
              <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Details</h3>
              <div className="space-y-3">
                {invoice.lineItems.map((item, index) => (
                  <div key={index} className="flex justify-between">
                    <span className="text-gray-700">
                      {item.description}
                      {item.quantity && item.quantity > 1 && ` (x${item.quantity})`}
                    </span>
                    <span className="font-medium text-gray-800">
                      {formatCurrency(item.amount)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="border-t mt-4 pt-4 flex justify-between">
                <span className="font-semibold text-gray-800">Total</span>
                <span className="font-bold text-emerald-600 text-lg">
                  {formatCurrency(invoice.amount)}
                </span>
              </div>
            </div>
          )}

          {/* Payment Action */}
          <div className="p-6">
            {invoice.stripeInvoiceUrl ? (
              <a
                href={invoice.stripeInvoiceUrl}
                className="block w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white py-4 px-6 rounded-xl font-semibold text-center hover:from-emerald-600 hover:to-teal-600 transition-all shadow-lg hover:shadow-xl"
              >
                Pay with Card
              </a>
            ) : (
              <div className="text-center">
                <p className="text-gray-600 mb-4">
                  Please contact our office to complete your payment.
                </p>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-500">Invoice #</p>
                  <p className="font-mono text-lg">{invoice.id}</p>
                </div>
              </div>
            )}
          </div>

          {/* Security Badge */}
          <div className="bg-gray-50 px-6 py-4 flex items-center justify-center gap-2 text-sm text-gray-500">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span>Secured by Stripe</span>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-gray-500 text-sm mt-6">
          Questions? Contact {invoice.clinic?.name || 'our office'}
        </p>
      </div>
    </div>
  );
}
