'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

import { AnimatePresence, motion } from 'framer-motion';

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

  // Auto-open lobby when navigated with ?consultationId=X (from consultations page)
  useEffect(() => {
    const consultationId = searchParams.get('consultationId');
    if (!consultationId || selectedSession) return;

    const loadSession = async () => {
      try {
        const res = await apiFetch('/api/provider/telehealth/upcoming');
        if (!res.ok) return;
        const data = await res.json();
        const sessions: TelehealthSessionData[] = data.sessions ?? [];

        // Match by appointment ID
        const match = sessions.find(
          (s) => s.appointment?.id === Number(consultationId) || s.id === Number(consultationId)
        );

        if (match) {
          setSelectedSession(match);
          setPhase('lobby');
          onPhaseChange?.('lobby');
        }
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
      changePhase('lobby');
    },
    [changePhase]
  );

  const handleJoinCall = useCallback((enableScribe: boolean) => {
    setScribeEnabled(enableScribe);
    changePhase('call');
  }, [changePhase]);

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
        userEmail={userEmail}
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
            <motion.div key={`queue-${refreshKey}`} {...pageVariants}>
              <SessionQueue
                onSelectSession={handleSelectSession}
                onScheduleNew={() => setShowScheduleModal(true)}
              />
            </motion.div>
          )}

          {phase === 'lobby' && selectedSession && (
            <motion.div key="lobby" {...pageVariants}>
              <SessionLobby
                session={selectedSession}
                userName={userName}
                onJoinCall={handleJoinCall}
                onBack={handleBackToQueue}
              />
            </motion.div>
          )}

          {phase === 'postCall' && postCallData && (
            <motion.div key="postCall" {...pageVariants}>
              <PostCallSummary
                data={postCallData}
                onBackToQueue={handleBackToQueue}
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
