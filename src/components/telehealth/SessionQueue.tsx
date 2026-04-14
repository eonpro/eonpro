'use client';

import { useState, useEffect, useCallback } from 'react';

import {
  Video,
  Calendar,
  Clock,
  Users,
  Plus,
  CheckCircle,
  XCircle,
  AlertCircle,
  Copy,
  Loader2,
  ChevronRight,
  RefreshCw,
  Trash2,
  LinkIcon,
} from 'lucide-react';

import { apiFetch } from '@/lib/api/fetch';

import { type TelehealthSessionData } from './types';

interface SessionQueueProps {
  onSelectSession: (session: TelehealthSessionData) => void;
  onScheduleNew: () => void;
}

const STATUS_CONFIG: Record<string, { icon: typeof Clock; color: string; label: string }> = {
  SCHEDULED: { icon: Clock, color: 'text-blue-700 bg-blue-50 ring-blue-200', label: 'Scheduled' },
  WAITING: {
    icon: Users,
    color: 'text-amber-700 bg-amber-50 ring-amber-200',
    label: 'Patient Waiting',
  },
  IN_PROGRESS: {
    icon: Video,
    color: 'text-emerald-700 bg-emerald-50 ring-emerald-200',
    label: 'In Progress',
  },
  COMPLETED: {
    icon: CheckCircle,
    color: 'text-gray-600 bg-gray-50 ring-gray-200',
    label: 'Completed',
  },
  CANCELLED: { icon: XCircle, color: 'text-red-600 bg-red-50 ring-red-200', label: 'Cancelled' },
  NO_SHOW: {
    icon: AlertCircle,
    color: 'text-orange-600 bg-orange-50 ring-orange-200',
    label: 'No Show',
  },
};

export default function SessionQueue({ onSelectSession, onScheduleNew }: SessionQueueProps) {
  const [sessions, setSessions] = useState<TelehealthSessionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [provisioningId, setProvisioningId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [provisionError, setProvisionError] = useState<number | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await apiFetch('/api/provider/telehealth/upcoming');
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions ?? []);
        setError(null);
      } else {
        setError('Failed to load sessions. Please try refreshing.');
      }
    } catch {
      setError('Unable to connect. Please check your internet connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSessions();
    const interval = setInterval(() => void fetchSessions(), 15000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  const copyLink = async (session: TelehealthSessionData) => {
    if (!session.joinUrl) return;
    try {
      await navigator.clipboard.writeText(session.joinUrl);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = session.joinUrl;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopiedId(session.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const cancelSession = async (session: TelehealthSessionData) => {
    if (!session.appointment?.id) return;
    if (
      !window.confirm(
        `Cancel the telehealth session with ${session.patient.firstName} ${session.patient.lastName}?`
      )
    )
      return;

    try {
      const res = await apiFetch(
        `/api/scheduling/appointments?appointmentId=${session.appointment.id}&reason=Provider+cancelled+telehealth+session`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        void fetchSessions();
      }
    } catch {
      // silently fail
    }
  };

  const provisionMeeting = async (session: TelehealthSessionData) => {
    if (!session.appointment?.id) return;
    setProvisioningId(session.id);
    setProvisionError(null);
    try {
      const res = await apiFetch('/api/v2/zoom/meetings/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: session.appointment.id }),
      });
      if (res.ok) {
        void fetchSessions();
      } else {
        setProvisionError(session.id);
      }
    } catch {
      setProvisionError(session.id);
    } finally {
      setProvisioningId(null);
    }
  };

  const waitingSessions = sessions.filter((s) => s.status === 'WAITING');
  const upcomingSessions = sessions.filter((s) => s.status === 'SCHEDULED');
  const activeSessions = sessions.filter((s) => s.status === 'IN_PROGRESS');

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-blue-500" />
          <p className="text-sm text-gray-500">Loading your sessions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Telehealth Center</h1>
          <p className="mt-1 text-sm text-gray-500">
            {sessions.length > 0
              ? `${waitingSessions.length + upcomingSessions.length + activeSessions.length} active sessions`
              : 'No upcoming sessions'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void fetchSessions()}
            className="rounded-lg border border-gray-200 bg-white p-2.5 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={onScheduleNew}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Schedule Session
          </button>
        </div>
      </div>

      {/* Fetch Error Banner */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
          <p className="flex-1 text-sm text-red-700">{error}</p>
          <button
            onClick={() => {
              setError(null);
              void fetchSessions();
            }}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* Patients Waiting Alert */}
      {waitingSessions.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50">
          <div className="px-5 py-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-500" />
              </span>
              <h2 className="text-sm font-semibold text-amber-900">
                {waitingSessions.length} patient{waitingSessions.length !== 1 ? 's' : ''} waiting
              </h2>
            </div>
          </div>
          <div className="divide-y divide-amber-100">
            {waitingSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onSelect={onSelectSession}
                onCopy={copyLink}
                onCancel={cancelSession}
                onProvision={provisionMeeting}
                copiedId={copiedId}
                provisioningId={provisioningId}
                provisionError={provisionError}
                highlight
              />
            ))}
          </div>
        </div>
      )}

      {/* Active Calls */}
      {activeSessions.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-emerald-200 bg-white">
          <div className="border-b border-emerald-100 bg-emerald-50 px-5 py-3">
            <h2 className="text-sm font-semibold text-emerald-800">Active Calls</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {activeSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onSelect={onSelectSession}
                onCopy={copyLink}
                onCancel={cancelSession}
                onProvision={provisionMeeting}
                copiedId={copiedId}
                provisioningId={provisioningId}
                provisionError={provisionError}
              />
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Sessions */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-700">Upcoming Sessions</h2>
        </div>
        {upcomingSessions.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Video className="mx-auto mb-3 h-10 w-10 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">No upcoming sessions</p>
            <p className="mt-1 text-xs text-gray-400">
              Schedule a telehealth consultation to get started
            </p>
            <button
              onClick={onScheduleNew}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50"
            >
              <Plus className="h-4 w-4" />
              Schedule Session
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {upcomingSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onSelect={onSelectSession}
                onCopy={copyLink}
                onCancel={cancelSession}
                onProvision={provisionMeeting}
                copiedId={copiedId}
                provisioningId={provisioningId}
                provisionError={provisionError}
              />
            ))}
          </div>
        )}
      </div>

      {/* Quick Stats */}
      {sessions.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-2xl font-bold text-blue-600">
              {upcomingSessions.length + waitingSessions.length}
            </div>
            <div className="text-xs font-medium text-gray-500">Pending</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-2xl font-bold text-emerald-600">{activeSessions.length}</div>
            <div className="text-xs font-medium text-gray-500">In Progress</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-2xl font-bold text-gray-600">
              {sessions.filter((s) => s.status === 'COMPLETED').length}
            </div>
            <div className="text-xs font-medium text-gray-500">Completed</div>
          </div>
        </div>
      )}
    </div>
  );
}

