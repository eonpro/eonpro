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

import { apiFetch } from '@/lib/api/fetch';

const ZOOM_SDK_VERSION = '5.1.4';
const ZOOM_CDN_BASE = `https://source.zoom.us/${ZOOM_SDK_VERSION}`;

const VENDOR_SCRIPTS = [
  `${ZOOM_CDN_BASE}/lib/vendor/react.min.js`,
  `${ZOOM_CDN_BASE}/lib/vendor/react-dom.min.js`,
  `${ZOOM_CDN_BASE}/lib/vendor/redux.min.js`,
  `${ZOOM_CDN_BASE}/lib/vendor/redux-thunk.min.js`,
  `${ZOOM_CDN_BASE}/lib/vendor/lodash.min.js`,
];

const EMBEDDED_SDK_SCRIPT = `${ZOOM_CDN_BASE}/zoom-meeting-embedded-${ZOOM_SDK_VERSION}.min.js`;

declare global {
  interface Window {
    ZoomMtgEmbedded?: {
      createClient: () => ZoomEmbeddedClient;
    };
  }
}

interface ZoomEmbeddedClient {
  init: (options: {
    zoomAppRoot: HTMLElement;
    language?: string;
    patchJsMedia?: boolean;
    leaveOnPageUnload?: boolean;
  }) => Promise<void>;
  join: (options: {
    signature: string;
    meetingNumber: string;
    password: string;
    userName: string;
    sdkKey: string;
    userEmail?: string;
    tk?: string;
    zak?: string;
  }) => Promise<void>;
  leaveMeeting: () => void;
  endMeeting: () => void;
}

export interface ZoomEmbeddedMeetingProps {
  meetingNumber: string;
  password?: string;
  userName: string;
  joinUrl?: string;
  leaveRef?: React.MutableRefObject<(() => void) | null>;
  onMeetingStart?: () => void;
  onMeetingEnd?: (reason?: string) => void;
}

