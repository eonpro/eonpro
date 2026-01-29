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
import Link from 'next/link';

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

  useEffect(() => {
    fetchBillingData();
  }, []);

  const fetchBillingData = async () => {
    try {
      const res = await fetch('/api/patient-portal/billing');
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
      const res = await fetch('/api/patient-portal/billing/portal', {
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
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto pb-24">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
        <p className="text-gray-600 mt-1">Manage your subscription and payment history</p>
      </div>

      {/* Subscription Card */}
      {data?.subscription && (
        <div
          className="rounded-2xl p-6 mb-6 text-white"
          style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd)` }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-white/80 text-sm">Current Plan</p>
              <h2 className="text-2xl font-bold mt-1">{data.subscription.planName}</h2>
              <p className="text-white/90 mt-2">
                {formatCurrency(data.subscription.amount)} / {data.subscription.interval}
              </p>
            </div>
            <div
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                data.subscription.status === 'active'
                  ? 'bg-white/20 text-white'
                  : 'bg-red-500/20 text-red-200'
              }`}
            >
              {data.subscription.status === 'active' ? 'Active' : data.subscription.status}
            </div>
          </div>

          {data.subscription.cancelAtPeriodEnd && (
            <div className="mt-4 p-3 bg-white/10 rounded-xl">
              <p className="text-sm">
                Your subscription will cancel on {formatDate(data.subscription.currentPeriodEnd)}
              </p>
            </div>
          )}

          {data.upcomingInvoice && (
            <div className="mt-4 pt-4 border-t border-white/20">
              <div className="flex justify-between text-sm">
                <span className="text-white/80">Next billing date</span>
                <span className="font-medium">{formatDate(data.upcomingInvoice.date)}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-white/80">Amount</span>
                <span className="font-medium">{formatCurrency(data.upcomingInvoice.amount)}</span>
              </div>
            </div>
          )}

          <button
            onClick={openCustomerPortal}
            className="mt-4 w-full py-3 bg-white/20 hover:bg-white/30 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
          >
            Manage Subscription
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'history', label: 'Payment History' },
          { id: 'methods', label: 'Payment Methods' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`px-4 py-2 rounded-xl font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <Receipt className="w-5 h-5 text-blue-500" />
                <span className="text-gray-600 text-sm">Total Paid</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(
                  data?.invoices
                    .filter((i) => i.status === 'paid')
                    .reduce((sum, i) => sum + i.amount, 0) || 0
                )}
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-5 h-5 text-green-500" />
                <span className="text-gray-600 text-sm">Member Since</span>
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
            <h3 className="font-semibold text-gray-900 mb-3">Recent Invoices</h3>
            <div className="space-y-3">
              {data?.invoices.slice(0, 3).map((invoice) => {
                const status = STATUS_CONFIG[invoice.status];
                const StatusIcon = status.icon;

                return (
                  <div key={invoice.id} className="bg-white rounded-xl p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full ${status.bg} flex items-center justify-center`}>
                          <StatusIcon className={`w-5 h-5 ${status.color}`} />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{invoice.description}</p>
                          <p className="text-sm text-gray-500">{formatDate(invoice.date)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">{formatCurrency(invoice.amount)}</p>
                        <span className={`text-xs font-medium ${status.color}`}>
                          {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {(!data?.invoices || data.invoices.length === 0) && (
                <div className="text-center py-8 bg-gray-50 rounded-xl">
                  <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-600">No invoices yet</p>
                </div>
              )}
            </div>
          </div>

          {/* Security Notice */}
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-green-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-gray-900">Secure Payments</h4>
                <p className="text-sm text-gray-600 mt-1">
                  Your payment information is securely processed by Stripe. We never store your
                  full card details.
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
              <div key={invoice.id} className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-full ${status.bg} flex items-center justify-center flex-shrink-0`}>
                      <StatusIcon className={`w-5 h-5 ${status.color}`} />
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
                        className="flex items-center gap-1 text-sm mt-2 hover:underline"
                        style={{ color: primaryColor }}
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {(!data?.invoices || data.invoices.length === 0) && (
            <div className="text-center py-12 bg-gray-50 rounded-xl">
              <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-600">No payment history yet</p>
            </div>
          )}
        </div>
      )}

      {/* Payment Methods Tab */}
      {activeTab === 'methods' && (
        <div className="space-y-4">
          {data?.paymentMethods.map((method) => (
            <div key={method.id} className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-8 rounded bg-gray-100 flex items-center justify-center">
                    <CreditCard className="w-6 h-6 text-gray-500" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {method.brand.charAt(0).toUpperCase() + method.brand.slice(1)} •••• {method.last4}
                    </p>
                    <p className="text-sm text-gray-500">
                      Expires {method.expMonth}/{method.expYear}
                    </p>
                  </div>
                </div>
                {method.isDefault && (
                  <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-100 text-green-700">
                    Default
                  </span>
                )}
              </div>
            </div>
          ))}

          {(!data?.paymentMethods || data.paymentMethods.length === 0) && (
            <div className="text-center py-12 bg-gray-50 rounded-xl">
              <CreditCard className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-600">No payment methods on file</p>
            </div>
          )}

          <button
            onClick={openCustomerPortal}
            className="w-full py-3 rounded-xl font-medium text-white flex items-center justify-center gap-2"
            style={{ backgroundColor: primaryColor }}
          >
            <CreditCard className="w-5 h-5" />
            Update Payment Method
          </button>
        </div>
      )}
    </div>
  );
}
