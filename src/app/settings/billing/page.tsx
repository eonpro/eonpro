'use client';

import { CreditCard, Building2, FileText, AlertCircle } from 'lucide-react';

export default function BillingSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Billing Settings</h1>
        <p className="text-gray-500 mt-1">Manage your clinic&apos;s billing configuration</p>
      </div>

      <div className="grid gap-6">
        {/* Stripe Connection */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-100 rounded-lg">
              <CreditCard className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Payment Processing</h2>
              <p className="text-sm text-gray-500">Stripe integration status</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-sm text-green-700">Connected to Stripe</span>
          </div>
        </div>

        {/* Clinic Info */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Building2 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Billing Information</h2>
              <p className="text-sm text-gray-500">Your clinic&apos;s billing details</p>
            </div>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-500">Business Name</span>
              <span className="font-medium text-gray-900">EONMEDS</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
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
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-amber-100 rounded-lg">
              <FileText className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Platform Invoices</h2>
              <p className="text-sm text-gray-500">Your EONPro subscription invoices</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
            <AlertCircle className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-500">No invoices yet</span>
          </div>
        </div>
      </div>
    </div>
  );
}
