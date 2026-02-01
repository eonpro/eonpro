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
      const res = await fetch('/api/admin/integrations/zoom');
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
      const res = await fetch('/api/admin/integrations/zoom', {
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
    if (!confirm('Are you sure you want to disconnect your Zoom account? You will revert to using the platform default Zoom account.')) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/integrations/zoom', {
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
      const res = await fetch('/api/admin/integrations/zoom', {
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
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-24 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Video className="w-6 h-6 text-blue-600" />
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
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                <CheckCircle className="w-4 h-4 mr-1" />
                Connected
              </span>
            ) : status?.configured ? (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                <AlertCircle className="w-4 h-4 mr-1" />
                Using Platform Account
              </span>
            ) : (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
                <XCircle className="w-4 h-4 mr-1" />
                Not Configured
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
      {success && (
        <div className="mx-6 mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
          <p className="text-sm text-green-600">{success}</p>
        </div>
      )}

      <div className="p-6">
        {/* Connection Status */}
        {status?.isOwnAccount && (
          <div className="mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">Connected Account</p>
                  <p className="text-sm text-gray-500">{status.accountEmail}</p>
                  {status.connectedAt && (
                    <p className="text-xs text-gray-400 mt-1">
                      Connected on {new Date(status.connectedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <button
                  onClick={handleDisconnect}
                  disabled={saving}
                  className="inline-flex items-center px-3 py-2 border border-red-300 rounded-md text-sm font-medium text-red-700 bg-white hover:bg-red-50 disabled:opacity-50"
                >
                  <Unlink className="w-4 h-4 mr-1" />
                  Disconnect
                </button>
              </div>

              {/* HIPAA Badge */}
              <div className="flex items-center space-x-2 text-sm text-green-600">
                <Shield className="w-4 h-4" />
                <span>HIPAA Business Associate Agreement recommended with your Zoom account</span>
              </div>
            </div>
          </div>
        )}

        {/* Settings (when connected) */}
        {status?.configured && (
          <div className="mb-6">
            <h4 className="text-sm font-medium text-gray-900 mb-3">Meeting Settings</h4>
            <div className="space-y-3">
              <label className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <Users className="w-5 h-5 text-gray-400 mr-3" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Waiting Room</p>
                    <p className="text-xs text-gray-500">Patients wait until provider admits them</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.waitingRoomEnabled}
                  onChange={(e) => setSettings({ ...settings, waitingRoomEnabled: e.target.checked })}
                  className="h-4 w-4 text-blue-600 rounded"
                />
              </label>

              <label className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <HardDrive className="w-5 h-5 text-gray-400 mr-3" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Cloud Recording</p>
                    <p className="text-xs text-gray-500">Automatically record sessions (with consent)</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.recordingEnabled}
                  onChange={(e) => setSettings({ ...settings, recordingEnabled: e.target.checked })}
                  className="h-4 w-4 text-blue-600 rounded"
                />
              </label>

              <label className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <Shield className="w-5 h-5 text-gray-400 mr-3" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">HIPAA-Compliant Settings</p>
                    <p className="text-xs text-gray-500">Enhanced encryption and security options</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.hipaaCompliant}
                  onChange={(e) => setSettings({ ...settings, hipaaCompliant: e.target.checked })}
                  className="h-4 w-4 text-blue-600 rounded"
                />
              </label>

              <button
                onClick={handleSettingsUpdate}
                disabled={saving}
                className="w-full mt-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50"
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
                  <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h4 className="text-sm font-medium text-blue-900 mb-2">{instructions.title}</h4>
                    <ol className="text-sm text-blue-700 space-y-1">
                      {instructions.steps.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                    <p className="text-xs text-blue-600 mt-3 italic">{instructions.note}</p>
                  </div>
                )}
                <button
                  onClick={() => setShowForm(true)}
                  className="w-full inline-flex items-center justify-center px-4 py-3 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                >
                  <Link2 className="w-4 h-4 mr-2" />
                  Connect Your Zoom Account
                </button>
                {status?.configured && (
                  <p className="text-xs text-gray-500 text-center mt-2">
                    Currently using platform Zoom account. Connect your own for full control.
                  </p>
                )}
              </div>
            ) : (
              <form onSubmit={handleConnect} className="space-y-4">
                <h4 className="text-sm font-medium text-gray-900">Enter Zoom App Credentials</h4>
                <p className="text-xs text-gray-500">
                  Create a Server-to-Server OAuth app in the Zoom App Marketplace to get these credentials.
                </p>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Account ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.accountId}
                    onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
                    placeholder="Your Zoom Account ID"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Client ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.clientId}
                    onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                    placeholder="OAuth Client ID"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Client Secret <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showSecrets ? 'text' : 'password'}
                      required
                      value={formData.clientSecret}
                      onChange={(e) => setFormData({ ...formData, clientSecret: e.target.value })}
                      placeholder="OAuth Client Secret"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecrets(!showSecrets)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showSecrets ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <p className="text-xs text-gray-500 mb-3">
                    Optional: For Web SDK (in-browser video)
                  </p>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        SDK Key
                      </label>
                      <input
                        type="text"
                        value={formData.sdkKey}
                        onChange={(e) => setFormData({ ...formData, sdkKey: e.target.value })}
                        placeholder="Web SDK Key"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        SDK Secret
                      </label>
                      <input
                        type={showSecrets ? 'text' : 'password'}
                        value={formData.sdkSecret}
                        onChange={(e) => setFormData({ ...formData, sdkSecret: e.target.value })}
                        placeholder="Web SDK Secret"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Webhook Secret
                  </label>
                  <input
                    type={showSecrets ? 'text' : 'password'}
                    value={formData.webhookSecret}
                    onChange={(e) => setFormData({ ...formData, webhookSecret: e.target.value })}
                    placeholder="Webhook Verification Secret (optional)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Used to verify webhook events from Zoom
                  </p>
                </div>

                <div className="flex space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
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
        <div className="mt-6 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500 mb-2">Resources</p>
          <div className="flex flex-wrap gap-3">
            <a
              href="https://marketplace.zoom.us/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-xs text-blue-600 hover:text-blue-800"
            >
              <ExternalLink className="w-3 h-3 mr-1" />
              Zoom App Marketplace
            </a>
            <a
              href="https://developers.zoom.us/docs/api/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-xs text-blue-600 hover:text-blue-800"
            >
              <ExternalLink className="w-3 h-3 mr-1" />
              API Documentation
            </a>
            <a
              href="https://zoom.us/pricing/healthcare"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-xs text-blue-600 hover:text-blue-800"
            >
              <ExternalLink className="w-3 h-3 mr-1" />
              HIPAA-Compliant Plans
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
