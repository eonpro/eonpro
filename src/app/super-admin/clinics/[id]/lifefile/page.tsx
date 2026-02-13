'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { logger } from '@/lib/logger';
import { CheckboxGroup } from '@/components/ui/Checkbox';

type LifefileSettings = {
  id: number;
  name: string;
  slug: string | null;
  // Outbound settings
  lifefileEnabled: boolean;
  lifefileBaseUrl: string | null;
  lifefileUsername: string | null;
  lifefilePassword: string | null;
  lifefileVendorId: string | null;
  lifefilePracticeId: string | null;
  lifefileLocationId: string | null;
  lifefileNetworkId: string | null;
  lifefilePracticeName: string | null;
  lifefilePracticeAddress: string | null;
  lifefilePracticePhone: string | null;
  lifefilePracticeFax: string | null;
  lifefileWebhookSecret: string | null;
  lifefileDatapushUsername: string | null;
  lifefileDatapushPassword: string | null;
  hasCredentials: boolean;
  // Inbound settings
  lifefileInboundEnabled: boolean;
  lifefileInboundPath: string | null;
  lifefileInboundUsername: string | null;
  lifefileInboundPassword: string | null;
  lifefileInboundSecret: string | null;
  lifefileInboundAllowedIPs: string | null;
  lifefileInboundEvents: string[];
  hasInboundCredentials: boolean;
  inboundWebhookUrl: string | null;
};

