'use client';

import { useState, useEffect, use } from 'react';
import { logger } from '../../../../../lib/logger';

import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Save,
  Building2,
  Palette,
  Globe,
  Users,
  Bell,
  Shield,
  CreditCard,
  Database,
  AlertCircle,
  Check,
  Upload,
  X,
} from 'lucide-react';
import Link from 'next/link';

interface ClinicSettings {
  id: number;
  name: string;
  subdomain: string;
  customDomain?: string | null;
  status: string;
  billingPlan: string;
  patientLimit: number;
  providerLimit: number;
  storageLimit: number;
  adminEmail: string;
  supportEmail?: string;
  phone?: string;
  address?: any;
  timezone: string;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  customCss?: string | null;
  patientIdPrefix?: string | null;
  settings: any;
  features: any;
  integrations: any;
}

export default function ClinicSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [clinic, setClinic] = useState<ClinicSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form states
  const [formData, setFormData] = useState<Partial<ClinicSettings>>({});

  useEffect(() => {
    fetchClinic();
  }, [resolvedParams.id]);

  const fetchClinic = async () => {
    try {
      const response = await fetch(`/api/admin/clinics/${resolvedParams.id}`);
      if (response.ok) {
        const data = await response.json();
        setClinic(data);
        setFormData(data);
      }
    } catch (error) {
      logger.error('Error fetching clinic:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/clinics/${resolvedParams.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const updated = await response.json();
        setClinic(updated);
        setMessage({ type: 'success', text: 'Settings saved successfully!' });
      } else {
        setMessage({ type: 'error', text: 'Failed to save settings' });
      }
    } catch (error) {
      logger.error('Error saving settings:', error);
      setMessage({ type: 'error', text: 'An error occurred while saving' });
    } finally {
      setSaving(false);
    }
  };

  const updateFormData = (field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const updateNestedData = (parent: string, field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [parent]: {
        ...((prev[parent as keyof ClinicSettings] as any) || {}),
        [field]: value,
      },
    }));
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="mb-6 h-8 w-1/4 rounded bg-gray-200"></div>
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 rounded bg-gray-200"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!clinic) {
    return (
      <div className="p-6">
        <div className="text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
          <p className="text-gray-600">Clinic not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/clinics"
            className="rounded-lg p-2 transition-colors hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Clinic Settings</h1>
            <p className="mt-1 text-gray-600">{clinic.name}</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          <Save className="h-5 w-5" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Message Alert */}
      {message && (
        <div
          className={`mb-6 flex items-center gap-2 rounded-lg p-4 ${
            message.type === 'success'
              ? 'border border-green-200 bg-green-50 text-green-800'
              : 'border border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {message.type === 'success' ? (
            <Check className="h-5 w-5" />
          ) : (
            <AlertCircle className="h-5 w-5" />
          )}
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 border-b">
        <nav className="flex space-x-8">
          {[
            { id: 'general', label: 'General', icon: Building2 },
            { id: 'branding', label: 'Branding', icon: Palette },
            { id: 'limits', label: 'Limits & Billing', icon: CreditCard },
            { id: 'features', label: 'Features', icon: Database },
            { id: 'settings', label: 'Settings', icon: Shield },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 border-b-2 px-1 py-4 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        {activeTab === 'general' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Clinic Name</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => updateFormData('name', e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Status</label>
                <select
                  value={formData.status || ''}
                  onChange={(e) => updateFormData('status', e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="TRIAL">Trial</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="EXPIRED">Expired</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Subdomain</label>
                <div className="flex">
                  <input
                    type="text"
                    value={formData.subdomain || ''}
                    onChange={(e) => updateFormData('subdomain', e.target.value)}
                    className="flex-1 rounded-l-lg border px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="rounded-r-lg border-b border-r border-t bg-gray-50 px-3 py-2 text-sm text-gray-500">
                    .{process.env.NEXT_PUBLIC_BASE_DOMAIN || 'localhost:3001'}
                  </span>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Custom Domain (Optional)
                </label>
                <input
                  type="text"
                  value={formData.customDomain || ''}
                  onChange={(e) => updateFormData('customDomain', e.target.value)}
                  placeholder="clinic.example.com"
                  className="w-full rounded-lg border px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Admin Email</label>
                <input
                  type="email"
                  value={formData.adminEmail || ''}
                  onChange={(e) => updateFormData('adminEmail', e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Support Email
                </label>
                <input
                  type="email"
                  value={formData.supportEmail || ''}
                  onChange={(e) => updateFormData('supportEmail', e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Phone</label>
                <input
                  type="tel"
                  value={formData.phone || ''}
                  onChange={(e) => updateFormData('phone', e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Timezone</label>
                <select
                  value={formData.timezone || 'America/New_York'}
                  onChange={(e) => updateFormData('timezone', e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="America/New_York">Eastern Time</option>
                  <option value="America/Chicago">Central Time</option>
                  <option value="America/Denver">Mountain Time</option>
                  <option value="America/Los_Angeles">Pacific Time</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Patient ID Prefix
                </label>
                <input
                  type="text"
                  value={formData.patientIdPrefix || ''}
                  onChange={(e) => {
                    // Validate: 2-5 uppercase letters only
                    const value = e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z]/g, '')
                      .slice(0, 5);
                    updateFormData('patientIdPrefix', value);
                  }}
                  placeholder="e.g., EON, WEL, OT"
                  maxLength={5}
                  className="w-full rounded-lg border px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  2-5 uppercase letters. Patient IDs will look like:{' '}
                  {formData.patientIdPrefix || 'XXX'}-123
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'branding' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Primary Color
                </label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={formData.primaryColor || '#3B82F6'}
                    onChange={(e) => updateFormData('primaryColor', e.target.value)}
                    className="h-10 w-12 cursor-pointer rounded border"
                  />
                  <input
                    type="text"
                    value={formData.primaryColor || '#3B82F6'}
                    onChange={(e) => updateFormData('primaryColor', e.target.value)}
                    className="flex-1 rounded-lg border px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Secondary Color
                </label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={formData.secondaryColor || '#10B981'}
                    onChange={(e) => updateFormData('secondaryColor', e.target.value)}
                    className="h-10 w-12 cursor-pointer rounded border"
                  />
                  <input
                    type="text"
                    value={formData.secondaryColor || '#10B981'}
                    onChange={(e) => updateFormData('secondaryColor', e.target.value)}
                    className="flex-1 rounded-lg border px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Logo URL</label>
              <input
                type="url"
                value={formData.logoUrl || ''}
                onChange={(e) => updateFormData('logoUrl', e.target.value)}
                placeholder="https://example.com/logo.png"
                className="w-full rounded-lg border px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Custom CSS (Advanced)
              </label>
              <textarea
                value={formData.customCss || ''}
                onChange={(e) => updateFormData('customCss', e.target.value)}
                rows={6}
                placeholder="/* Custom styles for this clinic */"
                className="w-full rounded-lg border px-3 py-2 font-mono text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        {activeTab === 'limits' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Billing Plan</label>
                <select
                  value={formData.billingPlan || 'starter'}
                  onChange={(e) => updateFormData('billingPlan', e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="starter">Starter</option>
                  <option value="professional">Professional</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Patient Limit
                </label>
                <input
                  type="number"
                  value={formData.patientLimit || 100}
                  onChange={(e) => updateFormData('patientLimit', parseInt(e.target.value))}
                  className="w-full rounded-lg border px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Provider Limit
                </label>
                <input
                  type="number"
                  value={formData.providerLimit || 5}
                  onChange={(e) => updateFormData('providerLimit', parseInt(e.target.value))}
                  className="w-full rounded-lg border px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Storage Limit (MB)
                </label>
                <input
                  type="number"
                  value={formData.storageLimit || 5000}
                  onChange={(e) => updateFormData('storageLimit', parseInt(e.target.value))}
                  className="w-full rounded-lg border px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'features' && (
          <div className="space-y-4">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Available Features</h3>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(formData.features || {}).map(([key, value]) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={value as boolean}
                    onChange={(e) => updateNestedData('features', key, e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    {key.replace(/_/g, ' ')}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-4">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Clinic Settings</h3>
            <div className="space-y-3">
              {Object.entries(formData.settings || {}).map(([key, value]) => (
                <label key={key} className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={value as boolean}
                    onChange={(e) => updateNestedData('settings', key, e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    {key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase())}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
