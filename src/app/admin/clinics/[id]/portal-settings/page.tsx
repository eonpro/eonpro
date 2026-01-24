'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  Palette,
  Image,
  Save,
  Check,
  AlertCircle,
  Eye,
  Upload,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Plus,
} from 'lucide-react';
import { BrandingImageUploader } from '@/components/admin/BrandingImageUploader';

interface PortalSettings {
  logoUrl: string | null;
  iconUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  customCss: string | null;
  features: {
    showBMICalculator: boolean;
    showCalorieCalculator: boolean;
    showDoseCalculator: boolean;
    showShipmentTracking: boolean;
    showMedicationReminders: boolean;
    showWeightTracking: boolean;
    showResources: boolean;
    showBilling: boolean;
  };
  resourceVideos: Array<{
    id: string;
    title: string;
    description: string;
    url: string;
    thumbnail: string;
    category: string;
  }>;
}

const defaultSettings: PortalSettings = {
  logoUrl: null,
  iconUrl: null,
  faviconUrl: null,
  primaryColor: '#4fa77e',
  secondaryColor: '#3B82F6',
  accentColor: '#d3f931',
  customCss: null,
  features: {
    showBMICalculator: true,
    showCalorieCalculator: true,
    showDoseCalculator: true,
    showShipmentTracking: true,
    showMedicationReminders: true,
    showWeightTracking: true,
    showResources: true,
    showBilling: true,
  },
  resourceVideos: [],
};

