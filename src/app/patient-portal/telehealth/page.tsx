'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Shield,
  Clock,
  Users,
  CheckCircle,
  AlertTriangle,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { portalFetch } from '@/lib/api/patient-portal-client';

interface AppointmentData {
  id: number;
  title: string;
  startTime: string;
  duration: number;
  type: string;
  videoLink?: string;
  zoomJoinUrl?: string;
  zoomMeetingId?: string;
  providerName?: string;
  status: string;
}

function TelehealthJoinContent() {
  const searchParams = useSearchParams();
  const appointmentId = searchParams.get('appointmentId');

  const videoRef = useRef<HTMLVideoElement>(null);
  const [appointment, setAppointment] = useState<AppointmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devicesReady, setDevicesReady] = useState(false);
  const [joined, setJoined] = useState(false);
  const [, setCountdownTick] = useState(0);

  const fetchAppointment = useCallback(async () => {
    if (!appointmentId) {
      setError('No appointment specified');
      setLoading(false);
      return;
    }

    try {
      const res = await portalFetch(`/api/patient-portal/appointments?appointmentId=${appointmentId}`);
      if (res.ok) {
        const data = await res.json();
        const appt = data.appointment ?? data;
        if (appt?.type?.toUpperCase() !== 'VIDEO') {
          setError('This appointment is not a video consultation');
        } else {
          setAppointment(appt);
        }
      } else {
        setError('Could not find this appointment');
      }
    } catch {
      setError('Failed to load appointment details');
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    void fetchAppointment();
  }, [fetchAppointment]);

  useEffect(() => {
    let mounted = true;

    const initDevices = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (!mounted) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }
        setStream(mediaStream);
        setDevicesReady(true);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch {
        if (mounted) setDevicesReady(false);
      }
    };

    void initDevices();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [stream]);

  useEffect(() => {
    if (!appointment?.startTime) return;
    const interval = setInterval(() => setCountdownTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, [appointment?.startTime]);

  const toggleCamera = () => {
    stream?.getVideoTracks().forEach((t) => { t.enabled = !cameraOn; });
    setCameraOn(!cameraOn);
  };

  const toggleMic = () => {
    stream?.getAudioTracks().forEach((t) => { t.enabled = !micOn; });
    setMicOn(!micOn);
  };

  const joinCall = () => {
    const url = appointment?.zoomJoinUrl ?? appointment?.videoLink;
    if (url) {
      stream?.getTracks().forEach((t) => t.stop());
      setJoined(true);
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const formatTime = (dateStr: string) =>
    new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateStr));

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
        <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 px-4">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-amber-500" />
          <h1 className="mb-2 text-xl font-bold text-gray-900">{error}</h1>
          <p className="text-sm text-gray-500">
            Please check the link you received or contact your provider&apos;s office.
          </p>
        </div>
      </div>
    );
  }

  if (joined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 px-4">
        <div className="max-w-md text-center">
          <CheckCircle className="mx-auto mb-4 h-16 w-16 text-emerald-500" />
          <h1 className="mb-2 text-2xl font-bold text-gray-900">Joining Your Call</h1>
          <p className="mb-6 text-sm text-gray-500">
            Zoom should have opened in a new tab. If it didn&apos;t, click the button below.
          </p>
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={joinCall}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <ExternalLink className="h-4 w-4" />
              Reopen Zoom
            </button>
            <a
              href={`/patient-portal/telehealth/complete?appointmentId=${appointmentId}`}
              className="text-sm text-gray-500 underline hover:text-gray-700"
            >
              I&apos;m done with my visit
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 px-4 py-8">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
            <Video className="h-8 w-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Your Video Consultation</h1>
          <p className="mt-1 text-sm text-gray-500">
            Check your camera and microphone before joining
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
          {/* Appointment Info */}
          <div className="border-b border-gray-100 bg-gray-50 px-6 py-4">
            <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-gray-600 sm:gap-6">
              {appointment?.providerName && (
                <span className="flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-gray-400" />
                  {appointment.providerName}
                </span>
              )}
              {appointment?.startTime && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-gray-400" />
                  {formatTime(appointment.startTime)}
                </span>
              )}
            </div>
          </div>

          {/* Camera Preview */}
          <div className="relative mx-auto aspect-video w-full max-w-lg bg-gray-900">
            {devicesReady && cameraOn ? (
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
                  {devicesReady ? 'Camera off' : 'Camera not available'}
                </p>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-4 border-t border-gray-800 bg-gray-900 py-4">
            <button
              onClick={toggleMic}
              disabled={!devicesReady}
              className={`flex h-12 w-12 items-center justify-center rounded-full transition-all ${
                micOn ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-red-600 text-white hover:bg-red-700'
              } disabled:opacity-40`}
            >
              {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </button>
            <button
              onClick={toggleCamera}
              disabled={!devicesReady}
              className={`flex h-12 w-12 items-center justify-center rounded-full transition-all ${
                cameraOn ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-red-600 text-white hover:bg-red-700'
              } disabled:opacity-40`}
            >
              {cameraOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
            </button>
          </div>

          {/* Join Button with Countdown */}
          <div className="px-6 py-5">
            {appointment?.startTime && (() => {
              const msUntil = new Date(appointment.startTime).getTime() - Date.now();
              const minsUntil = Math.max(0, Math.floor(msUntil / 60000));
              if (minsUntil > 0 && minsUntil <= 60) {
                return (
                  <p className="mb-3 text-center text-sm font-medium text-blue-700">
                    Starting in {minsUntil} minute{minsUntil !== 1 ? 's' : ''}
                  </p>
                );
              }
              return null;
            })()}
            <button
              onClick={joinCall}
              disabled={!appointment?.zoomJoinUrl && !appointment?.videoLink}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-4 text-lg font-bold text-white shadow-lg transition-all hover:bg-blue-700 hover:shadow-xl active:scale-[0.98] disabled:bg-gray-300"
            >
              <Video className="h-6 w-6" />
              Join Consultation
            </button>
          </div>

          {/* HIPAA Badge */}
          <div className="border-t border-gray-100 bg-gray-50 px-6 py-3 text-center">
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
              <Shield className="h-3.5 w-3.5" />
              HIPAA-compliant encrypted connection
            </span>
          </div>
        </div>

        {/* Help Text */}
        <p className="mt-6 text-center text-xs text-gray-400">
          Having trouble? Contact your provider&apos;s office for assistance.
        </p>
      </div>
    </div>
  );
}

export default function PatientTelehealthPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
          <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
        </div>
      }
    >
      <TelehealthJoinContent />
    </Suspense>
  );
}
