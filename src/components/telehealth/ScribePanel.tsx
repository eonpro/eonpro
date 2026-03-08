'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  FileText,
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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    if (!appointmentId || !patientId || !providerId) return;

    setInitializing(true);
    setError(null);

    try {
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

      if (!startRes.ok) throw new Error('Failed to start scribe session');
      const { sessionId: sid } = await startRes.json();
      setSessionId(sid);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start(10000); // 10-second chunks
      setRecording(true);

      // Send chunks periodically
      const sendInterval = setInterval(async () => {
        if (chunksRef.current.length === 0) return;

        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        chunksRef.current = [];

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

          if (res.ok) {
            const data = await res.json();
            if (data.text) {
              const newSegment: TranscriptSegment = {
                speaker: data.speaker || 'unknown',
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
          }
        } catch {
          // Non-blocking — scribe failure shouldn't interrupt the call
        }
      }, 12000);

      return () => clearInterval(sendInterval);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start recording';
      setError(msg);
    } finally {
      setInitializing(false);
    }
  }, [appointmentId, patientId, providerId, onTranscriptUpdate]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    setRecording(false);
  }, []);

  useEffect(() => {
    if (isCallActive && !recording && !initializing && appointmentId) {
      startRecording();
    }

    if (!isCallActive && recording) {
      stopRecording();
    }
  }, [isCallActive, recording, initializing, appointmentId, startRecording, stopRecording]);

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
        {recording && (
          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
        )}
      </button>
    );
  }

  return (
    <div className="flex h-full w-80 flex-col border-l border-gray-200 bg-white">
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
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
            <p className="text-xs text-amber-700">{error}</p>
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
                : 'AI Scribe will start when the call begins.'}
            </p>
          </div>
        )}

        <div className="space-y-3">
          {segments.map((seg, i) => (
            <div key={i} className="group">
              <div className="mb-0.5 flex items-center gap-2">
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wide ${
                    seg.speaker === 'provider' ? 'text-blue-600' : seg.speaker === 'patient' ? 'text-emerald-600' : 'text-gray-400'
                  }`}
                >
                  {seg.speaker === 'provider' ? 'Provider' : seg.speaker === 'patient' ? 'Patient' : 'Speaker'}
                </span>
                <span className="text-[10px] text-gray-300">
                  {new Date(seg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
                onClick={startRecording}
                disabled={initializing}
                className="flex items-center gap-1.5 rounded-lg bg-blue-100 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-200 disabled:opacity-50"
              >
                <Mic className="h-3.5 w-3.5" />
                Resume
              </button>
            )}
          </div>
          <span className="text-[10px] text-gray-400">
            {segments.length} segments
          </span>
        </div>
      </div>
    </div>
  );
}
