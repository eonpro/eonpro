'use client';

import { useState, useEffect, useRef } from 'react';
import { isFeatureEnabled } from '@/lib/features';
import { logger } from '@/lib/logger';
import { Patient, Provider, Order } from '@/types/models';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  Monitor,
  Users,
  MessageSquare,
  Settings,
  Maximize,
  Volume2,
  Loader2,
  AlertCircle,
  Clock,
  UserCheck,
} from 'lucide-react';

interface MeetingRoomProps {
  meetingId: string;
  meetingPassword?: string;
  userName: string;
  userEmail?: string;
  role: 'host' | 'participant';
  onMeetingEnd?: () => void;
}

interface ParticipantInfo {
  id: string;
  name: string;
  isHost: boolean;
  isMuted: boolean;
  isVideoOn: boolean;
  isInWaitingRoom?: boolean;
}

export default function MeetingRoom({
  meetingId,
  meetingPassword,
  userName,
  userEmail,
  role,
  onMeetingEnd,
}: MeetingRoomProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [waitingRoomCount, setWaitingRoomCount] = useState(0);
  const [meetingDuration, setMeetingDuration] = useState(0);
  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoContainerRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const meetingClientRef = useRef<any>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  // Check if feature is enabled
  const isEnabled = isFeatureEnabled('ZOOM_TELEHEALTH');
  const useMock = !isEnabled || process.env.ZOOM_USE_MOCK === 'true';

  useEffect(() => {
    if (isEnabled) {
      initializeMeeting();
    }

    // Start duration timer
    const startTime = Date.now();
    durationIntervalRef.current = setInterval(() => {
      setMeetingDuration(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      leaveMeeting();
    };
  }, []);

  const initializeMeeting = async () => {
    try {
      setIsLoading(true);

      if (useMock) {
        // Mock meeting initialization
        logger.debug('[ZOOM] Initializing mock meeting');
        await new Promise((resolve) => setTimeout(resolve, 2000));

        setParticipants([
          {
            id: 'host-1',
            name: role === 'host' ? userName : 'Dr. Smith',
            isHost: role === 'host',
            isMuted: false,
            isVideoOn: true,
          },
          {
            id: 'participant-1',
            name: role === 'participant' ? userName : 'John Doe',
            isHost: false,
            isMuted: true,
            isVideoOn: true,
          },
        ]);

        if (role === 'host') {
          setWaitingRoomCount(1);
        }

        // Initialize mock video streams
        await initializeLocalVideo();

        setIsConnected(true);
      } else {
        // Initialize real Zoom SDK
        // This would require the Zoom Web SDK to be loaded
        logger.debug('[ZOOM] Would initialize real Zoom SDK here');
        setError('Zoom SDK not loaded. Please configure Zoom credentials.');
      }
    } catch (err: any) {
      // @ts-ignore

      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('[ZOOM] Initialization error:', err);
      setError(errorMessage || 'Failed to join meeting');
    } finally {
      setIsLoading(false);
    }
  };

  const initializeLocalVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // For demo, mirror the local stream to remote
      if (remoteVideoRef.current && useMock) {
        // Clone stream for demo purposes
        remoteVideoRef.current.srcObject = stream.clone();
      }
    } catch (err: any) {
      // @ts-ignore

      logger.error('[ZOOM] Failed to access camera/microphone:', err);
      setIsVideoOn(false);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);

    // Toggle actual microphone if connected
    if (localVideoRef.current?.srcObject) {
      const stream = localVideoRef.current.srcObject as MediaStream;
      stream.getAudioTracks().forEach((track: any) => {
        track.enabled = isMuted; // Note: inverted because we're toggling
      });
    }
  };

  const toggleVideo = () => {
    setIsVideoOn(!isVideoOn);

    // Toggle actual camera if connected
    if (localVideoRef.current?.srcObject) {
      const stream = localVideoRef.current.srcObject as MediaStream;
      stream.getVideoTracks().forEach((track: any) => {
        track.enabled = !isVideoOn; // Note: inverted because we're toggling
      });
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      setIsScreenSharing(false);
      // Stop screen share and clean up stream
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
        screenStreamRef.current = null;
      }
      if (remoteVideoRef.current && localVideoRef.current?.srcObject) {
        remoteVideoRef.current.srcObject = (localVideoRef.current.srcObject as MediaStream).clone();
      }
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });

        // Store reference for cleanup
        screenStreamRef.current = screenStream;

        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = screenStream;
        }

        setIsScreenSharing(true);

        // Listen for screen share end - the track will be stopped when the user clicks "Stop sharing"
        // which automatically triggers the 'ended' event and cleans up
        const videoTrack = screenStream.getVideoTracks()[0];
        const handleEnded = () => {
          setIsScreenSharing(false);
          screenStreamRef.current = null;
          if (remoteVideoRef.current && localVideoRef.current?.srcObject) {
            remoteVideoRef.current.srcObject = (
              localVideoRef.current.srcObject as MediaStream
            ).clone();
          }
        };
        videoTrack.addEventListener('ended', handleEnded);
      } catch (err: any) {
        // @ts-ignore

        logger.error('[ZOOM] Screen share failed:', err);
      }
    }
  };

  const admitFromWaitingRoom = (participantId: string) => {
    logger.debug('[ZOOM] Admitting participant:', { value: participantId });
    setWaitingRoomCount(Math.max(0, waitingRoomCount - 1));

    // In real implementation, this would call the Zoom API
    setParticipants((prev) => [
      ...prev,
      {
        id: participantId,
        name: `Patient ${participantId}`,
        isHost: false,
        isMuted: true,
        isVideoOn: true,
      },
    ]);
  };

  const leaveMeeting = () => {
    // Stop all media tracks
    if (localVideoRef.current?.srcObject) {
      const stream = localVideoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track: any) => track.stop());
    }

    if (remoteVideoRef.current?.srcObject) {
      const stream = remoteVideoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track: any) => track.stop());
    }

    // Stop screen share stream if active
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }

    setIsConnected(false);
    onMeetingEnd?.();
  };

  const formatDuration = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isEnabled) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900">
        <div className="text-center text-white">
          <AlertCircle className="mx-auto mb-4 h-16 w-16 text-yellow-500" />
          <h2 className="mb-2 text-2xl font-semibold">Zoom Telehealth Not Enabled</h2>
          <p className="text-gray-400">
            Please enable the Zoom Telehealth feature to use video consultations.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900">
        <div className="text-center text-white">
          <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin" />
          <h2 className="text-xl">Joining meeting...</h2>
          <p className="mt-2 text-gray-400">Meeting ID: {meetingId}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900">
        <div className="max-w-md text-center text-white">
          <AlertCircle className="mx-auto mb-4 h-16 w-16 text-red-500" />
          <h2 className="mb-2 text-2xl font-semibold">Unable to Join Meeting</h2>
          <p className="mb-4 text-gray-400">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between bg-gray-800 px-6 py-3">
        <div className="flex items-center gap-4">
          <h1 className="font-semibold text-white">Telehealth Consultation</h1>
          <span className="text-sm text-gray-400">Meeting ID: {meetingId}</span>
          {useMock && (
            <span className="rounded bg-yellow-500/20 px-2 py-1 text-xs text-yellow-500">
              DEMO MODE
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-white">
            <Clock className="h-4 w-4" />
            <span className="font-mono">{formatDuration(meetingDuration)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-gray-400" />
            <span className="text-white">{participants.length}</span>
          </div>
          {waitingRoomCount > 0 && (
            <div className="flex items-center gap-2 rounded bg-yellow-600/20 px-3 py-1">
              <UserCheck className="h-4 w-4 text-yellow-500" />
              <span className="text-sm text-yellow-500">{waitingRoomCount} waiting</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1">
        {/* Video Area */}
        <div className="relative flex-1 bg-black" ref={videoContainerRef}>
          {/* Remote Video (Main) */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="h-full w-full object-contain"
          />

          {/* Local Video (PiP) */}
          <div className="absolute right-4 top-4 h-36 w-48 overflow-hidden rounded-lg bg-gray-800 shadow-lg">
            {isVideoOn ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="mirror h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <div className="text-center">
                  <VideoOff className="mx-auto mb-2 h-8 w-8 text-gray-500" />
                  <span className="text-sm text-gray-400">{userName}</span>
                </div>
              </div>
            )}
          </div>

          {/* Screen Share Indicator */}
          {isScreenSharing && (
            <div className="absolute left-4 top-4 flex items-center gap-2 rounded-lg bg-green-600 px-3 py-1 text-white">
              <Monitor className="h-4 w-4" />
              <span className="text-sm">Screen Sharing</span>
            </div>
          )}
        </div>

        {/* Sidebar (Participants/Chat) */}
        {(showParticipants || showChat) && (
          <div className="w-80 border-l border-gray-700 bg-gray-800">
            <div className="flex border-b border-gray-700">
              <button
                onClick={() => {
                  setShowParticipants(true);
                  setShowChat(false);
                }}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  showParticipants ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Participants ({participants.length})
              </button>
              <button
                onClick={() => {
                  setShowParticipants(false);
                  setShowChat(true);
                }}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  showChat ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Chat
              </button>
            </div>

            {/* Participants List */}
            {showParticipants && (
              <div className="space-y-2 p-4">
                {/* Waiting Room */}
                {role === 'host' && waitingRoomCount > 0 && (
                  <div className="mb-4 rounded-lg bg-yellow-600/10 p-3">
                    <h3 className="mb-2 text-sm font-semibold text-yellow-500">
                      Waiting Room ({waitingRoomCount})
                    </h3>
                    <button
                      onClick={() => admitFromWaitingRoom('waiting-1')}
                      className="w-full rounded bg-yellow-600 px-3 py-2 text-sm text-white hover:bg-yellow-700"
                    >
                      Admit All
                    </button>
                  </div>
                )}

                {/* In Meeting */}
                {participants.map((participant: any) => (
                  <div
                    key={participant.id}
                    className="flex items-center justify-between rounded p-2 hover:bg-gray-700"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
                        {participant.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <span className="text-sm text-white">
                          {participant.name}
                          {participant.isHost && (
                            <span className="ml-2 text-xs text-blue-400">(Host)</span>
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {participant.isMuted ? (
                        <MicOff className="h-4 w-4 text-red-500" />
                      ) : (
                        <Mic className="h-4 w-4 text-green-500" />
                      )}
                      {participant.isVideoOn ? (
                        <Video className="h-4 w-4 text-green-500" />
                      ) : (
                        <VideoOff className="h-4 w-4 text-red-500" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Chat */}
            {showChat && (
              <div className="flex h-full flex-col">
                <div className="flex-1 p-4">
                  <div className="text-center text-sm text-gray-500">
                    Chat messages will appear here
                  </div>
                </div>
                <div className="border-t border-gray-700 p-4">
                  <input
                    type="text"
                    placeholder="Type a message..."
                    className="w-full rounded-lg bg-gray-700 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-gray-800 px-6 py-4">
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={toggleMute}
            className={`rounded-lg p-3 transition-colors ${
              isMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            {isMuted ? (
              <MicOff className="h-5 w-5 text-white" />
            ) : (
              <Mic className="h-5 w-5 text-white" />
            )}
          </button>

          <button
            onClick={toggleVideo}
            className={`rounded-lg p-3 transition-colors ${
              !isVideoOn ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            {isVideoOn ? (
              <Video className="h-5 w-5 text-white" />
            ) : (
              <VideoOff className="h-5 w-5 text-white" />
            )}
          </button>

          <button
            onClick={toggleScreenShare}
            className={`rounded-lg p-3 transition-colors ${
              isScreenSharing ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            <Monitor className="h-5 w-5 text-white" />
          </button>

          <button
            onClick={() => setShowParticipants(!showParticipants)}
            className="rounded-lg bg-gray-700 p-3 hover:bg-gray-600"
          >
            <Users className="h-5 w-5 text-white" />
          </button>

          <button
            onClick={() => setShowChat(!showChat)}
            className="relative rounded-lg bg-gray-700 p-3 hover:bg-gray-600"
          >
            <MessageSquare className="h-5 w-5 text-white" />
          </button>

          <button
            onClick={leaveMeeting}
            className="rounded-lg bg-red-600 px-6 py-3 font-semibold text-white hover:bg-red-700"
          >
            <PhoneOff className="mr-2 inline h-5 w-5" />
            Leave Meeting
          </button>
        </div>
      </div>
    </div>
  );
}
