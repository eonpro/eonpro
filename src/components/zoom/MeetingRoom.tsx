'use client';

import { useState, useEffect, useCallback } from 'react';
import { isFeatureEnabled } from '@/lib/features';
import {
  Video,
  ExternalLink,
  Clock,
  Users,
  Loader2,
  AlertCircle,
  CheckCircle,
  Copy,
  ArrowLeft,
  Shield,
} from 'lucide-react';

export interface MeetingRoomProps {
  meetingId: string;
  meetingPassword?: string;
  userName: string;
  userEmail?: string;
  role: 'host' | 'participant';
  joinUrl?: string;
  hostUrl?: string;
  topic?: string;
  patientName?: string;
  scheduledAt?: string;
  duration?: number;
  onBack?: () => void;
}

type LobbyState = 'ready' | 'launched' | 'ended';

export default function MeetingRoom({
  meetingId,
  meetingPassword,
  userName,
  role,
  joinUrl,
  hostUrl,
  topic,
  patientName,
  scheduledAt,
  duration,
  onBack,
}: MeetingRoomProps) {
  const [lobbyState, setLobbyState] = useState<LobbyState>('ready');
  const [copied, setCopied] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [launchedAt, setLaunchedAt] = useState<number | null>(null);

  const isEnabled = isFeatureEnabled('ZOOM_TELEHEALTH');
  const zoomUrl = role === 'host' ? (hostUrl || joinUrl) : joinUrl;

  useEffect(() => {
    if (lobbyState !== 'launched' || !launchedAt) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - launchedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [lobbyState, launchedAt]);

  const formatDuration = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const launchZoom = useCallback(() => {
    if (!zoomUrl) return;
    window.open(zoomUrl, '_blank', 'noopener,noreferrer');
    setLobbyState('launched');
    setLaunchedAt(Date.now());
  }, [zoomUrl]);

  const copyLink = useCallback(() => {
    const link = joinUrl || '';
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [joinUrl]);

  if (!isEnabled) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="max-w-md text-center">
          <AlertCircle className="mx-auto mb-4 h-16 w-16 text-yellow-500" />
          <h2 className="mb-2 text-2xl font-semibold text-gray-900">Zoom Telehealth Not Enabled</h2>
          <p className="text-gray-500">
            Please enable the Zoom Telehealth feature to use video consultations.
          </p>
        </div>
      </div>
    );
  }

  if (!zoomUrl) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="max-w-md text-center">
          <AlertCircle className="mx-auto mb-4 h-16 w-16 text-red-500" />
          <h2 className="mb-2 text-2xl font-semibold text-gray-900">Meeting Link Unavailable</h2>
          <p className="mb-4 text-gray-500">
            No Zoom meeting link is available. The meeting may not have been created yet.
          </p>
          {onBack && (
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200"
            >
              <ArrowLeft className="h-4 w-4" />
              Go Back
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl py-8">
      {onBack && (
        <button
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Telehealth Center
        </button>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {/* Header */}
        <div className="border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-8 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600">
              <Video className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                {topic || 'Telehealth Consultation'}
              </h1>
              <p className="text-sm text-gray-600">
                {role === 'host' ? 'You are the host' : 'You are a participant'}
              </p>
            </div>
          </div>
        </div>

        {/* Meeting Details */}
        <div className="space-y-4 px-8 py-6">
          {patientName && (
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Patient</p>
                <p className="font-medium text-gray-900">{patientName}</p>
              </div>
            </div>
          )}

          {scheduledAt && (
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Scheduled</p>
                <p className="font-medium text-gray-900">
                  {new Date(scheduledAt).toLocaleString([], {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {duration ? ` (${duration} min)` : ''}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">Meeting ID</p>
              <p className="font-mono text-sm font-medium text-gray-900">{meetingId}</p>
            </div>
          </div>

          {/* HIPAA Notice */}
          <div className="rounded-lg bg-green-50 p-3">
            <p className="flex items-center gap-2 text-xs text-green-700">
              <Shield className="h-3.5 w-3.5" />
              HIPAA-compliant connection with enhanced encryption
            </p>
          </div>
        </div>

        {/* Action Area */}
        <div className="border-t border-gray-100 bg-gray-50 px-8 py-6">
          {lobbyState === 'ready' && (
            <div className="space-y-3">
              <button
                onClick={launchZoom}
                className="flex w-full items-center justify-center gap-3 rounded-xl bg-blue-600 px-6 py-4 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                <Video className="h-6 w-6" />
                {role === 'host' ? 'Start Meeting in Zoom' : 'Join Meeting in Zoom'}
                <ExternalLink className="h-5 w-5" />
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={copyLink}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  {copied ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy Patient Link
                    </>
                  )}
                </button>
              </div>

              <p className="text-center text-xs text-gray-500">
                Zoom will open in a new tab. This page will stay open for you to return to.
              </p>
            </div>
          )}

          {lobbyState === 'launched' && (
            <div className="space-y-4 text-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-green-100 px-4 py-2 text-green-700">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500"></span>
                </span>
                Meeting in progress
              </div>

              <div className="text-3xl font-mono font-bold text-gray-900">
                {formatDuration(elapsed)}
              </div>

              <p className="text-sm text-gray-500">
                Zoom is open in another tab. Return here when the meeting is finished.
              </p>

              <div className="flex items-center gap-2">
                <button
                  onClick={launchZoom}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
                >
                  <ExternalLink className="h-4 w-4" />
                  Rejoin Zoom
                </button>
                <button
                  onClick={() => setLobbyState('ended')}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  End Session
                </button>
              </div>
            </div>
          )}

          {lobbyState === 'ended' && (
            <div className="space-y-4 text-center">
              <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
              <h3 className="text-lg font-semibold text-gray-900">Meeting Ended</h3>
              <p className="text-sm text-gray-500">
                Duration: {formatDuration(elapsed)}
              </p>

              <div className="flex items-center gap-2">
                {onBack && (
                  <button
                    onClick={onBack}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--brand-primary,#4fa77e)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Dashboard
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
