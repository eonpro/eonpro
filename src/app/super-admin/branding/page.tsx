'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Palette, Globe, Image, Type, Save,
  Check, AlertCircle, Eye
} from 'lucide-react';

interface PlatformBranding {
  platformName: string;
  tagline: string;
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  footerText: string;
  supportEmail: string;
  supportPhone: string;
  termsUrl: string;
  privacyUrl: string;
}

export default function WhiteLabelBrandingPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const [branding, setBranding] = useState<PlatformBranding>({
    platformName: 'EONPRO',
    tagline: 'HIPAA Compliant Healthcare Platform',
    logoUrl: '',
    faviconUrl: '',
    primaryColor: '#4fa77e',
    secondaryColor: '#3B82F6',
    accentColor: '#8B5CF6',
    footerText: '© 2024 EONPRO. All rights reserved.',
    supportEmail: 'support@eonpro.com',
    supportPhone: '',
    termsUrl: '/terms',
    privacyUrl: '/privacy',
  });

  const handleChange = (field: keyof PlatformBranding, value: string) => {
    setBranding(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');

    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError('Failed to save branding settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 min-h-screen">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">White Label Settings</h1>
          <p className="text-gray-500 mt-1">Customize platform branding and appearance</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all shadow-sm ${
            saved
              ? 'bg-[#4fa77e] text-white'
              : 'bg-[#4fa77e] text-white hover:bg-[#3d9268]'
          }`}
        >
          {saving ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
              Saving...
            </>
          ) : saved ? (
            <>
              <Check className="h-5 w-5" />
              Saved!
            </>
          ) : (
            <>
              <Save className="h-5 w-5" />
              Save Changes
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700">
          <AlertCircle className="h-5 w-5" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Settings Panel */}
        <div className="lg:col-span-2 space-y-6">
          {/* Platform Identity */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Globe className="h-5 w-5 text-[#4fa77e]" />
              Platform Identity
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Platform Name
                </label>
                <input
                  type="text"
                  value={branding.platformName}
                  onChange={(e) => handleChange('platformName', e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#4fa77e]/20 focus:border-[#4fa77e]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tagline
                </label>
                <input
                  type="text"
                  value={branding.tagline}
                  onChange={(e) => handleChange('tagline', e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#4fa77e]/20 focus:border-[#4fa77e]"
                />
              </div>
            </div>
          </div>

          {/* Logos */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Image className="h-5 w-5 text-[#4fa77e]" />
              Logos & Icons
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Logo URL
                </label>
                <input
                  type="url"
                  value={branding.logoUrl}
                  onChange={(e) => handleChange('logoUrl', e.target.value)}
                  placeholder="https://example.com/logo.png"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#4fa77e]/20 focus:border-[#4fa77e]"
                />
                <p className="text-xs text-gray-500 mt-1">Recommended: 200x50px, PNG or SVG</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Favicon URL
                </label>
                <input
                  type="url"
                  value={branding.faviconUrl}
                  onChange={(e) => handleChange('faviconUrl', e.target.value)}
                  placeholder="https://example.com/favicon.ico"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#4fa77e]/20 focus:border-[#4fa77e]"
                />
                <p className="text-xs text-gray-500 mt-1">Recommended: 32x32px, ICO or PNG</p>
              </div>
            </div>
          </div>

          {/* Colors */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Palette className="h-5 w-5 text-[#4fa77e]" />
              Brand Colors
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Primary Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={branding.primaryColor}
                    onChange={(e) => handleChange('primaryColor', e.target.value)}
                    className="w-12 h-10 rounded-lg cursor-pointer border border-gray-200"
                  />
                  <input
                    type="text"
                    value={branding.primaryColor}
                    onChange={(e) => handleChange('primaryColor', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Secondary Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={branding.secondaryColor}
                    onChange={(e) => handleChange('secondaryColor', e.target.value)}
                    className="w-12 h-10 rounded-lg cursor-pointer border border-gray-200"
                  />
                  <input
                    type="text"
                    value={branding.secondaryColor}
                    onChange={(e) => handleChange('secondaryColor', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Accent Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={branding.accentColor}
                    onChange={(e) => handleChange('accentColor', e.target.value)}
                    className="w-12 h-10 rounded-lg cursor-pointer border border-gray-200"
                  />
                  <input
                    type="text"
                    value={branding.accentColor}
                    onChange={(e) => handleChange('accentColor', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer & Legal */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Type className="h-5 w-5 text-[#4fa77e]" />
              Footer & Legal
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Footer Copyright Text
                </label>
                <input
                  type="text"
                  value={branding.footerText}
                  onChange={(e) => handleChange('footerText', e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#4fa77e]/20 focus:border-[#4fa77e]"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Support Email
                  </label>
                  <input
                    type="email"
                    value={branding.supportEmail}
                    onChange={(e) => handleChange('supportEmail', e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#4fa77e]/20 focus:border-[#4fa77e]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Support Phone
                  </label>
                  <input
                    type="tel"
                    value={branding.supportPhone}
                    onChange={(e) => handleChange('supportPhone', e.target.value)}
                    placeholder="(555) 123-4567"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#4fa77e]/20 focus:border-[#4fa77e]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Terms of Service URL
                  </label>
                  <input
                    type="text"
                    value={branding.termsUrl}
                    onChange={(e) => handleChange('termsUrl', e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#4fa77e]/20 focus:border-[#4fa77e]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Privacy Policy URL
                  </label>
                  <input
                    type="text"
                    value={branding.privacyUrl}
                    onChange={(e) => handleChange('privacyUrl', e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#4fa77e]/20 focus:border-[#4fa77e]"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Preview Panel */}
        <div className="lg:col-span-1">
          <div className="sticky top-8">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Eye className="h-5 w-5 text-[#4fa77e]" />
                Live Preview
              </h2>

              {/* Mini Preview */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                {/* Header Preview */}
                <div
                  className="p-4"
                  style={{ backgroundColor: branding.primaryColor }}
                >
                  <div className="flex items-center gap-2">
                    {branding.logoUrl ? (
                      <img src={branding.logoUrl} alt="Logo" className="h-6" />
                    ) : (
                      <div className="text-white font-bold text-lg">
                        {branding.platformName}
                      </div>
                    )}
                  </div>
                </div>

                {/* Content Preview */}
                <div className="p-4 bg-[#efece7]">
                  <div className="space-y-2">
                    <div
                      className="h-3 rounded-full w-3/4"
                      style={{ backgroundColor: branding.secondaryColor }}
                    ></div>
                    <div className="h-3 bg-white rounded-full w-1/2"></div>
                    <div className="h-3 bg-white rounded-full w-2/3"></div>
                  </div>
                  <button
                    className="mt-4 px-4 py-2 rounded-xl text-white text-sm font-medium"
                    style={{ backgroundColor: branding.accentColor }}
                  >
                    Sample Button
                  </button>
                </div>

                {/* Footer Preview */}
                <div className="p-3 bg-gray-100 border-t text-center">
                  <p className="text-xs text-gray-500">{branding.footerText}</p>
                </div>
              </div>

              {/* Color Swatches */}
              <div className="mt-6">
                <p className="text-sm font-medium text-gray-700 mb-2">Color Palette</p>
                <div className="flex gap-2">
                  <div
                    className="w-12 h-12 rounded-xl shadow-inner"
                    style={{ backgroundColor: branding.primaryColor }}
                    title="Primary"
                  ></div>
                  <div
                    className="w-12 h-12 rounded-xl shadow-inner"
                    style={{ backgroundColor: branding.secondaryColor }}
                    title="Secondary"
                  ></div>
                  <div
                    className="w-12 h-12 rounded-xl shadow-inner"
                    style={{ backgroundColor: branding.accentColor }}
                    title="Accent"
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
