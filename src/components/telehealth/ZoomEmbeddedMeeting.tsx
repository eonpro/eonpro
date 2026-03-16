'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

import {
  Video,
  VideoOff,
  ExternalLink,
  PhoneOff,
  Mic,
  AlertTriangle,
} from 'lucide-react';

export interface ZoomEmbeddedMeetingProps {
  meetingNumber: string;
  joinUrl?: string;
  leaveRef?: React.MutableRefObject<(() => void) | null>;
  onMeetingStart?: () => void;
  onMeetingEnd?: (reason?: string) => void;
}

/**
 * Launches the Zoom meeting in a separate browser window while showing
 * call-in-progress status here. The Zoom Meeting SDK's Component View
 * (embedded) requires React 18 internals that are incompatible with
 * React 19. This approach gives the provider the full Zoom web/desktop
 * experience with all controls (mute, camera, screen share, etc.) while
 * letting the AI Scribe panel run alongside in the main window.
 */
export default function ZoomEmbeddedMeeting({
  meetingNumber,
  joinUrl,
  leaveRef,
  onMeetingStart,
  onMeetingEnd,
}: ZoomEmbeddedMeetingProps) {
  const [status, setStatus] = useState<'ready' | 'active' | 'blocked' | 'ended' | 'closed'>('ready');
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

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
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }
      popupRef.current = null;
      setStatus('ended');
      onMeetingEnd?.(reason);
    },
    [onMeetingEnd, stopPolling]
  );

  const launchZoom = useCallback(() => {
    if (!joinUrl) return;

    const zoomWindow = window.open(joinUrl, 'zoom_meeting');

    if (!zoomWindow || zoomWindow.closed) {
      setStatus('blocked');
      return;
    }

    popupRef.current = zoomWindow;
    setStatus('active');
    onMeetingStart?.();

    pollRef.current = setInterval(() => {
      try {
        if (zoomWindow.closed) {
          stopPolling();
          popupRef.current = null;
          if (mountedRef.current) {
            setStatus('closed');
          }
        }
      } catch {
        // Cross-origin access error — window is still open
      }
    }, 2000);
  }, [joinUrl, onMeetingStart, stopPolling]);

  const focusZoomWindow = useCallback(() => {
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.focus();
    } else {
      launchZoom();
    }
  }, [launchZoom]);

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
      stopPolling();
    };
  }, [stopPolling]);

  if (status === 'ready') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 p-8">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-blue-600/20">
            <Video className="h-12 w-12 text-blue-400" />
          </div>
          <p className="mb-1 text-lg font-semibold text-white">Ready to Join</p>
          <p className="mb-1 text-sm text-gray-400">
            Meeting #{meetingNumber}
          </p>
        </div>
        {joinUrl ? (
          <button
            onClick={launchZoom}
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
  }

  if (status === 'blocked') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 p-8">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-amber-600/20">
          <AlertTriangle className="h-10 w-10 text-amber-400" />
        </div>
        <p className="mb-2 text-lg font-semibold text-white">Pop-up Blocked</p>
        <p className="mb-6 max-w-sm text-center text-sm text-gray-400">
          Your browser blocked the Zoom window. Click the button below to open it,
          or allow pop-ups for this site.
        </p>
        <button
          onClick={launchZoom}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <ExternalLink className="h-4 w-4" />
          Open Zoom Meeting
        </button>
      </div>
    );
  }

  if (status === 'closed') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 p-8">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-amber-600/20">
          <AlertTriangle className="h-10 w-10 text-amber-400" />
        </div>
        <p className="mb-2 text-lg font-semibold text-white">Zoom Window Closed</p>
        <p className="mb-6 max-w-sm text-center text-sm text-gray-400">
          The Zoom window was closed. The meeting may still be active.
        </p>
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={() => {
              setStatus('active');
              launchZoom();
            }}
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
  }

  if (status === 'ended') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 p-8">
        <VideoOff className="mb-4 h-12 w-12 text-gray-400" />
        <p className="text-lg font-semibold text-white">Meeting Ended</p>
      </div>
    );
  }

  // status === 'active'
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 p-8">
      {/* Active call status */}
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
        <p className="mb-1 text-sm text-gray-400">
          Meeting #{meetingNumber}
        </p>
        <div className="mt-2 flex items-center gap-1.5 rounded-full bg-emerald-900/30 px-3 py-1">
          <Mic className="h-3 w-3 text-emerald-400" />
          <span className="text-xs font-medium text-emerald-400">
            Zoom meeting active
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={focusZoomWindow}
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
}
