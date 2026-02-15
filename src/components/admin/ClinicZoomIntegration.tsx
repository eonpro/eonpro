'use client';

/**
 * Clinic Zoom Integration Component
 *
 * Allows clinic admins to connect, configure, and manage their Zoom account.
 * Similar to Stripe Connect and Lifefile integration flows.
 */

import React, { useState, useEffect } from 'react';
import {
  Video,
  CheckCircle,
  XCircle,
  Settings,
  ExternalLink,
  AlertCircle,
  Shield,
  Mic,
  Users,
  HardDrive,
  Eye,
  EyeOff,
  Loader2,
  Unlink,
  Link2,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface ZoomStatus {
  configured: boolean;
  enabled: boolean;
  accountEmail?: string;
  connectedAt?: string;
  isOwnAccount: boolean;
  settings: {
    waitingRoomEnabled: boolean;
    recordingEnabled: boolean;
    hipaaCompliant: boolean;
  };
}

interface SetupInstructions {
  title: string;
  steps: string[];
  note: string;
}

export default function ClinicZoomIntegration() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<ZoomStatus | null>(null);
  const [instructions, setInstructions] = useState<SetupInstructions | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    accountId: '',
    clientId: '',
    clientSecret: '',
    sdkKey: '',
    sdkSecret: '',
    webhookSecret: '',
  });

  // Settings state
  const [settings, setSettings] = useState({
    waitingRoomEnabled: true,
    recordingEnabled: true,
    hipaaCompliant: true,
  });

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/admin/integrations/zoom');
      if (res.ok) {
        const data = await res.json();
        setStatus(data.status);
        setInstructions(data.setupInstructions || null);
        if (data.status?.settings) {
          setSettings(data.status.settings);
        }
      }
    } catch (error) {
      console.error('Failed to fetch Zoom status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await apiFetch('/api/admin/integrations/zoom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to connect Zoom');
        return;
      }

      setSuccess(data.message);
      setShowForm(false);
      await fetchStatus();
    } catch (error) {
      setError('Failed to connect Zoom account');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (
      !confirm(
        'Are you sure you want to disconnect your Zoom account? You will revert to using the platform default Zoom account.'
      )
    ) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await apiFetch('/api/admin/integrations/zoom', {
        method: 'DELETE',
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to disconnect Zoom');
        return;
      }

      setSuccess(data.message);
      await fetchStatus();
    } catch (error) {
      setError('Failed to disconnect Zoom account');
    } finally {
      setSaving(false);
    }
  };

  const handleSettingsUpdate = async () => {
    setSaving(true);
    setError(null);

    try {
      const res = await apiFetch('/api/admin/integrations/zoom', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to update settings');
        return;
      }

      setSuccess('Settings updated successfully');
      await fetchStatus();
    } catch (error) {
      setError('Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="animate-pulse">
          <div className="mb-4 h-6 w-1/3 rounded bg-gray-200"></div>
          <div className="h-24 rounded bg-gray-200"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white shadow">
      <div className="border-b border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <Video className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900">Zoom Telehealth</h3>
              <p className="text-sm text-gray-500">
                {status?.isOwnAccount
                  ? `Connected to ${status.accountEmail}`
                  : 'Using platform Zoom account'}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {status?.isOwnAccount ? (
              <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
                <CheckCircle className="mr-1 h-4 w-4" />
                Connected
              </span>
            ) : status?.configured ? (
              <span className="inline-flex items-center rounded-full bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-800">
                <AlertCircle className="mr-1 h-4 w-4" />
                Using Platform Account
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-800">
                <XCircle className="mr-1 h-4 w-4" />
                Not Configured
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="mx-6 mt-4 rounded-md border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
      {success && (
        <div className="mx-6 mt-4 rounded-md border border-green-200 bg-green-50 p-3">
          <p className="text-sm text-green-600">{success}</p>
        </div>
      )}

      <div className="p-6">
        {/* Connection Status */}
        {status?.isOwnAccount && (
          <div className="mb-6">
            <div className="rounded-lg bg-gray-50 p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Connected Account</p>
                  <p className="text-sm text-gray-500">{status.accountEmail}</p>
                  {status.connectedAt && (
                    <p className="mt-1 text-xs text-gray-400">
                      Connected on {new Date(status.connectedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <button
                  onClick={handleDisconnect}
                  disabled={saving}
                  className="inline-flex items-center rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  <Unlink className="mr-1 h-4 w-4" />
                  Disconnect
                </button>
              </div>

              {/* HIPAA Badge */}
              <div className="flex items-center space-x-2 text-sm text-green-600">
                <Shield className="h-4 w-4" />
                <span>HIPAA Business Associate Agreement recommended with your Zoom account</span>
              </div>
            </div>
          </div>
        )}

        {/* Settings (when connected) */}
        {status?.configured && (
          <div className="mb-6">
            <h4 className="mb-3 text-sm font-medium text-gray-900">Meeting Settings</h4>
            <div className="space-y-3">
              <label className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                <div className="flex items-center">
                  <Users className="mr-3 h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Waiting Room</p>
                    <p className="text-xs text-gray-500">
                      Patients wait until provider admits them
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.waitingRoomEnabled}
                  onChange={(e) =>
                    setSettings({ ...settings, waitingRoomEnabled: e.target.checked })
                  }
                  className="h-4 w-4 rounded text-blue-600"
                />
              </label>

              <label className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                <div className="flex items-center">
                  <HardDrive className="mr-3 h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Cloud Recording</p>
                    <p className="text-xs text-gray-500">
                      Automatically record sessions (with consent)
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.recordingEnabled}
                  onChange={(e) => setSettings({ ...settings, recordingEnabled: e.target.checked })}
                  className="h-4 w-4 rounded text-blue-600"
                />
              </label>

              <label className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                <div className="flex items-center">
                  <Shield className="mr-3 h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">HIPAA-Compliant Settings</p>
                    <p className="text-xs text-gray-500">
                      Enhanced encryption and security options
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.hipaaCompliant}
                  onChange={(e) => setSettings({ ...settings, hipaaCompliant: e.target.checked })}
                  className="h-4 w-4 rounded text-blue-600"
                />
              </label>

              <button
                onClick={handleSettingsUpdate}
                disabled={saving}
                className="mt-2 w-full rounded-md bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        )}

        {/* Connect Form */}
        {!status?.isOwnAccount && (
          <>
            {!showForm ? (
              <div>
                {instructions && (
                  <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <h4 className="mb-2 text-sm font-medium text-blue-900">{instructions.title}</h4>
                    <ol className="space-y-1 text-sm text-blue-700">
                      {instructions.steps.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                    <p className="mt-3 text-xs italic text-blue-600">{instructions.note}</p>
                  </div>
                )}
                <button
                  onClick={() => setShowForm(true)}
                  className="inline-flex w-full items-center justify-center rounded-md border border-transparent bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700"
                >
                  <Link2 className="mr-2 h-4 w-4" />
                  Connect Your Zoom Account
                </button>
                {status?.configured && (
                  <p className="mt-2 text-center text-xs text-gray-500">
                    Currently using platform Zoom account. Connect your own for full control.
                  </p>
                )}
              </div>
            ) : (
              <form onSubmit={handleConnect} className="space-y-4">
                <h4 className="text-sm font-medium text-gray-900">Enter Zoom App Credentials</h4>
                <p className="text-xs text-gray-500">
                  Create a Server-to-Server OAuth app in the Zoom App Marketplace to get these
                  credentials.
                </p>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Account ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.accountId}
                    onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
                    placeholder="Your Zoom Account ID"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Client ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.clientId}
                    onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                    placeholder="OAuth Client ID"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Client Secret <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showSecrets ? 'text' : 'password'}
                      required
                      value={formData.clientSecret}
                      onChange={(e) => setFormData({ ...formData, clientSecret: e.target.value })}
                      placeholder="OAuth Client Secret"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 pr-10 focus:border-blue-500 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecrets(!showSecrets)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showSecrets ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <p className="mb-3 text-xs text-gray-500">
                    Optional: For Web SDK (in-browser video)
                  </p>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        SDK Key
                      </label>
                      <input
                        type="text"
                        value={formData.sdkKey}
                        onChange={(e) => setFormData({ ...formData, sdkKey: e.target.value })}
                        placeholder="Web SDK Key"
                        className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        SDK Secret
                      </label>
                      <input
                        type={showSecrets ? 'text' : 'password'}
                        value={formData.sdkSecret}
                        onChange={(e) => setFormData({ ...formData, sdkSecret: e.target.value })}
                        placeholder="Web SDK Secret"
                        className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Webhook Secret
                  </label>
                  <input
                    type={showSecrets ? 'text' : 'password'}
                    value={formData.webhookSecret}
                    onChange={(e) => setFormData({ ...formData, webhookSecret: e.target.value })}
                    placeholder="Webhook Verification Secret (optional)"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Used to verify webhook events from Zoom
                  </p>
                </div>

                <div className="flex space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex flex-1 items-center justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      'Connect Zoom'
                    )}
                  </button>
                </div>
              </form>
            )}
          </>
        )}

        {/* Help Links */}
        <div className="mt-6 border-t border-gray-200 pt-4">
          <p className="mb-2 text-xs text-gray-500">Resources</p>
          <div className="flex flex-wrap gap-3">
            <a
              href="https://marketplace.zoom.us/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-xs text-blue-600 hover:text-blue-800"
            >
              <ExternalLink className="mr-1 h-3 w-3" />
              Zoom App Marketplace
            </a>
            <a
              href="https://developers.zoom.us/docs/api/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-xs text-blue-600 hover:text-blue-800"
            >
              <ExternalLink className="mr-1 h-3 w-3" />
              API Documentation
            </a>
            <a
              href="https://zoom.us/pricing/healthcare"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-xs text-blue-600 hover:text-blue-800"
            >
              <ExternalLink className="mr-1 h-3 w-3" />
              HIPAA-Compliant Plans
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
