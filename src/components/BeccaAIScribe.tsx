'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Mic,
  MicOff,
  StopCircle,
  FileText,
  AlertTriangle,
  Loader2,
  Volume2,
  Clock,
} from 'lucide-react';

interface TranscriptionSegment {
  id: string;
  speaker: 'provider' | 'patient' | 'unknown';
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
  timestamp: Date;
}

interface ScribeProps {
  patientId: number;
  providerId: number;
  appointmentId?: number;
  patientName: string;
  onSOAPGenerated?: (soapNote: any) => void;
  onClose?: () => void;
}

export default function BeccaAIScribe({
  patientId,
  providerId,
  appointmentId,
  patientName,
  onSOAPGenerated,
  onClose,
}: ScribeProps) {
  // State
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [segments, setSegments] = useState<TranscriptionSegment[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingSOAP, setIsGeneratingSOAP] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [soapNote, setSoapNote] = useState<any>(null);
  const [redFlags, setRedFlags] = useState<any>(null);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const chunkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
    }
  }, [segments]);

  // Timer for recording duration
  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording, isPaused]);

  // Cleanup on unmount - stop recording and clear intervals
  useEffect(() => {
    return () => {
      // Clear chunk interval
      if (chunkIntervalRef.current) {
        clearInterval(chunkIntervalRef.current);
      }
      // Stop media recorder and release tracks
      if (mediaRecorderRef.current) {
        try {
          if (mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
          }
          mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
        } catch (e) {
          // Ignore errors during cleanup
        }
      }
    };
  }, []);

  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Start recording
  const startRecording = async () => {
    try {
      setError(null);

      // Start session
      const sessionRes = await fetch('/api/ai-scribe/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          patientId,
          providerId,
          appointmentId,
        }),
      });

      if (!sessionRes.ok) {
        throw new Error('Failed to start transcription session');
      }

      const sessionData = await sessionRes.json();
      setSessionId(sessionData.session.id);

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Process audio every 10 seconds
      mediaRecorder.onstop = async () => {
        if (audioChunksRef.current.length > 0) {
          await processAudioChunk();
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setDuration(0);

      // Set up interval to process chunks
      chunkIntervalRef.current = setInterval(async () => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
          mediaRecorderRef.current.start();
        }
      }, 10000); // Every 10 seconds
    } catch (err: any) {
      setError(err.message || 'Failed to start recording');
      console.error('Recording error:', err);
    }
  };

  // Process audio chunk
  const processAudioChunk = async () => {
    if (audioChunksRef.current.length === 0 || !sessionId) return;

    setIsProcessing(true);

    try {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      audioChunksRef.current = [];

      const formData = new FormData();
      formData.append('audio', audioBlob, 'audio.webm');
      formData.append('sessionId', sessionId);
      formData.append('patientId', patientId.toString());
      formData.append('providerId', providerId.toString());
      formData.append('isChunk', 'true');

      const response = await fetch('/api/ai-scribe/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Transcription failed');
      }

      const data = await response.json();

      if (data.segments && data.segments.length > 0) {
        setSegments((prev) => [...prev, ...data.segments]);
      }
    } catch (err: any) {
      console.error('Chunk processing error:', err);
      // Don't set error state for chunk failures - just log
    } finally {
      setIsProcessing(false);
    }
  };

  // Stop recording
  const stopRecording = async () => {
    // Clear chunk interval
    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current);
      chunkIntervalRef.current = null;
    }

    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }

    setIsRecording(false);
    setIsPaused(false);

    // Process any remaining audio
    await processAudioChunk();
  };

  // Toggle pause
  const togglePause = () => {
    if (!mediaRecorderRef.current) return;

    if (isPaused) {
      mediaRecorderRef.current.resume();
    } else {
      mediaRecorderRef.current.pause();
    }
    setIsPaused(!isPaused);
  };

  // Generate SOAP note
  const generateSOAP = async () => {
    if (!sessionId) return;

    setIsGeneratingSOAP(true);
    setError(null);

    try {
      const response = await fetch('/api/ai-scribe/generate-soap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          patientId,
          providerId,
          appointmentId,
          saveNote: true,
          checkRedFlags: true,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate SOAP note');
      }

      const data = await response.json();
      setSoapNote(data.soapNote);
      setRedFlags(data.redFlags);

      if (onSOAPGenerated) {
        onSOAPGenerated(data.soapNote);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate SOAP note');
    } finally {
      setIsGeneratingSOAP(false);
    }
  };

  return (
    <div className="w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-xl">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
              <Mic className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Becca AI Scribe</h2>
              <p className="text-sm text-white/80">Recording session with {patientName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isRecording && (
              <div className="flex items-center gap-2 rounded-full bg-white/20 px-3 py-1">
                <div
                  className={`h-2 w-2 rounded-full ${isPaused ? 'bg-yellow-400' : 'animate-pulse bg-red-500'}`}
                />
                <Clock className="h-4 w-4" />
                <span className="font-mono">{formatDuration(duration)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="m-4 rounded border-l-4 border-red-500 bg-red-50 p-4">
          <div className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Red Flags Alert */}
      {redFlags?.hasRedFlags && (
        <div className="m-4 rounded border-l-4 border-amber-500 bg-amber-50 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
            <div>
              <h4 className="font-semibold text-amber-800">Red Flags Detected</h4>
              <ul className="mt-2 space-y-1">
                {redFlags.flags.map((flag: any, idx: number) => (
                  <li key={idx} className="text-sm text-amber-700">
                    <span
                      className={`mr-2 inline-block rounded px-2 py-0.5 text-xs ${
                        flag.severity === 'high'
                          ? 'bg-red-100 text-red-700'
                          : flag.severity === 'medium'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {flag.severity}
                    </span>
                    {flag.description}
                  </li>
                ))}
              </ul>
              {redFlags.recommendation && (
                <p className="mt-2 text-sm font-medium text-amber-800">
                  Recommendation: {redFlags.recommendation}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="p-4">
        {/* Transcript Area */}
        <div className="mb-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
            <Volume2 className="h-4 w-4" />
            Live Transcript
            {isProcessing && <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />}
          </h3>
          <div
            ref={transcriptContainerRef}
            className="h-64 overflow-y-auto rounded-lg border bg-gray-50 p-4"
          >
            {segments.length === 0 ? (
              <p className="py-8 text-center text-gray-400">
                {isRecording
                  ? "Listening... Speech will appear here as it's transcribed."
                  : 'Click "Start Recording" to begin transcribing the consultation.'}
              </p>
            ) : (
              <div className="space-y-3">
                {segments.map((segment, idx) => (
                  <div
                    key={segment.id || idx}
                    className={`flex gap-3 ${
                      segment.speaker === 'provider' ? 'justify-start' : 'justify-end'
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg p-3 ${
                        segment.speaker === 'provider'
                          ? 'bg-emerald-100 text-emerald-900'
                          : 'bg-blue-100 text-blue-900'
                      }`}
                    >
                      <p className="mb-1 text-xs font-medium opacity-70">
                        {segment.speaker === 'provider' ? '👨‍⚕️ Provider' : '👤 Patient'}
                      </p>
                      <p className="text-sm">{segment.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* SOAP Note Preview */}
        {soapNote && (
          <div className="mb-4 rounded-lg border bg-emerald-50 p-4">
            <h3 className="mb-3 flex items-center gap-2 font-medium text-emerald-800">
              <FileText className="h-4 w-4" />
              Generated SOAP Note
            </h3>
            <div className="space-y-3 text-sm">
              <div>
                <h4 className="font-semibold text-gray-700">Subjective</h4>
                <p className="text-gray-600">{soapNote.subjective}</p>
              </div>
              <div>
                <h4 className="font-semibold text-gray-700">Objective</h4>
                <p className="text-gray-600">{soapNote.objective}</p>
              </div>
              <div>
                <h4 className="font-semibold text-gray-700">Assessment</h4>
                <p className="text-gray-600">{soapNote.assessment}</p>
              </div>
              <div>
                <h4 className="font-semibold text-gray-700">Plan</h4>
                <p className="text-gray-600">{soapNote.plan}</p>
              </div>
              {soapNote.icdCodes?.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-700">ICD-10 Codes</h4>
                  <p className="text-gray-600">{soapNote.icdCodes.join(', ')}</p>
                </div>
              )}
              {soapNote.cptCodes?.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-700">CPT Codes</h4>
                  <p className="text-gray-600">{soapNote.cptCodes.join(', ')}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {!isRecording ? (
              <button
                onClick={startRecording}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-white transition-colors hover:bg-emerald-700"
              >
                <Mic className="h-4 w-4" />
                Start Recording
              </button>
            ) : (
              <>
                <button
                  onClick={togglePause}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 transition-colors ${
                    isPaused
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'bg-yellow-500 text-white hover:bg-yellow-600'
                  }`}
                >
                  {isPaused ? (
                    <>
                      <Mic className="h-4 w-4" />
                      Resume
                    </>
                  ) : (
                    <>
                      <MicOff className="h-4 w-4" />
                      Pause
                    </>
                  )}
                </button>
                <button
                  onClick={stopRecording}
                  className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700"
                >
                  <StopCircle className="h-4 w-4" />
                  Stop
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {segments.length > 0 && !isRecording && (
              <button
                onClick={generateSOAP}
                disabled={isGeneratingSOAP}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGeneratingSOAP ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4" />
                    Generate SOAP Note
                  </>
                )}
              </button>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-600 transition-colors hover:text-gray-800"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t bg-gray-50 px-4 py-3 text-xs text-gray-500">
        <p className="flex items-center gap-1">
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          Audio is processed securely and not stored. Only transcripts are saved for documentation.
        </p>
      </div>
    </div>
  );
}
