'use client';

import { CreditCard, Building2, FileText, AlertCircle } from 'lucide-react';

export default function BillingSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Billing Settings</h1>
        <p className="mt-1 text-gray-500">Manage your clinic&apos;s billing configuration</p>
      </div>

      <div className="grid gap-6">
        {/* Stripe Connection */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg bg-[var(--brand-primary-light)] p-2">
              <CreditCard className="h-5 w-5 text-[var(--brand-primary)]" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Payment Processing</h2>
              <p className="text-sm text-gray-500">Stripe integration status</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3">
            <div className="h-2 w-2 rounded-full bg-green-500"></div>
            <span className="text-sm text-green-700">Connected to Stripe</span>
          </div>
        </div>

        {/* Clinic Info */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2">
              <Building2 className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Billing Information</h2>
              <p className="text-sm text-gray-500">Your clinic&apos;s billing details</p>
            </div>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between border-b border-gray-100 py-2">
              <span className="text-gray-500">Business Name</span>
              <span className="font-medium text-gray-900">EONMEDS</span>
            </div>
            <div className="flex justify-between border-b border-gray-100 py-2">
              <span className="text-gray-500">Billing Email</span>
              <span className="font-medium text-gray-900">billing@eonmeds.com</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-gray-500">Plan</span>
              <span className="font-medium text-emerald-600">Enterprise</span>
            </div>
          </div>
        </div>

        {/* Invoices */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg bg-amber-100 p-2">
              <FileText className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Platform Invoices</h2>
              <p className="text-sm text-gray-500">Your EONPro subscription invoices</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-3">
            <AlertCircle className="h-4 w-4 text-gray-400" />
            <span className="text-sm text-gray-500">No invoices yet</span>
          </div>
        </div>
      </div>
    </div>
  );
}
