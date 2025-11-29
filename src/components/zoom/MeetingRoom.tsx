"use client";

import { useState, useEffect, useRef } from "react";
import { isFeatureEnabled } from "@/lib/features";
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
  UserCheck
} from "lucide-react";

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

  // Check if feature is enabled
  const isEnabled = isFeatureEnabled("ZOOM_TELEHEALTH");
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
        await new Promise(resolve => setTimeout(resolve, 2000));
        
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
      // Stop screen share
      if (remoteVideoRef.current && localVideoRef.current?.srcObject) {
        remoteVideoRef.current.srcObject = (localVideoRef.current.srcObject as MediaStream).clone();
      }
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });
        
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = screenStream;
        }
        
        setIsScreenSharing(true);
        
        // Listen for screen share end
        screenStream.getVideoTracks()[0].addEventListener('ended', () => {
          setIsScreenSharing(false);
          if (remoteVideoRef.current && localVideoRef.current?.srcObject) {
            remoteVideoRef.current.srcObject = (localVideoRef.current.srcObject as MediaStream).clone();
          }
        });
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
    setParticipants(prev => [
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
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-center text-white">
          <AlertCircle className="h-16 w-16 mx-auto mb-4 text-yellow-500" />
          <h2 className="text-2xl font-semibold mb-2">Zoom Telehealth Not Enabled</h2>
          <p className="text-gray-400">Please enable the Zoom Telehealth feature to use video consultations.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-center text-white">
          <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4" />
          <h2 className="text-xl">Joining meeting...</h2>
          <p className="text-gray-400 mt-2">Meeting ID: {meetingId}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-center text-white max-w-md">
          <AlertCircle className="h-16 w-16 mx-auto mb-4 text-red-500" />
          <h2 className="text-2xl font-semibold mb-2">Unable to Join Meeting</h2>
          <p className="text-gray-400 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="bg-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-white font-semibold">Telehealth Consultation</h1>
          <span className="text-gray-400 text-sm">Meeting ID: {meetingId}</span>
          {useMock && (
            <span className="text-yellow-500 text-xs bg-yellow-500/20 px-2 py-1 rounded">
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
            <div className="flex items-center gap-2 bg-yellow-600/20 px-3 py-1 rounded">
              <UserCheck className="h-4 w-4 text-yellow-500" />
              <span className="text-yellow-500 text-sm">{waitingRoomCount} waiting</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Video Area */}
        <div className="flex-1 relative bg-black" ref={videoContainerRef}>
          {/* Remote Video (Main) */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-contain"
          />
          
          {/* Local Video (PiP) */}
          <div className="absolute top-4 right-4 w-48 h-36 bg-gray-800 rounded-lg overflow-hidden shadow-lg">
            {isVideoOn ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover mirror"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center">
                  <VideoOff className="h-8 w-8 text-gray-500 mx-auto mb-2" />
                  <span className="text-gray-400 text-sm">{userName}</span>
                </div>
              </div>
            )}
          </div>

          {/* Screen Share Indicator */}
          {isScreenSharing && (
            <div className="absolute top-4 left-4 bg-green-600 text-white px-3 py-1 rounded-lg flex items-center gap-2">
              <Monitor className="h-4 w-4" />
              <span className="text-sm">Screen Sharing</span>
            </div>
          )}
        </div>

        {/* Sidebar (Participants/Chat) */}
        {(showParticipants || showChat) && (
          <div className="w-80 bg-gray-800 border-l border-gray-700">
            <div className="flex border-b border-gray-700">
              <button
                onClick={() => {
                  setShowParticipants(true);
                  setShowChat(false);
                }}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  showParticipants 
                    ? 'text-white bg-gray-900' 
                    : 'text-gray-400 hover:text-white'
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
                  showChat 
                    ? 'text-white bg-gray-900' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Chat
              </button>
            </div>

            {/* Participants List */}
            {showParticipants && (
              <div className="p-4 space-y-2">
                {/* Waiting Room */}
                {role === 'host' && waitingRoomCount > 0 && (
                  <div className="mb-4 p-3 bg-yellow-600/10 rounded-lg">
                    <h3 className="text-yellow-500 text-sm font-semibold mb-2">
                      Waiting Room ({waitingRoomCount})
                    </h3>
                    <button
                      onClick={() => admitFromWaitingRoom('waiting-1')}
                      className="w-full px-3 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 text-sm"
                    >
                      Admit All
                    </button>
                  </div>
                )}

                {/* In Meeting */}
                {participants.map((participant: any) => (
                  <div 
                    key={participant.id}
                    className="flex items-center justify-between p-2 rounded hover:bg-gray-700"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                        {participant.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <span className="text-white text-sm">
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
              <div className="flex flex-col h-full">
                <div className="flex-1 p-4">
                  <div className="text-center text-gray-500 text-sm">
                    Chat messages will appear here
                  </div>
                </div>
                <div className="p-4 border-t border-gray-700">
                  <input
                    type="text"
                    placeholder="Type a message..."
                    className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            className={`p-3 rounded-lg transition-colors ${
              isMuted 
                ? 'bg-red-600 hover:bg-red-700' 
                : 'bg-gray-700 hover:bg-gray-600'
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
            className={`p-3 rounded-lg transition-colors ${
              !isVideoOn 
                ? 'bg-red-600 hover:bg-red-700' 
                : 'bg-gray-700 hover:bg-gray-600'
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
            className={`p-3 rounded-lg transition-colors ${
              isScreenSharing 
                ? 'bg-blue-600 hover:bg-blue-700' 
                : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            <Monitor className="h-5 w-5 text-white" />
          </button>

          <button
            onClick={() => setShowParticipants(!showParticipants)}
            className="p-3 bg-gray-700 rounded-lg hover:bg-gray-600"
          >
            <Users className="h-5 w-5 text-white" />
          </button>

          <button
            onClick={() => setShowChat(!showChat)}
            className="p-3 bg-gray-700 rounded-lg hover:bg-gray-600 relative"
          >
            <MessageSquare className="h-5 w-5 text-white" />
          </button>

          <button
            onClick={leaveMeeting}
            className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold"
          >
            <PhoneOff className="h-5 w-5 inline mr-2" />
            Leave Meeting
          </button>
        </div>
      </div>
    </div>
  );
}