function SessionCard({
  session,
  onSelect,
  onCopy,
  onCancel,
  onProvision,
  copiedId,
  provisioningId,
  provisionError,
  highlight = false,
}: {
  session: TelehealthSessionData;
  onSelect: (s: TelehealthSessionData) => void;
  onCopy: (s: TelehealthSessionData) => void;
  onCancel: (s: TelehealthSessionData) => void;
  onProvision: (s: TelehealthSessionData) => void;
  copiedId: number | null;
  provisioningId: number | null;
  provisionError: number | null;
  highlight?: boolean;
}) {
  const badge = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.SCHEDULED;
  const Icon = badge.icon;
  const hasMeetingData = !!(session.meetingId && session.joinUrl);
  const isProvisioning = provisioningId === session.id;

  const formatTime = (dateStr: string) =>
    new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(
      new Date(dateStr)
    );

  const isToday = (dateStr: string) =>
    new Date(dateStr).toDateString() === new Date().toDateString();

  const getActionLabel = () => {
    if (session.status === 'WAITING') return 'Join Now';
    if (session.status === 'IN_PROGRESS') return 'Rejoin';
    return 'Start';
  };
  const actionLabel = getActionLabel();

  const getActionColor = () => {
    if (session.status === 'WAITING') return 'bg-amber-600 hover:bg-amber-700';
    if (session.status === 'IN_PROGRESS') return 'bg-emerald-600 hover:bg-emerald-700';
    return 'bg-blue-600 hover:bg-blue-700';
  };
  const actionColor = getActionColor();

  return (
    <div
      className={`group px-5 py-4 transition-colors ${highlight ? 'bg-amber-50/50 hover:bg-amber-50' : 'hover:bg-gray-50'}`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-gray-900">
              {session.patient.firstName} {session.patient.lastName}
            </span>
            <span
              className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${badge.color}`}
            >
              <Icon className="h-3 w-3" />
              {badge.label}
            </span>
            {!hasMeetingData &&
              (session.status === 'SCHEDULED' || session.status === 'WAITING') && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700 ring-1 ring-inset ring-orange-200">
                  <AlertCircle className="h-3 w-3" />
                  Video link pending
                </span>
              )}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
            {session.topic && <span className="truncate">{session.topic}</span>}
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {isToday(session.scheduledAt)
                ? 'Today'
                : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
                    new Date(session.scheduledAt)
                  )}{' '}
              at {formatTime(session.scheduledAt)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {session.duration}min
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {(session.status === 'SCHEDULED' ||
            session.status === 'WAITING' ||
            session.status === 'IN_PROGRESS') && (
            <>
              {session.status === 'SCHEDULED' && session.appointment && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void onCancel(session);
                  }}
                  className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                  title="Cancel session"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}

              {hasMeetingData ? (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCopy(session);
                    }}
                    className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                    title="Copy patient link"
                  >
                    {copiedId === session.id ? (
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    onClick={() => onSelect(session)}
                    className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all ${actionColor}`}
                  >
                    <Video className="h-3.5 w-3.5" />
                    {actionLabel}
                  </button>
                </>
              ) : session.appointment ? (
                <div className="flex items-center gap-2">
                  {provisionError === session.id && (
                    <span className="text-[11px] font-medium text-red-600">Failed</span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void onProvision(session);
                    }}
                    disabled={isProvisioning}
                    className={`flex items-center gap-1.5 rounded-lg border px-4 py-2 text-xs font-semibold shadow-sm transition-all disabled:opacity-60 ${
                      provisionError === session.id
                        ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
                        : 'border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100'
                    }`}
                  >
                    {isProvisioning ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <LinkIcon className="h-3.5 w-3.5" />
                    )}
                    {isProvisioning
                      ? 'Generating...'
                      : provisionError === session.id
                        ? 'Retry'
                        : 'Generate Link'}
                  </button>
                </div>
              ) : null}
            </>
          )}

          {session.status === 'COMPLETED' && session.appointment && (
            <a
              href={`/provider/soap-notes?appointmentId=${session.appointment.id}`}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
            >
              SOAP Notes
              <ChevronRight className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
