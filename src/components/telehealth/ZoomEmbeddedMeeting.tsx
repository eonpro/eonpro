'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

import {
  Video,
  VideoOff,
  ExternalLink,
  PhoneOff,
  Loader2,
  Mic,
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
  const [status, setStatus] = useState<'ready' | 'active' | 'ended'>('ready');
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

    // Omit 'noopener' so we retain a reference to poll for window closure.
    // Cross-origin restrictions already prevent the Zoom page from accessing
    // our window's content (zoom.us is a different origin).
    const zoomWindow = window.open(joinUrl, 'zoom_meeting');
    popupRef.current = zoomWindow;
    setStatus('active');
    onMeetingStart?.();

    // Poll to detect when the provider closes the Zoom window/tab
    if (zoomWindow) {
      pollRef.current = setInterval(() => {
        if (zoomWindow.closed) {
          endMeeting('window_closed');
        }
      }, 2000);
    }
  }, [joinUrl, onMeetingStart, endMeeting]);

  const focusZoomWindow = useCallback(() => {
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.focus();
    } else if (joinUrl) {
      launchZoom();
    }
  }, [joinUrl, launchZoom]);

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

  // Auto-launch on mount
  useEffect(() => {
    if (joinUrl && status === 'ready') {
      launchZoom();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'ready') {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-gray-900 p-8">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-blue-600/20">
          <Loader2 className="h-10 w-10 animate-spin text-blue-400" />
        </div>
        <p className="mb-1 text-lg font-semibold text-white">Opening Zoom...</p>
        <p className="mb-6 text-sm text-gray-400">
          Your meeting should open in a new window
        </p>
        {joinUrl && (
          <button
            onClick={launchZoom}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <ExternalLink className="h-4 w-4" />
            Launch Zoom Meeting
          </button>
        )}
      </div>
    );
  }

  if (status === 'ended') {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-gray-900 p-8">
        <VideoOff className="mb-4 h-12 w-12 text-gray-400" />
        <p className="text-lg font-semibold text-white">Meeting Ended</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center bg-gray-900 p-8">
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
            AI Scribe is listening
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
