"use client";

import { useState } from "react";
import { X, Calendar, Check, AlertCircle, Loader } from "lucide-react";

interface CalendarSyncProps {
  onClose: () => void;
}

export default function CalendarSync({ onClose }: CalendarSyncProps) {
  const [googleConnected, setGoogleConnected] = useState(false);
  const [appleConnected, setAppleConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [syncSettings, setSyncSettings] = useState({
    syncDirection: 'both', // 'both', 'toExternal', 'fromExternal'
    autoSync: true,
    syncFrequency: '15', // minutes
    includePrivateEvents: false,
    defaultEventDuration: '30', // minutes
  });

  const handleGoogleConnect = async () => {
    setIsConnecting(true);
    // Simulate Google OAuth flow
    setTimeout(() => {
      setGoogleConnected(true);
      setIsConnecting(false);
    }, 2000);
  };

  const handleAppleConnect = async () => {
    setIsConnecting(true);
    // Simulate Apple Calendar connection
    setTimeout(() => {
      setAppleConnected(true);
      setIsConnecting(false);
    }, 2000);
  };

  const handleDisconnect = (service: 'google' | 'apple') => {
    if (service === 'google') {
      setGoogleConnected(false);
    } else {
      setAppleConnected(false);
    }
  };

  return (
    <div className="bg-white rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Calendar Integration</h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Google Calendar */}
        <div className={`border rounded-lg p-4 ${googleConnected ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}>
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-lg shadow-sm flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-6 h-6">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              </div>
              <div>
                <h4 className="font-medium">Google Calendar</h4>
                <p className="text-xs text-gray-600">Sync with Google Calendar</p>
              </div>
            </div>
            {googleConnected && (
              <Check className="w-5 h-5 text-green-600" />
            )}
          </div>

          {googleConnected ? (
            <div className="space-y-3">
              <p className="text-sm text-green-700">✓ Connected to your.email@gmail.com</p>
              <div className="flex gap-2">
                <button className="flex-1 text-xs px-3 py-1.5 bg-white border border-gray-300 rounded hover:bg-gray-50">
                  Sync Now
                </button>
                <button 
                  onClick={() => handleDisconnect('google')}
                  className="flex-1 text-xs px-3 py-1.5 text-red-600 border border-red-200 rounded hover:bg-red-50"
                >
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleGoogleConnect}
              disabled={isConnecting}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {isConnecting ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader className="w-4 h-4 animate-spin" />
                  Connecting...
                </span>
              ) : (
                'Connect Google Calendar'
              )}
            </button>
          )}
        </div>

        {/* Apple Calendar */}
        <div className={`border rounded-lg p-4 ${appleConnected ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}>
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-lg shadow-sm flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-6 h-6">
                  <path fill="#000" d="M18.71,19.5C17.88,20.74 17,21.95 15.66,21.97C14.32,22 13.89,21.18 12.37,21.18C10.84,21.18 10.37,21.95 9.1,22C7.79,22.05 6.8,20.68 5.96,19.47C4.25,17 2.94,12.45 4.7,9.39C5.57,7.87 7.13,6.91 8.82,6.88C10.1,6.86 11.32,7.75 12.11,7.75C12.89,7.75 14.37,6.68 15.92,6.84C16.57,6.87 18.39,7.1 19.56,8.82C19.47,8.88 17.39,10.1 17.41,12.63C17.44,15.65 20.06,16.66 20.09,16.67C20.06,16.74 19.67,18.11 18.71,19.5M13,3.5C13.73,2.67 14.94,2.04 15.94,2C16.07,3.17 15.6,4.35 14.9,5.19C14.21,6.04 13.07,6.7 11.95,6.61C11.8,5.46 12.36,4.26 13,3.5Z"/>
                </svg>
              </div>
              <div>
                <h4 className="font-medium">Apple Calendar</h4>
                <p className="text-xs text-gray-600">Sync with iCloud Calendar</p>
              </div>
            </div>
            {appleConnected && (
              <Check className="w-5 h-5 text-green-600" />
            )}
          </div>

          {appleConnected ? (
            <div className="space-y-3">
              <p className="text-sm text-green-700">✓ Connected to iCloud</p>
              <div className="flex gap-2">
                <button className="flex-1 text-xs px-3 py-1.5 bg-white border border-gray-300 rounded hover:bg-gray-50">
                  Sync Now
                </button>
                <button 
                  onClick={() => handleDisconnect('apple')}
                  className="flex-1 text-xs px-3 py-1.5 text-red-600 border border-red-200 rounded hover:bg-red-50"
                >
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleAppleConnect}
              disabled={isConnecting}
              className="w-full px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {isConnecting ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader className="w-4 h-4 animate-spin" />
                  Connecting...
                </span>
              ) : (
                'Connect Apple Calendar'
              )}
            </button>
          )}
        </div>
      </div>

      {/* Sync Settings */}
      <div className="mt-6 pt-6 border-t">
        <h4 className="font-medium mb-4">Sync Settings</h4>
        
        <div className="space-y-4">
          {/* Sync Direction */}
          <div>
            <label className="text-sm font-medium text-gray-700">Sync Direction</label>
            <select
              value={syncSettings.syncDirection}
              onChange={(e) => setSyncSettings({...syncSettings, syncDirection: e.target.value})}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="both">Two-way sync</option>
              <option value="toExternal">Only push to external calendars</option>
              <option value="fromExternal">Only pull from external calendars</option>
            </select>
          </div>

          {/* Auto Sync */}
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">Auto-sync</label>
            <button
              onClick={() => setSyncSettings({...syncSettings, autoSync: !syncSettings.autoSync})}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                syncSettings.autoSync ? 'bg-[#4fa77e]' : 'bg-gray-200'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                syncSettings.autoSync ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>

          {/* Sync Frequency */}
          {syncSettings.autoSync && (
            <div>
              <label className="text-sm font-medium text-gray-700">Sync Frequency</label>
              <select
                value={syncSettings.syncFrequency}
                onChange={(e) => setSyncSettings({...syncSettings, syncFrequency: e.target.value})}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="5">Every 5 minutes</option>
                <option value="15">Every 15 minutes</option>
                <option value="30">Every 30 minutes</option>
                <option value="60">Every hour</option>
              </select>
            </div>
          )}

          {/* Include Private Events */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-700">Include Private Events</label>
              <p className="text-xs text-gray-500">Sync events marked as private in external calendars</p>
            </div>
            <button
              onClick={() => setSyncSettings({...syncSettings, includePrivateEvents: !syncSettings.includePrivateEvents})}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                syncSettings.includePrivateEvents ? 'bg-[#4fa77e]' : 'bg-gray-200'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                syncSettings.includePrivateEvents ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>

          {/* Default Event Duration */}
          <div>
            <label className="text-sm font-medium text-gray-700">Default Appointment Duration</label>
            <select
              value={syncSettings.defaultEventDuration}
              onChange={(e) => setSyncSettings({...syncSettings, defaultEventDuration: e.target.value})}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60">1 hour</option>
            </select>
          </div>
        </div>

        {/* Info Box */}
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex gap-2">
            <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-blue-800">
              <p className="font-medium mb-1">Sync Information</p>
              <ul className="space-y-0.5 list-disc list-inside">
                <li>Appointments will sync automatically based on your settings</li>
                <li>Patient information will remain private and secure</li>
                <li>Zoom links will be generated for all telehealth appointments</li>
                <li>Changes made in external calendars will reflect here</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="mt-4 flex justify-end">
          <button className="px-4 py-2 bg-[#4fa77e] text-white rounded-lg hover:bg-[#3f8660] transition-colors">
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
