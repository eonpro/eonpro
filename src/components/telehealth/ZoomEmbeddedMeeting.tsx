'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

import {
  Video,
  AlertCircle,
  Loader2,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';

import { apiFetch } from '@/lib/api/fetch';

export interface ZoomEmbeddedMeetingProps {
  meetingNumber: string;
  password?: string;
  userName: string;
  userEmail?: string;
  role?: 0 | 1;
  joinUrl?: string;
  onMeetingStart?: () => void;
  onMeetingEnd?: (reason?: string) => void;
  onParticipantJoin?: (participant: { userName: string }) => void;
  onParticipantLeave?: (participant: { userName: string }) => void;
  onError?: (error: string) => void;
}

type SDKStatus = 'loading' | 'ready' | 'joining' | 'joined' | 'error' | 'ended';

export default function ZoomEmbeddedMeeting({
  meetingNumber,
  password = '',
  userName,
  userEmail = '',
  role = 1,
  joinUrl,
  onMeetingStart,
  onMeetingEnd,
  onParticipantJoin,
  onParticipantLeave,
  onError,
}: ZoomEmbeddedMeetingProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<any>(null);
  const [status, setStatus] = useState<SDKStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const handleError = useCallback(
    (message: string) => {
      if (!mountedRef.current) return;
      setError(message);
      setStatus('error');
      onError?.(message);
    },
    [onError]
  );

  const initAndJoin = useCallback(async () => {
    if (!containerRef.current || !mountedRef.current) return;

    try {
      setStatus('loading');
      setError(null);

      const ZoomMtgEmbedded = (await import('@zoom/meetingsdk/embedded')).default;

      if (!mountedRef.current) return;

      const client = ZoomMtgEmbedded.createClient();
      clientRef.current = client;

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
                width: 1000,
                height: 600,
              },
            },
          },
          meetingInfo: ['topic', 'host', 'mn', 'pwd', 'telPwd', 'invite', 'participant', 'dc', 'enctype'],
          toolbar: {
            buttons: [
              { text: 'Audio', className: 'zoom-audio-btn', onClick: () => {} },
              { text: 'Video', className: 'zoom-video-btn', onClick: () => {} },
            ],
          },
        },
      });

      if (!mountedRef.current) return;
      setStatus('ready');

      const sigRes = await apiFetch('/api/v2/zoom/sdk-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingNumber, role }),
      });

      if (!sigRes.ok) {
        const sigErr = await sigRes.json().catch(() => ({ error: 'Failed to get signature' })) as { error?: string };
        throw new Error(sigErr.error ?? 'Failed to generate meeting signature');
      }

      const { signature, sdkKey } = await sigRes.json();

      if (!mountedRef.current) return;
      setStatus('joining');

      await client.join({
        signature,
        sdkKey,
        meetingNumber,
        password,
        userName,
        userEmail,
      });

      if (!mountedRef.current) return;
      setStatus('joined');
      onMeetingStart?.();

      client.on('connection-change', (payload: { state: string; reason?: string }) => {
        if (!mountedRef.current) return;
        if (payload.state === 'Closed' || payload.state === 'Reconnecting') {
          setStatus('ended');
          onMeetingEnd?.(payload.reason);
        }
      });

      client.on('user-added', (payload: { userId: number; displayName: string }[]) => {
        if (!mountedRef.current) return;
        payload?.forEach((p) => onParticipantJoin?.({ userName: p.displayName }));
      });

      client.on('user-removed', (payload: { userId: number; displayName: string }[]) => {
        if (!mountedRef.current) return;
        payload?.forEach((p) => onParticipantLeave?.({ userName: p.displayName }));
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize Zoom';
      handleError(message);
    }
  }, [meetingNumber, password, userName, userEmail, role, onMeetingStart, onMeetingEnd, onParticipantJoin, onParticipantLeave, handleError]);

  useEffect(() => {
    mountedRef.current = true;
    void initAndJoin();

    return () => {
      mountedRef.current = false;
      if (clientRef.current) {
        try {
          clientRef.current.leave();
        } catch {
          // SDK may already be destroyed
        }
        clientRef.current = null;
      }
    };
  }, [initAndJoin]);

  const leaveMeeting = useCallback(() => {
    if (clientRef.current) {
      try {
        clientRef.current.leave();
      } catch {
        // ignore
      }
    }
    setStatus('ended');
    onMeetingEnd?.('provider_ended');
  }, [onMeetingEnd]);

  if (status === 'error') {
    return (
      <div className="flex min-h-[500px] flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50/50 p-8">
        <AlertCircle className="mb-4 h-12 w-12 text-red-400" />
        <h3 className="mb-2 text-lg font-semibold text-gray-900">Unable to Load Video</h3>
        <p className="mb-6 max-w-md text-center text-sm text-gray-600">{error}</p>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setError(null);
              void initAndJoin();
            }}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
          {joinUrl && (
            <a
              href={joinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <ExternalLink className="h-4 w-4" />
              Open in Zoom App
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      {(status === 'loading' || status === 'ready' || status === 'joining') && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-gray-900/95">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-blue-600/20">
            {status === 'loading' ? (
              <Loader2 className="h-10 w-10 animate-spin text-blue-400" />
            ) : (
              <Video className="h-10 w-10 text-blue-400" />
            )}
          </div>
          <p className="mb-1 text-lg font-semibold text-white">
            {status === 'loading' && 'Initializing Zoom...'}
            {status === 'ready' && 'Getting credentials...'}
            {status === 'joining' && 'Joining meeting...'}
          </p>
          <p className="text-sm text-gray-400">
            {status === 'loading' && 'Loading video components'}
            {status === 'ready' && 'Authenticating with Zoom'}
            {status === 'joining' && 'Connecting to the meeting room'}
          </p>
        </div>
      )}

      {status === 'ended' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-gray-900/95">
          <Video className="mb-4 h-12 w-12 text-gray-400" />
          <p className="text-lg font-semibold text-white">Meeting Ended</p>
        </div>
      )}

      <div
        ref={containerRef}
        className="relative min-h-[500px] w-full overflow-hidden rounded-2xl bg-gray-900"
        style={{ aspectRatio: '16/9' }}
      />

      {status === 'joined' && (
        <div className="mt-3 flex justify-center">
          <button
            onClick={leaveMeeting}
            className="rounded-full bg-red-600 px-6 py-2.5 text-sm font-medium text-white shadow-lg transition-all hover:bg-red-700 hover:shadow-xl"
          >
            End Call
          </button>
        </div>
      )}
    </div>
  );
}
