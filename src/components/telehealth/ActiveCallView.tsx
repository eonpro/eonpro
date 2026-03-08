'use client';

import { useState, useCallback, useRef } from 'react';

import dynamic from 'next/dynamic';

import {
  Users,
  Sparkles,
  Copy,
  CheckCircle,
  Shield,
} from 'lucide-react';

import CallTimer from './CallTimer';
import ScribePanel from './ScribePanel';
import { type TelehealthSessionData, type PostCallData } from './types';

const ZoomEmbeddedMeeting = dynamic(
  async () => import('./ZoomEmbeddedMeeting'),
  { ssr: false }
);

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
  const transcriptRef = useRef('');

  const handleMeetingStart = useCallback(() => {
    setCallActive(true);
    setCallStartTime(new Date());
  }, []);

  // eslint-disable-next-line no-unused-vars -- reserved for future use
  const handleMeetingEnd = useCallback(
    (_reason?: string) => {
      setCallActive(false);
      const duration = callStartTime
        ? Math.floor((Date.now() - callStartTime.getTime()) / 1000)
        : 0;

      onCallEnd({
        session,
        duration,
        transcript: transcriptRef.current ?? undefined,
      });
    },
    [session, callStartTime, onCallEnd]
  );

  const handleTranscriptUpdate = useCallback((transcript: string) => {
    transcriptRef.current = transcript;
  }, []);

  const copyPatientLink = () => {
    if (!session.joinUrl) return;
    void navigator.clipboard.writeText(session.joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex h-[100dvh] flex-col bg-gray-950">
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
        {/* Video Area */}
        <div className="flex flex-1 items-center justify-center p-2 sm:p-4">
          <div className="w-full max-w-5xl">
            <ZoomEmbeddedMeeting
              meetingNumber={session.meetingId ?? session.id.toString()}
              password={session.password}
              userName={userName}
              userEmail={userEmail}
              role={1}
              joinUrl={session.hostUrl ?? session.joinUrl}
              onMeetingStart={handleMeetingStart}
              onMeetingEnd={handleMeetingEnd}
              onError={() => {
                // Non-blocking: error is shown inside ZoomEmbeddedMeeting
              }}
            />
          </div>
        </div>

        {/* Scribe Sidebar — hidden on mobile, shown on md+ */}
        {scribeEnabled && (
          <div className="hidden md:flex">
            <ScribePanel
              appointmentId={session.appointment?.id}
              patientId={session.patient.id}
              providerId={undefined}
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
