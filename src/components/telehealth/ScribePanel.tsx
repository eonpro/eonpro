'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

import {
  Mic,
  MicOff,
  AlertTriangle,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Sparkles,
} from 'lucide-react';

import { apiFetch } from '@/lib/api/fetch';

interface ScribePanelProps {
  appointmentId?: number;
  patientId?: number;
  providerId?: number;
  isCallActive: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onTranscriptUpdate?: (transcript: string) => void;
}

interface TranscriptSegment {
  speaker: 'provider' | 'patient' | 'unknown';
  text: string;
  timestamp: number;
}

function getSpeakerStyle(speaker: TranscriptSegment['speaker']): string {
  if (speaker === 'provider') return 'text-blue-600';
  if (speaker === 'patient') return 'text-emerald-600';
  return 'text-gray-400';
}

function getSpeakerLabel(speaker: TranscriptSegment['speaker']): string {
  if (speaker === 'provider') return 'Provider';
  if (speaker === 'patient') return 'Patient';
  return 'Speaker';
}

export default function ScribePanel({
  appointmentId,
  patientId,
  providerId,
  isCallActive,
  collapsed,
  onToggle,
  onTranscriptUpdate,
}: ScribePanelProps) {
  const [recording, setRecording] = useState(false);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(false);
  const [startFailed, setStartFailed] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const sendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chunkErrorCountRef = useRef(0);

  const startRecording = useCallback(async () => {
    if (!appointmentId || !patientId || !providerId) return;

    setInitializing(true);
    setError(null);
    setStartFailed(false);
    chunkErrorCountRef.current = 0;

    try {
      // Request mic permission FIRST so the prompt appears while user is on this tab,
      // before Zoom steals focus. Also applies a timeout so we don't hang forever
      // if the permission dialog is ignored.
      let stream: MediaStream;
      try {
        const micPromise = navigator.mediaDevices.getUserMedia({ audio: true });
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  'Microphone permission timed out. Please allow microphone access and try again.'
                )
              ),
            15_000
          )
        );
        stream = await Promise.race([micPromise, timeoutPromise]);
      } catch (micErr) {
        const micMsg = micErr instanceof Error ? micErr.message : 'Microphone access denied';
        throw new Error(
          micMsg.includes('timed out')
            ? micMsg
            : micMsg.includes('denied') || micMsg.includes('NotAllowedError')
              ? 'Microphone access was denied. Please allow microphone access in your browser settings and try again.'
              : `Microphone error: ${micMsg}`
        );
      }

      const startRes = await apiFetch('/api/ai-scribe/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          patientId,
          providerId,
          appointmentId,
        }),
      });

      if (!startRes.ok) {
        stream.getTracks().forEach((t) => t.stop());
        let serverMsg = `Server returned ${startRes.status}`;
        try {
          const errBody = await startRes.json();
          serverMsg = errBody.details || errBody.error || serverMsg;
        } catch {
          /* response not JSON */
        }
        throw new Error(serverMsg);
      }
      const startData = await startRes.json();
      const sid = startData.sessionId ?? startData.session?.id;
      if (!sid) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error('No session ID returned from scribe service');
      }
      setSessionId(sid);

      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : 'audio/webm;codecs=opus';
      const blobType = mimeType.split(';')[0]; // 'audio/ogg' or 'audio/webm'

      function stopAndCollect(rec: MediaRecorder): Promise<Blob> {
        return new Promise((resolve) => {
          const parts: Blob[] = [];
          rec.ondataavailable = (e) => {
            if (e.data.size > 0) parts.push(e.data);
          };
          rec.onstop = () => resolve(new Blob(parts, { type: blobType }));
          rec.stop();
        });
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = () => {};
      recorder.start();
      setRecording(true);

      const sendInterval = setInterval(() => {
        const currentRec = mediaRecorderRef.current;
        if (!currentRec || currentRec.state !== 'recording' || !stream.active) return;

        void (async () => {
          const blob = await stopAndCollect(currentRec);

          if (stream.active) {
            const newRec = new MediaRecorder(stream, { mimeType });
            newRec.ondataavailable = () => {};
            mediaRecorderRef.current = newRec;
            newRec.start();
          }

          if (blob.size === 0) return;

          const formData = new FormData();
          formData.append('audio', blob, 'chunk.webm');
          formData.append('sessionId', sid);
          formData.append('patientId', patientId.toString());
          formData.append('providerId', providerId.toString());
          formData.append('isChunk', 'true');

          try {
            const res = await apiFetch('/api/ai-scribe/transcribe', {
              method: 'POST',
              body: formData,
            });
            if (!res.ok) {
              chunkErrorCountRef.current += 1;
              if (chunkErrorCountRef.current >= 3) {
                setError(
                  'Transcription service unavailable. Recording continues — SOAP note can be written manually.'
                );
              }
              return;
            }
            chunkErrorCountRef.current = 0;
            const data = await res.json();
            if (data?.text) {
              const newSegment: TranscriptSegment = {
                speaker: data.speaker ?? 'unknown',
                text: data.text,
                timestamp: Date.now(),
              };
              setSegments((prev) => {
                const next = [...prev, newSegment];
                const fullTranscript = next.map((s) => s.text).join(' ');
                onTranscriptUpdate?.(fullTranscript);
                return next;
              });
            }
          } catch {
            chunkErrorCountRef.current += 1;
            if (chunkErrorCountRef.current >= 3) {
              setError(
                'Transcription service unavailable. Recording continues — SOAP note can be written manually.'
              );
            }
          }
        })();
      }, 12000);

      sendIntervalRef.current = sendInterval;
    } catch (err) {
      if (mediaRecorderRef.current) {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          /* already stopped */
        }
        mediaRecorderRef.current = null;
      }
      const msg = err instanceof Error ? err.message : 'Failed to start recording';
      setError(msg);
      setStartFailed(true);
    } finally {
      setInitializing(false);
    }
  }, [appointmentId, patientId, providerId, onTranscriptUpdate]);

  const stopRecording = useCallback(() => {
    if (sendIntervalRef.current) {
      clearInterval(sendIntervalRef.current);
      sendIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setRecording(false);
  }, []);

  useEffect(() => {
    if (
      isCallActive &&
      !recording &&
      !initializing &&
      !startFailed &&
      appointmentId &&
      patientId &&
      providerId
    ) {
      void startRecording();
    }

    if (!isCallActive && recording) {
      stopRecording();
    }
  }, [
    isCallActive,
    recording,
    initializing,
    startFailed,
    appointmentId,
    patientId,
    providerId,
    startRecording,
    stopRecording,
  ]);

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [segments]);

  if (collapsed) {
    return (
      <button
        onClick={onToggle}
        className="flex h-full w-10 flex-col items-center justify-center gap-2 border-l border-gray-200 bg-gray-50 transition-colors hover:bg-gray-100"
        title="Open AI Scribe"
      >
        <ChevronLeft className="h-4 w-4 text-gray-500" />
        <div className="flex flex-col items-center gap-1">
          <Sparkles className="h-4 w-4 text-blue-500" />
          <span className="text-[10px] font-medium text-gray-500 [writing-mode:vertical-rl]">
            AI Scribe
          </span>
        </div>
        {recording && <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />}
      </button>
    );
  }

  return (
    <div className="flex h-full w-72 flex-col border-l border-gray-200 bg-white lg:w-80">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-gray-900">AI Scribe</h3>
          {recording && (
            <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
              Recording
            </span>
          )}
        </div>
        <button
          onClick={onToggle}
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Transcript */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
        {error && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              <p className="text-xs text-amber-700">{error}</p>
            </div>
            {startFailed && isCallActive && (
              <button
                onClick={() => {
                  setStartFailed(false);
                  setError(null);
                  void startRecording();
                }}
                className="mt-2 flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
              >
                <Mic className="h-3.5 w-3.5" />
                Retry AI Scribe
              </button>
            )}
          </div>
        )}

        {initializing && (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-blue-500" />
              <p className="text-xs text-gray-500">Initializing AI Scribe...</p>
            </div>
          </div>
        )}

        {!initializing && segments.length === 0 && !error && (
          <div className="py-8 text-center">
            <Mic className="mx-auto mb-2 h-8 w-8 text-gray-300" />
            <p className="text-xs text-gray-500">
              {recording
                ? 'Listening... Transcript will appear here.'
                : isCallActive && (!appointmentId || !providerId)
                  ? 'Waiting for session data...'
                  : 'AI Scribe will start when the call begins.'}
            </p>
            {recording && (
              <p className="mt-2 text-[10px] text-gray-400">
                Captures audio from your microphone. For best results, use speakers instead of
                headphones so patient audio is picked up.
              </p>
            )}
            {isCallActive && !recording && !initializing && appointmentId && providerId && (
              <button
                onClick={() => void startRecording()}
                className="mx-auto mt-4 flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700"
              >
                <Mic className="h-3.5 w-3.5" />
                Start AI Scribe
              </button>
            )}
          </div>
        )}

        <div className="space-y-3">
          {segments.map((seg, i) => (
            <div key={i} className="group">
              <div className="mb-0.5 flex items-center gap-2">
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wide ${getSpeakerStyle(seg.speaker)}`}
                >
                  {getSpeakerLabel(seg.speaker)}
                </span>
                <span className="text-[10px] text-gray-300">
                  {new Date(seg.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-gray-700">{seg.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {recording ? (
              <button
                onClick={stopRecording}
                className="flex items-center gap-1.5 rounded-lg bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-200"
              >
                <MicOff className="h-3.5 w-3.5" />
                Pause
              </button>
            ) : (
              <button
                onClick={() => {
                  setStartFailed(false);
                  setError(null);
                  void startRecording();
                }}
                disabled={initializing}
                className="flex items-center gap-1.5 rounded-lg bg-blue-100 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-200 disabled:opacity-50"
              >
                <Mic className="h-3.5 w-3.5" />
                Resume
              </button>
            )}
          </div>
          <span className="text-[10px] text-gray-400">{segments.length} segments</span>
        </div>
      </div>
    </div>
  );
}
