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

interface StripeStatus {
  connected: boolean;
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
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
      const token = localStorage.getItem('auth-token') || 
                    localStorage.getItem('super_admin-token') ||
                    localStorage.getItem('token');

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      // Fetch Stripe status
      const stripeRes = await fetch('/api/stripe/status', {
        credentials: 'include',
        headers,
      });

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
      await new Promise(resolve => setTimeout(resolve, 1000));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  // Mock Stripe status for demonstration
  const mockStripeStatus: StripeStatus = stripeStatus || {
    connected: true,
    accountId: 'acct_1234567890',
    chargesEnabled: true,
    payoutsEnabled: true,
    detailsSubmitted: true,
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Finance Settings</h2>
        <p className="text-sm text-gray-500 mt-1">Configure payment processing and financial preferences</p>
      </div>

      {/* Stripe Connection */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-50 rounded-lg">
              <CreditCard className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Stripe Connect</h3>
              <p className="text-sm text-gray-500">Payment processing configuration</p>
            </div>
          </div>
          {mockStripeStatus.connected ? (
            <span className="flex items-center gap-2 px-3 py-1 bg-green-50 text-green-700 rounded-full text-sm font-medium">
              <CheckCircle className="h-4 w-4" />
              Connected
            </span>
          ) : (
            <span className="flex items-center gap-2 px-3 py-1 bg-red-50 text-red-700 rounded-full text-sm font-medium">
              <AlertTriangle className="h-4 w-4" />
              Not Connected
            </span>
          )}
        </div>

        {mockStripeStatus.connected ? (
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">Account ID</p>
              <p className="text-sm font-mono text-gray-900">{mockStripeStatus.accountId}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">Status</p>
              <div className="flex items-center gap-2 mt-1">
                {mockStripeStatus.chargesEnabled && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Charges</span>
                )}
                {mockStripeStatus.payoutsEnabled && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Payouts</span>
                )}
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex gap-3">
          <Link
            href="/admin/settings/stripe"
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <Settings className="h-4 w-4" />
            Manage Stripe
          </Link>
          <a
            href="https://dashboard.stripe.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Stripe Dashboard
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>

      {/* Reconciliation Settings */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-50 rounded-lg">
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
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoReconcile}
                onChange={(e) => setSettings({ ...settings, autoReconcile: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Match Confidence Threshold
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="50"
                max="100"
                value={settings.reconcileThreshold}
                onChange={(e) => setSettings({ ...settings, reconcileThreshold: parseInt(e.target.value) })}
                className="flex-1"
              />
              <span className="text-sm font-medium text-gray-900 w-12">{settings.reconcileThreshold}%</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Payments with confidence above this threshold will be auto-matched
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Auto-Create Patients</p>
              <p className="text-sm text-gray-500">Create new patient records for unmatched payments</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoCreatePatients}
                onChange={(e) => setSettings({ ...settings, autoCreatePatients: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Notification Settings */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-amber-50 rounded-lg">
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
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.sendPaymentReceipts}
                onChange={(e) => setSettings({ ...settings, sendPaymentReceipts: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Invoice Reminders</p>
              <p className="text-sm text-gray-500">Send automatic reminders for unpaid invoices</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.sendInvoiceReminders}
                onChange={(e) => setSettings({ ...settings, sendInvoiceReminders: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          {settings.sendInvoiceReminders && (
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Reminder Days Before Due
              </label>
              <select
                value={settings.invoiceReminderDays}
                onChange={(e) => setSettings({ ...settings, invoiceReminderDays: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              >
                <option value={1}>1 day</option>
                <option value={3}>3 days</option>
                <option value={5}>5 days</option>
                <option value={7}>7 days</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Churn Alert Threshold
            </label>
            <div className="flex items-center gap-4">
              <input
                type="number"
                min="1"
                max="20"
                value={settings.churnAlertThreshold}
                onChange={(e) => setSettings({ ...settings, churnAlertThreshold: parseInt(e.target.value) })}
                className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
              <span className="text-sm text-gray-500">% monthly churn triggers alert</span>
            </div>
          </div>
        </div>
      </div>

      {/* Subscription Settings */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-green-50 rounded-lg">
            <Shield className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Subscription Settings</h3>
            <p className="text-sm text-gray-500">Billing and subscription management</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Default Payment Terms (Days)
            </label>
            <select
              value={settings.defaultPaymentTerms}
              onChange={(e) => setSettings({ ...settings, defaultPaymentTerms: parseInt(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
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
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.enableSubscriptionPause}
                onChange={(e) => setSettings({ ...settings, enableSubscriptionPause: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          {settings.enableSubscriptionPause && (
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Maximum Pause Duration (Days)
              </label>
              <input
                type="number"
                min="7"
                max="180"
                value={settings.maxPauseDuration}
                onChange={(e) => setSettings({ ...settings, maxPauseDuration: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
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
          className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
