'use client';

import { useEffect, useState } from 'react';
import {
  Settings,
  Save,
  DollarSign,
  Clock,
  Shield,
  Link as LinkIcon,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';

interface ProgramSettings {
  // Attribution
  newPatientModel: string;
  returningPatientModel: string;
  cookieWindowDays: number;
  enableFingerprinting: boolean;
  enableSubIds: boolean;

  // Commission
  defaultCommissionType: string;
  defaultCommissionValue: number;
  holdDays: number;
  clawbackEnabled: boolean;

  // Payout
  minimumPayoutCents: number;
  payoutFrequency: string;

  // Fraud
  fraudEnabled: boolean;
  maxConversionsPerDay: number;
  maxConversionsPerIp: number;
  blockProxyVpn: boolean;
  blockTor: boolean;
  autoHoldOnHighRisk: boolean;
}

export default function AffiliateSettingsPage() {
  const [settings, setSettings] = useState<ProgramSettings>({
    newPatientModel: 'FIRST_CLICK',
    returningPatientModel: 'LAST_CLICK',
    cookieWindowDays: 30,
    enableFingerprinting: true,
    enableSubIds: true,
    defaultCommissionType: 'PERCENT',
    defaultCommissionValue: 10,
    holdDays: 7,
    clawbackEnabled: true,
    minimumPayoutCents: 5000,
    payoutFrequency: 'MONTHLY',
    fraudEnabled: true,
    maxConversionsPerDay: 50,
    maxConversionsPerIp: 3,
    blockProxyVpn: false,
    blockTor: true,
    autoHoldOnHighRisk: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<'attribution' | 'commission' | 'payout' | 'fraud'>(
    'attribution'
  );

  useEffect(() => {
    // Fetch current settings
    const fetchSettings = async () => {
      const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token');
      try {
        const response = await fetch('/api/admin/affiliate-settings', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          if (data.settings) {
            setSettings((s) => ({ ...s, ...data.settings }));
          }
        }
      } catch (error) {
        console.error('Failed to fetch settings:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token');

    try {
      const response = await fetch('/api/admin/affiliate-settings', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Affiliate Program Settings</h1>
          <p className="text-gray-500">Configure your affiliate program</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {saved ? (
            <>
              <CheckCircle className="h-5 w-5" />
              Saved!
            </>
          ) : (
            <>
              <Save className="h-5 w-5" />
              {saving ? 'Saving...' : 'Save Changes'}
            </>
          )}
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="flex gap-8">
          {[
            { id: 'attribution', label: 'Attribution', icon: LinkIcon },
            { id: 'commission', label: 'Commission', icon: DollarSign },
            { id: 'payout', label: 'Payout', icon: Clock },
            { id: 'fraud', label: 'Fraud Detection', icon: Shield },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'border-violet-600 text-violet-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Attribution Settings */}
      {activeTab === 'attribution' && (
        <div className="space-y-6 rounded-xl bg-white p-6 shadow-sm">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                New Patient Attribution Model
              </label>
              <select
                value={settings.newPatientModel}
                onChange={(e) => setSettings((s) => ({ ...s, newPatientModel: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                <option value="FIRST_CLICK">First Click</option>
                <option value="LAST_CLICK">Last Click</option>
                <option value="LINEAR">Linear (Split)</option>
                <option value="TIME_DECAY">Time Decay</option>
                <option value="POSITION">Position Based</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">How to attribute new patient conversions</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Returning Patient Attribution Model
              </label>
              <select
                value={settings.returningPatientModel}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, returningPatientModel: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                <option value="FIRST_CLICK">First Click</option>
                <option value="LAST_CLICK">Last Click</option>
                <option value="LINEAR">Linear (Split)</option>
                <option value="TIME_DECAY">Time Decay</option>
                <option value="POSITION">Position Based</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">
                How to attribute returning patient conversions
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Cookie Window (Days)
              </label>
              <input
                type="number"
                min="1"
                max="365"
                value={settings.cookieWindowDays}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, cookieWindowDays: parseInt(e.target.value) || 30 }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
              <p className="mt-1 text-xs text-gray-500">How long attribution cookies last</p>
            </div>

            <div className="space-y-3">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={settings.enableFingerprinting}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, enableFingerprinting: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                />
                <span className="text-sm text-gray-700">Enable browser fingerprinting</span>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={settings.enableSubIds}
                  onChange={(e) => setSettings((s) => ({ ...s, enableSubIds: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                />
                <span className="text-sm text-gray-700">Enable sub-ID tracking</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Commission Settings */}
      {activeTab === 'commission' && (
        <div className="space-y-6 rounded-xl bg-white p-6 shadow-sm">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Default Commission Type
              </label>
              <select
                value={settings.defaultCommissionType}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, defaultCommissionType: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                <option value="PERCENT">Percentage</option>
                <option value="FLAT">Flat Amount</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Default Commission Value
              </label>
              <div className="relative mt-1">
                <input
                  type="number"
                  min="0"
                  value={settings.defaultCommissionValue}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      defaultCommissionValue: parseFloat(e.target.value) || 0,
                    }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {settings.defaultCommissionType === 'PERCENT' ? '%' : '$'}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Hold Period (Days)</label>
              <input
                type="number"
                min="0"
                max="90"
                value={settings.holdDays}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, holdDays: parseInt(e.target.value) || 0 }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                Days before commission is approved for payout
              </p>
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={settings.clawbackEnabled}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, clawbackEnabled: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                />
                <span className="text-sm text-gray-700">
                  Enable clawback on refunds/chargebacks
                </span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Payout Settings */}
      {activeTab === 'payout' && (
        <div className="space-y-6 rounded-xl bg-white p-6 shadow-sm">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Minimum Payout Amount
              </label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <input
                  type="number"
                  min="0"
                  value={settings.minimumPayoutCents / 100}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      minimumPayoutCents: Math.round((parseFloat(e.target.value) || 0) * 100),
                    }))
                  }
                  className="w-full rounded-lg border border-gray-300 py-2 pl-7 pr-3 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Payout Frequency</label>
              <select
                value={settings.payoutFrequency}
                onChange={(e) => setSettings((s) => ({ ...s, payoutFrequency: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                <option value="WEEKLY">Weekly</option>
                <option value="BIWEEKLY">Bi-weekly</option>
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Fraud Settings */}
      {activeTab === 'fraud' && (
        <div className="space-y-6 rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.fraudEnabled}
                onChange={(e) => setSettings((s) => ({ ...s, fraudEnabled: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
              />
              <span className="font-medium text-gray-900">Enable Fraud Detection</span>
            </label>
          </div>

          {settings.fraudEnabled && (
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Max Conversions Per Day
                </label>
                <input
                  type="number"
                  min="1"
                  value={settings.maxConversionsPerDay}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      maxConversionsPerDay: parseInt(e.target.value) || 50,
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Max Conversions Per IP (30 days)
                </label>
                <input
                  type="number"
                  min="1"
                  value={settings.maxConversionsPerIp}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      maxConversionsPerIp: parseInt(e.target.value) || 3,
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>

              <div className="col-span-2 space-y-3">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settings.blockProxyVpn}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, blockProxyVpn: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                  />
                  <span className="text-sm text-gray-700">Block proxy/VPN traffic</span>
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settings.blockTor}
                    onChange={(e) => setSettings((s) => ({ ...s, blockTor: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                  />
                  <span className="text-sm text-gray-700">Block TOR exit nodes</span>
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settings.autoHoldOnHighRisk}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, autoHoldOnHighRisk: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                  />
                  <span className="text-sm text-gray-700">
                    Auto-hold commissions on high-risk alerts
                  </span>
                </label>
              </div>
            </div>
          )}

          <div className="rounded-lg bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600" />
              <div className="text-sm text-amber-700">
                <p className="font-medium">Important</p>
                <p>
                  Fraud detection helps protect your program but may occasionally flag legitimate
                  conversions. Review the fraud queue regularly to resolve alerts.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
