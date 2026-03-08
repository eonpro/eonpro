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
import { TelehealthSessionData, PostCallData } from './types';

const ZoomEmbeddedMeeting = dynamic(
  () => import('./ZoomEmbeddedMeeting'),
  { ssr: false }
);

interface ActiveCallViewProps {
  session: TelehealthSessionData;
  userName: string;
  userEmail?: string;
  onCallEnd: (data: PostCallData) => void;
}

export default function ActiveCallView({
  session,
  userName,
  userEmail,
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

  const handleMeetingEnd = useCallback(
    (reason?: string) => {
      setCallActive(false);
      const duration = callStartTime
        ? Math.floor((Date.now() - callStartTime.getTime()) / 1000)
        : 0;

      onCallEnd({
        session,
        duration,
        transcript: transcriptRef.current || undefined,
      });
    },
    [session, callStartTime, onCallEnd]
  );

  const handleTranscriptUpdate = useCallback((transcript: string) => {
    transcriptRef.current = transcript;
  }, []);

  const copyPatientLink = () => {
    if (!session.joinUrl) return;
    navigator.clipboard.writeText(session.joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex h-screen flex-col bg-gray-950">
      {/* Top Bar */}
      <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900 px-4 py-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/20">
              <Users className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">
                {session.patient.firstName} {session.patient.lastName}
              </p>
              {session.topic && (
                <p className="text-[11px] text-gray-400">{session.topic}</p>
              )}
            </div>
          </div>

          {callStartTime && (
            <CallTimer
              startTime={callStartTime}
              scheduledDuration={session.duration}
              className="text-white [&_svg]:text-gray-400 [&_span]:text-gray-200"
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-emerald-900/30 px-2.5 py-1">
            <Shield className="h-3 w-3 text-emerald-400" />
            <span className="text-[10px] font-medium text-emerald-400">HIPAA Encrypted</span>
          </div>

          <button
            onClick={copyPatientLink}
            className="flex items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-gray-700"
          >
            {copied ? (
              <>
                <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Patient Link
              </>
            )}
          </button>

          <button
            onClick={() => setScribeCollapsed(!scribeCollapsed)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors ${
              scribeCollapsed
                ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI Scribe
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Video Area */}
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="w-full max-w-5xl">
            <ZoomEmbeddedMeeting
              meetingNumber={session.meetingId || session.id.toString()}
              password={session.password}
              userName={userName}
              userEmail={userEmail}
              role={1}
              joinUrl={session.hostUrl || session.joinUrl}
              onMeetingStart={handleMeetingStart}
              onMeetingEnd={handleMeetingEnd}
              onError={(err) => {
                // Non-blocking: error is shown inside ZoomEmbeddedMeeting
              }}
            />
          </div>
        </div>

        {/* Scribe Sidebar */}
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
    </div>
  );
}
