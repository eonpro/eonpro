'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Settings,
  CreditCard,
  Building2,
  Bell,
  Shield,
  RefreshCcw,
  ExternalLink,
  CheckCircle,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface StripeStatus {
  connected: boolean;
  accountType?: 'dedicated' | 'connect' | 'platform' | null;
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  businessName?: string;
  subdomain?: string;
  message?: string;
  warning?: string;
}

export default function FinanceSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [stripeStatus, setStripeStatus] = useState<StripeStatus | null>(null);
  const [saving, setSaving] = useState(false);

  const [settings, setSettings] = useState({
    autoReconcile: true,
    reconcileThreshold: 80,
    autoCreatePatients: false,
    sendPaymentReceipts: true,
    sendInvoiceReminders: true,
    invoiceReminderDays: 3,
    defaultPaymentTerms: 30,
    enableSubscriptionPause: true,
    maxPauseDuration: 90,
    churnAlertThreshold: 5,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      // Fetch Stripe status
      const stripeRes = await apiFetch('/api/stripe/status');

      if (stripeRes.ok) {
        const data = await stripeRes.json();
        setStripeStatus(data);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save settings logic would go here
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  // Use real Stripe status or disconnected state
  const displayStripeStatus: StripeStatus = stripeStatus || {
    connected: false,
    accountId: null,
    chargesEnabled: false,
    payoutsEnabled: false,
    detailsSubmitted: false,
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Finance Settings</h2>
        <p className="mt-1 text-sm text-gray-500">
          Configure payment processing and financial preferences
        </p>
      </div>

      {/* Stripe Connection */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-[var(--brand-primary-light)] p-2">
              <CreditCard className="h-5 w-5 text-[var(--brand-primary)]" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {displayStripeStatus.accountType === 'dedicated'
                  ? 'Dedicated Stripe Account'
                  : displayStripeStatus.accountType === 'platform'
                    ? 'Platform Stripe Account'
                    : 'Stripe Connect'}
              </h3>
              <p className="text-sm text-gray-500">
                {displayStripeStatus.accountType === 'dedicated'
                  ? 'Your clinic has a dedicated Stripe account'
                  : displayStripeStatus.accountType === 'platform'
                    ? 'Using platform-level payment processing'
                    : 'Payment processing configuration'}
              </p>
            </div>
          </div>
          {displayStripeStatus.connected ? (
            <span className="flex items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-700">
              <CheckCircle className="h-4 w-4" />
              Connected
            </span>
          ) : (
            <span className="flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-700">
              <AlertTriangle className="h-4 w-4" />
              Not Connected
            </span>
          )}
        </div>

        {displayStripeStatus.connected ? (
          <div className="mb-4 grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-sm text-gray-500">
                {displayStripeStatus.accountType === 'dedicated' ? 'Account Type' : 'Account ID'}
              </p>
              <p className="font-mono text-sm text-gray-900">
                {displayStripeStatus.accountType === 'dedicated'
                  ? `Dedicated (${displayStripeStatus.subdomain || 'clinic'})`
                  : displayStripeStatus.accountId}
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-sm text-gray-500">Status</p>
              <div className="mt-1 flex items-center gap-2">
                {displayStripeStatus.chargesEnabled && (
                  <span className="rounded bg-green-100 px-2 py-1 text-xs text-green-700">
                    Charges
                  </span>
                )}
                {displayStripeStatus.payoutsEnabled && (
                  <span className="rounded bg-green-100 px-2 py-1 text-xs text-green-700">
                    Payouts
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {displayStripeStatus.message && (
          <p className="mb-4 text-sm text-gray-600">{displayStripeStatus.message}</p>
        )}

        <div className="flex gap-3">
          {displayStripeStatus.accountType !== 'dedicated' && (
            <Link
              href="/admin/settings/stripe"
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              <Settings className="h-4 w-4" />
              Manage Stripe
            </Link>
          )}
          <a
            href="https://dashboard.stripe.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Stripe Dashboard
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>

      {/* Reconciliation Settings */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-lg bg-blue-50 p-2">
            <RefreshCcw className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Payment Reconciliation</h3>
            <p className="text-sm text-gray-500">Automatic payment matching settings</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Enable Auto-Reconciliation</p>
              <p className="text-sm text-gray-500">Automatically match payments to patients</p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={settings.autoReconcile}
                onChange={(e) => setSettings({ ...settings, autoReconcile: e.target.checked })}
                className="peer sr-only"
              />
              <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300"></div>
            </label>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-900">
              Match Confidence Threshold
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="50"
                max="100"
                value={settings.reconcileThreshold}
                onChange={(e) =>
                  setSettings({ ...settings, reconcileThreshold: parseInt(e.target.value) })
                }
                className="flex-1"
              />
              <span className="w-12 text-sm font-medium text-gray-900">
                {settings.reconcileThreshold}%
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Payments with confidence above this threshold will be auto-matched
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Auto-Create Patients</p>
              <p className="text-sm text-gray-500">
                Create new patient records for unmatched payments
              </p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={settings.autoCreatePatients}
                onChange={(e) => setSettings({ ...settings, autoCreatePatients: e.target.checked })}
                className="peer sr-only"
              />
              <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Notification Settings */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-lg bg-amber-50 p-2">
            <Bell className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Notifications</h3>
            <p className="text-sm text-gray-500">Email and alert preferences</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Payment Receipts</p>
              <p className="text-sm text-gray-500">Send email receipts for successful payments</p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={settings.sendPaymentReceipts}
                onChange={(e) =>
                  setSettings({ ...settings, sendPaymentReceipts: e.target.checked })
                }
                className="peer sr-only"
              />
              <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Invoice Reminders</p>
              <p className="text-sm text-gray-500">Send automatic reminders for unpaid invoices</p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={settings.sendInvoiceReminders}
                onChange={(e) =>
                  setSettings({ ...settings, sendInvoiceReminders: e.target.checked })
                }
                className="peer sr-only"
              />
              <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300"></div>
            </label>
          </div>

          {settings.sendInvoiceReminders && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-900">
                Reminder Days Before Due
              </label>
              <select
                value={settings.invoiceReminderDays}
                onChange={(e) =>
                  setSettings({ ...settings, invoiceReminderDays: parseInt(e.target.value) })
                }
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <option value={1}>1 day</option>
                <option value={3}>3 days</option>
                <option value={5}>5 days</option>
                <option value={7}>7 days</option>
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-900">
              Churn Alert Threshold
            </label>
            <div className="flex items-center gap-4">
              <input
                type="number"
                min="1"
                max="20"
                value={settings.churnAlertThreshold}
                onChange={(e) =>
                  setSettings({ ...settings, churnAlertThreshold: parseInt(e.target.value) })
                }
                className="w-20 rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <span className="text-sm text-gray-500">% monthly churn triggers alert</span>
            </div>
          </div>
        </div>
      </div>

      {/* Subscription Settings */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-lg bg-green-50 p-2">
            <Shield className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Subscription Settings</h3>
            <p className="text-sm text-gray-500">Billing and subscription management</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-900">
              Default Payment Terms (Days)
            </label>
            <select
              value={settings.defaultPaymentTerms}
              onChange={(e) =>
                setSettings({ ...settings, defaultPaymentTerms: parseInt(e.target.value) })
              }
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <option value={7}>Net 7</option>
              <option value={14}>Net 14</option>
              <option value={30}>Net 30</option>
              <option value={60}>Net 60</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Allow Subscription Pause</p>
              <p className="text-sm text-gray-500">Patients can temporarily pause subscriptions</p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={settings.enableSubscriptionPause}
                onChange={(e) =>
                  setSettings({ ...settings, enableSubscriptionPause: e.target.checked })
                }
                className="peer sr-only"
              />
              <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300"></div>
            </label>
          </div>

          {settings.enableSubscriptionPause && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-900">
                Maximum Pause Duration (Days)
              </label>
              <input
                type="number"
                min="7"
                max="180"
                value={settings.maxPauseDuration}
                onChange={(e) =>
                  setSettings({ ...settings, maxPauseDuration: parseInt(e.target.value) })
                }
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
          )}
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
