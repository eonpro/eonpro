'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

import {
  Users,
  Sparkles,
  Copy,
  CheckCircle,
  Shield,
  ExternalLink,
  PhoneOff,
  Video,
} from 'lucide-react';

import { safeParseJsonString } from '@/lib/utils/safe-json';
import CallTimer from './CallTimer';
import ScribePanel from './ScribePanel';
import { type TelehealthSessionData, type PostCallData } from './types';

interface ActiveCallViewProps {
  session: TelehealthSessionData;
  userName: string;
  userEmail?: string;
  scribeEnabled?: boolean;
  onCallEnd: (data: PostCallData) => void;
}

export default function ActiveCallView({
  session,
  userName,
  userEmail,
  scribeEnabled = true,
  onCallEnd,
}: ActiveCallViewProps) {
  const [scribeCollapsed, setScribeCollapsed] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [callStartTime, setCallStartTime] = useState<Date | null>(null);
  const [copied, setCopied] = useState(false);
  const [providerId, setProviderId] = useState<number | undefined>();
  const [zoomOpened, setZoomOpened] = useState(false);
  const transcriptRef = useRef('');
  const callStartRef = useRef<Date | null>(null);
  const onCallEndRef = useRef(onCallEnd);
  onCallEndRef.current = onCallEnd;

  useEffect(() => {
    try {
      const user = localStorage.getItem('user');
      if (user) {
        const parsed = safeParseJsonString(user);
        if (parsed?.providerId) setProviderId(Number(parsed.providerId));
      }
    } catch { /* ignore */ }
  }, []);

  // Open Zoom in a new tab immediately
  useEffect(() => {
    if (zoomOpened) return;
    const url = session.hostUrl ?? session.joinUrl;
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
      setZoomOpened(true);
      setCallActive(true);
      const now = new Date();
      callStartRef.current = now;
      setCallStartTime(now);
    }
  }, [session.hostUrl, session.joinUrl, zoomOpened]);

  const handleEndCall = useCallback(() => {
    setCallActive(false);
    const start = callStartRef.current;
    const duration = start
      ? Math.floor((Date.now() - start.getTime()) / 1000)
      : 0;

    onCallEndRef.current({
      session,
      duration,
      transcript: transcriptRef.current ?? undefined,
    });
  }, [session]);

  const handleTranscriptUpdate = useCallback((transcript: string) => {
    transcriptRef.current = transcript;
  }, []);

  const copyPatientLink = () => {
    if (!session.joinUrl) return;
    void navigator.clipboard.writeText(session.joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const reopenZoom = () => {
    const url = session.hostUrl ?? session.joinUrl;
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-gray-950">
      {/* Top Bar */}
      <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900 px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <div className="hidden sm:flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600/20">
            <Users className="h-4 w-4 text-blue-400" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-white sm:text-sm">
              {session.patient.firstName} {session.patient.lastName}
            </p>
            {session.topic && (
              <p className="hidden text-[11px] text-gray-400 sm:block">{session.topic}</p>
            )}
          </div>

          {callStartTime && (
            <CallTimer
              startTime={callStartTime}
              scheduledDuration={session.duration}
              className="text-white [&_svg]:text-gray-400 [&_span]:text-gray-200"
            />
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <div className="hidden items-center gap-1 rounded-lg bg-emerald-900/30 px-2.5 py-1 sm:flex">
            <Shield className="h-3 w-3 text-emerald-400" />
            <span className="text-[10px] font-medium text-emerald-400">HIPAA Encrypted</span>
          </div>

          <button
            onClick={copyPatientLink}
            className="flex items-center gap-1.5 rounded-lg bg-gray-800 px-2 py-1.5 text-xs text-gray-300 transition-colors hover:bg-gray-700 sm:px-3"
          >
            {copied ? (
              <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">{copied ? 'Copied' : 'Patient Link'}</span>
          </button>

          {scribeEnabled && (
            <button
              onClick={() => setScribeCollapsed(!scribeCollapsed)}
              className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition-colors sm:px-3 ${
                scribeCollapsed
                  ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">AI Scribe</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Call Status Area */}
        <div className="flex flex-1 flex-col items-center justify-center p-4 sm:p-8">
          <div className="w-full max-w-lg text-center">
            <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-blue-600/20">
              <Video className="h-12 w-12 text-blue-400" />
            </div>

            <h2 className="mb-2 text-xl font-semibold text-white">
              Call in Progress
            </h2>
            <p className="mb-8 text-sm text-gray-400">
              Zoom is open in a separate tab. Your AI Scribe is recording the session.
            </p>

            <div className="mb-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <button
                onClick={reopenZoom}
                className="flex items-center gap-2 rounded-lg border border-gray-600 bg-gray-800 px-5 py-3 text-sm font-medium text-gray-200 transition-colors hover:bg-gray-700"
              >
                <ExternalLink className="h-4 w-4" />
                Reopen Zoom
              </button>

              <button
                onClick={handleEndCall}
                className="flex items-center gap-2 rounded-full bg-red-600 px-8 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-red-700 hover:shadow-xl"
              >
                <PhoneOff className="h-4 w-4" />
                End Call
              </button>
            </div>

            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 text-left">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Session Details</p>
              <div className="space-y-1.5 text-sm text-gray-400">
                <div className="flex justify-between">
                  <span>Patient</span>
                  <span className="text-gray-200">{session.patient.firstName} {session.patient.lastName}</span>
                </div>
                {session.topic && (
                  <div className="flex justify-between">
                    <span>Topic</span>
                    <span className="text-gray-200">{session.topic}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Duration</span>
                  <span className="text-gray-200">{session.duration} min</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Scribe Sidebar */}
        {scribeEnabled && (
          <div className="hidden md:flex">
            <ScribePanel
              appointmentId={session.appointment?.id}
              patientId={session.patient.id}
              providerId={providerId}
              isCallActive={callActive}
              collapsed={scribeCollapsed}
              onToggle={() => setScribeCollapsed(!scribeCollapsed)}
              onTranscriptUpdate={handleTranscriptUpdate}
            />
          </div>
        )}
      </div>
    </div>
  );
}
