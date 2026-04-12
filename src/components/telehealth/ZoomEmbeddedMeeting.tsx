'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

import {
  Video,
  VideoOff,
  ExternalLink,
  PhoneOff,
  Mic,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

export interface ZoomEmbeddedMeetingProps {
  meetingNumber: string;
  password?: string;
  userName?: string;
  joinUrl?: string;
  sessionId?: number;
  leaveRef?: React.MutableRefObject<(() => void) | null>;
  onMeetingStart?: () => void;
  onMeetingEnd?: (reason?: string) => void;
}

type MeetingStatus = 'ready' | 'loading' | 'active' | 'ended';

/**
 * Fetch a fresh host URL (start_url with embedded ZAK token) from the backend.
 * The ZAK in the URL auto-authenticates the provider as the Zoom host —
 * no separate Zoom login is required.
 */
async function fetchFreshHostUrl(
  meetingNumber: string,
  sessionId?: number,
  fallbackUrl?: string,
): Promise<string | null> {
  try {
    const res = await fetch('/api/v2/zoom/meetings/host-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        sessionId ? { sessionId } : { meetingId: meetingNumber },
      ),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.hostUrl) return data.hostUrl;
    }
  } catch { /* fall through */ }
  return fallbackUrl || null;
}

export default function ZoomEmbeddedMeeting({
  meetingNumber,
  joinUrl,
  sessionId,
  leaveRef,
  onMeetingStart,
  onMeetingEnd,
}: ZoomEmbeddedMeetingProps) {
  const [status, setStatus] = useState<MeetingStatus>('ready');
  const [hostUrl, setHostUrl] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const joinBtnRef = useRef<HTMLButtonElement>(null);

  const effectiveUrl = hostUrl || joinUrl;

  const endMeeting = useCallback(
    (reason?: string) => {
      if (!mountedRef.current) return;
      setStatus('ended');
      onMeetingEnd?.(reason);
    },
    [onMeetingEnd],
  );

  useEffect(() => {
    if (leaveRef) leaveRef.current = () => endMeeting('provider_ended');
    return () => {
      if (leaveRef) leaveRef.current = null;
    };
  }, [endMeeting, leaveRef]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (status === 'ready' && joinBtnRef.current) {
      joinBtnRef.current.focus();
    }
  }, [status]);

  const handleStartMeeting = useCallback(async () => {
    setStatus('loading');

    // Fetch a fresh start_url with ZAK from the backend.
    // The ZAK token embedded in the URL authenticates the
    // provider as host automatically — no Zoom login needed.
    const freshUrl = await fetchFreshHostUrl(meetingNumber, sessionId, joinUrl);

    if (freshUrl) {
      setHostUrl(freshUrl);
      window.open(freshUrl, '_blank', 'noopener,noreferrer');
    } else if (joinUrl) {
      window.open(joinUrl, '_blank', 'noopener,noreferrer');
    }

    if (mountedRef.current) {
      setStatus('active');
      onMeetingStart?.();
    }
  }, [meetingNumber, sessionId, joinUrl, onMeetingStart]);

  const reopenMeeting = useCallback(async () => {
    const freshUrl = await fetchFreshHostUrl(meetingNumber, sessionId, effectiveUrl ?? undefined);
    const url = freshUrl || effectiveUrl;
    if (url) {
      if (freshUrl) setHostUrl(freshUrl);
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, [meetingNumber, sessionId, effectiveUrl]);

  // ── Ready ──
  if (status === 'ready') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 p-8">
        {meetingNumber ? (
          <button
            ref={joinBtnRef}
            onClick={handleStartMeeting}
            className="group flex flex-col items-center gap-6 rounded-3xl bg-blue-600 px-16 py-10 shadow-2xl transition-all hover:bg-blue-700 hover:shadow-blue-900/30 active:scale-[0.97] focus:outline-none focus:ring-4 focus:ring-blue-400/50"
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/20 transition-transform group-hover:scale-110">
              <Video className="h-10 w-10 text-white" />
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-white">Start Zoom Call</p>
              <p className="mt-1 text-sm text-blue-200">Meeting #{meetingNumber}</p>
            </div>
          </button>
        ) : (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-red-600/20">
              <AlertTriangle className="h-10 w-10 text-red-400" />
            </div>
            <p className="text-lg font-semibold text-white">No meeting link available</p>
            <p className="mt-1 text-sm text-gray-400">
              Go back and generate the video link first
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── Loading ──
  if (status === 'loading') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 p-8">
        <Loader2 className="mb-4 h-12 w-12 animate-spin text-blue-400" />
        <p className="text-lg font-semibold text-white">Starting meeting as host...</p>
        <p className="mt-1 text-sm text-gray-400">
          Getting your host credentials from Zoom
        </p>
      </div>
    );
  }

  // ── Ended ──
  if (status === 'ended') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 p-8">
        <VideoOff className="mb-4 h-12 w-12 text-gray-400" />
        <p className="text-lg font-semibold text-white">Meeting Ended</p>
      </div>
    );
  }

  // ── Active ──
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 p-8">
      <div className="mb-8 flex flex-col items-center">
        <div className="relative mb-6">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-600/20">
            <Video className="h-12 w-12 text-emerald-400" />
          </div>
          <span className="absolute -right-1 -top-1 flex h-5 w-5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-5 w-5 rounded-full bg-emerald-500" />
          </span>
        </div>
        <p className="mb-1 text-lg font-semibold text-white">Call in Progress</p>
        <p className="mb-1 text-sm text-gray-400">Meeting #{meetingNumber}</p>
        <div className="mt-2 flex items-center gap-1.5 rounded-full bg-emerald-900/30 px-3 py-1">
          <Mic className="h-3 w-3 text-emerald-400" />
          <span className="text-xs font-medium text-emerald-400">You joined as host</span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3">
        <button
          onClick={reopenMeeting}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <ExternalLink className="h-4 w-4" />
          Reopen Zoom Window
        </button>
        <button
          onClick={() => endMeeting('provider_ended')}
          className="flex items-center gap-2 rounded-lg bg-red-600/20 px-6 py-2.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-600/30"
        >
          <PhoneOff className="h-4 w-4" />
          End Call
        </button>
      </div>
    </div>
  );
}
