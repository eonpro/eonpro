'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Users,
  Clock,
  Shield,
  ArrowLeft,
  AlertTriangle,
  CheckCircle,
  Calendar,
  Loader2,
} from 'lucide-react';
import { TelehealthSessionData, DeviceStatus } from './types';

interface SessionLobbyProps {
  session: TelehealthSessionData;
  userName: string;
  onJoinCall: () => void;
  onBack: () => void;
}

export default function SessionLobby({ session, userName, onJoinCall, onBack }: SessionLobbyProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [devices, setDevices] = useState<DeviceStatus>({
    camera: 'pending',
    microphone: 'pending',
  });
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [checking, setChecking] = useState(true);

  const checkDevices = useCallback(async () => {
    setChecking(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setDevices({
        camera: 'granted',
        microphone: 'granted',
        cameraStream: stream,
      });
    } catch (err) {
      const error = err as DOMException;
      if (error.name === 'NotAllowedError') {
        setDevices({ camera: 'denied', microphone: 'denied' });
      } else if (error.name === 'NotFoundError') {
        setDevices({ camera: 'unavailable', microphone: 'unavailable' });
      } else {
        setDevices({ camera: 'denied', microphone: 'denied' });
      }
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    checkDevices();

    return () => {
      if (devices.cameraStream) {
        devices.cameraStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCamera = () => {
    if (devices.cameraStream) {
      devices.cameraStream.getVideoTracks().forEach((track) => {
        track.enabled = !cameraOn;
      });
      setCameraOn(!cameraOn);
    }
  };

  const toggleMic = () => {
    if (devices.cameraStream) {
      devices.cameraStream.getAudioTracks().forEach((track) => {
        track.enabled = !micOn;
      });
      setMicOn(!micOn);
    }
  };

  const handleJoin = () => {
    if (devices.cameraStream) {
      devices.cameraStream.getTracks().forEach((track) => track.stop());
    }
    onJoinCall();
  };

  const formatDateTime = (dateStr: string) =>
    new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateStr));

  const devicesReady = devices.camera === 'granted' && devices.microphone === 'granted';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Back Button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to sessions
      </button>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Camera Preview — takes 3 columns */}
        <div className="lg:col-span-3">
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-900">
            <div className="relative aspect-video w-full">
              {checking ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-10 w-10 animate-spin text-gray-400" />
                </div>
              ) : devices.camera === 'granted' && cameraOn ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-cover"
                  style={{ transform: 'scaleX(-1)' }}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-gray-400">
                  <VideoOff className="mb-2 h-12 w-12" />
                  <p className="text-sm">
                    {devices.camera === 'denied'
                      ? 'Camera access denied'
                      : devices.camera === 'unavailable'
                        ? 'No camera detected'
                        : 'Camera off'}
                  </p>
                </div>
              )}

              {/* Name Overlay */}
              <div className="absolute bottom-3 left-3 rounded-lg bg-black/60 px-3 py-1.5 backdrop-blur-sm">
                <span className="text-sm font-medium text-white">{userName}</span>
              </div>
            </div>

            {/* Device Controls */}
            <div className="flex items-center justify-center gap-3 border-t border-gray-800 bg-gray-950 px-4 py-3">
              <button
                onClick={toggleMic}
                disabled={devices.microphone !== 'granted'}
                className={`flex h-11 w-11 items-center justify-center rounded-full transition-all ${
                  micOn
                    ? 'bg-gray-700 text-white hover:bg-gray-600'
                    : 'bg-red-600 text-white hover:bg-red-700'
                } disabled:opacity-40`}
                title={micOn ? 'Mute microphone' : 'Unmute microphone'}
              >
                {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
              </button>

              <button
                onClick={toggleCamera}
                disabled={devices.camera !== 'granted'}
                className={`flex h-11 w-11 items-center justify-center rounded-full transition-all ${
                  cameraOn
                    ? 'bg-gray-700 text-white hover:bg-gray-600'
                    : 'bg-red-600 text-white hover:bg-red-700'
                } disabled:opacity-40`}
                title={cameraOn ? 'Turn off camera' : 'Turn on camera'}
              >
                {cameraOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {/* Device warnings */}
          {!checking && !devicesReady && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="text-xs text-amber-800">
                <p className="font-medium">Device access required</p>
                <p className="mt-0.5">
                  Allow camera and microphone access in your browser settings to join the call.
                  You can still join without them, but video/audio won't work.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Session Info — takes 2 columns */}
        <div className="space-y-4 lg:col-span-2">
          {/* Patient Info */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {session.patient.firstName} {session.patient.lastName}
                </p>
                <p className="text-xs text-gray-500">Patient</p>
              </div>
            </div>

            <div className="space-y-3 border-t border-gray-100 pt-4">
              {session.topic && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Topic</p>
                  <p className="mt-0.5 text-sm text-gray-700">{session.topic}</p>
                </div>
              )}

              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Scheduled</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-gray-700">
                  <Calendar className="h-3.5 w-3.5 text-gray-400" />
                  {formatDateTime(session.scheduledAt)}
                </p>
              </div>

              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Duration</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-gray-700">
                  <Clock className="h-3.5 w-3.5 text-gray-400" />
                  {session.duration} minutes
                </p>
              </div>

              {session.appointment?.reason && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Reason</p>
                  <p className="mt-0.5 text-sm text-gray-700">{session.appointment.reason}</p>
                </div>
              )}
            </div>
          </div>

          {/* Security Badge */}
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <Shield className="h-4 w-4 text-emerald-600" />
            <span className="text-xs font-medium text-emerald-700">
              HIPAA-compliant encrypted session
            </span>
          </div>

          {/* Device Status */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Devices</p>
            <div className="space-y-2">
              <DeviceRow
                label="Camera"
                status={devices.camera}
                checking={checking}
              />
              <DeviceRow
                label="Microphone"
                status={devices.microphone}
                checking={checking}
              />
            </div>
          </div>

          {/* Join Button */}
          <button
            onClick={handleJoin}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-4 text-base font-semibold text-white shadow-lg transition-all hover:bg-blue-700 hover:shadow-xl active:scale-[0.98]"
          >
            <Video className="h-5 w-5" />
            Join Call
          </button>
        </div>
      </div>
    </div>
  );
}

function DeviceRow({
  label,
  status,
  checking,
}: {
  label: string;
  status: DeviceStatus['camera'];
  checking: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-600">{label}</span>
      {checking ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
      ) : status === 'granted' ? (
        <span className="flex items-center gap-1 text-xs text-emerald-600">
          <CheckCircle className="h-3.5 w-3.5" />
          Ready
        </span>
      ) : status === 'denied' ? (
        <span className="flex items-center gap-1 text-xs text-red-600">
          <AlertTriangle className="h-3.5 w-3.5" />
          Blocked
        </span>
      ) : (
        <span className="flex items-center gap-1 text-xs text-gray-400">
          Not found
        </span>
      )}
    </div>
  );
}
