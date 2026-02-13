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
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-emerald-600"></div>
          <p className="text-gray-600">Loading invoice...</p>
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <svg
              className="h-8 w-8 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <h1 className="mb-2 text-2xl font-bold text-gray-800">Invoice Not Found</h1>
          <p className="text-gray-600">
            {error || 'This invoice may have been paid or is no longer available.'}
          </p>
        </div>
      </div>
    );
  }

  if (invoice.status === 'PAID') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <svg
              className="h-8 w-8 text-emerald-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="mb-2 text-2xl font-bold text-gray-800">Payment Complete</h1>
          <p className="mb-4 text-gray-600">Thank you! This invoice has been paid.</p>
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-sm text-gray-500">Amount Paid</p>
            <p className="text-2xl font-bold text-emerald-600">
              {formatCurrency(invoice.amountPaid || invoice.amount)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (invoice.status === 'VOID' || invoice.status === 'UNCOLLECTIBLE') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
            <svg
              className="h-8 w-8 text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
          </div>
          <h1 className="mb-2 text-2xl font-bold text-gray-800">Invoice Cancelled</h1>
          <p className="text-gray-600">This invoice is no longer valid.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 px-4 py-12">
      <div className="mx-auto max-w-lg">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-800">
            {invoice.clinic?.name || 'EON Medical'}
          </h1>
          <p className="mt-2 text-gray-600">Secure Payment</p>
        </div>

        {/* Invoice Card */}
        <div className="overflow-hidden rounded-2xl bg-white shadow-xl">
          {/* Amount Header */}
          <div className="bg-gradient-to-r from-emerald-500 to-teal-500 p-6 text-center text-white">
            <p className="mb-1 text-sm text-emerald-100">Amount Due</p>
            <p className="text-4xl font-bold">
              {formatCurrency(invoice.amountDue || invoice.amount)}
            </p>
            {invoice.dueDate && (
              <p className="mt-2 text-sm text-emerald-100">Due {formatDate(invoice.dueDate)}</p>
            )}
          </div>

          {/* Patient Info */}
          <div className="border-b p-6">
            <p className="text-sm text-gray-500">Invoice for</p>
            <p className="text-lg font-semibold text-gray-800">
              {invoice.patient.firstName} {invoice.patient.lastName}
            </p>
            {invoice.description && <p className="mt-1 text-gray-600">{invoice.description}</p>}
          </div>

          {/* Line Items */}
          {invoice.lineItems && invoice.lineItems.length > 0 && (
            <div className="border-b p-6">
              <h3 className="mb-3 text-sm font-semibold uppercase text-gray-500">Details</h3>
              <div className="space-y-3">
                {invoice.lineItems.map((item, index) => (
                  <div key={index} className="flex justify-between">
                    <span className="text-gray-700">
                      {item.description}
                      {item.quantity && item.quantity > 1 && ` (x${item.quantity})`}
                    </span>
                    <span className="font-medium text-gray-800">{formatCurrency(item.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-between border-t pt-4">
                <span className="font-semibold text-gray-800">Total</span>
                <span className="text-lg font-bold text-emerald-600">
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
                className="block w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-4 text-center font-semibold text-white shadow-lg transition-all hover:from-emerald-600 hover:to-teal-600 hover:shadow-xl"
              >
                Pay with Card
              </a>
            ) : (
              <div className="text-center">
                <p className="mb-4 text-gray-600">
                  Please contact our office to complete your payment.
                </p>
                <div className="rounded-lg bg-gray-50 p-4">
                  <p className="text-sm text-gray-500">Invoice #</p>
                  <p className="font-mono text-lg">{invoice.id}</p>
                </div>
              </div>
            )}
          </div>

          {/* Security Badge */}
          <div className="flex items-center justify-center gap-2 bg-gray-50 px-6 py-4 text-sm text-gray-500">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            <span>Secured by Stripe</span>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-sm text-gray-500">
          Questions? Contact {invoice.clinic?.name || 'our office'}
        </p>
      </div>
    </div>
  );
}
