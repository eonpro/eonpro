'use client';

import { useState, useEffect } from 'react';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import {
  CreditCard,
  Calendar,
  Package,
  Check,
  ExternalLink,
  ChevronRight,
  AlertCircle,
  History,
} from 'lucide-react';

interface Subscription {
  id: string;
  planName: string;
  status: 'active' | 'paused' | 'cancelled';
  amount: number;
  interval: 'month' | 'year';
  nextBillingDate: string;
  paymentMethod: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  };
}

interface Invoice {
  id: string;
  date: string;
  amount: number;
  status: 'paid' | 'pending' | 'failed';
  description: string;
}

export default function SubscriptionPage() {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';
  const accentColor = branding?.accentColor || '#d3f931';

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [managingBilling, setManagingBilling] = useState(false);

  useEffect(() => {
    loadSubscriptionData();
  }, []);

  const loadSubscriptionData = async () => {
    // Demo data - in production, fetch from Stripe API
    const demoSubscription: Subscription = {
      id: 'sub_1234567890',
      planName: 'Weight Loss Program - Monthly',
      status: 'active',
      amount: 299,
      interval: 'month',
      nextBillingDate: '2026-02-18',
      paymentMethod: {
        brand: 'visa',
        last4: '4242',
        expMonth: 12,
        expYear: 2027,
      },
    };

    const demoInvoices: Invoice[] = [
      {
        id: 'inv_001',
        date: '2026-01-18',
        amount: 299,
        status: 'paid',
        description: 'Weight Loss Program - Monthly',
      },
      {
        id: 'inv_002',
        date: '2025-12-18',
        amount: 299,
        status: 'paid',
        description: 'Weight Loss Program - Monthly',
      },
      {
        id: 'inv_003',
        date: '2025-11-18',
        amount: 299,
        status: 'paid',
        description: 'Weight Loss Program - Monthly',
      },
    ];

    setSubscription(demoSubscription);
    setInvoices(demoInvoices);
    setLoading(false);
  };

  const handleManageBilling = async () => {
    setManagingBilling(true);
    try {
      // In production, redirect to Stripe Customer Portal
      const response = await fetch('/api/stripe/customer-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnUrl: window.location.href }),
      });

      if (response.ok) {
        const { url } = await response.json();
        window.location.href = url;
      } else {
        // Demo fallback
        alert('Stripe Customer Portal would open here in production.');
      }
    } catch (error) {
      console.error('Error opening billing portal:', error);
      alert('Unable to open billing portal. Please try again later.');
    } finally {
      setManagingBilling(false);
    }
  };

  const getCardIcon = (brand: string) => {
    // Return appropriate card icon based on brand
    return CreditCard;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div
          className="h-12 w-12 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: `${primaryColor} transparent ${primaryColor} ${primaryColor}` }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Subscription & Billing</h1>
        <p className="mt-1 text-gray-500">Manage your subscription and payment details</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="space-y-6 lg:col-span-2">
          {/* Current Plan */}
          {subscription && (
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              <div className="p-6" style={{ backgroundColor: accentColor }}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="mb-1 text-sm font-medium" style={{ color: '#555' }}>
                      Current Plan
                    </p>
                    <h2 className="text-2xl font-bold" style={{ color: '#1a1a1a' }}>
                      {subscription.planName}
                    </h2>
                  </div>
                  <span
                    className="rounded-full px-3 py-1.5 text-xs font-bold uppercase"
                    style={{
                      backgroundColor: subscription.status === 'active' ? '#22C55E' : '#F59E0B',
                      color: 'white',
                    }}
                  >
                    {subscription.status}
                  </span>
                </div>

                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-bold" style={{ color: '#1a1a1a' }}>
                    ${subscription.amount}
                  </span>
                  <span style={{ color: '#555' }}>/{subscription.interval}</span>
                </div>
              </div>

              <div className="space-y-4 p-6">
                <div className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-500">Next billing date</p>
                      <p className="font-semibold text-gray-900">
                        {new Date(subscription.nextBillingDate).toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Plan Features */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">Plan includes:</p>
                  {[
                    'Monthly medication supply',
                    'Provider consultations',
                    'Progress tracking tools',
                    'Nutrition guidance',
                    'Priority support',
                  ].map((feature) => (
                    <div key={feature} className="flex items-center gap-2 text-sm text-gray-600">
                      <Check className="h-4 w-4" style={{ color: primaryColor }} />
                      {feature}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Payment Method */}
          {subscription?.paymentMethod && (
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Payment Method</h3>
                <button
                  onClick={handleManageBilling}
                  disabled={managingBilling}
                  className="text-sm font-medium"
                  style={{ color: primaryColor }}
                >
                  Update
                </button>
              </div>

              <div className="flex items-center gap-4 rounded-xl bg-gray-50 p-4">
                <div className="rounded-lg p-3" style={{ backgroundColor: `${primaryColor}15` }}>
                  <CreditCard className="h-6 w-6" style={{ color: primaryColor }} />
                </div>
                <div className="flex-1">
                  <p className="font-semibold capitalize text-gray-900">
                    {subscription.paymentMethod.brand} •••• {subscription.paymentMethod.last4}
                  </p>
                  <p className="text-sm text-gray-500">
                    Expires {subscription.paymentMethod.expMonth}/
                    {subscription.paymentMethod.expYear}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Billing History */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Billing History</h3>
              <History className="h-5 w-5 text-gray-400" />
            </div>

            {invoices.length === 0 ? (
              <p className="py-8 text-center text-gray-500">No billing history yet</p>
            ) : (
              <div className="space-y-3">
                {invoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    className="flex cursor-pointer items-center justify-between rounded-xl bg-gray-50 p-4 transition-colors hover:bg-gray-100"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{invoice.description}</p>
                      <p className="text-sm text-gray-500">
                        {new Date(invoice.date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">${invoice.amount}</p>
                      <span
                        className={`text-xs font-medium ${
                          invoice.status === 'paid'
                            ? 'text-green-600'
                            : invoice.status === 'pending'
                              ? 'text-amber-600'
                              : 'text-red-600'
                        }`}
                      >
                        {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="mb-4 font-semibold text-gray-900">Quick Actions</h3>

            <div className="space-y-3">
              <button
                onClick={handleManageBilling}
                disabled={managingBilling}
                className="flex w-full items-center justify-between rounded-xl bg-gray-50 p-4 transition-colors hover:bg-gray-100 disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5 text-gray-400" />
                  <span className="font-medium text-gray-700">Manage Billing</span>
                </div>
                <ExternalLink className="h-4 w-4 text-gray-400" />
              </button>

              <button
                onClick={handleManageBilling}
                disabled={managingBilling}
                className="flex w-full items-center justify-between rounded-xl bg-gray-50 p-4 transition-colors hover:bg-gray-100 disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <Package className="h-5 w-5 text-gray-400" />
                  <span className="font-medium text-gray-700">Change Plan</span>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Support Card */}
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-6">
            <AlertCircle className="mb-3 h-6 w-6 text-blue-600" />
            <h3 className="mb-2 font-semibold text-blue-900">Need Help?</h3>
            <p className="mb-4 text-sm text-blue-800">
              Contact our support team for billing questions or subscription changes.
            </p>
            <button className="w-full rounded-xl bg-blue-600 py-2.5 text-center font-medium text-white transition-colors hover:bg-blue-700">
              Contact Support
            </button>
          </div>

          {/* Cancellation Notice */}
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
            <p className="text-sm text-gray-600">
              Need to pause or cancel? You can manage your subscription anytime through the billing
              portal. Changes take effect at the end of your current billing period.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
