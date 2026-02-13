'use client';

import React, { useState } from 'react';

export default function GeneralSettingsPage() {
  const [settings, setSettings] = useState({
    platformName: 'Lifefile EHR',
    platformUrl: 'https://lifefile.com',
    timezone: 'America/New_York',
    maintenanceMode: false,
    logoUrl: '/logo.png',
    primaryColor: '#4CAF50',
    supportEmail: 'support@lifefile.com',
  });

  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    // In production, this would save to the API
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">General Settings</h1>
        <p className="mt-2 text-gray-600">Configure basic platform settings and branding</p>
      </div>

      <div className="rounded-lg bg-white shadow">
        {/* Platform Settings */}
        <div className="border-b border-gray-200 p-6">
          <h2 className="mb-4 text-xl font-semibold">Platform Configuration</h2>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Platform Name</label>
              <input
                type="text"
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-green-500 focus:outline-none focus:ring-green-500"
                value={settings.platformName}
                onChange={(e: any) => setSettings({ ...settings, platformName: e.target.value })}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Platform URL</label>
              <input
                type="url"
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-green-500 focus:outline-none focus:ring-green-500"
                value={settings.platformUrl}
                onChange={(e: any) => setSettings({ ...settings, platformUrl: e.target.value })}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Default Timezone
              </label>
              <select
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-green-500 focus:outline-none focus:ring-green-500"
                value={settings.timezone}
                onChange={(e: any) => setSettings({ ...settings, timezone: e.target.value })}
              >
                <option value="America/New_York">Eastern Time</option>
                <option value="America/Chicago">Central Time</option>
                <option value="America/Denver">Mountain Time</option>
                <option value="America/Los_Angeles">Pacific Time</option>
                <option value="UTC">UTC</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Maintenance Mode
              </label>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                  checked={settings.maintenanceMode}
                  onChange={(e: any) =>
                    setSettings({ ...settings, maintenanceMode: e.target.checked })
                  }
                />
                <label className="ml-2 text-sm text-gray-600">
                  Enable maintenance mode (prevents user access)
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Branding Settings */}
        <div className="border-b border-gray-200 p-6">
          <h2 className="mb-4 text-xl font-semibold">Branding</h2>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Logo URL</label>
              <input
                type="text"
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-green-500 focus:outline-none focus:ring-green-500"
                value={settings.logoUrl}
                onChange={(e: any) => setSettings({ ...settings, logoUrl: e.target.value })}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Primary Color</label>
              <div className="flex items-center">
                <input
                  type="color"
                  className="h-10 w-20 cursor-pointer rounded-md border border-gray-300"
                  value={settings.primaryColor}
                  onChange={(e: any) => setSettings({ ...settings, primaryColor: e.target.value })}
                />
                <input
                  type="text"
                  className="ml-2 flex-1 rounded-md border border-gray-300 px-3 py-2 focus:border-green-500 focus:outline-none focus:ring-green-500"
                  value={settings.primaryColor}
                  onChange={(e: any) => setSettings({ ...settings, primaryColor: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Support Email</label>
              <input
                type="email"
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-green-500 focus:outline-none focus:ring-green-500"
                value={settings.supportEmail}
                onChange={(e: any) => setSettings({ ...settings, supportEmail: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end bg-gray-50 p-6">
          <button
            onClick={handleSave}
            className="rounded-lg bg-green-600 px-6 py-2 text-white transition-colors hover:bg-green-700"
          >
            Save Changes
          </button>
        </div>
      </div>

      {/* Success Message */}
      {saved && (
        <div className="fixed bottom-4 right-4 flex items-center rounded-lg bg-green-600 px-6 py-3 text-white shadow-lg">
          <svg className="mr-2 h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          Settings saved successfully!
        </div>
      )}
    </div>
  );
}
