'use client';

import { useState, useEffect } from 'react';
import { CreditCard, Package, Receipt, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function BillingSettingsPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Billing Settings</h1>
        <p className="text-gray-500 mt-1">Manage your clinic's billing and payment settings</p>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href="/settings/transactions"
          className="bg-white rounded-xl border border-gray-200 p-6 hover:border-emerald-300 hover:shadow-md transition-all"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-100 rounded-lg">
              <Receipt className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Transactions</h3>
              <p className="text-sm text-gray-500">View all Stripe transactions</p>
            </div>
          </div>
        </Link>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <CreditCard className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Payment Methods</h3>
              <p className="text-sm text-gray-500">Manage payment options</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-100 rounded-lg">
              <Package className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Products & Pricing</h3>
              <p className="text-sm text-gray-500">Manage your product catalog</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stripe Connection Status */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Stripe Connection</h2>
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-green-700 font-medium">Connected</span>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          Your Stripe account is connected and processing payments.
        </p>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
        <div>
          <h4 className="font-medium text-blue-800">View All Transactions</h4>
          <p className="text-sm text-blue-600 mt-1">
            To see all Stripe transactions, invoices, and payments, go to the{' '}
            <Link href="/settings/transactions" className="underline font-medium">
              Transactions tab
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
