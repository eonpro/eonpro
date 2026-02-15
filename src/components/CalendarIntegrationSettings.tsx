'use client';

/**
 * Calendar Integration Settings Component
 *
 * Comprehensive settings for calendar sync (Google, Outlook, Apple) and Zoom telehealth.
 * Allows providers to connect their calendars and manage video consultation settings.
 */

import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Video,
  CheckCircle,
  XCircle,
  RefreshCw,
  Settings,
  ExternalLink,
  Copy,
  QrCode,
  Smartphone,
  Monitor,
  Link2,
  Unlink,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface CalendarConnection {
  provider: 'google' | 'outlook' | 'apple';
  isConnected: boolean;
  syncEnabled: boolean;
  lastSyncAt: string | null;
  syncDirection: 'to_external' | 'from_external' | 'both';
}

interface CalendarSubscription {
  id: number;
  name: string;
  token: string;
  feedUrl: string;
  webcalUrl: string;
  isActive: boolean;
  lastAccessedAt: string | null;
  accessCount: number;
}

interface ZoomStatus {
  configured: boolean;
  enabled: boolean;
  accountEmail?: string;
  waitingRoomEnabled: boolean;
}

interface Props {
  providerId?: number;
  onUpdate?: () => void;
}

export default function CalendarIntegrationSettings({ providerId, onUpdate }: Props) {
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<CalendarConnection[]>([]);
  const [subscriptions, setSubscriptions] = useState<CalendarSubscription[]>([]);
  const [zoomStatus, setZoomStatus] = useState<ZoomStatus | null>(null);
  const [activeTab, setActiveTab] = useState<'calendars' | 'subscriptions' | 'zoom'>('calendars');
  const [appleSetup, setAppleSetup] = useState<{
    feedUrl: string;
    webcalUrl: string;
    qrCodeUrl: string;
    instructions: string[];
  } | null>(null);
  const [showAppleModal, setShowAppleModal] = useState(false);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  // Fetch data on mount
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setCalendarError(null);
    try {
      // Fetch calendar integration status
      const calendarRes = await apiFetch('/api/calendar-sync?action=status');
      if (calendarRes.ok) {
        const data = await calendarRes.json();
        setConnections(data.integrations || []);
      } else {
        const errBody = await calendarRes.json().catch(() => ({}));
        if (calendarRes.status === 404 && errBody.code === 'PROVIDER_NOT_LINKED') {
          setCalendarError(
            errBody.hint ||
              'Your account is not linked to a provider profile. Ask an admin to link your user to a provider or ensure a provider exists with your email.'
          );
        } else {
          setCalendarError(errBody.error || errBody.detail || 'Failed to load calendar status');
        }
      }

      // Fetch subscriptions
      const subRes = await apiFetch('/api/calendar/subscriptions');
      if (subRes.ok) {
        const data = await subRes.json();
        setSubscriptions(data.subscriptions || []);
      }

      // Fetch Zoom status
      const zoomRes = await apiFetch('/api/v2/zoom/meetings?action=status');
      if (zoomRes.ok) {
        const data = await zoomRes.json();
        setZoomStatus(data);
      }
    } catch (error) {
      console.error('Failed to fetch calendar settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (provider: 'google' | 'outlook' | 'apple') => {
    try {
      if (provider === 'apple') {
        // Apple uses subscription setup, not OAuth
        const res = await apiFetch('/api/calendar-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'connect', provider: 'apple' }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.setup) {
            setAppleSetup(data.setup);
            setShowAppleModal(true);
          }
        }
      } else {
        // Google/Outlook use OAuth
        const res = await apiFetch('/api/calendar-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'connect', provider }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.authUrl) {
            window.location.href = data.authUrl;
          }
        }
      }
    } catch (error) {
      console.error('Failed to connect calendar:', error);
    }
  };

  const handleDisconnect = async (provider: 'google' | 'outlook' | 'apple') => {
    if (!confirm(`Disconnect ${provider.charAt(0).toUpperCase() + provider.slice(1)} Calendar?`)) {
      return;
    }

    try {
      const res = await apiFetch('/api/calendar-sync', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      if (res.ok) {
        await fetchData();
        onUpdate?.();
      }
    } catch (error) {
      console.error('Failed to disconnect calendar:', error);
    }
  };

  const handleSync = async () => {
    try {
      const res = await apiFetch('/api/calendar-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync' }),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (error) {
      console.error('Failed to sync calendars:', error);
    }
  };

  const handleCreateSubscription = async () => {
    try {
      const res = await apiFetch('/api/calendar/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Appointments',
          includePatientNames: false,
          includeMeetingLinks: true,
          syncRangeDays: 90,
        }),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (error) {
      console.error('Failed to create subscription:', error);
    }
  };

  const handleDeleteSubscription = async (id: number) => {
    if (!confirm('Delete this calendar subscription?')) {
      return;
    }

    try {
      const res = await apiFetch(`/api/calendar/subscriptions?subscriptionId=${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (error) {
      console.error('Failed to delete subscription:', error);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopySuccess(label);
    setTimeout(() => setCopySuccess(null), 2000);
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'google':
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
      case 'outlook':
        return (
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path
              fill="#0078D4"
              d="M24 7.387v10.478c0 .23-.08.424-.238.576-.157.152-.355.228-.594.228H8.22l-.324-.228V7.387l.324-.228h14.947c.24 0 .438.076.595.228.157.152.237.346.237.576zM8.22 6.16L0 2.898v18.205l8.22-3.262V6.16zm0 .999v10.837l14.468 5.105V1.055L8.22 7.16z"
            />
          </svg>
        );
      case 'apple':
        return (
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"
            />
          </svg>
        );
      default:
        return <Calendar className="h-5 w-5" />;
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="animate-pulse">
          <div className="mb-4 h-6 w-1/4 rounded bg-gray-200"></div>
          <div className="space-y-3">
            <div className="h-16 rounded bg-gray-200"></div>
            <div className="h-16 rounded bg-gray-200"></div>
            <div className="h-16 rounded bg-gray-200"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white shadow">
      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex">
          <button
            onClick={() => setActiveTab('calendars')}
            className={`border-b-2 px-6 py-4 text-sm font-medium ${
              activeTab === 'calendars'
                ? 'border-[var(--brand-primary,#4fa77e)] text-[var(--brand-primary,#4fa77e)]'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            <Calendar className="mr-2 inline h-4 w-4" />
            Calendar Sync
          </button>
          <button
            onClick={() => setActiveTab('subscriptions')}
            className={`border-b-2 px-6 py-4 text-sm font-medium ${
              activeTab === 'subscriptions'
                ? 'border-[var(--brand-primary,#4fa77e)] text-[var(--brand-primary,#4fa77e)]'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            <Link2 className="mr-2 inline h-4 w-4" />
            iCal Feeds
          </button>
          <button
            onClick={() => setActiveTab('zoom')}
            className={`border-b-2 px-6 py-4 text-sm font-medium ${
              activeTab === 'zoom'
                ? 'border-[var(--brand-primary,#4fa77e)] text-[var(--brand-primary,#4fa77e)]'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            <Video className="mr-2 inline h-4 w-4" />
            Zoom Telehealth
          </button>
        </nav>
      </div>

      <div className="p-6">
        {/* Calendar Sync Tab */}
        {activeTab === 'calendars' && (
          <div className="space-y-6">
            {calendarError && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                <div className="flex-1">
                  <p className="text-sm text-amber-800">{calendarError}</p>
                  <button
                    type="button"
                    onClick={() => fetchData()}
                    className="mt-2 text-sm font-medium text-amber-800 underline hover:text-amber-900"
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium text-gray-900">Calendar Integrations</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Connect your calendar to sync appointments automatically
                </p>
              </div>
              <button
                onClick={handleSync}
                className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Sync Now
              </button>
            </div>

            <div className="grid gap-4">
              {['google', 'outlook', 'apple'].map((provider) => {
                const connection = connections.find((c) => c.provider === provider);
                const isConnected = connection?.isConnected || false;

                return (
                  <div
                    key={provider}
                    className="flex items-center justify-between rounded-lg border p-4 hover:bg-gray-50"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
                        {getProviderIcon(provider)}
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900">
                          {provider === 'google' && 'Google Calendar'}
                          {provider === 'outlook' && 'Microsoft Outlook'}
                          {provider === 'apple' && 'Apple Calendar'}
                        </h4>
                        <p className="text-sm text-gray-500">
                          {isConnected ? (
                            <span className="flex items-center text-green-600">
                              <CheckCircle className="mr-1 h-4 w-4" />
                              Connected
                              {connection?.lastSyncAt && (
                                <span className="ml-2 text-gray-400">
                                  · Last sync: {new Date(connection.lastSyncAt).toLocaleString()}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="flex items-center text-gray-400">
                              <XCircle className="mr-1 h-4 w-4" />
                              Not connected
                            </span>
                          )}
                        </p>
                        {provider === 'apple' && (
                          <p className="mt-1 text-xs text-gray-400">
                            Uses iCal subscription (one-way sync)
                          </p>
                        )}
                      </div>
                    </div>
                    <div>
                      {isConnected ? (
                        <button
                          onClick={() =>
                            handleDisconnect(provider as 'google' | 'outlook' | 'apple')
                          }
                          className="inline-flex items-center rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                        >
                          <Unlink className="mr-1 h-4 w-4" />
                          Disconnect
                        </button>
                      ) : (
                        <button
                          onClick={() => handleConnect(provider as 'google' | 'outlook' | 'apple')}
                          className="inline-flex items-center rounded-md border border-transparent bg-[var(--brand-primary,#4fa77e)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand-primary-dark,#3d8563)]"
                        >
                          Connect
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="flex">
                <AlertCircle className="mr-3 h-5 w-5 flex-shrink-0 text-blue-500" />
                <div className="text-sm text-blue-700">
                  <p className="font-medium">About Calendar Sync</p>
                  <ul className="mt-1 list-inside list-disc space-y-1">
                    <li>Google & Outlook provide two-way sync (appointments sync both ways)</li>
                    <li>
                      Apple Calendar uses subscription feeds (our appointments → your calendar)
                    </li>
                    <li>Sync happens automatically when appointments are created or modified</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Subscriptions Tab */}
        {activeTab === 'subscriptions' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium text-gray-900">iCal Subscription Feeds</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Subscribe to your appointment feed in any calendar app
                </p>
              </div>
              <button
                onClick={handleCreateSubscription}
                className="inline-flex items-center rounded-md border border-transparent bg-[var(--brand-primary,#4fa77e)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand-primary-dark,#3d8563)]"
              >
                Create Subscription
              </button>
            </div>

            {subscriptions.length === 0 ? (
              <div className="rounded-lg border-2 border-dashed border-gray-200 py-8 text-center">
                <Link2 className="mx-auto mb-4 h-12 w-12 text-gray-400" />
                <p className="text-gray-500">No subscription feeds yet</p>
                <p className="mt-1 text-sm text-gray-400">
                  Create a subscription to sync appointments to your calendar
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {subscriptions.map((sub) => (
                  <div key={sub.id} className="rounded-lg border p-4">
                    <div className="mb-4 flex items-start justify-between">
                      <div>
                        <h4 className="font-medium text-gray-900">{sub.name}</h4>
                        <p className="text-sm text-gray-500">
                          {sub.accessCount} accesses
                          {sub.lastAccessedAt && (
                            <span>
                              {' '}
                              · Last accessed: {new Date(sub.lastAccessedAt).toLocaleString()}
                            </span>
                          )}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteSubscription(sub.id)}
                        className="text-sm text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center">
                        <div className="flex-1">
                          <label className="flex items-center text-xs font-medium text-gray-500">
                            <Monitor className="mr-1 h-3 w-3" />
                            HTTP URL (Google, Outlook)
                          </label>
                          <div className="mt-1 flex">
                            <input
                              type="text"
                              readOnly
                              value={sub.feedUrl}
                              className="flex-1 rounded-l border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
                            />
                            <button
                              onClick={() => copyToClipboard(sub.feedUrl, `feed-${sub.id}`)}
                              className="rounded-r border border-l-0 border-gray-200 bg-gray-100 px-3 py-2 hover:bg-gray-200"
                            >
                              {copySuccess === `feed-${sub.id}` ? (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              ) : (
                                <Copy className="h-4 w-4 text-gray-500" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center">
                        <div className="flex-1">
                          <label className="flex items-center text-xs font-medium text-gray-500">
                            <Smartphone className="mr-1 h-3 w-3" />
                            WebCal URL (Apple Calendar, iOS)
                          </label>
                          <div className="mt-1 flex">
                            <input
                              type="text"
                              readOnly
                              value={sub.webcalUrl}
                              className="flex-1 rounded-l border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
                            />
                            <button
                              onClick={() => copyToClipboard(sub.webcalUrl, `webcal-${sub.id}`)}
                              className="rounded-r border border-l-0 border-gray-200 bg-gray-100 px-3 py-2 hover:bg-gray-200"
                            >
                              {copySuccess === `webcal-${sub.id}` ? (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              ) : (
                                <Copy className="h-4 w-4 text-gray-500" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-lg bg-gray-50 p-4">
              <h4 className="mb-2 font-medium text-gray-900">How to Subscribe</h4>
              <div className="grid gap-4 text-sm md:grid-cols-3">
                <div>
                  <p className="font-medium text-gray-700">Apple Calendar</p>
                  <ol className="mt-1 space-y-1 text-gray-500">
                    <li>1. Copy the WebCal URL</li>
                    <li>2. File → New Calendar Subscription</li>
                    <li>3. Paste URL and Subscribe</li>
                  </ol>
                </div>
                <div>
                  <p className="font-medium text-gray-700">Google Calendar</p>
                  <ol className="mt-1 space-y-1 text-gray-500">
                    <li>1. Copy the HTTP URL</li>
                    <li>2. Settings → Add Calendar → From URL</li>
                    <li>3. Paste URL and Add</li>
                  </ol>
                </div>
                <div>
                  <p className="font-medium text-gray-700">Outlook</p>
                  <ol className="mt-1 space-y-1 text-gray-500">
                    <li>1. Copy the HTTP URL</li>
                    <li>2. Add Calendar → From Internet</li>
                    <li>3. Paste URL and Import</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Zoom Tab */}
        {activeTab === 'zoom' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Zoom Telehealth</h3>
              <p className="mt-1 text-sm text-gray-500">
                Video consultation settings for telehealth appointments
              </p>
            </div>

            <div className="rounded-lg border p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                    <Video className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">Zoom Video Consultations</h4>
                    <p className="mt-1 text-sm text-gray-500">
                      {zoomStatus?.configured ? (
                        <span className="flex items-center text-green-600">
                          <CheckCircle className="mr-1 h-4 w-4" />
                          Configured and ready
                        </span>
                      ) : (
                        <span className="flex items-center text-yellow-600">
                          <AlertCircle className="mr-1 h-4 w-4" />
                          Not configured - contact administrator
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                {zoomStatus?.configured && (
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-medium ${
                      zoomStatus.enabled
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {zoomStatus.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                )}
              </div>

              {zoomStatus?.configured && (
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg bg-gray-50 p-4">
                    <h5 className="mb-2 font-medium text-gray-900">Features</h5>
                    <ul className="space-y-2 text-sm text-gray-600">
                      <li className="flex items-center">
                        <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                        HD Video Consultations
                      </li>
                      <li className="flex items-center">
                        <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                        Screen Sharing
                      </li>
                      <li className="flex items-center">
                        {zoomStatus.waitingRoomEnabled ? (
                          <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="mr-2 h-4 w-4 text-gray-400" />
                        )}
                        Waiting Room
                      </li>
                      <li className="flex items-center">
                        <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                        Cloud Recording (with consent)
                      </li>
                    </ul>
                  </div>

                  <div className="rounded-lg bg-gray-50 p-4">
                    <h5 className="mb-2 font-medium text-gray-900">Auto-Create Meetings</h5>
                    <p className="text-sm text-gray-600">
                      When you schedule a VIDEO appointment, a Zoom meeting is automatically created
                      and the link is included in patient reminders.
                    </p>
                    <div className="mt-3 flex items-center text-sm text-[var(--brand-primary,#4fa77e)]">
                      <Clock className="mr-1 h-4 w-4" />
                      Meetings refresh automatically before expiry
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="flex">
                <AlertCircle className="mr-3 h-5 w-5 flex-shrink-0 text-blue-500" />
                <div className="text-sm text-blue-700">
                  <p className="font-medium">HIPAA Compliance</p>
                  <p className="mt-1">
                    All Zoom meetings use HIPAA-compliant settings including enhanced encryption,
                    waiting rooms, and cloud recording with patient consent requirements.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Apple Calendar Setup Modal */}
      {showAppleModal && appleSetup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="mx-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white">
            <div className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">Add to Apple Calendar</h3>
                <button
                  onClick={() => setShowAppleModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-4">
                {/* QR Code */}
                <div className="rounded-lg bg-gray-50 p-4 text-center">
                  <p className="mb-3 text-sm text-gray-500">Scan with your iPhone</p>
                  <img
                    src={appleSetup.qrCodeUrl}
                    alt="QR Code for calendar subscription"
                    className="mx-auto h-48 w-48"
                  />
                </div>

                {/* URLs */}
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      WebCal URL (Mac/iOS)
                    </label>
                    <div className="mt-1 flex">
                      <input
                        type="text"
                        readOnly
                        value={appleSetup.webcalUrl}
                        className="flex-1 rounded-l border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
                      />
                      <button
                        onClick={() => copyToClipboard(appleSetup.webcalUrl, 'apple-webcal')}
                        className="rounded-r border border-l-0 border-gray-200 bg-gray-100 px-3 py-2 hover:bg-gray-200"
                      >
                        {copySuccess === 'apple-webcal' ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4 text-gray-500" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">HTTP URL</label>
                    <div className="mt-1 flex">
                      <input
                        type="text"
                        readOnly
                        value={appleSetup.feedUrl}
                        className="flex-1 rounded-l border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
                      />
                      <button
                        onClick={() => copyToClipboard(appleSetup.feedUrl, 'apple-feed')}
                        className="rounded-r border border-l-0 border-gray-200 bg-gray-100 px-3 py-2 hover:bg-gray-200"
                      >
                        {copySuccess === 'apple-feed' ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4 text-gray-500" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Instructions */}
                <div className="rounded-lg bg-gray-50 p-4">
                  <h4 className="mb-2 font-medium text-gray-900">Instructions</h4>
                  <ul className="space-y-1 text-sm text-gray-600">
                    {appleSetup.instructions.slice(0, 4).map((instruction, i) => (
                      <li key={i}>{instruction}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowAppleModal(false)}
                  className="rounded-md bg-[var(--brand-primary,#4fa77e)] px-4 py-2 text-white hover:bg-[var(--brand-primary-dark,#3d8563)]"
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
