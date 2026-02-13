'use client';

/**
 * Provider Calendar Status Card
 *
 * Displays calendar sync and Zoom status on the provider dashboard.
 * Shows connected calendars, upcoming telehealth sessions, and quick actions.
 */

import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Video,
  CheckCircle,
  XCircle,
  Clock,
  ExternalLink,
  Settings,
  RefreshCw,
  Users,
} from 'lucide-react';
import Link from 'next/link';

interface TelehealthSession {
  id: number;
  topic: string;
  scheduledAt: string;
  duration: number;
  status: string;
  joinUrl: string;
  patient: {
    firstName: string;
    lastName: string;
  };
}

interface CalendarStatus {
  google: boolean;
  outlook: boolean;
  apple: boolean;
  lastSyncAt: string | null;
}

interface Props {
  providerId?: number;
  compact?: boolean;
}

export default function ProviderCalendarStatusCard({ providerId, compact = false }: Props) {
  const [loading, setLoading] = useState(true);
  const [calendarStatus, setCalendarStatus] = useState<CalendarStatus>({
    google: false,
    outlook: false,
    apple: false,
    lastSyncAt: null,
  });
  const [upcomingSessions, setUpcomingSessions] = useState<TelehealthSession[]>([]);
  const [zoomEnabled, setZoomEnabled] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    setCalendarError(null);
    try {
      // Fetch calendar status
      const calRes = await fetch('/api/calendar-sync?action=status');
      if (calRes.ok) {
        const data = await calRes.json();
        const integrations = data.integrations || [];
        setCalendarStatus({
          google: integrations.find((i: any) => i.provider === 'google')?.isConnected || false,
          outlook: integrations.find((i: any) => i.provider === 'outlook')?.isConnected || false,
          apple: integrations.find((i: any) => i.provider === 'apple')?.isConnected || false,
          lastSyncAt: integrations.find((i: any) => i.lastSyncAt)?.lastSyncAt || null,
        });
      } else {
        const errBody = await calRes.json().catch(() => ({}));
        if (calRes.status === 404 && errBody.code === 'PROVIDER_NOT_LINKED') {
          setCalendarError(
            errBody.hint ||
              'Your account is not linked to a provider profile. Ask an admin to link your user.'
          );
        }
      }

      // Fetch upcoming telehealth sessions
      const sessionsRes = await fetch('/api/provider/telehealth/upcoming');
      if (sessionsRes.ok) {
        const data = await sessionsRes.json();
        setUpcomingSessions(data.sessions || []);
        setZoomEnabled(data.zoomEnabled || false);
      }
    } catch (error) {
      console.error('Failed to fetch status:', error);
    } finally {
      setLoading(false);
    }
  };

  const connectedCount = [
    calendarStatus.google,
    calendarStatus.outlook,
    calendarStatus.apple,
  ].filter(Boolean).length;

  if (loading) {
    return (
      <div className="animate-pulse rounded-lg bg-white p-4 shadow">
        <div className="mb-3 h-4 w-1/3 rounded bg-gray-200"></div>
        <div className="mb-2 h-8 rounded bg-gray-200"></div>
        <div className="h-8 rounded bg-gray-200"></div>
      </div>
    );
  }

  if (calendarError) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow">
        <div className="mb-2 flex items-center gap-2 text-amber-800">
          <Calendar className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm font-medium">Calendar</span>
        </div>
        <p className="text-sm text-amber-700">{calendarError}</p>
        <button
          type="button"
          onClick={() => fetchStatus()}
          className="mt-2 text-sm font-medium text-amber-800 underline hover:text-amber-900"
        >
          Retry
        </button>
      </div>
    );
  }

  if (compact) {
    // Compact version for sidebar
    return (
      <div className="rounded-lg bg-white p-4 shadow">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-900">Calendar & Video</h3>
          <Link
            href="/provider/settings/calendar"
            className="text-xs text-[var(--brand-primary,#4fa77e)] hover:underline"
          >
            Settings
          </Link>
        </div>

        <div className="space-y-2">
          {/* Calendar Status */}
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center text-gray-600">
              <Calendar className="mr-2 h-4 w-4" />
              Calendars
            </span>
            <span className={connectedCount > 0 ? 'text-green-600' : 'text-gray-400'}>
              {connectedCount}/3 connected
            </span>
          </div>

          {/* Zoom Status */}
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center text-gray-600">
              <Video className="mr-2 h-4 w-4" />
              Zoom
            </span>
            <span className={zoomEnabled ? 'text-green-600' : 'text-gray-400'}>
              {zoomEnabled ? 'Enabled' : 'Not configured'}
            </span>
          </div>

          {/* Upcoming Session */}
          {upcomingSessions.length > 0 && (
            <div className="mt-3 border-t pt-3">
              <p className="mb-1 text-xs text-gray-500">Next Video Call</p>
              <div className="flex items-center justify-between">
                <span className="truncate text-sm font-medium">
                  {upcomingSessions[0].patient.firstName} {upcomingSessions[0].patient.lastName}
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(upcomingSessions[0].scheduledAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Full version
  return (
    <div className="rounded-lg bg-white shadow">
      <div className="border-b border-gray-100 p-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center font-medium text-gray-900">
            <Calendar className="mr-2 h-5 w-5 text-[var(--brand-primary,#4fa77e)]" />
            Calendar & Telehealth
          </h3>
          <Link
            href="/provider/settings/calendar"
            className="flex items-center text-sm text-[var(--brand-primary,#4fa77e)] hover:underline"
          >
            <Settings className="mr-1 h-4 w-4" />
            Settings
          </Link>
        </div>
      </div>

      <div className="p-4">
        {/* Calendar Connections */}
        <div className="mb-4">
          <p className="mb-2 text-sm text-gray-500">Connected Calendars</p>
          <div className="flex space-x-3">
            <div
              className={`flex items-center rounded-full px-3 py-2 text-sm ${
                calendarStatus.google
                  ? 'border border-green-200 bg-green-50 text-green-700'
                  : 'border border-gray-200 bg-gray-50 text-gray-400'
              }`}
            >
              <svg className="mr-1 h-4 w-4" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
              </svg>
              Google
              {calendarStatus.google && <CheckCircle className="ml-1 h-3 w-3" />}
            </div>
            <div
              className={`flex items-center rounded-full px-3 py-2 text-sm ${
                calendarStatus.outlook
                  ? 'border border-green-200 bg-green-50 text-green-700'
                  : 'border border-gray-200 bg-gray-50 text-gray-400'
              }`}
            >
              <svg className="mr-1 h-4 w-4" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M24 7.387v10.478c0 .23-.08.424-.238.576-.157.152-.355.228-.594.228H8.22l-.324-.228V7.387l.324-.228h14.947c.24 0 .438.076.595.228.157.152.237.346.237.576z"
                />
              </svg>
              Outlook
              {calendarStatus.outlook && <CheckCircle className="ml-1 h-3 w-3" />}
            </div>
            <div
              className={`flex items-center rounded-full px-3 py-2 text-sm ${
                calendarStatus.apple
                  ? 'border border-green-200 bg-green-50 text-green-700'
                  : 'border border-gray-200 bg-gray-50 text-gray-400'
              }`}
            >
              <svg className="mr-1 h-4 w-4" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83z"
                />
              </svg>
              Apple
              {calendarStatus.apple && <CheckCircle className="ml-1 h-3 w-3" />}
            </div>
          </div>
          {calendarStatus.lastSyncAt && (
            <p className="mt-2 flex items-center text-xs text-gray-400">
              <RefreshCw className="mr-1 h-3 w-3" />
              Last sync: {new Date(calendarStatus.lastSyncAt).toLocaleString()}
            </p>
          )}
        </div>

        {/* Upcoming Telehealth Sessions */}
        <div>
          <p className="mb-2 flex items-center text-sm text-gray-500">
            <Video className="mr-1 h-4 w-4" />
            Upcoming Video Consultations
          </p>

          {!zoomEnabled ? (
            <div className="rounded-lg bg-gray-50 py-4 text-center">
              <Video className="mx-auto mb-2 h-8 w-8 text-gray-300" />
              <p className="text-sm text-gray-500">Zoom not configured</p>
              <p className="text-xs text-gray-400">Contact admin to enable telehealth</p>
            </div>
          ) : upcomingSessions.length === 0 ? (
            <div className="rounded-lg bg-gray-50 py-4 text-center">
              <Clock className="mx-auto mb-2 h-8 w-8 text-gray-300" />
              <p className="text-sm text-gray-500">No upcoming sessions</p>
            </div>
          ) : (
            <div className="space-y-2">
              {upcomingSessions.slice(0, 3).map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between rounded-lg bg-gray-50 p-3 hover:bg-gray-100"
                >
                  <div className="flex items-center">
                    <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand-primary-light,#e8f5f0)]">
                      <Users className="h-4 w-4 text-[var(--brand-primary,#4fa77e)]" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {session.patient.firstName} {session.patient.lastName}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(session.scheduledAt).toLocaleString([], {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {' · '}
                        {session.duration} min
                      </p>
                    </div>
                  </div>
                  <a
                    href={session.joinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center rounded-md bg-blue-500 px-3 py-1.5 text-sm text-white hover:bg-blue-600"
                  >
                    <Video className="mr-1 h-3 w-3" />
                    Join
                  </a>
                </div>
              ))}

              {upcomingSessions.length > 3 && (
                <Link
                  href="/provider/telehealth"
                  className="block py-2 text-center text-sm text-[var(--brand-primary,#4fa77e)] hover:underline"
                >
                  View all {upcomingSessions.length} sessions
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
