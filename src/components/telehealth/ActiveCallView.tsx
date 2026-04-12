'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

import {
  Users,
  Sparkles,
  Copy,
  CheckCircle,
  Shield,
  PhoneOff,
} from 'lucide-react';

import { safeParseJsonString } from '@/lib/utils/safe-json';
import CallTimer from './CallTimer';
import ScribePanel from './ScribePanel';
import ZoomEmbeddedMeeting from './ZoomEmbeddedMeeting';
import { type TelehealthSessionData, type PostCallData } from './types';

interface ActiveCallViewProps {
  session: TelehealthSessionData;
  userName: string;
  scribeEnabled?: boolean;
  onCallEnd: (data: PostCallData) => void;
}

export default function ActiveCallView({
  session,
  userName,
  scribeEnabled = true,
  onCallEnd,
}: ActiveCallViewProps) {
  const [scribeCollapsed, setScribeCollapsed] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [callStartTime, setCallStartTime] = useState<Date | null>(null);
  const [copied, setCopied] = useState(false);
  const [providerId, setProviderId] = useState<number | undefined>();
  const transcriptRef = useRef('');
  const callStartRef = useRef<Date | null>(null);
  const onCallEndRef = useRef(onCallEnd);
  onCallEndRef.current = onCallEnd;
  const leaveCallRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    try {
      const user = localStorage.getItem('user');
      if (user) {
        const parsed = safeParseJsonString<Record<string, unknown>>(user);
        if (parsed?.providerId) setProviderId(Number(parsed.providerId));
        else if (parsed?.id) setProviderId(Number(parsed.id));
      }
    } catch { /* ignore */ }
  }, []);

  const handleMeetingStart = useCallback(() => {
    setCallActive(true);
    const now = new Date();
    callStartRef.current = now;
    setCallStartTime(now);
  }, []);

  const handleMeetingEnd = useCallback(
    () => {
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
    },
    [session]
  );

  const handleTranscriptUpdate = useCallback((transcript: string) => {
    transcriptRef.current = transcript;
  }, []);

  const handleEndCallClick = useCallback(() => {
    leaveCallRef.current?.();
  }, []);

  const copyPatientLink = async () => {
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
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

          <button
            onClick={handleEndCallClick}
            className="flex items-center gap-1.5 rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 sm:px-3"
          >
            <PhoneOff className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">End Call</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Call status area */}
        <div className="relative flex-1">
          <div className="absolute inset-0 overflow-hidden">
            <ZoomEmbeddedMeeting
              meetingNumber={session.meetingId ?? ''}
              password={session.password ?? ''}
              userName={userName}
              joinUrl={session.hostUrl ?? session.joinUrl}
              sessionId={session.id}
              leaveRef={leaveCallRef}
              onMeetingStart={handleMeetingStart}
              onMeetingEnd={handleMeetingEnd}
            />
          </div>
        </div>

        {/* Scribe Sidebar */}
        {scribeEnabled && (
          <div className="hidden sm:flex">
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
