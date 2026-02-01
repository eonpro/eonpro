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
  Clock
} from 'lucide-react';

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

  // Fetch data on mount
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch calendar integration status
      const calendarRes = await fetch('/api/calendar-sync?action=status');
      if (calendarRes.ok) {
        const data = await calendarRes.json();
        setConnections(data.integrations || []);
      }

      // Fetch subscriptions
      const subRes = await fetch('/api/calendar/subscriptions');
      if (subRes.ok) {
        const data = await subRes.json();
        setSubscriptions(data.subscriptions || []);
      }

      // Fetch Zoom status
      const zoomRes = await fetch('/api/v2/zoom/meetings?action=status');
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
        const res = await fetch('/api/calendar-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'connect', provider: 'apple' })
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
        const res = await fetch('/api/calendar-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'connect', provider })
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
      const res = await fetch('/api/calendar-sync', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider })
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
      const res = await fetch('/api/calendar-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync' })
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
      const res = await fetch('/api/calendar/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Appointments',
          includePatientNames: false,
          includeMeetingLinks: true,
          syncRangeDays: 90
        })
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
      const res = await fetch(`/api/calendar/subscriptions?subscriptionId=${id}`, {
        method: 'DELETE'
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
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
        );
      case 'outlook':
        return (
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#0078D4" d="M24 7.387v10.478c0 .23-.08.424-.238.576-.157.152-.355.228-.594.228H8.22l-.324-.228V7.387l.324-.228h14.947c.24 0 .438.076.595.228.157.152.237.346.237.576zM8.22 6.16L0 2.898v18.205l8.22-3.262V6.16zm0 .999v10.837l14.468 5.105V1.055L8.22 7.16z"/>
          </svg>
        );
      case 'apple':
        return (
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="currentColor" d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
          </svg>
        );
      default:
        return <Calendar className="w-5 h-5" />;
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-16 bg-gray-200 rounded"></div>
            <div className="h-16 bg-gray-200 rounded"></div>
            <div className="h-16 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex -mb-px">
          <button
            onClick={() => setActiveTab('calendars')}
            className={`px-6 py-4 text-sm font-medium border-b-2 ${
              activeTab === 'calendars'
                ? 'border-[var(--brand-primary,#4fa77e)] text-[var(--brand-primary,#4fa77e)]'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Calendar className="w-4 h-4 inline mr-2" />
            Calendar Sync
          </button>
          <button
            onClick={() => setActiveTab('subscriptions')}
            className={`px-6 py-4 text-sm font-medium border-b-2 ${
              activeTab === 'subscriptions'
                ? 'border-[var(--brand-primary,#4fa77e)] text-[var(--brand-primary,#4fa77e)]'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Link2 className="w-4 h-4 inline mr-2" />
            iCal Feeds
          </button>
          <button
            onClick={() => setActiveTab('zoom')}
            className={`px-6 py-4 text-sm font-medium border-b-2 ${
              activeTab === 'zoom'
                ? 'border-[var(--brand-primary,#4fa77e)] text-[var(--brand-primary,#4fa77e)]'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Video className="w-4 h-4 inline mr-2" />
            Zoom Telehealth
          </button>
        </nav>
      </div>

      <div className="p-6">
        {/* Calendar Sync Tab */}
        {activeTab === 'calendars' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-medium text-gray-900">Calendar Integrations</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Connect your calendar to sync appointments automatically
                </p>
              </div>
              <button
                onClick={handleSync}
                className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Sync Now
              </button>
            </div>

            <div className="grid gap-4">
              {['google', 'outlook', 'apple'].map((provider) => {
                const connection = connections.find(c => c.provider === provider);
                const isConnected = connection?.isConnected || false;

                return (
                  <div
                    key={provider}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100">
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
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Connected
                              {connection?.lastSyncAt && (
                                <span className="text-gray-400 ml-2">
                                  · Last sync: {new Date(connection.lastSyncAt).toLocaleString()}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="flex items-center text-gray-400">
                              <XCircle className="w-4 h-4 mr-1" />
                              Not connected
                            </span>
                          )}
                        </p>
                        {provider === 'apple' && (
                          <p className="text-xs text-gray-400 mt-1">
                            Uses iCal subscription (one-way sync)
                          </p>
                        )}
                      </div>
                    </div>
                    <div>
                      {isConnected ? (
                        <button
                          onClick={() => handleDisconnect(provider as 'google' | 'outlook' | 'apple')}
                          className="inline-flex items-center px-3 py-2 border border-red-300 rounded-md text-sm font-medium text-red-700 bg-white hover:bg-red-50"
                        >
                          <Unlink className="w-4 h-4 mr-1" />
                          Disconnect
                        </button>
                      ) : (
                        <button
                          onClick={() => handleConnect(provider as 'google' | 'outlook' | 'apple')}
                          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-[var(--brand-primary,#4fa77e)] hover:bg-[var(--brand-primary-dark,#3d8563)]"
                        >
                          Connect
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex">
                <AlertCircle className="w-5 h-5 text-blue-500 mr-3 flex-shrink-0" />
                <div className="text-sm text-blue-700">
                  <p className="font-medium">About Calendar Sync</p>
                  <ul className="mt-1 list-disc list-inside space-y-1">
                    <li>Google & Outlook provide two-way sync (appointments sync both ways)</li>
                    <li>Apple Calendar uses subscription feeds (our appointments → your calendar)</li>
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
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-medium text-gray-900">iCal Subscription Feeds</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Subscribe to your appointment feed in any calendar app
                </p>
              </div>
              <button
                onClick={handleCreateSubscription}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-[var(--brand-primary,#4fa77e)] hover:bg-[var(--brand-primary-dark,#3d8563)]"
              >
                Create Subscription
              </button>
            </div>

            {subscriptions.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
                <Link2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">No subscription feeds yet</p>
                <p className="text-sm text-gray-400 mt-1">
                  Create a subscription to sync appointments to your calendar
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {subscriptions.map((sub) => (
                  <div key={sub.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className="font-medium text-gray-900">{sub.name}</h4>
                        <p className="text-sm text-gray-500">
                          {sub.accessCount} accesses
                          {sub.lastAccessedAt && (
                            <span> · Last accessed: {new Date(sub.lastAccessedAt).toLocaleString()}</span>
                          )}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteSubscription(sub.id)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Delete
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center">
                        <div className="flex-1">
                          <label className="text-xs font-medium text-gray-500 flex items-center">
                            <Monitor className="w-3 h-3 mr-1" />
                            HTTP URL (Google, Outlook)
                          </label>
                          <div className="flex mt-1">
                            <input
                              type="text"
                              readOnly
                              value={sub.feedUrl}
                              className="flex-1 text-sm bg-gray-50 border border-gray-200 rounded-l px-3 py-2"
                            />
                            <button
                              onClick={() => copyToClipboard(sub.feedUrl, `feed-${sub.id}`)}
                              className="px-3 py-2 bg-gray-100 border border-l-0 border-gray-200 rounded-r hover:bg-gray-200"
                            >
                              {copySuccess === `feed-${sub.id}` ? (
                                <CheckCircle className="w-4 h-4 text-green-500" />
                              ) : (
                                <Copy className="w-4 h-4 text-gray-500" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center">
                        <div className="flex-1">
                          <label className="text-xs font-medium text-gray-500 flex items-center">
                            <Smartphone className="w-3 h-3 mr-1" />
                            WebCal URL (Apple Calendar, iOS)
                          </label>
                          <div className="flex mt-1">
                            <input
                              type="text"
                              readOnly
                              value={sub.webcalUrl}
                              className="flex-1 text-sm bg-gray-50 border border-gray-200 rounded-l px-3 py-2"
                            />
                            <button
                              onClick={() => copyToClipboard(sub.webcalUrl, `webcal-${sub.id}`)}
                              className="px-3 py-2 bg-gray-100 border border-l-0 border-gray-200 rounded-r hover:bg-gray-200"
                            >
                              {copySuccess === `webcal-${sub.id}` ? (
                                <CheckCircle className="w-4 h-4 text-green-500" />
                              ) : (
                                <Copy className="w-4 h-4 text-gray-500" />
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

            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-2">How to Subscribe</h4>
              <div className="grid md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="font-medium text-gray-700">Apple Calendar</p>
                  <ol className="text-gray-500 mt-1 space-y-1">
                    <li>1. Copy the WebCal URL</li>
                    <li>2. File → New Calendar Subscription</li>
                    <li>3. Paste URL and Subscribe</li>
                  </ol>
                </div>
                <div>
                  <p className="font-medium text-gray-700">Google Calendar</p>
                  <ol className="text-gray-500 mt-1 space-y-1">
                    <li>1. Copy the HTTP URL</li>
                    <li>2. Settings → Add Calendar → From URL</li>
                    <li>3. Paste URL and Add</li>
                  </ol>
                </div>
                <div>
                  <p className="font-medium text-gray-700">Outlook</p>
                  <ol className="text-gray-500 mt-1 space-y-1">
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
              <p className="text-sm text-gray-500 mt-1">
                Video consultation settings for telehealth appointments
              </p>
            </div>

            <div className="border rounded-lg p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 flex items-center justify-center rounded-full bg-blue-100">
                    <Video className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">Zoom Video Consultations</h4>
                    <p className="text-sm text-gray-500 mt-1">
                      {zoomStatus?.configured ? (
                        <span className="flex items-center text-green-600">
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Configured and ready
                        </span>
                      ) : (
                        <span className="flex items-center text-yellow-600">
                          <AlertCircle className="w-4 h-4 mr-1" />
                          Not configured - contact administrator
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                {zoomStatus?.configured && (
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    zoomStatus.enabled 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {zoomStatus.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                )}
              </div>

              {zoomStatus?.configured && (
                <div className="mt-6 grid md:grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h5 className="font-medium text-gray-900 mb-2">Features</h5>
                    <ul className="text-sm text-gray-600 space-y-2">
                      <li className="flex items-center">
                        <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                        HD Video Consultations
                      </li>
                      <li className="flex items-center">
                        <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                        Screen Sharing
                      </li>
                      <li className="flex items-center">
                        {zoomStatus.waitingRoomEnabled ? (
                          <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                        ) : (
                          <XCircle className="w-4 h-4 text-gray-400 mr-2" />
                        )}
                        Waiting Room
                      </li>
                      <li className="flex items-center">
                        <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                        Cloud Recording (with consent)
                      </li>
                    </ul>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <h5 className="font-medium text-gray-900 mb-2">Auto-Create Meetings</h5>
                    <p className="text-sm text-gray-600">
                      When you schedule a VIDEO appointment, a Zoom meeting is automatically created 
                      and the link is included in patient reminders.
                    </p>
                    <div className="mt-3 flex items-center text-sm text-[var(--brand-primary,#4fa77e)]">
                      <Clock className="w-4 h-4 mr-1" />
                      Meetings refresh automatically before expiry
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex">
                <AlertCircle className="w-5 h-5 text-blue-500 mr-3 flex-shrink-0" />
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
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                {/* QR Code */}
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500 mb-3">Scan with your iPhone</p>
                  <img
                    src={appleSetup.qrCodeUrl}
                    alt="QR Code for calendar subscription"
                    className="w-48 h-48 mx-auto"
                  />
                </div>

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
                        onClick={() => copyToClipboard(appleSetup.webcalUrl, 'apple-webcal')}
                        className="px-3 py-2 bg-gray-100 border border-l-0 border-gray-200 rounded-r hover:bg-gray-200"
                      >
                        {copySuccess === 'apple-webcal' ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
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
                        onClick={() => copyToClipboard(appleSetup.feedUrl, 'apple-feed')}
                        className="px-3 py-2 bg-gray-100 border border-l-0 border-gray-200 rounded-r hover:bg-gray-200"
                      >
                        {copySuccess === 'apple-feed' ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
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
                    {appleSetup.instructions.slice(0, 4).map((instruction, i) => (
                      <li key={i}>{instruction}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowAppleModal(false)}
                  className="px-4 py-2 bg-[var(--brand-primary,#4fa77e)] text-white rounded-md hover:bg-[var(--brand-primary-dark,#3d8563)]"
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
