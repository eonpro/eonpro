'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Palette, Globe, Image, Type, Save,
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const [branding, setBranding] = useState<PlatformBranding>({
    platformName: 'EONPRO',
    tagline: 'HIPAA Compliant Healthcare Platform',
    logoUrl: '',
    faviconUrl: '',
    primaryColor: '#10B981',
    secondaryColor: '#3B82F6',
    accentColor: '#8B5CF6',
    footerText: '© 2024 EONPRO. All rights reserved.',
    supportEmail: 'support@eonpro.com',
    supportPhone: '',
    termsUrl: '/terms',
    privacyUrl: '/privacy',
  });

  useEffect(() => {
    // Check if user is super admin
    const user = localStorage.getItem('user');
    if (user) {
      const userData = JSON.parse(user);
      if (userData.role?.toLowerCase() !== 'super_admin') {
        router.push('/admin');
        return;
      }
    }
    // In a real app, fetch current branding settings from API
    setLoading(false);
  }, [router]);

  const handleChange = (field: keyof PlatformBranding, value: string) => {
    setBranding(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');

    try {
      // In a real implementation, save to API
      // const token = localStorage.getItem('auth-token');
      // await fetch('/api/super-admin/branding', {
      //   method: 'PUT',
      //   headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      //   body: JSON.stringify(branding),
      // });

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError('Failed to save branding settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-900 to-indigo-800 text-white">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div>
              <button
                onClick={() => router.push('/super-admin')}
                className="flex items-center gap-2 text-purple-200 hover:text-white mb-4 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </button>
              <div className="flex items-center gap-3">
                <Palette className="h-8 w-8 text-purple-300" />
                <div>
                  <h1 className="text-2xl font-bold">White Label Settings</h1>
                  <p className="text-purple-200">Customize platform branding and appearance</p>
                </div>
              </div>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className={`px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-all ${
                saved
                  ? 'bg-green-500 text-white'
                  : 'bg-white text-purple-900 hover:bg-purple-50'
              }`}
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-900"></div>
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
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700">
            <AlertCircle className="h-5 w-5" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Settings Panel */}
          <div className="lg:col-span-2 space-y-6">
            {/* Platform Identity */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Globe className="h-5 w-5 text-purple-600" />
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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
              </div>
            </div>

            {/* Logos */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Image className="h-5 w-5 text-purple-600" />
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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Recommended: 32x32px, ICO or PNG</p>
                </div>
              </div>
            </div>

            {/* Colors */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Palette className="h-5 w-5 text-purple-600" />
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
                      className="w-12 h-10 rounded cursor-pointer border border-gray-300"
                    />
                    <input
                      type="text"
                      value={branding.primaryColor}
                      onChange={(e) => handleChange('primaryColor', e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
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
                      className="w-12 h-10 rounded cursor-pointer border border-gray-300"
                    />
                    <input
                      type="text"
                      value={branding.secondaryColor}
                      onChange={(e) => handleChange('secondaryColor', e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
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
                      className="w-12 h-10 rounded cursor-pointer border border-gray-300"
                    />
                    <input
                      type="text"
                      value={branding.accentColor}
                      onChange={(e) => handleChange('accentColor', e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer & Legal */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Type className="h-5 w-5 text-purple-600" />
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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
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
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
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
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
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
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
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
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Preview Panel */}
          <div className="lg:col-span-1">
            <div className="sticky top-8">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Eye className="h-5 w-5 text-purple-600" />
                  Live Preview
                </h2>

                {/* Mini Preview */}
                <div className="border border-gray-200 rounded-lg overflow-hidden">
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
                  <div className="p-4 bg-gray-50">
                    <div className="space-y-2">
                      <div
                        className="h-3 rounded-full w-3/4"
                        style={{ backgroundColor: branding.secondaryColor }}
                      ></div>
                      <div className="h-3 bg-gray-200 rounded-full w-1/2"></div>
                      <div className="h-3 bg-gray-200 rounded-full w-2/3"></div>
                    </div>
                    <button
                      className="mt-4 px-4 py-2 rounded-lg text-white text-sm font-medium"
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
                      className="w-12 h-12 rounded-lg shadow-inner"
                      style={{ backgroundColor: branding.primaryColor }}
                      title="Primary"
                    ></div>
                    <div
                      className="w-12 h-12 rounded-lg shadow-inner"
                      style={{ backgroundColor: branding.secondaryColor }}
                      title="Secondary"
                    ></div>
                    <div
                      className="w-12 h-12 rounded-lg shadow-inner"
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
    </div>
  );
}

