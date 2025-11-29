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
        <p className="text-gray-600 mt-2">Configure basic platform settings and branding</p>
      </div>

      <div className="bg-white rounded-lg shadow">
        {/* Platform Settings */}
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold mb-4">Platform Configuration</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Platform Name
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
                value={settings.platformName}
                onChange={(e: any) => setSettings({...settings, platformName: e.target.value})}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Platform URL
              </label>
              <input
                type="url"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
                value={settings.platformUrl}
                onChange={(e: any) => setSettings({...settings, platformUrl: e.target.value})}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Default Timezone
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
                value={settings.timezone}
                onChange={(e: any) => setSettings({...settings, timezone: e.target.value})}
              >
                <option value="America/New_York">Eastern Time</option>
                <option value="America/Chicago">Central Time</option>
                <option value="America/Denver">Mountain Time</option>
                <option value="America/Los_Angeles">Pacific Time</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Maintenance Mode
              </label>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                  checked={settings.maintenanceMode}
                  onChange={(e: any) => setSettings({...settings, maintenanceMode: e.target.checked})}
                />
                <label className="ml-2 text-sm text-gray-600">
                  Enable maintenance mode (prevents user access)
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Branding Settings */}
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold mb-4">Branding</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Logo URL
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
                value={settings.logoUrl}
                onChange={(e: any) => setSettings({...settings, logoUrl: e.target.value})}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Primary Color
              </label>
              <div className="flex items-center">
                <input
                  type="color"
                  className="h-10 w-20 border border-gray-300 rounded-md cursor-pointer"
                  value={settings.primaryColor}
                  onChange={(e: any) => setSettings({...settings, primaryColor: e.target.value})}
                />
                <input
                  type="text"
                  className="ml-2 flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
                  value={settings.primaryColor}
                  onChange={(e: any) => setSettings({...settings, primaryColor: e.target.value})}
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Support Email
              </label>
              <input
                type="email"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
                value={settings.supportEmail}
                onChange={(e: any) => setSettings({...settings, supportEmail: e.target.value})}
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="p-6 bg-gray-50 flex justify-end">
          <button
            onClick={handleSave}
            className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors"
          >
            Save Changes
          </button>
        </div>
      </div>

      {/* Success Message */}
      {saved && (
        <div className="fixed bottom-4 right-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg flex items-center">
          <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          Settings saved successfully!
        </div>
      )}
    </div>
  );
}