export default function ClinicPortalSettingsPage() {
  const router = useRouter();
  const params = useParams();
  const clinicId = params.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [clinicName, setClinicName] = useState('');

  const [settings, setSettings] = useState<PortalSettings>(defaultSettings);
  const [previewMode, setPreviewMode] = useState(false);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchSettings();
  }, [clinicId]);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/patient-portal/branding?clinicId=${clinicId}`);

      if (response.ok) {
        const data = await response.json();
        setClinicName(data.clinicName);
        setSettings({
          logoUrl: data.logoUrl,
          iconUrl: data.iconUrl,
          faviconUrl: data.faviconUrl,
          primaryColor: data.primaryColor || '#4fa77e',
          secondaryColor: data.secondaryColor || '#3B82F6',
          accentColor: data.accentColor || '#d3f931',
          customCss: data.customCss,
          features: { ...defaultSettings.features, ...data.features },
          resourceVideos: data.resourceVideos || [],
        });
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');

    try {
      const response = await fetch('/api/patient-portal/branding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId: parseInt(clinicId as string),
          ...settings,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleColorChange = (field: keyof PortalSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleFeatureToggle = (feature: keyof typeof settings.features) => {
    setSettings((prev) => ({
      ...prev,
      features: {
        ...prev.features,
        [feature]: !prev.features[feature],
      },
    }));
    setSaved(false);
  };

  const handleFileUpload = async (type: 'logo' | 'favicon', file: File) => {
    // In production, upload to S3/storage and get URL
    // For now, create a local preview URL
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (type === 'logo') {
        setSettings((prev) => ({ ...prev, logoUrl: dataUrl }));
      } else {
        setSettings((prev) => ({ ...prev, faviconUrl: dataUrl }));
      }
      setSaved(false);
    };
    reader.readAsDataURL(file);
  };

  const addResourceVideo = () => {
    setSettings((prev) => ({
      ...prev,
      resourceVideos: [
        ...prev.resourceVideos,
        {
          id: Date.now().toString(),
          title: '',
          description: '',
          url: '',
          thumbnail: '',
          category: 'tutorials',
        },
      ],
    }));
    setSaved(false);
  };

  const updateResourceVideo = (index: number, field: string, value: string) => {
    setSettings((prev) => ({
      ...prev,
      resourceVideos: prev.resourceVideos.map((video, i) =>
        i === index ? { ...video, [field]: value } : video
      ),
    }));
    setSaved(false);
  };

  const removeResourceVideo = (index: number) => {
    setSettings((prev) => ({
      ...prev,
      resourceVideos: prev.resourceVideos.filter((_, i) => i !== index),
    }));
    setSaved(false);
  };

  const Toggle = ({ enabled, onChange }: { enabled: boolean; onChange: () => void }) => (
    <button
      type="button"
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        enabled ? 'bg-[#4fa77e]' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#efece7]">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-[#4fa77e] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#efece7] p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <button
            onClick={() => router.back()}
            className="mb-2 flex items-center gap-2 text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Patient Portal Settings</h1>
          <p className="mt-1 text-gray-500">Configure white-label branding for {clinicName}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setPreviewMode(!previewMode)}
            className="flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
          >
            <Eye className="h-4 w-4" />
            {previewMode ? 'Hide Preview' : 'Preview'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-2 rounded-xl px-5 py-2 font-medium transition-all ${
              saved ? 'bg-[#4fa77e] text-white' : 'bg-[#4fa77e] text-white hover:bg-[#3d9268]'
            }`}
          >
            {saving ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : saved ? (
              <Check className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          <AlertCircle className="h-5 w-5" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Settings Panels */}
        <div className="space-y-6 lg:col-span-2">
          {/* Logo, Icon & Favicon */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Image className="h-5 w-5 text-[#4fa77e]" />
              Branding Assets
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              Upload your clinic's logo, icon, and favicon to white-label the platform for your patients.
            </p>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <BrandingImageUploader
                label="Logo"
                description="Main logo displayed in header and emails"
                imageUrl={settings.logoUrl}
                onImageChange={(url) => {
                  setSettings((prev) => ({ ...prev, logoUrl: url }));
                  setSaved(false);
                }}
                imageType="logo"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                maxSizeMB={2}
                recommendedSize="Recommended: 400x100px, transparent PNG or SVG"
                clinicId={parseInt(clinicId as string)}
              />

              <BrandingImageUploader
                label="App Icon"
                description="Square icon for mobile apps and PWA"
                imageUrl={settings.iconUrl}
                onImageChange={(url) => {
                  setSettings((prev) => ({ ...prev, iconUrl: url }));
                  setSaved(false);
                }}
                imageType="icon"
                accept="image/png,image/jpeg"
                maxSizeMB={1}
                recommendedSize="Required: 192x192px square PNG"
                clinicId={parseInt(clinicId as string)}
              />

              <BrandingImageUploader
                label="Favicon"
                description="Small icon shown in browser tabs"
                imageUrl={settings.faviconUrl}
                onImageChange={(url) => {
                  setSettings((prev) => ({ ...prev, faviconUrl: url }));
                  setSaved(false);
                }}
                imageType="favicon"
                accept="image/png,image/x-icon,.ico"
                maxSizeMB={0.1}
                recommendedSize="Required: 32x32px or 16x16px"
                clinicId={parseInt(clinicId as string)}
              />
            </div>
          </div>

          {/* Colors */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Palette className="h-5 w-5 text-[#4fa77e]" />
              Brand Colors
            </h2>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Primary Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={settings.primaryColor}
                    onChange={(e) => handleColorChange('primaryColor', e.target.value)}
                    className="h-10 w-12 cursor-pointer rounded-lg border border-gray-200"
                  />
                  <input
                    type="text"
                    value={settings.primaryColor}
                    onChange={(e) => handleColorChange('primaryColor', e.target.value)}
                    className="flex-1 rounded-xl border border-gray-200 px-3 py-2 font-mono text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Secondary Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={settings.secondaryColor}
                    onChange={(e) => handleColorChange('secondaryColor', e.target.value)}
                    className="h-10 w-12 cursor-pointer rounded-lg border border-gray-200"
                  />
                  <input
                    type="text"
                    value={settings.secondaryColor}
                    onChange={(e) => handleColorChange('secondaryColor', e.target.value)}
                    className="flex-1 rounded-xl border border-gray-200 px-3 py-2 font-mono text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Accent Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={settings.accentColor}
                    onChange={(e) => handleColorChange('accentColor', e.target.value)}
                    className="h-10 w-12 cursor-pointer rounded-lg border border-gray-200"
                  />
                  <input
                    type="text"
                    value={settings.accentColor}
                    onChange={(e) => handleColorChange('accentColor', e.target.value)}
                    className="flex-1 rounded-xl border border-gray-200 px-3 py-2 font-mono text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Feature Toggles */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
              <ToggleRight className="h-5 w-5 text-[#4fa77e]" />
              Feature Toggles
            </h2>

            <div className="space-y-4">
              {[
                {
                  key: 'showWeightTracking',
                  label: 'Weight Tracking',
                  desc: 'Allow patients to log and track weight',
                },
                {
                  key: 'showBMICalculator',
                  label: 'BMI Calculator',
                  desc: 'Show BMI calculator tool',
                },
                {
                  key: 'showCalorieCalculator',
                  label: 'Calorie Calculator',
                  desc: 'Show calorie deficit calculator',
                },
                {
                  key: 'showDoseCalculator',
                  label: 'Dose Calculator',
                  desc: 'Show medication dose calculator',
                },
                {
                  key: 'showMedicationReminders',
                  label: 'Medication Reminders',
                  desc: 'Calendar reminder functionality',
                },
                {
                  key: 'showShipmentTracking',
                  label: 'Shipment Tracking',
                  desc: 'Order tracking functionality',
                },
                {
                  key: 'showResources',
                  label: 'Resources & Videos',
                  desc: 'Tutorial videos and guides',
                },
                {
                  key: 'showBilling',
                  label: 'Billing & Subscription',
                  desc: 'Payment and subscription management',
                },
              ].map(({ key, label, desc }) => (
                <div
                  key={key}
                  className="flex items-center justify-between border-b border-gray-100 py-2 last:border-0"
                >
                  <div>
                    <p className="font-medium text-gray-900">{label}</p>
                    <p className="text-sm text-gray-500">{desc}</p>
                  </div>
                  <Toggle
                    enabled={settings.features[key as keyof typeof settings.features]}
                    onChange={() => handleFeatureToggle(key as keyof typeof settings.features)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Resource Videos */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Resource Videos</h2>
              <button
                onClick={addResourceVideo}
                className="flex items-center gap-2 rounded-lg bg-[#4fa77e] px-3 py-1.5 text-sm text-white hover:bg-[#3d9268]"
              >
                <Plus className="h-4 w-4" />
                Add Video
              </button>
            </div>

            {settings.resourceVideos.length === 0 ? (
              <p className="text-sm text-gray-500">
                No videos added yet. Add tutorial videos for your patients.
              </p>
            ) : (
              <div className="space-y-4">
                {settings.resourceVideos.map((video, index) => (
                  <div key={video.id} className="rounded-xl border border-gray-200 p-4">
                    <div className="mb-3 flex items-start justify-between">
                      <span className="text-sm font-medium text-gray-500">Video #{index + 1}</span>
                      <button
                        onClick={() => removeResourceVideo(index)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Title"
                        value={video.title}
                        onChange={(e) => updateResourceVideo(index, 'title', e.target.value)}
                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        placeholder="Category"
                        value={video.category}
                        onChange={(e) => updateResourceVideo(index, 'category', e.target.value)}
                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                      <input
                        type="url"
                        placeholder="Video URL"
                        value={video.url}
                        onChange={(e) => updateResourceVideo(index, 'url', e.target.value)}
                        className="col-span-2 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                      <textarea
                        placeholder="Description"
                        value={video.description}
                        onChange={(e) => updateResourceVideo(index, 'description', e.target.value)}
                        className="col-span-2 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        rows={2}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Preview Panel */}
        <div className="lg:col-span-1">
          <div className="sticky top-8">
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
                <Eye className="h-5 w-5 text-[#4fa77e]" />
                Live Preview
              </h2>

              {/* Mobile Phone Frame Preview */}
              <div className="mx-auto max-w-[280px] rounded-[2rem] bg-gray-900 p-2">
                <div className="overflow-hidden rounded-[1.5rem] bg-[#efece7]">
                  {/* Preview Header */}
                  <div className="flex items-center gap-3 bg-white px-4 py-3">
                    {settings.logoUrl ? (
                      <img src={settings.logoUrl} alt="Logo" className="h-6 w-auto" />
                    ) : (
                      <div
                        className="flex h-6 w-6 items-center justify-center rounded text-xs font-bold text-white"
                        style={{ backgroundColor: settings.primaryColor }}
                      >
                        {clinicName?.[0] || 'E'}
                      </div>
                    )}
                    <span className="truncate text-sm font-semibold text-gray-900">
                      {clinicName || 'Clinic'}
                    </span>
                  </div>

                  {/* Preview Content */}
                  <div className="space-y-3 p-4">
                    {/* Weight Card */}
                    <div
                      className="rounded-xl p-4"
                      style={{ backgroundColor: settings.accentColor }}
                    >
                      <p className="text-xs font-medium opacity-70" style={{ color: '#333' }}>
                        Current Weight
                      </p>
                      <p className="text-2xl font-bold" style={{ color: '#333' }}>
                        168 lbs
                      </p>
                      <p className="text-xs" style={{ color: '#166534' }}>
                        ↓ Down 32 lbs
                      </p>
                    </div>

                    {/* Quick Stats */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-white p-3">
                        <div
                          className="mb-1 h-6 w-6 rounded"
                          style={{ backgroundColor: `${settings.primaryColor}20` }}
                        />
                        <p className="text-[10px] text-gray-500">Next Dose</p>
                        <p className="text-xs font-medium">Wed 8AM</p>
                      </div>
                      <div className="rounded-lg bg-white p-3">
                        <div className="mb-1 h-6 w-6 rounded bg-blue-50" />
                        <p className="text-[10px] text-gray-500">Shipment</p>
                        <p className="text-xs font-medium">In Transit</p>
                      </div>
                    </div>

                    {/* Treatment Card */}
                    <div className="overflow-hidden rounded-xl bg-white">
                      <div className="px-3 py-2" style={{ backgroundColor: settings.primaryColor }}>
                        <p className="text-xs font-medium text-white">Treatment</p>
                      </div>
                      <div className="p-3">
                        <p className="text-sm font-medium">Semaglutide</p>
                        <button
                          className="mt-2 w-full rounded-lg py-1.5 text-xs text-white"
                          style={{ backgroundColor: settings.primaryColor }}
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Preview Bottom Nav */}
                  <div className="flex justify-around bg-white px-2 py-2">
                    {['Home', 'Progress', 'Meds', 'Tools', 'Profile'].map((item, i) => (
                      <div key={item} className="text-center">
                        <div
                          className={`mx-auto mb-0.5 h-5 w-5 rounded ${i === 0 ? '' : 'bg-gray-200'}`}
                          style={i === 0 ? { backgroundColor: `${settings.primaryColor}20` } : {}}
                        />
                        <span
                          className="text-[8px]"
                          style={{ color: i === 0 ? settings.primaryColor : '#9ca3af' }}
                        >
                          {item}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Color Swatches */}
              <div className="mt-6">
                <p className="mb-2 text-sm font-medium text-gray-700">Color Palette</p>
                <div className="flex gap-2">
                  <div
                    className="h-12 w-12 rounded-xl shadow-inner"
                    style={{ backgroundColor: settings.primaryColor }}
                    title="Primary"
                  />
                  <div
                    className="h-12 w-12 rounded-xl shadow-inner"
                    style={{ backgroundColor: settings.secondaryColor }}
                    title="Secondary"
                  />
                  <div
                    className="h-12 w-12 rounded-xl shadow-inner"
                    style={{ backgroundColor: settings.accentColor }}
                    title="Accent"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
