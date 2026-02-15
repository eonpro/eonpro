'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Save,
  Building2,
  Globe,
  Palette,
  Mail,
  Phone,
  MapPin,
  CreditCard,
  Settings,
} from 'lucide-react';
import { US_STATES } from '@/components/AddressAutocomplete';
import { BrandingImageUploader } from '@/components/admin/BrandingImageUploader';
import { apiFetch } from '@/lib/api/fetch';

// Helper function to calculate text color based on background luminance
function getTextColorForBg(hex: string, mode: 'auto' | 'light' | 'dark'): string {
  if (mode === 'light') return '#ffffff';
  if (mode === 'dark') return '#1f2937';

  // Auto mode: calculate based on luminance
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '#ffffff';

  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;

  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.5 ? '#1f2937' : '#ffffff';
}

export default function CreateClinicPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('basic');

  useEffect(() => {
    const user = localStorage.getItem('user');
    const token = localStorage.getItem('auth-token');

    if (!token) {
      setError('Please log in to access this page');
      setTimeout(() => router.push('/login'), 2000);
      return;
    }
    if (user) {
      try {
        const userData = JSON.parse(user);
        const role = userData.role?.toLowerCase();
        if (role !== 'super_admin') {
          setError('Access denied. Super Admin privileges required.');
          setTimeout(() => router.push('/admin'), 2000);
          return;
        }
      } catch {
        localStorage.removeItem('user');
        setTimeout(() => router.push('/login'), 2000);
        return;
      }
    }
  }, [router]);

  const [formData, setFormData] = useState({
    // Basic Info
    name: '',
    subdomain: '',
    customDomain: '',
    adminEmail: '',
    supportEmail: '',
    phone: '',
    timezone: 'America/New_York',

    // Address
    address1: '',
    address2: '',
    city: '',
    state: '',
    zip: '',

    // Branding
    primaryColor: '#10B981',
    secondaryColor: '#3B82F6',
    accentColor: '#d3f931',
    buttonTextColor: 'auto' as 'auto' | 'light' | 'dark',
    logoUrl: '',
    iconUrl: '',
    faviconUrl: '',

    // Plan & Limits
    billingPlan: 'starter',
    patientLimit: 100,
    providerLimit: 5,
    storageLimit: 5000,

    // Features
    features: {
      telehealth: true,
      prescriptions: true,
      billing: true,
      messaging: true,
      patientPortal: true,
      analytics: true,
      apiAccess: false,
      customBranding: false,
      multiLocation: false,
    },
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;

    if (name.startsWith('features.')) {
      const featureName = name.replace('features.', '');
      setFormData((prev) => ({
        ...prev,
        features: {
          ...prev.features,
          [featureName]: (e.target as HTMLInputElement).checked,
        },
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: type === 'number' ? parseInt(value) : value,
      }));
    }
  };

  const generateSubdomain = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setFormData((prev) => ({
      ...prev,
      name,
      subdomain: prev.subdomain || generateSubdomain(name),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await apiFetch('/api/super-admin/clinics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          settings: {
            branding: {
              primaryColor: formData.primaryColor,
              secondaryColor: formData.secondaryColor,
              accentColor: formData.accentColor,
              buttonTextColor: formData.buttonTextColor,
              logoUrl: formData.logoUrl,
              iconUrl: formData.iconUrl,
              faviconUrl: formData.faviconUrl,
            },
          },
          address: {
            address1: formData.address1,
            address2: formData.address2,
            city: formData.city,
            state: formData.state,
            zip: formData.zip,
          },
        }),
      });

      const data = await response.json();

      if (response.ok) {
        router.push('/super-admin/clinics');
      } else {
        setError(data.error || 'Failed to create clinic');
      }
    } catch (err) {
      setError('An error occurred while creating the clinic');
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'basic', label: 'Basic Info', icon: Building2 },
    { id: 'branding', label: 'Branding', icon: Palette },
    { id: 'features', label: 'Features', icon: Settings },
    { id: 'billing', label: 'Plan & Limits', icon: CreditCard },
  ];

  const plans = [
    { id: 'starter', name: 'Starter', patients: 100, providers: 5, storage: 5000 },
    { id: 'professional', name: 'Professional', patients: 500, providers: 20, storage: 25000 },
    { id: 'enterprise', name: 'Enterprise', patients: -1, providers: -1, storage: 100000 },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <button
            onClick={() => router.back()}
            className="mb-4 flex items-center text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="mr-2 h-5 w-5" />
            Back to Clinics
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Create New Clinic</h1>
          <p className="mt-1 text-gray-600">
            Set up a new clinic with custom branding and features
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-8">
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 flex gap-2 border-b border-gray-200">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'border-emerald-500 text-emerald-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <form onSubmit={handleSubmit}>
          {/* Basic Info Tab */}
          {activeTab === 'basic' && (
            <div className="space-y-6">
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 flex items-center text-lg font-semibold text-gray-900">
                  <Building2 className="mr-2 h-5 w-5 text-emerald-600" />
                  Clinic Information
                </h2>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Clinic Name *
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleNameChange}
                      required
                      placeholder="e.g., Tampa Medical Center"
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Subdomain *
                    </label>
                    <div className="flex items-center">
                      <input
                        type="text"
                        name="subdomain"
                        value={formData.subdomain}
                        onChange={handleChange}
                        required
                        placeholder="tampa-medical"
                        className="flex-1 rounded-l-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <span className="rounded-r-lg border border-l-0 border-gray-300 bg-gray-100 px-4 py-2 text-sm text-gray-500">
                        .eonpro.io
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Custom Domain (Optional)
                    </label>
                    <input
                      type="text"
                      name="customDomain"
                      value={formData.customDomain}
                      onChange={handleChange}
                      placeholder="portal.yourclinic.com"
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Admin Email *
                    </label>
                    <input
                      type="email"
                      name="adminEmail"
                      value={formData.adminEmail}
                      onChange={handleChange}
                      required
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Support Email
                    </label>
                    <input
                      type="email"
                      name="supportEmail"
                      value={formData.supportEmail}
                      onChange={handleChange}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Phone</label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Timezone</label>
                    <select
                      name="timezone"
                      value={formData.timezone}
                      onChange={handleChange}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="America/New_York">Eastern Time</option>
                      <option value="America/Chicago">Central Time</option>
                      <option value="America/Denver">Mountain Time</option>
                      <option value="America/Los_Angeles">Pacific Time</option>
                    </select>
                  </div>
                </div>
              </div>

              <ClinicAddressSection
                formData={formData}
                handleChange={handleChange}
                setFormData={setFormData}
              />
            </div>
          )}

          {/* Branding Tab */}
          {activeTab === 'branding' && (
            <div className="space-y-6">
              {/* Logo, Icon & Favicon Upload */}
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 flex items-center text-lg font-semibold text-gray-900">
                  <Palette className="mr-2 h-5 w-5 text-emerald-600" />
                  Branding Assets
                </h2>
                <p className="mb-6 text-sm text-gray-500">
                  Upload your clinic's logo, icon, and favicon to white-label the platform for your
                  members.
                </p>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                  <BrandingImageUploader
                    label="Logo"
                    description="Main logo displayed in header and emails"
                    imageUrl={formData.logoUrl || null}
                    onImageChange={(url) =>
                      setFormData((prev) => ({ ...prev, logoUrl: url || '' }))
                    }
                    imageType="logo"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    maxSizeMB={2}
                    recommendedSize="Recommended: 400x100px, transparent PNG or SVG"
                  />

                  <BrandingImageUploader
                    label="App Icon"
                    description="Square icon for mobile apps and PWA"
                    imageUrl={formData.iconUrl || null}
                    onImageChange={(url) =>
                      setFormData((prev) => ({ ...prev, iconUrl: url || '' }))
                    }
                    imageType="icon"
                    accept="image/png,image/jpeg"
                    maxSizeMB={1}
                    recommendedSize="Required: 192x192px square PNG"
                  />

                  <BrandingImageUploader
                    label="Favicon"
                    description="Small icon shown in browser tabs"
                    imageUrl={formData.faviconUrl || null}
                    onImageChange={(url) =>
                      setFormData((prev) => ({ ...prev, faviconUrl: url || '' }))
                    }
                    imageType="favicon"
                    accept="image/png,image/x-icon,.ico"
                    maxSizeMB={0.1}
                    recommendedSize="Required: 32x32px or 16x16px"
                  />
                </div>
              </div>

              {/* Brand Colors */}
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-lg font-semibold text-gray-900">Brand Colors</h2>
                <p className="mb-6 text-sm text-gray-500">
                  Define your clinic's color palette for a consistent brand experience.
                </p>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Primary Color
                    </label>
                    <p className="mb-2 text-xs text-gray-500">
                      Main brand color for buttons and links
                    </p>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        name="primaryColor"
                        value={
                          /^#[0-9A-Fa-f]{6}$/.test(formData.primaryColor)
                            ? formData.primaryColor
                            : '#10B981'
                        }
                        onChange={handleChange}
                        className="h-10 w-14 cursor-pointer rounded border border-gray-300"
                      />
                      <input
                        type="text"
                        value={formData.primaryColor}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, primaryColor: e.target.value }))
                        }
                        placeholder="#10B981"
                        className="flex-1 rounded-lg border border-gray-300 px-4 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Secondary Color
                    </label>
                    <p className="mb-2 text-xs text-gray-500">Supporting color for backgrounds</p>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        name="secondaryColor"
                        value={
                          /^#[0-9A-Fa-f]{6}$/.test(formData.secondaryColor)
                            ? formData.secondaryColor
                            : '#3B82F6'
                        }
                        onChange={handleChange}
                        className="h-10 w-14 cursor-pointer rounded border border-gray-300"
                      />
                      <input
                        type="text"
                        value={formData.secondaryColor}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, secondaryColor: e.target.value }))
                        }
                        placeholder="#3B82F6"
                        className="flex-1 rounded-lg border border-gray-300 px-4 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Accent Color
                    </label>
                    <p className="mb-2 text-xs text-gray-500">
                      Highlight color for badges and alerts
                    </p>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        name="accentColor"
                        value={
                          /^#[0-9A-Fa-f]{6}$/.test(formData.accentColor)
                            ? formData.accentColor
                            : '#d3f931'
                        }
                        onChange={handleChange}
                        className="h-10 w-14 cursor-pointer rounded border border-gray-300"
                      />
                      <input
                        type="text"
                        value={formData.accentColor}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, accentColor: e.target.value }))
                        }
                        placeholder="#d3f931"
                        className="flex-1 rounded-lg border border-gray-300 px-4 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Button Text Color */}
                <div className="mt-6 border-t border-gray-200 pt-6">
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Button Text Color
                  </label>
                  <p className="mb-3 text-xs text-gray-500">
                    Control the text color inside buttons. Auto mode calculates based on background
                    brightness.
                  </p>
                  <div className="flex gap-3">
                    {[
                      { value: 'auto', label: 'Auto', desc: 'Calculate from background' },
                      { value: 'light', label: 'Light (White)', desc: 'Always use white text' },
                      { value: 'dark', label: 'Dark (Black)', desc: 'Always use dark text' },
                    ].map((option) => (
                      <label
                        key={option.value}
                        className={`flex-1 cursor-pointer rounded-lg border-2 p-3 transition-all ${
                          formData.buttonTextColor === option.value
                            ? 'border-emerald-500 bg-emerald-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="buttonTextColor"
                          value={option.value}
                          checked={formData.buttonTextColor === option.value}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              buttonTextColor: e.target.value as 'auto' | 'light' | 'dark',
                            }))
                          }
                          className="sr-only"
                        />
                        <div className="text-sm font-medium text-gray-900">{option.label}</div>
                        <div className="text-xs text-gray-500">{option.desc}</div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-lg font-semibold text-gray-900">Live Preview</h2>
                <div className="rounded-xl bg-gray-100 p-6">
                  {/* Header Preview */}
                  <div className="mb-4 rounded-lg bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      {formData.logoUrl ? (
                        <img
                          src={formData.logoUrl}
                          alt="Logo"
                          className="h-10 max-w-[150px] object-contain"
                        />
                      ) : (
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-lg font-bold"
                          style={{
                            backgroundColor: formData.primaryColor,
                            color: getTextColorForBg(
                              formData.primaryColor,
                              formData.buttonTextColor
                            ),
                          }}
                        >
                          {formData.name?.[0] || 'C'}
                        </div>
                      )}
                      <span className="text-lg font-semibold">
                        {formData.name || 'Clinic Name'}
                      </span>
                    </div>
                  </div>

                  {/* UI Elements Preview */}
                  <div className="rounded-lg bg-white p-4 shadow-sm">
                    <div className="mb-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        className="rounded-lg px-4 py-2 text-sm font-medium"
                        style={{
                          backgroundColor: formData.primaryColor,
                          color: getTextColorForBg(formData.primaryColor, formData.buttonTextColor),
                        }}
                      >
                        Primary Button
                      </button>
                      <button
                        type="button"
                        className="rounded-lg px-4 py-2 text-sm font-medium"
                        style={{
                          backgroundColor: formData.secondaryColor,
                          color: getTextColorForBg(
                            formData.secondaryColor,
                            formData.buttonTextColor
                          ),
                        }}
                      >
                        Secondary Button
                      </button>
                      <span
                        className="rounded-full px-3 py-1 text-xs font-medium"
                        style={{
                          backgroundColor: formData.accentColor,
                          color: getTextColorForBg(formData.accentColor, formData.buttonTextColor),
                        }}
                      >
                        Accent Badge
                      </span>
                    </div>

                    {/* Color Swatches */}
                    <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
                      <span className="mr-2 text-xs text-gray-500">Color Palette:</span>
                      <div
                        className="h-8 w-8 rounded-lg shadow-inner"
                        style={{ backgroundColor: formData.primaryColor }}
                        title="Primary"
                      />
                      <div
                        className="h-8 w-8 rounded-lg shadow-inner"
                        style={{ backgroundColor: formData.secondaryColor }}
                        title="Secondary"
                      />
                      <div
                        className="h-8 w-8 rounded-lg border border-gray-200 shadow-inner"
                        style={{ backgroundColor: formData.accentColor }}
                        title="Accent"
                      />
                      {(formData.iconUrl || formData.faviconUrl) && (
                        <>
                          <span className="ml-4 mr-2 text-xs text-gray-500">Icons:</span>
                          {formData.iconUrl && (
                            <img src={formData.iconUrl} alt="Icon" className="h-8 w-8 rounded" />
                          )}
                          {formData.faviconUrl && (
                            <img src={formData.faviconUrl} alt="Favicon" className="h-4 w-4" />
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Features Tab */}
          {activeTab === 'features' && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 flex items-center text-lg font-semibold text-gray-900">
                <Settings className="mr-2 h-5 w-5 text-emerald-600" />
                Enabled Features
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {Object.entries(formData.features).map(([key, value]) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center justify-between rounded-lg bg-gray-50 p-4 hover:bg-gray-100"
                  >
                    <span className="font-medium capitalize text-gray-700">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                    <input
                      type="checkbox"
                      name={`features.${key}`}
                      checked={value}
                      onChange={handleChange}
                      className="h-5 w-5 rounded text-emerald-600 focus:ring-emerald-500"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Billing Tab */}
          {activeTab === 'billing' && (
            <div className="space-y-6">
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 flex items-center text-lg font-semibold text-gray-900">
                  <CreditCard className="mr-2 h-5 w-5 text-emerald-600" />
                  Billing Plan
                </h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {plans.map((plan) => (
                    <label
                      key={plan.id}
                      className={`relative cursor-pointer rounded-lg border-2 p-4 transition-all ${
                        formData.billingPlan === plan.id
                          ? 'border-emerald-500 bg-emerald-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="billingPlan"
                        value={plan.id}
                        checked={formData.billingPlan === plan.id}
                        onChange={handleChange}
                        className="sr-only"
                      />
                      <div className="text-center">
                        <h3 className="font-semibold text-gray-900">{plan.name}</h3>
                        <div className="mt-2 text-sm text-gray-600">
                          <p>{plan.patients === -1 ? 'Unlimited' : plan.patients} patients</p>
                          <p>{plan.providers === -1 ? 'Unlimited' : plan.providers} providers</p>
                          <p>{(plan.storage / 1000).toFixed(0)} GB storage</p>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-lg font-semibold text-gray-900">Custom Limits</h2>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Patient Limit
                    </label>
                    <input
                      type="number"
                      name="patientLimit"
                      value={formData.patientLimit}
                      onChange={handleChange}
                      min="-1"
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <p className="mt-1 text-xs text-gray-500">-1 for unlimited</p>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Provider Limit
                    </label>
                    <input
                      type="number"
                      name="providerLimit"
                      value={formData.providerLimit}
                      onChange={handleChange}
                      min="-1"
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <p className="mt-1 text-xs text-gray-500">-1 for unlimited</p>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Storage Limit (MB)
                    </label>
                    <input
                      type="number"
                      name="storageLimit"
                      value={formData.storageLimit}
                      onChange={handleChange}
                      min="100"
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <div className="mt-8 flex justify-end gap-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-lg border border-gray-300 px-6 py-3 text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`flex items-center gap-2 rounded-lg px-6 py-3 font-medium text-white transition-colors ${
                loading ? 'cursor-not-allowed bg-gray-400' : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {loading ? (
                <>
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
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
    </div>
  );
}

// Address Section Component with Google Maps Autocomplete
function ClinicAddressSection({
  formData,
  handleChange,
  setFormData,
}: {
  formData: any;
  handleChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => void;
  setFormData: React.Dispatch<React.SetStateAction<any>>;
}) {
  const addressInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let autocompleteInstance: any = null;
    let intervalId: NodeJS.Timeout | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    const initializeAutocomplete = () => {
      if (
        typeof window === 'undefined' ||
        !(window as any).google?.maps?.places?.Autocomplete ||
        !addressInputRef.current
      ) {
        return false;
      }

      try {
        autocompleteInstance = new (window as any).google.maps.places.Autocomplete(
          addressInputRef.current,
          {
            componentRestrictions: { country: 'us' },
            fields: ['address_components', 'formatted_address'],
            types: ['address'],
          }
        );

        autocompleteInstance.addListener('place_changed', () => {
          const place = autocompleteInstance.getPlace();
          if (place.address_components) {
            let streetNumber = '';
            let streetName = '';
            let city = '';
            let state = '';
            let zip = '';

            place.address_components.forEach((component: any) => {
              const types = component.types;
              if (types.includes('street_number')) streetNumber = component.long_name;
              if (types.includes('route')) streetName = component.long_name;
              if (types.includes('locality')) city = component.long_name;
              if (types.includes('administrative_area_level_1')) state = component.short_name;
              if (types.includes('postal_code')) zip = component.long_name;
            });

            setFormData((prev: any) => ({
              ...prev,
              address1: `${streetNumber} ${streetName}`.trim(),
              city,
              state,
              zip,
            }));
          }
        });

        return true;
      } catch (error) {
        console.error('Error initializing Google Maps Autocomplete:', error);
        return false;
      }
    };

    // Try immediately
    if (!initializeAutocomplete()) {
      // Poll for Google Maps to be loaded
      intervalId = setInterval(() => {
        if (initializeAutocomplete()) {
          if (intervalId) clearInterval(intervalId);
          if (timeoutId) clearTimeout(timeoutId);
        }
      }, 500);

      // Timeout after 10 seconds
      timeoutId = setTimeout(() => {
        if (intervalId) clearInterval(intervalId);
      }, 10000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [setFormData]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 flex items-center text-lg font-semibold text-gray-900">
        <MapPin className="mr-2 h-5 w-5 text-emerald-600" />
        Address
      </h2>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium text-gray-700">Street Address</label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              ref={addressInputRef}
              type="text"
              name="address1"
              value={formData.address1}
              onChange={handleChange}
              placeholder="Start typing to search..."
              className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Start typing to use Google Maps address autocomplete
          </p>
        </div>
        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Suite/Unit (Optional)
          </label>
          <input
            type="text"
            name="address2"
            value={formData.address2}
            onChange={handleChange}
            placeholder="Apt, Suite, Unit, etc."
            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">City</label>
          <input
            type="text"
            name="city"
            value={formData.city}
            onChange={handleChange}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">State</label>
            <select
              name="state"
              value={formData.state}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Select</option>
              {US_STATES.map((state) => (
                <option key={state.code} value={state.code}>
                  {state.code}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">ZIP</label>
            <input
              type="text"
              name="zip"
              value={formData.zip}
              onChange={handleChange}
              maxLength={5}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
