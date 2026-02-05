"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Check, AlertCircle, Loader, Copy, QrCode } from "lucide-react";

interface CalendarSyncProps {
  onClose: () => void;
}

interface CalendarIntegration {
  provider: 'google' | 'outlook' | 'apple';
  isConnected: boolean;
  syncEnabled: boolean;
  lastSyncAt: string | null;
  syncDirection: string;
  accountEmail?: string;
}

interface AppleSetup {
  feedUrl: string;
  webcalUrl: string;
  qrCodeUrl: string;
  instructions: string[];
}

export default function CalendarSync({ onClose }: CalendarSyncProps) {
  // Connection states
  const [integrations, setIntegrations] = useState<CalendarIntegration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState<'google' | 'apple' | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Apple Calendar modal
  const [showAppleModal, setShowAppleModal] = useState(false);
  const [appleSetup, setAppleSetup] = useState<AppleSetup | null>(null);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

  // Sync settings
  const [syncSettings, setSyncSettings] = useState({
    syncDirection: 'both', // 'both', 'to_external', 'from_external'
    autoSync: true,
    syncFrequency: '15', // minutes
    includePrivateEvents: false,
    defaultEventDuration: '30', // minutes
  });

  // Derived connection states
  const googleIntegration = integrations.find(i => i.provider === 'google');
  const appleIntegration = integrations.find(i => i.provider === 'apple');
  const googleConnected = googleIntegration?.isConnected || false;
  const appleConnected = appleIntegration?.isConnected || false;

  // Fetch calendar integration status on mount
  const fetchStatus = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/calendar-sync?action=status');

      if (!res.ok) {
        if (res.status === 401) {
          setError('Please log in to manage calendar integrations');
          return;
        }
        throw new Error('Failed to fetch calendar status');
      }

      const data = await res.json();
      setIntegrations(data.integrations || []);

      // Update sync settings from the first connected integration
      const connectedIntegration = data.integrations?.find((i: CalendarIntegration) => i.isConnected);
      if (connectedIntegration) {
        setSyncSettings(prev => ({
          ...prev,
          syncDirection: connectedIntegration.syncDirection || 'both',
        }));
      }
    } catch (err) {
      console.error('Failed to fetch calendar status:', err);
      setError('Failed to load calendar status. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Handle Google Calendar connect
  const handleGoogleConnect = async () => {
    try {
      setIsConnecting('google');
      setError(null);

      const res = await fetch('/api/calendar-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect', provider: 'google' }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to initiate Google connection');
      }

      const data = await res.json();

      if (data.authUrl) {
        // Redirect to Google OAuth
        window.location.href = data.authUrl;
      } else {
        throw new Error('No authorization URL received');
      }
    } catch (err) {
      console.error('Google connect error:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect Google Calendar');
      setIsConnecting(null);
    }
  };

  // Handle Apple Calendar connect (iCal subscription)
  const handleAppleConnect = async () => {
    try {
      setIsConnecting('apple');
      setError(null);

      const res = await fetch('/api/calendar-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect', provider: 'apple' }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to setup Apple Calendar');
      }

      const data = await res.json();

      if (data.setup) {
        setAppleSetup(data.setup);
        setShowAppleModal(true);
        // Refresh status to show Apple as connected
        await fetchStatus();
      } else {
        throw new Error('No setup information received');
      }
    } catch (err) {
      console.error('Apple connect error:', err);
      setError(err instanceof Error ? err.message : 'Failed to setup Apple Calendar');
    } finally {
      setIsConnecting(null);
    }
  };

  // Handle disconnect
  const handleDisconnect = async (provider: 'google' | 'apple') => {
    if (!confirm(`Disconnect ${provider === 'google' ? 'Google' : 'Apple'} Calendar?`)) {
      return;
    }

    try {
      setError(null);

      const res = await fetch(`/api/calendar-sync?provider=${provider}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to disconnect');
      }

      // Refresh status
      await fetchStatus();
    } catch (err) {
      console.error('Disconnect error:', err);
      setError(err instanceof Error ? err.message : 'Failed to disconnect calendar');
    }
  };

  // Handle manual sync
  const handleSync = async () => {
    try {
      setIsSyncing(true);
      setError(null);

      const res = await fetch('/api/calendar-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync' }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to sync');
      }

      // Refresh status to update last sync time
      await fetchStatus();
    } catch (err) {
      console.error('Sync error:', err);
      setError(err instanceof Error ? err.message : 'Failed to sync calendars');
    } finally {
      setIsSyncing(false);
    }
  };

  // Handle save settings
  const handleSaveSettings = async () => {
    try {
      setIsSaving(true);
      setError(null);

      // Update settings for each connected provider
      const connectedProviders = integrations.filter(i => i.isConnected);

      for (const integration of connectedProviders) {
        if (integration.provider === 'apple') continue; // Apple doesn't have sync settings

        const res = await fetch('/api/calendar-sync', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: integration.provider,
            syncEnabled: syncSettings.autoSync,
            syncDirection: syncSettings.syncDirection,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to save settings');
        }
      }

      // Refresh status
      await fetchStatus();
    } catch (err) {
      console.error('Save settings error:', err);
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  // Copy to clipboard helper
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopySuccess(label);
    setTimeout(() => setCopySuccess(null), 2000);
  };

  if (isLoading) {
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
        <div className="flex items-center justify-center py-12">
          <Loader className="w-6 h-6 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-500">Loading calendar status...</span>
        </div>
      </div>
    );
  }

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

      {/* Error message */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

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
              <p className="text-sm text-green-700">
                ✓ Connected{googleIntegration?.accountEmail ? ` to ${googleIntegration.accountEmail}` : ''}
              </p>
              {googleIntegration?.lastSyncAt && (
                <p className="text-xs text-gray-500">
                  Last sync: {new Date(googleIntegration.lastSyncAt).toLocaleString()}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleSync}
                  disabled={isSyncing}
                  className="flex-1 text-xs px-3 py-1.5 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                >
                  {isSyncing ? 'Syncing...' : 'Sync Now'}
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
              disabled={isConnecting === 'google'}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {isConnecting === 'google' ? (
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
              <p className="text-sm text-green-700">✓ Subscription active</p>
              <p className="text-xs text-gray-500">One-way sync (appointments to Apple Calendar)</p>
              <div className="flex gap-2">
                <button
                  onClick={handleAppleConnect}
                  className="flex-1 text-xs px-3 py-1.5 bg-white border border-gray-300 rounded hover:bg-gray-50"
                >
                  View Link
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
              disabled={isConnecting === 'apple'}
              className="w-full px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {isConnecting === 'apple' ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader className="w-4 h-4 animate-spin" />
                  Setting up...
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
              <option value="to_external">Only push to external calendars</option>
              <option value="from_external">Only pull from external calendars</option>
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
          <button
            onClick={handleSaveSettings}
            disabled={isSaving || !integrations.some(i => i.isConnected)}
            className="px-4 py-2 bg-[#4fa77e] text-white rounded-lg hover:bg-[#3f8660] transition-colors disabled:opacity-50"
          >
            {isSaving ? (
              <span className="flex items-center gap-2">
                <Loader className="w-4 h-4 animate-spin" />
                Saving...
              </span>
            ) : (
              'Save Settings'
            )}
          </button>
        </div>
      </div>

      {/* Apple Calendar Setup Modal */}
      {showAppleModal && appleSetup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Add to Apple Calendar
                </h3>
                <button
                  onClick={() => setShowAppleModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                {/* QR Code */}
                {appleSetup.qrCodeUrl && (
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-500 mb-3">Scan with your iPhone</p>
                    <div className="w-48 h-48 mx-auto bg-white rounded-lg flex items-center justify-center">
                      <img
                        src={appleSetup.qrCodeUrl}
                        alt="QR Code for calendar subscription"
                        className="w-44 h-44"
                      />
                    </div>
                  </div>
                )}

                {/* URLs */}
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700">WebCal URL (Mac/iOS)</label>
                    <div className="flex mt-1">
                      <input
                        type="text"
                        readOnly
                        value={appleSetup.webcalUrl}
                        className="flex-1 text-sm bg-gray-50 border border-gray-200 rounded-l px-3 py-2"
                      />
                      <button
                        onClick={() => copyToClipboard(appleSetup.webcalUrl, 'webcal')}
                        className="px-3 py-2 bg-gray-100 border border-l-0 border-gray-200 rounded-r hover:bg-gray-200"
                      >
                        {copySuccess === 'webcal' ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4 text-gray-500" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">HTTP URL</label>
                    <div className="flex mt-1">
                      <input
                        type="text"
                        readOnly
                        value={appleSetup.feedUrl}
                        className="flex-1 text-sm bg-gray-50 border border-gray-200 rounded-l px-3 py-2"
                      />
                      <button
                        onClick={() => copyToClipboard(appleSetup.feedUrl, 'feed')}
                        className="px-3 py-2 bg-gray-100 border border-l-0 border-gray-200 rounded-r hover:bg-gray-200"
                      >
                        {copySuccess === 'feed' ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4 text-gray-500" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Instructions */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-2">Instructions</h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    {appleSetup.instructions?.length > 0 ? (
                      appleSetup.instructions.slice(0, 4).map((instruction, i) => (
                        <li key={i}>{instruction}</li>
                      ))
                    ) : (
                      <>
                        <li>1. Copy the WebCal URL above</li>
                        <li>2. On Mac: File → New Calendar Subscription</li>
                        <li>3. On iOS: Settings → Calendar → Accounts → Add Subscribed Calendar</li>
                        <li>4. Paste the URL and subscribe</li>
                      </>
                    )}
                  </ul>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowAppleModal(false)}
                  className="px-4 py-2 bg-[#4fa77e] text-white rounded-md hover:bg-[#3f8660]"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