export default function ClinicLifefileSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const clinicId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [settings, setSettings] = useState<LifefileSettings | null>(null);

  // Form state
  const [form, setForm] = useState({
    // Outbound
    lifefileEnabled: false,
    lifefileBaseUrl: '',
    lifefileUsername: '',
    lifefilePassword: '',
    lifefileVendorId: '',
    lifefilePracticeId: '',
    lifefileLocationId: '',
    lifefileNetworkId: '',
    lifefilePracticeName: '',
    lifefilePracticeAddress: '',
    lifefilePracticePhone: '',
    lifefilePracticeFax: '',
    lifefileWebhookSecret: '',
    lifefileDatapushUsername: '',
    lifefileDatapushPassword: '',
    // Inbound
    lifefileInboundEnabled: false,
    lifefileInboundPath: '',
    lifefileInboundUsername: '',
    lifefileInboundPassword: '',
    lifefileInboundSecret: '',
    lifefileInboundAllowedIPs: '',
    lifefileInboundEvents: [] as string[],
  });

  const [copiedUrl, setCopiedUrl] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, [clinicId]);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('auth-token') || localStorage.getItem('super_admin-token');

      const res = await fetch(`/api/super-admin/clinics/${clinicId}/lifefile`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        throw new Error('Failed to fetch Lifefile settings');
      }

      const data = await res.json();
      setSettings(data.settings);

      // Populate form with current settings
      setForm({
        // Outbound
        lifefileEnabled: data.settings.lifefileEnabled || false,
        lifefileBaseUrl: data.settings.lifefileBaseUrl || '',
        lifefileUsername: data.settings.lifefileUsername || '',
        lifefilePassword: data.settings.lifefilePassword || '',
        lifefileVendorId: data.settings.lifefileVendorId || '',
        lifefilePracticeId: data.settings.lifefilePracticeId || '',
        lifefileLocationId: data.settings.lifefileLocationId || '',
        lifefileNetworkId: data.settings.lifefileNetworkId || '',
        lifefilePracticeName: data.settings.lifefilePracticeName || '',
        lifefilePracticeAddress: data.settings.lifefilePracticeAddress || '',
        lifefilePracticePhone: data.settings.lifefilePracticePhone || '',
        lifefilePracticeFax: data.settings.lifefilePracticeFax || '',
        lifefileWebhookSecret: data.settings.lifefileWebhookSecret || '',
        lifefileDatapushUsername: data.settings.lifefileDatapushUsername || '',
        lifefileDatapushPassword: data.settings.lifefileDatapushPassword || '',
        // Inbound
        lifefileInboundEnabled: data.settings.lifefileInboundEnabled || false,
        lifefileInboundPath: data.settings.lifefileInboundPath || '',
        lifefileInboundUsername: data.settings.lifefileInboundUsername || '',
        lifefileInboundPassword: data.settings.lifefileInboundPassword || '',
        lifefileInboundSecret: data.settings.lifefileInboundSecret || '',
        lifefileInboundAllowedIPs: data.settings.lifefileInboundAllowedIPs || '',
        lifefileInboundEvents: data.settings.lifefileInboundEvents || [],
      });
    } catch (err: any) {
      logger.error('Error fetching Lifefile settings:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const token = localStorage.getItem('auth-token') || localStorage.getItem('super_admin-token');

      const res = await fetch(`/api/super-admin/clinics/${clinicId}/lifefile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          // Outbound
          lifefileEnabled: form.lifefileEnabled,
          lifefileBaseUrl: form.lifefileBaseUrl || null,
          lifefileUsername: form.lifefileUsername || null,
          lifefilePassword: form.lifefilePassword || null,
          lifefileVendorId: form.lifefileVendorId || null,
          lifefilePracticeId: form.lifefilePracticeId || null,
          lifefileLocationId: form.lifefileLocationId || null,
          lifefileNetworkId: form.lifefileNetworkId || null,
          lifefilePracticeName: form.lifefilePracticeName || null,
          lifefilePracticeAddress: form.lifefilePracticeAddress || null,
          lifefilePracticePhone: form.lifefilePracticePhone || null,
          lifefilePracticeFax: form.lifefilePracticeFax || null,
          lifefileWebhookSecret: form.lifefileWebhookSecret || null,
          lifefileDatapushUsername: form.lifefileDatapushUsername || null,
          lifefileDatapushPassword: form.lifefileDatapushPassword || null,
          // Inbound
          lifefileInboundEnabled: form.lifefileInboundEnabled,
          lifefileInboundPath: form.lifefileInboundPath || null,
          lifefileInboundUsername: form.lifefileInboundUsername || null,
          lifefileInboundPassword: form.lifefileInboundPassword || null,
          lifefileInboundSecret: form.lifefileInboundSecret || null,
          lifefileInboundAllowedIPs: form.lifefileInboundAllowedIPs || null,
          lifefileInboundEvents: form.lifefileInboundEvents,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save settings');
      }

      setSuccess('Lifefile settings saved successfully!');
      fetchSettings(); // Refresh settings
    } catch (err: any) {
      logger.error('Error saving Lifefile settings:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setTesting(true);
      setError(null);
      setSuccess(null);

      const token = localStorage.getItem('auth-token') || localStorage.getItem('super_admin-token');

      const res = await fetch(`/api/super-admin/clinics/${clinicId}/lifefile`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.detail || data.error || 'Connection test failed');
      }

      setSuccess('Connection test successful! Lifefile is configured correctly.');
    } catch (err: any) {
      logger.error('Error testing Lifefile connection:', err);
      setError(`Connection test failed: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  const updateForm = (field: string, value: string | boolean | string[]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className="p-8">
        <p>Loading Lifefile settings...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-gray-500">
            <Link href="/super-admin" className="hover:text-[#4fa77e]">
              Super Admin
            </Link>
            <span>→</span>
            <Link href="/super-admin/clinics" className="hover:text-[#4fa77e]">
              Clinics
            </Link>
            <span>→</span>
            <span>{settings?.name || `Clinic ${clinicId}`}</span>
            <span>→</span>
            <span className="text-gray-700">Lifefile Settings</span>
          </div>
          <h1 className="text-3xl font-bold">Lifefile / Pharmacy Integration</h1>
          <p className="mt-1 text-gray-600">
            Configure the pharmacy integration for {settings?.name || 'this clinic'}
          </p>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">
          {success}
        </div>
      )}

      {/* Enable Toggle */}
      <div className="mb-6 rounded-xl border bg-white p-6 shadow">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Enable Lifefile Integration</h2>
            <p className="text-sm text-gray-500">
              When enabled, prescriptions from this clinic will be sent through Lifefile
            </p>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={form.lifefileEnabled}
              onChange={(e) => updateForm('lifefileEnabled', e.target.checked)}
              className="peer sr-only"
            />
            <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-[#4fa77e] peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#4fa77e]/20 rtl:peer-checked:after:-translate-x-full"></div>
          </label>
        </div>
      </div>

      {/* API Credentials */}
      <div className="mb-6 rounded-xl border bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold">API Credentials</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">API Base URL *</label>
            <input
              type="url"
              value={form.lifefileBaseUrl}
              onChange={(e) => updateForm('lifefileBaseUrl', e.target.value)}
              placeholder="https://api.lifefile.com/v1"
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Username *</label>
            <input
              type="text"
              value={form.lifefileUsername}
              onChange={(e) => updateForm('lifefileUsername', e.target.value)}
              placeholder="API username"
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Password *</label>
            <input
              type="password"
              value={form.lifefilePassword}
              onChange={(e) => updateForm('lifefilePassword', e.target.value)}
              placeholder="API password"
              className="w-full rounded-lg border px-3 py-2"
            />
            <p className="mt-1 text-xs text-gray-500">
              Leave as •••••••• to keep existing password
            </p>
          </div>
        </div>
      </div>

      {/* Account IDs */}
      <div className="mb-6 rounded-xl border bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold">Account Identifiers</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Vendor ID *</label>
            <input
              type="text"
              value={form.lifefileVendorId}
              onChange={(e) => updateForm('lifefileVendorId', e.target.value)}
              placeholder="e.g., 11596"
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Practice ID *</label>
            <input
              type="text"
              value={form.lifefilePracticeId}
              onChange={(e) => updateForm('lifefilePracticeId', e.target.value)}
              placeholder="Your practice ID"
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Location ID *</label>
            <input
              type="text"
              value={form.lifefileLocationId}
              onChange={(e) => updateForm('lifefileLocationId', e.target.value)}
              placeholder="e.g., 110396"
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Network ID *</label>
            <input
              type="text"
              value={form.lifefileNetworkId}
              onChange={(e) => updateForm('lifefileNetworkId', e.target.value)}
              placeholder="Your network ID"
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>
        </div>
      </div>

      {/* Practice Information */}
      <div className="mb-6 rounded-xl border bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold">Practice Information</h2>
        <p className="mb-4 text-sm text-gray-500">
          This information appears on prescriptions and pharmacy communications
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">Practice Name</label>
            <input
              type="text"
              value={form.lifefilePracticeName}
              onChange={(e) => updateForm('lifefilePracticeName', e.target.value)}
              placeholder="e.g., ABC Medical Clinic"
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">Practice Address</label>
            <input
              type="text"
              value={form.lifefilePracticeAddress}
              onChange={(e) => updateForm('lifefilePracticeAddress', e.target.value)}
              placeholder="123 Medical Center Dr, Suite 100, City, ST 12345"
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Practice Phone</label>
            <input
              type="tel"
              value={form.lifefilePracticePhone}
              onChange={(e) => updateForm('lifefilePracticePhone', e.target.value)}
              placeholder="555-555-5555"
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Practice Fax</label>
            <input
              type="tel"
              value={form.lifefilePracticeFax}
              onChange={(e) => updateForm('lifefilePracticeFax', e.target.value)}
              placeholder="555-555-5556"
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>
        </div>
      </div>

      {/* Webhook Settings (Optional) */}
      <div className="mb-6 rounded-xl border bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold">Outbound Webhook Settings (Optional)</h2>
        <p className="mb-4 text-sm text-gray-500">
          Configure credentials for legacy webhook endpoints
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">Webhook Secret</label>
            <input
              type="password"
              value={form.lifefileWebhookSecret}
              onChange={(e) => updateForm('lifefileWebhookSecret', e.target.value)}
              placeholder="Secret for webhook verification"
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Data Push Username
            </label>
            <input
              type="text"
              value={form.lifefileDatapushUsername}
              onChange={(e) => updateForm('lifefileDatapushUsername', e.target.value)}
              placeholder="Webhook auth username"
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Data Push Password
            </label>
            <input
              type="password"
              value={form.lifefileDatapushPassword}
              onChange={(e) => updateForm('lifefileDatapushPassword', e.target.value)}
              placeholder="Webhook auth password"
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>
        </div>
      </div>

      {/* Inbound Webhook Settings - Receive FROM Lifefile */}
      <div className="mb-6 rounded-xl border bg-white p-6 shadow">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Inbound Webhook Settings</h2>
            <p className="text-sm text-gray-500">
              Configure this clinic to receive data FROM Lifefile (shipping updates, prescription
              status, etc.)
            </p>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={form.lifefileInboundEnabled}
              onChange={(e) => updateForm('lifefileInboundEnabled', e.target.checked)}
              className="peer sr-only"
            />
            <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-[#4fa77e] peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#4fa77e]/20 rtl:peer-checked:after:-translate-x-full"></div>
          </label>
        </div>

        {/* Webhook URL Display */}
        {settings?.inboundWebhookUrl && (
          <div className="mb-4 rounded-lg bg-gray-50 p-4">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Webhook URL (share this with Lifefile)
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded border bg-white px-3 py-2 font-mono text-sm">
                {settings.inboundWebhookUrl}
              </code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(settings.inboundWebhookUrl || '');
                  setCopiedUrl(true);
                  setTimeout(() => setCopiedUrl(false), 2000);
                }}
                className="whitespace-nowrap rounded-lg bg-[#4fa77e] px-3 py-2 text-sm text-white hover:bg-[#3d8c65]"
              >
                {copiedUrl ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">Webhook Path *</label>
            <div className="flex items-center">
              <span className="mr-1 text-sm text-gray-500">/api/webhooks/lifefile/inbound/</span>
              <input
                type="text"
                value={form.lifefileInboundPath}
                onChange={(e) =>
                  updateForm(
                    'lifefileInboundPath',
                    e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '')
                  )
                }
                placeholder={settings?.slug || 'clinic-slug'}
                className="flex-1 rounded-lg border px-3 py-2"
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Unique identifier for this clinic&apos;s webhook endpoint (letters, numbers, hyphens,
              underscores only)
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Username *</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.lifefileInboundUsername}
                onChange={(e) => updateForm('lifefileInboundUsername', e.target.value)}
                placeholder="Webhook auth username"
                className="flex-1 rounded-lg border px-3 py-2"
              />
              <button
                type="button"
                onClick={() => {
                  const username = `${form.lifefileInboundPath || settings?.slug || 'clinic'}_webhook`;
                  updateForm('lifefileInboundUsername', username);
                }}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
              >
                Generate
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Password *</label>
            <div className="flex gap-2">
              <input
                type="password"
                value={form.lifefileInboundPassword}
                onChange={(e) => updateForm('lifefileInboundPassword', e.target.value)}
                placeholder="Webhook auth password"
                className="flex-1 rounded-lg border px-3 py-2"
              />
              <button
                type="button"
                onClick={() => {
                  // Generate random password
                  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
                  let password = '';
                  for (let i = 0; i < 16; i++) {
                    password += chars.charAt(Math.floor(Math.random() * chars.length));
                  }
                  updateForm('lifefileInboundPassword', password);
                }}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
              >
                Generate
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Leave as •••••••• to keep existing password
            </p>
          </div>

          <div className="col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              HMAC Secret (Optional)
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={form.lifefileInboundSecret}
                onChange={(e) => updateForm('lifefileInboundSecret', e.target.value)}
                placeholder="Secret for HMAC signature verification"
                className="flex-1 rounded-lg border px-3 py-2"
              />
              <button
                type="button"
                onClick={() => {
                  // Generate random secret
                  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
                  let secret = '';
                  for (let i = 0; i < 32; i++) {
                    secret += chars.charAt(Math.floor(Math.random() * chars.length));
                  }
                  updateForm('lifefileInboundSecret', secret);
                }}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
              >
                Generate
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              If provided, webhooks must include X-Webhook-Signature header with HMAC-SHA256
              signature
            </p>
          </div>

          <div className="col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Allowed IP Addresses (Optional)
            </label>
            <input
              type="text"
              value={form.lifefileInboundAllowedIPs}
              onChange={(e) => updateForm('lifefileInboundAllowedIPs', e.target.value)}
              placeholder="e.g., 192.168.1.1, 10.0.0.0/24"
              className="w-full rounded-lg border px-3 py-2"
            />
            <p className="mt-1 text-xs text-gray-500">
              Comma-separated list of allowed IP addresses. Leave empty to allow all IPs.
            </p>
          </div>

          <div className="col-span-2">
            <CheckboxGroup
              label="Allowed Event Types"
              options={[
                { id: 'shipping', label: 'Shipping Updates' },
                { id: 'prescription', label: 'Prescription Status' },
                { id: 'order', label: 'Order Status' },
                { id: 'rx', label: 'Rx Events' },
              ]}
              value={form.lifefileInboundEvents}
              onChange={(newValue) => updateForm('lifefileInboundEvents', newValue)}
              color="#4fa77e"
              helperText="Leave all unchecked to allow all event types"
            />
          </div>
        </div>

        {/* Sample cURL command */}
        {form.lifefileInboundPath && form.lifefileInboundUsername && (
          <div className="mt-4 rounded-lg bg-gray-900 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-300">Sample cURL Command</span>
              <button
                type="button"
                onClick={() => {
                  const baseUrl =
                    settings?.inboundWebhookUrl ||
                    `https://app.eonpro.io/api/webhooks/lifefile/inbound/${form.lifefileInboundPath}`;
                  const curlCommand = `curl -X POST ${baseUrl} \\
  -H "Authorization: Basic $(echo -n '${form.lifefileInboundUsername}:YOUR_PASSWORD' | base64)" \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "shipping_update",
    "trackingNumber": "1Z999AA10123456784",
    "orderId": "LF_ORDER_ID",
    "deliveryService": "UPS",
    "status": "shipped",
    "estimatedDelivery": "2026-02-10"
  }'`;
                  navigator.clipboard.writeText(curlCommand);
                }}
                className="text-xs text-[#4fa77e] hover:underline"
              >
                Copy
              </button>
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-green-400">
              {`curl -X POST ${settings?.inboundWebhookUrl || `https://app.eonpro.io/api/webhooks/lifefile/inbound/${form.lifefileInboundPath}`} \\
  -H "Authorization: Basic $(echo -n '${form.lifefileInboundUsername}:YOUR_PASSWORD' | base64)" \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "shipping_update",
    "trackingNumber": "1Z999AA10123456784",
    "orderId": "LF_ORDER_ID",
    "status": "shipped"
  }'`}
            </pre>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={handleTestConnection}
          disabled={testing || !form.lifefileBaseUrl || !form.lifefileUsername}
          className="rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {testing ? 'Testing...' : 'Test Connection'}
        </button>

        <div className="flex items-center gap-3">
          <Link
            href="/super-admin/clinics"
            className="rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-[#4fa77e] px-6 py-2 text-white hover:bg-[#3d8c65] disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
