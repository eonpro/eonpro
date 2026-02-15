'use client';

import { useState, useEffect } from 'react';
import {
  Calendar,
  RefreshCw,
  Settings,
  Check,
  X,
  ExternalLink,
  Loader2,
  AlertCircle,
  Cloud,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface CalendarIntegration {
  provider: 'google' | 'outlook';
  isConnected: boolean;
  syncEnabled: boolean;
  lastSyncAt: string | null;
  syncDirection: 'to_external' | 'from_external' | 'both';
}

interface CalendarIntegrationsProps {
  onUpdate?: () => void;
}

export default function CalendarIntegrations({ onUpdate }: CalendarIntegrationsProps) {
  const [integrations, setIntegrations] = useState<CalendarIntegration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingProvider, setEditingProvider] = useState<'google' | 'outlook' | null>(null);

  // Fetch integration status
  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await apiFetch('/api/calendar-sync?action=status');
      const data = await response.json();

      if (response.ok && data.success) {
        setIntegrations(data.integrations);
      } else {
        if (response.status === 404 && data.code === 'PROVIDER_NOT_LINKED') {
          setError(
            data.hint ||
              'Your account is not linked to a provider profile. Ask an admin to link your user to a provider or ensure a provider exists with your email.'
          );
        } else {
          setError(data.error || 'Failed to load integrations');
        }
      }
    } catch (err) {
      setError('Failed to load calendar integrations');
    } finally {
      setIsLoading(false);
    }
  };

  const connectCalendar = async (provider: 'google' | 'outlook') => {
    try {
      const response = await apiFetch('/api/calendar-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect', provider }),
      });

      const data = await response.json();

      if (data.success && data.authUrl) {
        // Redirect to OAuth provider
        window.location.href = data.authUrl;
      } else {
        setError(data.error || 'Failed to initiate connection');
      }
    } catch (err) {
      setError('Failed to connect calendar');
    }
  };

  const disconnectCalendar = async (provider: 'google' | 'outlook') => {
    if (
      !confirm(
        `Are you sure you want to disconnect ${provider === 'google' ? 'Google Calendar' : 'Outlook Calendar'}?`
      )
    ) {
      return;
    }

    try {
      const response = await apiFetch(`/api/calendar-sync?provider=${provider}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(`${provider === 'google' ? 'Google' : 'Outlook'} Calendar disconnected`);
        fetchStatus();
        onUpdate?.();
      } else {
        setError(data.error || 'Failed to disconnect');
      }
    } catch (err) {
      setError('Failed to disconnect calendar');
    }
  };

  const updateSettings = async (
    provider: 'google' | 'outlook',
    settings: { syncEnabled?: boolean; syncDirection?: string }
  ) => {
    try {
      const response = await apiFetch('/api/calendar-sync', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, ...settings }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('Settings updated');
        fetchStatus();
        setEditingProvider(null);
      } else {
        setError(data.error || 'Failed to update settings');
      }
    } catch (err) {
      setError('Failed to update settings');
    }
  };

  const syncCalendars = async () => {
    try {
      setIsSyncing(true);
      setError(null);

      const response = await apiFetch('/api/calendar-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync', importExternal: true }),
      });

      const data = await response.json();

      if (data.success) {
        const { syncResult } = data;
        setSuccess(
          `Sync complete: ${syncResult.totalCreated} created, ${syncResult.totalUpdated} updated`
        );
        fetchStatus();
        onUpdate?.();
      } else {
        setError(data.error || 'Sync failed');
      }
    } catch (err) {
      setError('Sync failed');
    } finally {
      setIsSyncing(false);
    }
  };

  const formatLastSync = (lastSyncAt: string | null) => {
    if (!lastSyncAt) return 'Never';
    const date = new Date(lastSyncAt);
    return date.toLocaleString();
  };

  const getProviderIcon = (provider: 'google' | 'outlook') => {
    if (provider === 'google') {
      return (
        <svg className="h-5 w-5" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
      );
    }

    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24">
        <path
          fill="#0078D4"
          d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"
        />
        <path fill="#fff" d="M11 7h2v6h-2zm0 8h2v2h-2z" />
      </svg>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-emerald-100 p-2">
            <Calendar className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Calendar Integrations</h2>
            <p className="text-sm text-gray-500">Sync appointments with your external calendars</p>
          </div>
        </div>

        {integrations.some((i) => i.isConnected && i.syncEnabled) && (
          <button
            onClick={syncCalendars}
            disabled={isSyncing}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {isSyncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Sync Now
          </button>
        )}
      </div>

      {/* Success/Error Messages */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1 text-sm">{error}</span>
          <button
            onClick={() => fetchStatus()}
            className="text-sm font-medium underline hover:no-underline"
          >
            Retry
          </button>
          <button onClick={() => setError(null)} className="p-1 hover:opacity-70">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-green-700">
          <Check className="h-4 w-4" />
          <span className="text-sm">{success}</span>
          <button onClick={() => setSuccess(null)} className="ml-auto">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Integrations List */}
      <div className="space-y-4">
        {integrations.map((integration) => (
          <div
            key={integration.provider}
            className="rounded-lg border p-4 transition-colors hover:bg-gray-50"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getProviderIcon(integration.provider)}
                <div>
                  <h3 className="font-medium text-gray-900">
                    {integration.provider === 'google' ? 'Google Calendar' : 'Outlook Calendar'}
                  </h3>
                  {integration.isConnected ? (
                    <p className="text-sm text-gray-500">
                      Last synced: {formatLastSync(integration.lastSyncAt)}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400">Not connected</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {integration.isConnected ? (
                  <>
                    <span className="flex items-center gap-1 text-sm text-green-600">
                      <Check className="h-4 w-4" />
                      Connected
                    </span>
                    <button
                      onClick={() =>
                        setEditingProvider(
                          editingProvider === integration.provider ? null : integration.provider
                        )
                      }
                      className="p-2 text-gray-400 transition-colors hover:text-gray-600"
                    >
                      <Settings className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => disconnectCalendar(integration.provider)}
                      className="p-2 text-red-400 transition-colors hover:text-red-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => connectCalendar(integration.provider)}
                    className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200"
                  >
                    <Cloud className="h-4 w-4" />
                    Connect
                  </button>
                )}
              </div>
            </div>

            {/* Settings Panel */}
            {editingProvider === integration.provider && integration.isConnected && (
              <div className="mt-4 space-y-4 border-t pt-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">Enable Sync</label>
                  <button
                    onClick={() =>
                      updateSettings(integration.provider, {
                        syncEnabled: !integration.syncEnabled,
                      })
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      integration.syncEnabled ? 'bg-emerald-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        integration.syncEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Sync Direction
                  </label>
                  <select
                    value={integration.syncDirection}
                    onChange={(e) =>
                      updateSettings(integration.provider, {
                        syncDirection: e.target.value,
                      })
                    }
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="both">Two-way (Recommended)</option>
                    <option value="to_external">
                      To {integration.provider === 'google' ? 'Google' : 'Outlook'} only
                    </option>
                    <option value="from_external">
                      From {integration.provider === 'google' ? 'Google' : 'Outlook'} only
                    </option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    {integration.syncDirection === 'both' && 'Appointments sync in both directions'}
                    {integration.syncDirection === 'to_external' &&
                      'Only push appointments to external calendar'}
                    {integration.syncDirection === 'from_external' &&
                      'Only import external events as blocked time'}
                  </p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Help Text */}
      <div className="mt-6 rounded-lg bg-blue-50 p-4">
        <h4 className="mb-2 text-sm font-medium text-blue-800">How Calendar Sync Works</h4>
        <ul className="space-y-1 text-sm text-blue-700">
          <li>
            • <strong>Two-way sync:</strong> Appointments appear in your external calendar, and
            external events block your availability
          </li>
          <li>
            • <strong>Automatic updates:</strong> Changes sync within minutes
          </li>
          <li>
            • <strong>Video links:</strong> Zoom/telehealth links are included in calendar events
          </li>
          <li>
            • <strong>Privacy:</strong> Patient names are shown, but sensitive health info is not
            synced
          </li>
        </ul>
      </div>
    </div>
  );
}
