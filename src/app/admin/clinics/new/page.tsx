'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, Save, Building2, AlertCircle, Check, Info
} from 'lucide-react';
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
    }
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
      
      router.push(`/admin/clinics/${data.id}/settings`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setSaving(false);
    }
  };
  
  const updateFormData = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };
  
  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/admin/clinics"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Create New Clinic</h1>
          <p className="text-gray-600 mt-1">Set up a new clinic in your platform</p>
        </div>
      </div>
      
      {/* Error Alert */}
      {error && (
        <div className="mb-6 p-4 rounded-lg flex items-center gap-2 bg-red-50 text-red-800 border border-red-200">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}
      
      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Basic Information */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Basic Information
          </h2>
          
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Clinic Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => updateFormData('name', e.target.value)}
                required
                placeholder="Main Street Medical"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Subdomain *
              </label>
              <div className="flex">
                <input
                  type="text"
                  value={formData.subdomain}
                  onChange={(e) => updateFormData('subdomain', e.target.value)}
                  required
                  placeholder="mainstreet"
                  pattern="[a-z0-9]+"
                  className="flex-1 px-3 py-2 border rounded-l-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 lowercase"
                />
                <span className="px-3 py-2 bg-gray-50 border-t border-r border-b rounded-r-lg text-gray-500 text-sm">
                  .{process.env.NEXT_PUBLIC_BASE_DOMAIN || 'localhost:3001'}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">Lowercase letters and numbers only</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Admin Email *
              </label>
              <input
                type="email"
                value={formData.adminEmail}
                onChange={(e) => updateFormData('adminEmail', e.target.value)}
                required
                placeholder="admin@clinic.com"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Support Email
              </label>
              <input
                type="email"
                value={formData.supportEmail}
                onChange={(e) => updateFormData('supportEmail', e.target.value)}
                placeholder="support@clinic.com"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Defaults to admin email if not provided</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => updateFormData('phone', e.target.value)}
                placeholder="(555) 123-4567"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Timezone
              </label>
              <select
                value={formData.timezone}
                onChange={(e) => updateFormData('timezone', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="America/New_York">Eastern Time</option>
                <option value="America/Chicago">Central Time</option>
                <option value="America/Denver">Mountain Time</option>
                <option value="America/Los_Angeles">Pacific Time</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Patient ID Prefix
              </label>
              <input
                type="text"
                value={formData.patientIdPrefix}
                onChange={(e) => {
                  // Validate: 2-5 uppercase letters only
                  const value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
                  updateFormData('patientIdPrefix', value);
                }}
                placeholder="e.g., EON, WEL, OT"
                maxLength={5}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                2-5 uppercase letters. Patient IDs will look like: {formData.patientIdPrefix || 'XXX'}-123
              </p>
            </div>
          </div>
        </div>

        {/* Plan & Status */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Plan & Status</h2>
          
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Initial Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => updateFormData('status', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="TRIAL">Trial (30 days)</option>
                <option value="ACTIVE">Active</option>
                <option value="PENDING_SETUP">Pending Setup</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Billing Plan
              </label>
              <select
                value={formData.billingPlan}
                onChange={(e) => updateFormData('billingPlan', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="starter">Starter - $99/month</option>
                <option value="professional">Professional - $299/month</option>
                <option value="enterprise">Enterprise - Custom</option>
              </select>
            </div>
          </div>
        </div>
        
        {/* Limits */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Resource Limits</h2>
          
          <div className="grid grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Patient Limit
              </label>
              <input
                type="number"
                value={formData.patientLimit}
                onChange={(e) => updateFormData('patientLimit', parseInt(e.target.value))}
                min="1"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Provider Limit
              </label>
              <input
                type="number"
                value={formData.providerLimit}
                onChange={(e) => updateFormData('providerLimit', parseInt(e.target.value))}
                min="1"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Storage (MB)
              </label>
              <input
                type="number"
                value={formData.storageLimit}
                onChange={(e) => updateFormData('storageLimit', parseInt(e.target.value))}
                min="100"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>
        
        {/* Features */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Features</h2>
          
          <div className="grid grid-cols-2 gap-4">
            {Object.entries(formData.features).map(([key, value]) => (
              <label key={key} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(e) => updateFormData('features', {
                    ...formData.features,
                    [key]: e.target.checked
                  })}
                  className="rounded text-blue-600"
                />
                <span className="text-sm font-medium text-gray-700">
                  {key.replace(/_/g, ' ')}
                </span>
              </label>
            ))}
          </div>
        </div>
        
        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Link
            href="/admin/clinics"
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving || !formData.name || !formData.subdomain || !formData.adminEmail}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Creating...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Create Clinic
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
