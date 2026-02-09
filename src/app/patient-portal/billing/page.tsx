'use client';

/**
 * Billing Page
 * Payment history, invoices, and subscription management
 */

import { useEffect, useState } from 'react';
import {
  CreditCard,
  Receipt,
  Download,
  ChevronRight,
  CheckCircle,
  Clock,
  AlertCircle,
  DollarSign,
  Calendar,
  Shield,
  ExternalLink,
} from 'lucide-react';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import NextLink from 'next/link';
import { portalFetch, getPortalResponseError } from '@/lib/api/patient-portal-client';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

interface Invoice {
  id: string;
  number: string;
  amount: number;
  status: 'paid' | 'pending' | 'failed' | 'refunded';
  date: string;
  dueDate: string;
  description: string;
  pdfUrl: string | null;
}

interface Subscription {
  id: string;
  planName: string;
  amount: number;
  interval: string;
  status: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

interface BillingData {
  subscription: Subscription | null;
  paymentMethods: PaymentMethod[];
  invoices: Invoice[];
  upcomingInvoice: {
    amount: number;
    date: string;
  } | null;
}

const STATUS_CONFIG = {
  paid: { color: 'text-green-600', bg: 'bg-green-100', icon: CheckCircle },
  pending: { color: 'text-yellow-600', bg: 'bg-yellow-100', icon: Clock },
  failed: { color: 'text-red-600', bg: 'bg-red-100', icon: AlertCircle },
  refunded: { color: 'text-gray-600', bg: 'bg-gray-100', icon: DollarSign },
};

export default function BillingPage() {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'methods'>('overview');
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetchBillingData();
  }, []);

  const fetchBillingData = async () => {
    setLoadError(null);
    try {
      const res = await portalFetch('/api/patient-portal/billing');
      const err = getPortalResponseError(res);
      if (err) {
        setLoadError(err);
        setLoading(false);
        return;
      }
      if (res.ok) {
        const result = await res.json();
        setData(result);
      }
    } catch (error) {
      console.error('Failed to fetch billing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const openCustomerPortal = async () => {
    try {
      const res = await portalFetch('/api/patient-portal/billing/portal', {
        method: 'POST',
      });
      if (res.ok) {
        const { url } = await res.json();
        window.location.href = url;
      }
    } catch (error) {
      console.error('Failed to open customer portal:', error);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount / 100);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-4 pb-24 md:p-6">
      {loadError && (
        <div
          className="mb-6 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4"
          role="alert"
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
          <p className="flex-1 text-sm font-medium text-amber-900">{loadError}</p>
          <NextLink
            href={`/login?redirect=${encodeURIComponent(`${PATIENT_PORTAL_PATH}/billing`)}&reason=session_expired`}
            className="shrink-0 rounded-lg bg-amber-200 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-300"
          >
            Log in
          </NextLink>
        </div>
      )}
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
        <p className="mt-1 text-gray-600">Manage your subscription and payment history</p>
      </div>

      {/* Subscription Card */}
      {data?.subscription && (
        <div
          className="mb-6 rounded-2xl p-6 text-white"
          style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd)` }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-white/80">Current Plan</p>
              <h2 className="mt-1 text-2xl font-bold">{data.subscription.planName}</h2>
              <p className="mt-2 text-white/90">
                {formatCurrency(data.subscription.amount)} / {data.subscription.interval}
              </p>
            </div>
            <div
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                data.subscription.status === 'active'
                  ? 'bg-white/20 text-white'
                  : 'bg-red-500/20 text-red-200'
              }`}
            >
              {data.subscription.status === 'active' ? 'Active' : data.subscription.status}
            </div>
          </div>

          {data.subscription.cancelAtPeriodEnd && (
            <div className="mt-4 rounded-xl bg-white/10 p-3">
              <p className="text-sm">
                Your subscription will cancel on {formatDate(data.subscription.currentPeriodEnd)}
              </p>
            </div>
          )}

          {data.upcomingInvoice && (
            <div className="mt-4 border-t border-white/20 pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-white/80">Next billing date</span>
                <span className="font-medium">{formatDate(data.upcomingInvoice.date)}</span>
              </div>
              <div className="mt-1 flex justify-between text-sm">
                <span className="text-white/80">Amount</span>
                <span className="font-medium">{formatCurrency(data.upcomingInvoice.amount)}</span>
              </div>
            </div>
          )}

          <button
            onClick={openCustomerPortal}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-white/20 py-3 font-medium transition-colors hover:bg-white/30"
          >
            Manage Subscription
            <ExternalLink className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'history', label: 'Payment History' },
          { id: 'methods', label: 'Payment Methods' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`whitespace-nowrap rounded-xl px-4 py-2 font-medium transition-colors ${
              activeTab === tab.id ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            style={activeTab === tab.id ? { backgroundColor: primaryColor } : {}}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="mb-1 flex items-center gap-2">
                <Receipt className="h-5 w-5 text-blue-500" />
                <span className="text-sm text-gray-600">Total Paid</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(
                  data?.invoices
                    .filter((i) => i.status === 'paid')
                    .reduce((sum, i) => sum + i.amount, 0) || 0
                )}
              </p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="mb-1 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-green-500" />
                <span className="text-sm text-gray-600">Member Since</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {data?.invoices.length
                  ? formatDate(data.invoices[data.invoices.length - 1].date)
                  : 'N/A'}
              </p>
            </div>
          </div>

          {/* Recent Invoices */}
          <div>
            <h3 className="mb-3 font-semibold text-gray-900">Recent Invoices</h3>
            <div className="space-y-3">
              {data?.invoices.slice(0, 3).map((invoice) => {
                const status = STATUS_CONFIG[invoice.status];
                const StatusIcon = status.icon;

                return (
                  <div key={invoice.id} className="rounded-xl bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-10 w-10 rounded-full ${status.bg} flex items-center justify-center`}
                        >
                          <StatusIcon className={`h-5 w-5 ${status.color}`} />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{invoice.description}</p>
                          <p className="text-sm text-gray-500">{formatDate(invoice.date)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">
                          {formatCurrency(invoice.amount)}
                        </p>
                        <span className={`text-xs font-medium ${status.color}`}>
                          {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {(!data?.invoices || data.invoices.length === 0) && (
                <div className="rounded-xl bg-gray-50 py-8 text-center">
                  <Receipt className="mx-auto mb-3 h-12 w-12 text-gray-300" />
                  <p className="text-gray-600">No invoices yet</p>
                </div>
              )}
            </div>
          </div>

          {/* Security Notice */}
          <div className="rounded-xl border border-green-200 bg-green-50 p-4">
            <div className="flex items-start gap-3">
              <Shield className="mt-0.5 h-5 w-5 text-green-600" />
              <div>
                <h4 className="font-medium text-gray-900">Secure Payments</h4>
                <p className="mt-1 text-sm text-gray-600">
                  Your payment information is securely processed by Stripe. We never store your full
                  card details.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment History Tab */}
      {activeTab === 'history' && (
        <div className="space-y-3">
          {data?.invoices.map((invoice) => {
            const status = STATUS_CONFIG[invoice.status];
            const StatusIcon = status.icon;

            return (
              <div key={invoice.id} className="rounded-xl bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div
                      className={`h-10 w-10 rounded-full ${status.bg} flex flex-shrink-0 items-center justify-center`}
                    >
                      <StatusIcon className={`h-5 w-5 ${status.color}`} />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{invoice.description}</p>
                      <p className="text-sm text-gray-500">Invoice #{invoice.number}</p>
                      <p className="text-sm text-gray-500">{formatDate(invoice.date)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">{formatCurrency(invoice.amount)}</p>
                    <span className={`text-xs font-medium ${status.color}`}>
                      {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                    </span>
                    {invoice.pdfUrl && (
                      <a
                        href={invoice.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 flex items-center gap-1 text-sm hover:underline"
                        style={{ color: primaryColor }}
                      >
                        <Download className="h-4 w-4" />
                        Download
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {(!data?.invoices || data.invoices.length === 0) && (
            <div className="rounded-xl bg-gray-50 py-12 text-center">
              <Receipt className="mx-auto mb-3 h-12 w-12 text-gray-300" />
              <p className="text-gray-600">No payment history yet</p>
            </div>
          )}
        </div>
      )}

      {/* Payment Methods Tab */}
      {activeTab === 'methods' && (
        <div className="space-y-4">
          {data?.paymentMethods.map((method) => (
            <div key={method.id} className="rounded-xl bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-12 items-center justify-center rounded bg-gray-100">
                    <CreditCard className="h-6 w-6 text-gray-500" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {method.brand.charAt(0).toUpperCase() + method.brand.slice(1)} ••••{' '}
                      {method.last4}
                    </p>
                    <p className="text-sm text-gray-500">
                      Expires {method.expMonth}/{method.expYear}
                    </p>
                  </div>
                </div>
                {method.isDefault && (
                  <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                    Default
                  </span>
                )}
              </div>
            </div>
          ))}

          {(!data?.paymentMethods || data.paymentMethods.length === 0) && (
            <div className="rounded-xl bg-gray-50 py-12 text-center">
              <CreditCard className="mx-auto mb-3 h-12 w-12 text-gray-300" />
              <p className="text-gray-600">No payment methods on file</p>
            </div>
          )}

          <button
            onClick={openCustomerPortal}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-3 font-medium text-white"
            style={{ backgroundColor: primaryColor }}
          >
            <CreditCard className="h-5 w-5" />
            Update Payment Method
          </button>
        </div>
      )}
    </div>
  );
}
