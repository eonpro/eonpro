'use client';

import { useState, useEffect, use } from 'react';
import { logger } from '../../../../../lib/logger';

import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, Save, Building2, Palette, Globe, Users, 
  Bell, Shield, CreditCard, Database, AlertCircle, Check,
  Upload, X
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

export default function ClinicSettingsPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [clinic, setClinic] = useState<ClinicSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
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
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };
  
  const updateNestedData = (parent: string, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [parent]: {
        ...(prev[parent as keyof ClinicSettings] as any || {}),
        [field]: value
      }
    }));
  };
  
  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="space-y-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 bg-gray-200 rounded"></div>
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
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-600">Clinic not found</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/clinics"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Clinic Settings</h1>
            <p className="text-gray-600 mt-1">{clinic.name}</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          <Save className="w-5 h-5" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
      
      {/* Message Alert */}
      {message && (
        <div className={`mb-6 p-4 rounded-lg flex items-center gap-2 ${
          message.type === 'success' 
            ? 'bg-green-50 text-green-800 border border-green-200' 
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {message.type === 'success' ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {message.text}
        </div>
      )}
      
      {/* Tabs */}
      <div className="border-b mb-6">
        <nav className="flex space-x-8">
          {[
            { id: 'general', label: 'General', icon: Building2 },
            { id: 'branding', label: 'Branding', icon: Palette },
            { id: 'limits', label: 'Limits & Billing', icon: CreditCard },
            { id: 'features', label: 'Features', icon: Database },
            { id: 'settings', label: 'Settings', icon: Shield },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      
      {/* Tab Content */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        {activeTab === 'general' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Clinic Name
                </label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => updateFormData('name', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Status
                </label>
                <select
                  value={formData.status || ''}
                  onChange={(e) => updateFormData('status', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="TRIAL">Trial</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="EXPIRED">Expired</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Subdomain
                </label>
                <div className="flex">
                  <input
                    type="text"
                    value={formData.subdomain || ''}
                    onChange={(e) => updateFormData('subdomain', e.target.value)}
                    className="flex-1 px-3 py-2 border rounded-l-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <span className="px-3 py-2 bg-gray-50 border-t border-r border-b rounded-r-lg text-gray-500 text-sm">
                    .{process.env.NEXT_PUBLIC_BASE_DOMAIN || 'localhost:3001'}
                  </span>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Custom Domain (Optional)
                </label>
                <input
                  type="text"
                  value={formData.customDomain || ''}
                  onChange={(e) => updateFormData('customDomain', e.target.value)}
                  placeholder="clinic.example.com"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Admin Email
                </label>
                <input
                  type="email"
                  value={formData.adminEmail || ''}
                  onChange={(e) => updateFormData('adminEmail', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Support Email
                </label>
                <input
                  type="email"
                  value={formData.supportEmail || ''}
                  onChange={(e) => updateFormData('supportEmail', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone
                </label>
                <input
                  type="tel"
                  value={formData.phone || ''}
                  onChange={(e) => updateFormData('phone', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Timezone
                </label>
                <select
                  value={formData.timezone || 'America/New_York'}
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
                  value={formData.patientIdPrefix || ''}
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
        )}
        
        {activeTab === 'branding' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Primary Color
                </label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={formData.primaryColor || '#3B82F6'}
                    onChange={(e) => updateFormData('primaryColor', e.target.value)}
                    className="w-12 h-10 border rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={formData.primaryColor || '#3B82F6'}
                    onChange={(e) => updateFormData('primaryColor', e.target.value)}
                    className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Secondary Color
                </label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={formData.secondaryColor || '#10B981'}
                    onChange={(e) => updateFormData('secondaryColor', e.target.value)}
                    className="w-12 h-10 border rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={formData.secondaryColor || '#10B981'}
                    onChange={(e) => updateFormData('secondaryColor', e.target.value)}
                    className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Logo URL
              </label>
              <input
                type="url"
                value={formData.logoUrl || ''}
                onChange={(e) => updateFormData('logoUrl', e.target.value)}
                placeholder="https://example.com/logo.png"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Custom CSS (Advanced)
              </label>
              <textarea
                value={formData.customCss || ''}
                onChange={(e) => updateFormData('customCss', e.target.value)}
                rows={6}
                placeholder="/* Custom styles for this clinic */"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
              />
            </div>
          </div>
        )}
        
        {activeTab === 'limits' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Billing Plan
                </label>
                <select
                  value={formData.billingPlan || 'starter'}
                  onChange={(e) => updateFormData('billingPlan', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="starter">Starter</option>
                  <option value="professional">Professional</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Patient Limit
                </label>
                <input
                  type="number"
                  value={formData.patientLimit || 100}
                  onChange={(e) => updateFormData('patientLimit', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Provider Limit
                </label>
                <input
                  type="number"
                  value={formData.providerLimit || 5}
                  onChange={(e) => updateFormData('providerLimit', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Storage Limit (MB)
                </label>
                <input
                  type="number"
                  value={formData.storageLimit || 5000}
                  onChange={(e) => updateFormData('storageLimit', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'features' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Available Features</h3>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(formData.features || {}).map(([key, value]) => (
                <label key={key} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
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
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Clinic Settings</h3>
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
                    {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
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
