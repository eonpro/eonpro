'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Building2, AlertCircle, Check, Info } from 'lucide-react';
import Link from 'next/link';

export default function NewClinicPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    subdomain: '',
    adminEmail: '',
    supportEmail: '',
    phone: '',
    billingPlan: 'starter',
    status: 'TRIAL',
    patientLimit: 100,
    providerLimit: 5,
    storageLimit: 5000,
    timezone: 'America/New_York',
    primaryColor: '#3B82F6',
    secondaryColor: '#10B981',
    patientIdPrefix: '',
    features: {
      STRIPE_SUBSCRIPTIONS: false,
      TWILIO_SMS: false,
      TWILIO_CHAT: false,
      ZOOM_TELEHEALTH: false,
      AWS_S3: false,
      AI_SOAP_NOTES: false,
      INTERNAL_MESSAGING: true,
      TICKET_SYSTEM: true,
    },
    settings: {
      allowPatientRegistration: true,
      requireEmailVerification: false,
      enableTelehealth: false,
      enableEPrescribing: false,
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      // Clean subdomain - lowercase and alphanumeric only
      const cleanedData = {
        ...formData,
        subdomain: formData.subdomain.toLowerCase().replace(/[^a-z0-9]/g, ''),
        supportEmail: formData.supportEmail || formData.adminEmail,
      };

      const response = await fetch('/api/admin/clinics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanedData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create clinic');
      }

      window.location.href = `/admin/clinics/${data.id}/settings`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setSaving(false);
    }
  };

  const updateFormData = (field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  return (
    <div className="mx-auto max-w-4xl p-6">
      {/* Header */}
      <div className="mb-8 flex items-center gap-4">
        <Link href="/admin/clinics" className="rounded-lg p-2 transition-colors hover:bg-gray-100">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Create New Clinic</h1>
          <p className="mt-1 text-gray-600">Set up a new clinic in your platform</p>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Basic Information */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Building2 className="h-5 w-5" />
            Basic Information
          </h2>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Clinic Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => updateFormData('name', e.target.value)}
                required
                placeholder="Main Street Medical"
                className="w-full rounded-lg border px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Subdomain *</label>
              <div className="flex">
                <input
                  type="text"
                  value={formData.subdomain}
                  onChange={(e) => updateFormData('subdomain', e.target.value)}
                  required
                  placeholder="mainstreet"
                  pattern="[a-z0-9]+"
                  className="flex-1 rounded-l-lg border px-3 py-2 lowercase focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                />
                <span className="rounded-r-lg border-b border-r border-t bg-gray-50 px-3 py-2 text-sm text-gray-500">
                  .{process.env.NEXT_PUBLIC_BASE_DOMAIN || 'localhost:3001'}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">Lowercase letters and numbers only</p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Admin Email *</label>
              <input
                type="email"
                value={formData.adminEmail}
                onChange={(e) => updateFormData('adminEmail', e.target.value)}
                required
                placeholder="admin@clinic.com"
                className="w-full rounded-lg border px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Support Email</label>
              <input
                type="email"
                value={formData.supportEmail}
                onChange={(e) => updateFormData('supportEmail', e.target.value)}
                placeholder="support@clinic.com"
                className="w-full rounded-lg border px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">Defaults to admin email if not provided</p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => updateFormData('phone', e.target.value)}
                placeholder="(555) 123-4567"
                className="w-full rounded-lg border px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Timezone</label>
              <select
                value={formData.timezone}
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
                value={formData.patientIdPrefix}
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

        {/* Plan & Status */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Plan & Status</h2>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Initial Status</label>
              <select
                value={formData.status}
                onChange={(e) => updateFormData('status', e.target.value)}
                className="w-full rounded-lg border px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              >
                <option value="TRIAL">Trial (30 days)</option>
                <option value="ACTIVE">Active</option>
                <option value="PENDING_SETUP">Pending Setup</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Billing Plan</label>
              <select
                value={formData.billingPlan}
                onChange={(e) => updateFormData('billingPlan', e.target.value)}
                className="w-full rounded-lg border px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              >
                <option value="starter">Starter - $99/month</option>
                <option value="professional">Professional - $299/month</option>
                <option value="enterprise">Enterprise - Custom</option>
              </select>
            </div>
          </div>
        </div>

        {/* Limits */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Resource Limits</h2>

          <div className="grid grid-cols-3 gap-6">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Patient Limit</label>
              <input
                type="number"
                value={formData.patientLimit}
                onChange={(e) => updateFormData('patientLimit', parseInt(e.target.value))}
                min="1"
                className="w-full rounded-lg border px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Provider Limit</label>
              <input
                type="number"
                value={formData.providerLimit}
                onChange={(e) => updateFormData('providerLimit', parseInt(e.target.value))}
                min="1"
                className="w-full rounded-lg border px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Storage (MB)</label>
              <input
                type="number"
                value={formData.storageLimit}
                onChange={(e) => updateFormData('storageLimit', parseInt(e.target.value))}
                min="100"
                className="w-full rounded-lg border px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Features</h2>

          <div className="grid grid-cols-2 gap-4">
            {Object.entries(formData.features).map(([key, value]) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(e) =>
                    updateFormData('features', {
                      ...formData.features,
                      [key]: e.target.checked,
                    })
                  }
                  className="rounded text-blue-600"
                />
                <span className="text-sm font-medium text-gray-700">{key.replace(/_/g, ' ')}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Link
            href="/admin/clinics"
            className="rounded-lg border border-gray-300 px-4 py-2 transition-colors hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving || !formData.name || !formData.subdomain || !formData.adminEmail}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
                Creating...
              </>
            ) : (
              <>
                <Save className="h-5 w-5" />
                Create Clinic
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
