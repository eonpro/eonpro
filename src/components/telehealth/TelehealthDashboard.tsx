'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, AlertTriangle, LinkIcon } from 'lucide-react';

import { apiFetch } from '@/lib/api/fetch';
import ActiveCallView from './ActiveCallView';
import PostCallSummary from './PostCallSummary';
import ScheduleSessionModal from './ScheduleSessionModal';
import SessionLobby from './SessionLobby';
import SessionQueue from './SessionQueue';
import { type TelehealthSessionData, type TelehealthPhase, type PostCallData } from './types';

interface TelehealthDashboardProps {
  userName: string;
  userEmail?: string;
  onPhaseChange?: (phase: TelehealthPhase) => void;
}

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
  exit: { opacity: 0, y: -12, transition: { duration: 0.2 } },
};

export default function TelehealthDashboard({
  userName,
  userEmail,
  onPhaseChange,
}: TelehealthDashboardProps) {
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<TelehealthPhase>('queue');
  const [selectedSession, setSelectedSession] = useState<TelehealthSessionData | null>(null);
  const [postCallData, setPostCallData] = useState<PostCallData | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [scribeEnabled, setScribeEnabled] = useState(true);
  const [provisioningDeepLink, setProvisioningDeepLink] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [provisioningInline, setProvisioningInline] = useState(false);

  // Handle ?postCall=true&appointmentId=X (returning from ended page)
  useEffect(() => {
    const isPostCall = searchParams.get('postCall') === 'true';
    const appointmentId = searchParams.get('appointmentId');
    if (!isPostCall || !appointmentId || postCallData) return;

    let cancelled = false;
    const loadPostCall = async () => {
      try {
        const res = await apiFetch('/api/provider/telehealth/upcoming');
        if (!res.ok) return;
        const data = await res.json();
        const sessions: TelehealthSessionData[] = data.sessions ?? [];
        const match = sessions.find(
          (s) => s.appointment?.id === Number(appointmentId) || s.id === Number(appointmentId)
        );

        if (!match) {
          const aptRes = await apiFetch(`/api/scheduling/appointments?appointmentId=${appointmentId}`);
          if (aptRes.ok) {
            const aptData = await aptRes.json();
            const apt = aptData.appointment ?? aptData;
            if (apt?.id) {
              const sessionData: TelehealthSessionData = {
                id: apt.id,
                topic: apt.title || apt.reason || 'Video Consultation',
                scheduledAt: apt.startTime,
                duration: apt.duration || 15,
                status: 'COMPLETED',
                joinUrl: apt.zoomJoinUrl || apt.videoLink || '',
                patient: apt.patient
                  ? { id: apt.patient.id, firstName: apt.patient.firstName || '', lastName: apt.patient.lastName || '' }
                  : { id: 0, firstName: 'Unknown', lastName: 'Patient' },
                appointment: { id: apt.id, title: apt.title || '', reason: apt.reason || '' },
              };
              setPostCallData({ session: sessionData, duration: 0 });
              changePhase('postCall');
              return;
            }
          }
          return;
        }

        if (!cancelled) {
          setPostCallData({ session: match, duration: 0 });
          changePhase('postCall');
        }
      } catch {
        // Fall through to queue
      }
    };

    void loadPostCall();
    return () => { cancelled = true; };
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open lobby when navigated with ?consultationId=X (from consultations page)
  useEffect(() => {
    const consultationId = searchParams.get('consultationId');
    if (!consultationId || selectedSession || searchParams.get('postCall')) return;

    const loadSession = async () => {
      try {
        const res = await apiFetch('/api/provider/telehealth/upcoming');
        if (!res.ok) return;
        const data = await res.json();
        const sessions: TelehealthSessionData[] = data.sessions ?? [];

        let match = sessions.find(
          (s) => s.appointment?.id === Number(consultationId) || s.id === Number(consultationId)
        );

        // If not found in upcoming, fetch the specific appointment directly
        if (!match) {
          try {
            const aptRes = await apiFetch(
              `/api/scheduling/appointments?appointmentId=${consultationId}`
            );
            if (aptRes.ok) {
              const aptData = await aptRes.json();
              const apt = aptData.appointment ?? aptData;
              if (apt?.id && apt?.type === 'VIDEO') {
                match = {
                  id: apt.id,
                  topic: apt.title || apt.reason || 'Video Consultation',
                  scheduledAt: apt.startTime,
                  duration: apt.duration || 15,
                  status: apt.status === 'CONFIRMED' ? 'SCHEDULED' : apt.status,
                  joinUrl: apt.zoomJoinUrl || apt.videoLink || '',
                  hostUrl: undefined,
                  meetingId: apt.zoomMeetingId || undefined,
                  password: undefined,
                  patient: apt.patient
                    ? { id: apt.patient.id, firstName: apt.patient.firstName || '', lastName: apt.patient.lastName || '' }
                    : { id: 0, firstName: 'Unknown', lastName: 'Patient' },
                  appointment: { id: apt.id, title: apt.title || '', reason: apt.reason || '' },
                };
              }
            }
          } catch {
            // Fall through to queue
          }
        }

        if (!match) return;

        // If the session has no meeting data, try to provision it first
        if (!match.meetingId && match.appointment?.id) {
          setProvisioningDeepLink(true);
          try {
            const provisionRes = await apiFetch('/api/v2/zoom/meetings/provision', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ appointmentId: match.appointment.id }),
            });
            if (provisionRes.ok) {
              const provisionData = await provisionRes.json();
              if (provisionData.appointment?.zoomMeetingId) {
                match.meetingId = provisionData.appointment.zoomMeetingId;
                match.joinUrl = provisionData.appointment.zoomJoinUrl || match.joinUrl;
                match.hostUrl = provisionData.appointment.hostUrl || match.hostUrl;
                match.password = provisionData.appointment.password || match.password;
              }
            }
          } catch {
            // Fall through -- lobby will show the session state as-is
          } finally {
            setProvisioningDeepLink(false);
          }
        }

        setSelectedSession(match);
        setPhase('lobby');
        onPhaseChange?.('lobby');
      } catch {
        // Fall through to queue view
      }
    };

    void loadSession();
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const changePhase = useCallback(
    (newPhase: TelehealthPhase) => {
      setPhase(newPhase);
      onPhaseChange?.(newPhase);
    },
    [onPhaseChange]
  );

  const handleSelectSession = useCallback(
    (session: TelehealthSessionData) => {
      setSelectedSession(session);
      setJoinError(null);

      // Quick-join: skip lobby if meeting is ready and provider has consented today
      const hasMeeting = !!(session.meetingId && session.joinUrl);
      if (hasMeeting) {
        try {
          const raw = localStorage.getItem('telehealth_scribe_consent');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed?.date === new Date().toISOString().slice(0, 10)) {
              setScribeEnabled(parsed.choice === 'enabled');
              changePhase('call');
              return;
            }
          }
        } catch { /* fall through to lobby */ }
      }

      changePhase('lobby');
    },
    [changePhase]
  );

  const handleProvisionAndJoin = useCallback(async () => {
    if (!selectedSession?.appointment?.id) return;
    setProvisioningInline(true);
    setJoinError(null);
    try {
      const res = await apiFetch('/api/v2/zoom/meetings/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: selectedSession.appointment.id }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.appointment?.zoomMeetingId) {
          setSelectedSession((prev) =>
            prev ? {
              ...prev,
              meetingId: data.appointment.zoomMeetingId,
              joinUrl: data.appointment.zoomJoinUrl || prev.joinUrl,
              hostUrl: data.appointment.hostUrl || prev.hostUrl,
              password: data.appointment.password || prev.password,
            } : prev
          );
          setJoinError(null);
          return;
        }
      }
      setJoinError('Failed to generate video link. Please try again.');
    } catch {
      setJoinError('Network error. Please check your connection and try again.');
    } finally {
      setProvisioningInline(false);
    }
  }, [selectedSession]);

  const handleJoinCall = useCallback((enableScribe: boolean) => {
    if (!selectedSession?.meetingId || !selectedSession?.joinUrl) {
      setJoinError('Video link is not ready yet. Generating it now...');
      void handleProvisionAndJoin();
      return;
    }
    setJoinError(null);
    setScribeEnabled(enableScribe);
    changePhase('call');
  }, [changePhase, selectedSession, handleProvisionAndJoin]);

  const handleCallEnd = useCallback(
    (data: PostCallData) => {
      setPostCallData(data);
      changePhase('postCall');
    },
    [changePhase]
  );

  const handleBackToQueue = useCallback(() => {
    setSelectedSession(null);
    setPostCallData(null);
    setRefreshKey((k) => k + 1);
    changePhase('queue');
  }, [changePhase]);

  const handleSessionCreated = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // Full-screen mode during active calls
  if (phase === 'call' && selectedSession) {
    return (
      <ActiveCallView
        session={selectedSession}
        userName={userName}
        scribeEnabled={scribeEnabled}
        onCallEnd={handleCallEnd}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#efece7]">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <AnimatePresence mode="wait">
          {phase === 'queue' && (
            <motion.div key={`queue-${refreshKey}`} {...(pageVariants as any)}>
              <SessionQueue
                onSelectSession={handleSelectSession}
                onScheduleNew={() => setShowScheduleModal(true)}
              />
            </motion.div>
          )}

          {phase === 'lobby' && selectedSession && (
            <motion.div key="lobby" {...(pageVariants as any)}>
              {/* Inline error/provision banner */}
              {joinError && (
                <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
                  <p className="flex-1 text-sm text-amber-800">{joinError}</p>
                  {!provisioningInline && selectedSession.appointment?.id && (
                    <button
                      onClick={() => void handleProvisionAndJoin()}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-700"
                    >
                      <LinkIcon className="h-3.5 w-3.5" />
                      Generate Link
                    </button>
                  )}
                  {provisioningInline && (
                    <Loader2 className="h-5 w-5 shrink-0 animate-spin text-amber-600" />
                  )}
                </div>
              )}
              {provisioningDeepLink ? (
                <div className="flex h-[60vh] items-center justify-center">
                  <div className="text-center">
                    <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-blue-500" />
                    <p className="text-sm text-gray-500">Preparing your video session...</p>
                  </div>
                </div>
              ) : (
                <SessionLobby
                  session={selectedSession}
                  userName={userName}
                  onJoinCall={handleJoinCall}
                  onBack={handleBackToQueue}
                  onSessionUpdated={(updates) => {
                    setSelectedSession((prev) =>
                      prev ? { ...prev, ...updates } : prev
                    );
                  }}
                />
              )}
            </motion.div>
          )}

          {phase === 'postCall' && postCallData && (
            <motion.div key="postCall" {...(pageVariants as any)}>
              <PostCallSummary
                data={postCallData}
                onBackToQueue={handleBackToQueue}
                onSelectNextPatient={(nextSession) => {
                  setSelectedSession(nextSession);
                  setPostCallData(null);
                  changePhase('lobby');
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {showScheduleModal && (
        <ScheduleSessionModal
          onClose={() => setShowScheduleModal(false)}
          onCreated={handleSessionCreated}
        />
      )}
    </div>
  );
}
