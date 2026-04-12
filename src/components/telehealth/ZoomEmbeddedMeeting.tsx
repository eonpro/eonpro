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

type MeetingStatus = 'ready' | 'loading' | 'active' | 'ended' | 'error';

interface SdkCredentials {
  signature: string;
  sdkKey: string;
  role: number;
  zak?: string;
}

async function fetchSdkCredentials(
  meetingNumber: string,
  sessionId?: number,
): Promise<SdkCredentials | null> {
  try {
    const res = await fetch('/api/v2/zoom/sdk-signature', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meetingNumber,
        role: 1,
        ...(sessionId ? { sessionId } : {}),
      }),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default function ZoomEmbeddedMeeting({
  meetingNumber,
  password,
  userName,
  joinUrl,
  sessionId,
  leaveRef,
  onMeetingStart,
  onMeetingEnd,
}: ZoomEmbeddedMeetingProps) {
  const [status, setStatus] = useState<MeetingStatus>('ready');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [usingFallback, setUsingFallback] = useState(false);
  const mountedRef = useRef(true);
  const clientRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const joinBtnRef = useRef<HTMLButtonElement>(null);

  const endMeeting = useCallback(
    (reason?: string) => {
      if (!mountedRef.current) return;

      try {
        if (clientRef.current) {
          clientRef.current.leaveMeeting();
        }
      } catch { /* already left */ }

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
    return () => {
      mountedRef.current = false;
      try {
        if (clientRef.current) {
          clientRef.current.leaveMeeting().catch(() => {});
        }
        import('@zoom/meetingsdk/embedded').then((mod) => {
          mod.default.destroyClient();
        }).catch(() => {});
      } catch { /* ignore */ }
    };
  }, []);

  useEffect(() => {
    if (status === 'ready' && joinBtnRef.current) {
      joinBtnRef.current.focus();
    }
  }, [status]);

  const openFallbackUrl = useCallback(async () => {
    if (!joinUrl) return;
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
        window.open(data.hostUrl || joinUrl, '_blank', 'noopener,noreferrer');
      } else {
        window.open(joinUrl, '_blank', 'noopener,noreferrer');
      }
    } catch {
      window.open(joinUrl, '_blank', 'noopener,noreferrer');
    }
  }, [joinUrl, sessionId, meetingNumber]);

  const handleStartMeeting = useCallback(async () => {
    if (!meetingNumber) return;
    setStatus('loading');

    const creds = await fetchSdkCredentials(meetingNumber, sessionId);

    if (!creds) {
      setUsingFallback(true);
      await openFallbackUrl();
      if (mountedRef.current) {
        setStatus('active');
        onMeetingStart?.();
      }
      return;
    }

    try {
      const ZoomMtgEmbedded = (await import('@zoom/meetingsdk/embedded')).default;

      const client = ZoomMtgEmbedded.createClient();
      clientRef.current = client;

      if (!containerRef.current) {
        throw new Error('Meeting container not available');
      }

      await client.init({
        zoomAppRoot: containerRef.current,
        language: 'en-US',
        patchJsMedia: true,
        leaveOnPageUnload: true,
        customize: {
          video: {
            isResizable: true,
            viewSizes: {
              default: {
                width: containerRef.current.clientWidth || 900,
                height: containerRef.current.clientHeight || 600,
              },
            },
          },
          meetingInfo: ['topic', 'host', 'mn', 'pwd', 'participant', 'dc', 'enctype'],
        },
      });

      await client.join({
        signature: creds.signature,
        sdkKey: creds.sdkKey,
        meetingNumber,
        password: password || '',
        userName: userName || 'Provider',
        zak: creds.zak,
      });

      client.on('connection-change', (payload: any) => {
        if (!mountedRef.current) return;
        if (payload.state === 'Closed' || payload.state === 'Fail') {
          setStatus('ended');
          onMeetingEnd?.(payload.reason || 'connection_closed');
          try {
            ZoomMtgEmbedded.destroyClient();
          } catch { /* ignore */ }
        }
      });

      if (mountedRef.current) {
        setStatus('active');
        onMeetingStart?.();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start Zoom meeting';
      if (mountedRef.current) {
        setErrorMsg(msg);
        setStatus('error');
      }
    }
  }, [meetingNumber, password, userName, joinUrl, sessionId, openFallbackUrl, onMeetingStart, onMeetingEnd]);

  return (
    <div className="absolute inset-0 bg-gray-900">
      {/* SDK container — always in DOM so it's available for init, visible only when active */}
      <div
        ref={containerRef}
        className={`h-full w-full ${status === 'active' && !usingFallback ? '' : 'hidden'}`}
      />

      {/* ── Ready ── */}
      {status === 'ready' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-8">
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
      )}

      {/* ── Loading ── */}
      {status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-8">
          <Loader2 className="mb-4 h-12 w-12 animate-spin text-blue-400" />
          <p className="text-lg font-semibold text-white">Starting meeting as host...</p>
          <p className="mt-1 text-sm text-gray-400">
            Connecting you to Zoom — no login required
          </p>
        </div>
      )}

      {/* ── Error (with fallback to Zoom app) ── */}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-8">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-amber-600/20">
            <AlertTriangle className="h-10 w-10 text-amber-400" />
          </div>
          <p className="mb-2 text-lg font-semibold text-white">
            Could not start embedded meeting
          </p>
          <p className="mb-6 max-w-sm text-center text-sm text-gray-400">
            {errorMsg || 'An unexpected error occurred.'}
          </p>
          <div className="flex flex-col items-center gap-3">
            {joinUrl && (
              <button
                onClick={async () => {
                  await openFallbackUrl();
                  setUsingFallback(true);
                  setStatus('active');
                  onMeetingStart?.();
                }}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                <ExternalLink className="h-4 w-4" />
                Open in Zoom App Instead
              </button>
            )}
            <button
              onClick={() => {
                setErrorMsg('');
                setStatus('ready');
              }}
              className="flex items-center gap-2 rounded-lg bg-gray-800 px-6 py-2.5 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-700"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* ── Ended ── */}
      {status === 'ended' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-8">
          <VideoOff className="mb-4 h-12 w-12 text-gray-400" />
          <p className="text-lg font-semibold text-white">Meeting Ended</p>
        </div>
      )}

      {/* ── Active: floating controls (SDK UI fills the container above) ── */}
      {status === 'active' && !usingFallback && (
        <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-gray-900/80 px-4 py-2 backdrop-blur-sm">
          <div className="flex items-center gap-1.5 rounded-full bg-emerald-900/30 px-3 py-1">
            <Mic className="h-3 w-3 text-emerald-400" />
            <span className="text-xs font-medium text-emerald-400">Host</span>
          </div>
          <button
            onClick={() => endMeeting('provider_ended')}
            className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-red-700"
          >
            <PhoneOff className="h-3.5 w-3.5" />
            End Call
          </button>
        </div>
      )}

      {/* ── Active (fallback mode): external Zoom window ── */}
      {status === 'active' && usingFallback && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-8">
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
              <span className="text-xs font-medium text-emerald-400">
                Zoom meeting active in external window
              </span>
            </div>
          </div>
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={openFallbackUrl}
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
      )}
    </div>
  );
}
