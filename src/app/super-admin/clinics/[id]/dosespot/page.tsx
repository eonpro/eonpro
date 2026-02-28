'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api/fetch';

type DoseSpotSettings = {
  id: number;
  name: string;
  slug: string | null;
  doseSpotEnabled: boolean;
  doseSpotBaseUrl: string | null;
  doseSpotTokenUrl: string | null;
  doseSpotSsoUrl: string | null;
  doseSpotClinicId: string | null;
  doseSpotClinicKey: string | null;
  doseSpotAdminId: string | null;
  doseSpotSubscriptionKey: string | null;
  hasCredentials: boolean;
};

export default function ClinicDoseSpotSettingsPage() {
  const params = useParams();
  const clinicId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [settings, setSettings] = useState<DoseSpotSettings | null>(null);

  const [form, setForm] = useState({
    doseSpotEnabled: false,
    doseSpotBaseUrl: '',
    doseSpotTokenUrl: '',
    doseSpotSsoUrl: '',
    doseSpotClinicId: '',
    doseSpotClinicKey: '',
    doseSpotAdminId: '',
    doseSpotSubscriptionKey: '',
  });

  useEffect(() => {
    fetchSettings();
  }, [clinicId]);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await apiFetch(`/api/super-admin/clinics/${clinicId}/dosespot`);

      if (!res.ok) {
        throw new Error('Failed to fetch DoseSpot settings');
      }

      const data = await res.json();
      setSettings(data.settings);

      setForm({
        doseSpotEnabled: data.settings.doseSpotEnabled || false,
        doseSpotBaseUrl: data.settings.doseSpotBaseUrl || '',
        doseSpotTokenUrl: data.settings.doseSpotTokenUrl || '',
        doseSpotSsoUrl: data.settings.doseSpotSsoUrl || '',
        doseSpotClinicId: data.settings.doseSpotClinicId || '',
        doseSpotClinicKey: data.settings.doseSpotClinicKey || '',
        doseSpotAdminId: data.settings.doseSpotAdminId || '',
        doseSpotSubscriptionKey: data.settings.doseSpotSubscriptionKey || '',
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const res = await apiFetch(`/api/super-admin/clinics/${clinicId}/dosespot`, {
        method: 'PUT',
        body: JSON.stringify({
          doseSpotEnabled: form.doseSpotEnabled,
          doseSpotBaseUrl: form.doseSpotBaseUrl || null,
          doseSpotTokenUrl: form.doseSpotTokenUrl || null,
          doseSpotSsoUrl: form.doseSpotSsoUrl || null,
          doseSpotClinicId: form.doseSpotClinicId || null,
          doseSpotClinicKey: form.doseSpotClinicKey || null,
          doseSpotAdminId: form.doseSpotAdminId || null,
          doseSpotSubscriptionKey: form.doseSpotSubscriptionKey || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save settings');
      }

      setSuccess('DoseSpot settings saved successfully!');
      fetchSettings();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const updateForm = (field: string, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className="p-8">
        <p>Loading DoseSpot settings...</p>
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
            <span>&rarr;</span>
            <Link href="/super-admin/clinics" className="hover:text-[#4fa77e]">
              Clinics
            </Link>
            <span>&rarr;</span>
            <span>{settings?.name || `Clinic ${clinicId}`}</span>
            <span>&rarr;</span>
            <span className="text-gray-700">DoseSpot Settings</span>
          </div>
          <h1 className="text-3xl font-bold">DoseSpot E-Prescribing</h1>
          <p className="mt-1 text-gray-600">
            Configure DoseSpot e-prescribing for {settings?.name || 'this clinic'} to enable
            external pharmacy prescriptions
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

      {/* Status Badge */}
      <div className="mb-6 rounded-xl border bg-white p-6 shadow">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Enable DoseSpot Integration</h2>
            <p className="text-sm text-gray-500">
              When enabled, providers can e-prescribe to external pharmacies via DoseSpot SSO
            </p>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={form.doseSpotEnabled}
              onChange={(e) => updateForm('doseSpotEnabled', e.target.checked)}
              className="peer sr-only"
            />
            <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-[#4fa77e] peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#4fa77e]/20 rtl:peer-checked:after:-translate-x-full"></div>
          </label>
        </div>
        {settings?.hasCredentials && (
          <div className="mt-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              Credentials configured
            </span>
          </div>
        )}
      </div>

      {/* API URLs */}
      <div className="mb-6 rounded-xl border bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold">API Endpoints</h2>
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              REST API Base URL *
            </label>
            <input
              type="url"
              value={form.doseSpotBaseUrl}
              onChange={(e) => updateForm('doseSpotBaseUrl', e.target.value)}
              placeholder="https://my.dosespot.com/webapi"
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              OAuth2 Token URL *
            </label>
            <input
              type="url"
              value={form.doseSpotTokenUrl}
              onChange={(e) => updateForm('doseSpotTokenUrl', e.target.value)}
              placeholder="https://my.dosespot.com/webapi/token"
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              SSO Login URL *
            </label>
            <input
              type="url"
              value={form.doseSpotSsoUrl}
              onChange={(e) => updateForm('doseSpotSsoUrl', e.target.value)}
              placeholder="https://my.dosespot.com/LoginSingleSignOn.aspx"
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>
        </div>
      </div>

      {/* OAuth2 Credentials */}
      <div className="mb-6 rounded-xl border bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold">OAuth2 Credentials</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Clinic ID (client_id) *
            </label>
            <input
              type="text"
              value={form.doseSpotClinicId}
              onChange={(e) => updateForm('doseSpotClinicId', e.target.value)}
              placeholder="Your DoseSpot Clinic ID"
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Admin User ID (username) *
            </label>
            <input
              type="text"
              value={form.doseSpotAdminId}
              onChange={(e) => updateForm('doseSpotAdminId', e.target.value)}
              placeholder="DoseSpot admin user ID"
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Clinic Key (client_secret) *
            </label>
            <input
              type="password"
              value={form.doseSpotClinicKey}
              onChange={(e) => updateForm('doseSpotClinicKey', e.target.value)}
              placeholder="DoseSpot clinic key"
              className="w-full rounded-lg border px-3 py-2"
            />
            <p className="mt-1 text-xs text-gray-500">
              Also used for SSO signing. Leave as masked value to keep existing key.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Subscription Key (API gateway) *
            </label>
            <input
              type="password"
              value={form.doseSpotSubscriptionKey}
              onChange={(e) => updateForm('doseSpotSubscriptionKey', e.target.value)}
              placeholder="API gateway subscription key"
              className="w-full rounded-lg border px-3 py-2"
            />
            <p className="mt-1 text-xs text-gray-500">
              Leave as masked value to keep existing key.
            </p>
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div className="mb-6 rounded-xl border border-teal-200 bg-teal-50 p-6">
        <h3 className="font-semibold text-teal-900">How DoseSpot works</h3>
        <ul className="mt-2 space-y-1 text-sm text-teal-800">
          <li>
            Providers open the DoseSpot UI via SSO to write prescriptions
          </li>
          <li>
            Prescriptions are sent electronically to the patient&apos;s chosen pharmacy
          </li>
          <li>
            Patients and providers are synced to DoseSpot automatically on first use
          </li>
          <li>
            This is separate from Lifefile (in-network) prescriptions
          </li>
        </ul>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
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
  );
}