type EmbedStatus =
  | 'loading-sdk'
  | 'joining'
  | 'active'
  | 'ended'
  | 'error'
  | 'fallback-ready'
  | 'fallback-active'
  | 'fallback-closed';

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load: ${src}`));
    document.head.appendChild(script);
  });
}

async function loadZoomSDK(): Promise<typeof window.ZoomMtgEmbedded> {
  if (window.ZoomMtgEmbedded) return window.ZoomMtgEmbedded;

  for (const src of VENDOR_SCRIPTS) {
    await loadScript(src);
  }
  await loadScript(EMBEDDED_SDK_SCRIPT);

  if (!window.ZoomMtgEmbedded) {
    throw new Error('ZoomMtgEmbedded not available after loading CDN scripts');
  }
  return window.ZoomMtgEmbedded;
}

export default function ZoomEmbeddedMeeting({
  meetingNumber,
  password = '',
  userName,
  joinUrl,
  leaveRef,
  onMeetingStart,
  onMeetingEnd,
}: ZoomEmbeddedMeetingProps) {
  const [status, setStatus] = useState<EmbedStatus>('loading-sdk');
  const [errorMsg, setErrorMsg] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<ZoomEmbeddedClient | null>(null);
  const mountedRef = useRef(true);
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initCalledRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const endMeeting = useCallback(
    (reason?: string) => {
      if (!mountedRef.current) return;
      stopPolling();

      if (clientRef.current) {
        try { clientRef.current.leaveMeeting(); } catch { /* ignore */ }
        clientRef.current = null;
      }
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }
      popupRef.current = null;

      setStatus('ended');
      onMeetingEnd?.(reason);
    },
    [onMeetingEnd, stopPolling],
  );

  useEffect(() => {
    if (leaveRef) leaveRef.current = () => endMeeting('provider_ended');
    return () => { if (leaveRef) leaveRef.current = null; };
  }, [endMeeting, leaveRef]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopPolling();
      if (clientRef.current) {
        try { clientRef.current.leaveMeeting(); } catch { /* ignore */ }
        clientRef.current = null;
      }
    };
  }, [stopPolling]);

  // Load SDK and auto-join the meeting
  useEffect(() => {
    if (initCalledRef.current || !meetingNumber) return;
    initCalledRef.current = true;

    let cancelled = false;

    const initAndJoin = async () => {
      // Wait for the container ref to be available (next tick)
      await new Promise((r) => requestAnimationFrame(r));
      if (cancelled || !mountedRef.current || !containerRef.current) return;

      try {
        setStatus('loading-sdk');
        const ZoomMtgEmbedded = await loadZoomSDK();
        if (cancelled || !mountedRef.current || !containerRef.current) return;

        setStatus('joining');

        const client = ZoomMtgEmbedded!.createClient();
        clientRef.current = client;

        await client.init({
          zoomAppRoot: containerRef.current,
          language: 'en-US',
          patchJsMedia: true,
          leaveOnPageUnload: true,
        });

        if (cancelled || !mountedRef.current) return;

        const sigRes = await apiFetch('/api/v2/zoom/sdk-signature', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ meetingNumber, role: 1 }),
        });

        if (!sigRes.ok) {
          const sigErr = await sigRes.json().catch(() => ({}));
          throw new Error(sigErr.error || `Signature request failed (${sigRes.status})`);
        }

        const { signature, sdkKey, zak } = await sigRes.json();
        if (cancelled || !mountedRef.current) return;

        await client.join({
          signature,
          meetingNumber,
          password,
          userName,
          sdkKey,
          ...(zak ? { zak } : {}),
        });

        if (cancelled || !mountedRef.current) return;

        setStatus('active');
        onMeetingStart?.();
      } catch (err) {
        if (cancelled || !mountedRef.current) return;
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('[ZoomEmbed] Init/join failed, falling back to window.open:', msg);
        setErrorMsg(msg);
        setStatus('fallback-ready');
      }
    };

    void initAndJoin();
    return () => { cancelled = true; };
  }, [meetingNumber, password, userName, onMeetingStart]);

  // ── Fallback: window.open ─────────────────────────────────────────
  const launchFallback = useCallback(() => {
    if (!joinUrl) return;
    const zoomWindow = window.open(joinUrl, 'zoom_meeting');
    if (!zoomWindow || zoomWindow.closed) return;

    popupRef.current = zoomWindow;
    setStatus('fallback-active');
    onMeetingStart?.();

    pollRef.current = setInterval(() => {
      try {
        if (zoomWindow.closed) {
          stopPolling();
          popupRef.current = null;
          if (mountedRef.current) setStatus('fallback-closed');
        }
      } catch { /* cross-origin */ }
    }, 2000);
  }, [joinUrl, onMeetingStart, stopPolling]);

  const focusFallback = useCallback(() => {
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.focus();
    } else {
      launchFallback();
    }
  }, [launchFallback]);

  // ── Overlay content based on status ───────────────────────────────
  const renderOverlay = () => {
    switch (status) {
      case 'loading-sdk':
        return (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-900 p-8">
            <Loader2 className="mb-4 h-10 w-10 animate-spin text-blue-400" />
            <p className="text-sm font-medium text-white">Loading video call...</p>
            <p className="mt-1 text-xs text-gray-400">Preparing the embedded meeting</p>
          </div>
        );

      case 'joining':
        return (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-900 p-8">
            <Loader2 className="mb-4 h-10 w-10 animate-spin text-blue-400" />
            <p className="text-sm font-medium text-white">Joining meeting...</p>
            <p className="mt-1 text-xs text-gray-400">Meeting #{meetingNumber}</p>
          </div>
        );

      case 'active':
        return null;

      case 'ended':
        return (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-900 p-8">
            <VideoOff className="mb-4 h-12 w-12 text-gray-400" />
            <p className="text-lg font-semibold text-white">Meeting Ended</p>
          </div>
        );

      case 'error':
        return (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-900 p-8">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-600/20">
              <AlertTriangle className="h-10 w-10 text-red-400" />
            </div>
            <p className="mb-2 text-lg font-semibold text-white">Video Call Error</p>
            <p className="mb-6 max-w-sm text-center text-sm text-gray-400">{errorMsg}</p>
            {joinUrl && (
              <button
                onClick={() => setStatus('fallback-ready')}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                <ExternalLink className="h-4 w-4" />
                Open in Zoom App Instead
              </button>
            )}
          </div>
        );

      case 'fallback-ready':
        return (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-900 p-8">
            {errorMsg && (
              <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-900/30 px-4 py-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <p className="text-xs text-amber-300">
                  Embedded view unavailable — opening in the Zoom app instead.
                </p>
              </div>
            )}
            <div className="mb-8 flex flex-col items-center">
              <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-blue-600/20">
                <Video className="h-12 w-12 text-blue-400" />
              </div>
              <p className="mb-1 text-lg font-semibold text-white">Ready to Join</p>
              <p className="text-sm text-gray-400">Meeting #{meetingNumber}</p>
            </div>
            {joinUrl ? (
              <button
                onClick={launchFallback}
                className="flex items-center gap-3 rounded-xl bg-blue-600 px-8 py-4 text-base font-semibold text-white shadow-lg transition-all hover:bg-blue-700 hover:shadow-xl active:scale-[0.98]"
              >
                <Video className="h-5 w-5" />
                Open Zoom Meeting
                <ExternalLink className="h-4 w-4 opacity-60" />
              </button>
            ) : (
              <p className="text-sm text-red-400">No meeting link available</p>
            )}
          </div>
        );

      case 'fallback-active':
        return (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-900 p-8">
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
                <span className="text-xs font-medium text-emerald-400">Zoom meeting active</span>
              </div>
            </div>
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={focusFallback}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                <ExternalLink className="h-4 w-4" />
                Open Zoom Window
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

      case 'fallback-closed':
        return (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-900 p-8">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-amber-600/20">
              <AlertTriangle className="h-10 w-10 text-amber-400" />
            </div>
            <p className="mb-2 text-lg font-semibold text-white">Zoom Window Closed</p>
            <p className="mb-6 max-w-sm text-center text-sm text-gray-400">
              The Zoom window was closed. The meeting may still be active.
            </p>
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={() => { setStatus('fallback-active'); launchFallback(); }}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                <ExternalLink className="h-4 w-4" />
                Rejoin Meeting
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

      default:
        return null;
    }
  };

  return (
    <div className="absolute inset-0 bg-gray-900">
      {/* SDK container is always in the DOM so containerRef is available */}
      <div
        ref={containerRef}
        id="zoomEmbeddedMeeting"
        className="h-full w-full"
      />
      {renderOverlay()}
    </div>
  );
}
