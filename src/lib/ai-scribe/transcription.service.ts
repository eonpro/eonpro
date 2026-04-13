/**
 * AI Scribe - Transcription Service
 *
 * Real-time and batch audio transcription using OpenAI Whisper
 * Includes speaker diarization and medical terminology enhancement
 */

import OpenAI from 'openai';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';

if (typeof globalThis.File === 'undefined') {
  try {
    // Node 18 requires explicit import for File; Node 20+ has it globally
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { File } = require('node:buffer');
    (globalThis as any).File = File;
  } catch {
    // Non-fatal: the SDK's toFile will throw a clear error at call time
  }
}

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is not configured. Set it in the environment to enable AI transcription.'
      );
    }
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

const MIME_TO_EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp3': 'mp3',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'mp4',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/flac': 'flac',
  'audio/mpga': 'mpga',
};

// Types
export interface TranscriptionSegment {
  id: string;
  speaker: 'provider' | 'patient' | 'unknown';
  text: string;
  startTime: number; // seconds
  endTime: number;
  confidence: number;
  timestamp: Date;
}

export interface TranscriptionSession {
  id: string;
  appointmentId?: number;
  patientId: number;
  providerId: number;
  status: 'active' | 'paused' | 'completed' | 'error';
  startedAt: Date;
  endedAt?: Date;
  segments: TranscriptionSegment[];
  fullTranscript?: string;
  soapNoteId?: number;
  metadata?: Record<string, any>;
}

export interface TranscribeAudioInput {
  audioBuffer: Buffer;
  mimeType: string;
  language?: string;
  prompt?: string;
}

export interface TranscribeResult {
  text: string;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  language: string;
  duration: number;
}

const MEDICAL_CONTEXT_PROMPT = `
Medical consultation transcript. Common terms include:
- Medications: Semaglutide, Tirzepatide, Ozempic, Wegovy, Mounjaro, Metformin
- Conditions: Obesity, Type 2 Diabetes, Hypertension, Hyperlipidemia, GERD
- Measurements: BMI, A1C, blood pressure, heart rate, weight in pounds/kg
- Procedures: injection, subcutaneous, titration, dose adjustment
- Labs: lipid panel, comprehensive metabolic panel, thyroid function
`;

/**
 * Transcribe audio using OpenAI Whisper.
 */
export async function transcribeAudio(input: TranscribeAudioInput): Promise<TranscribeResult> {
  const startTime = Date.now();
  const mimeType = input.mimeType || 'audio/webm';
  const ext = MIME_TO_EXT[mimeType] || 'webm';

  try {
    const openai = getOpenAI();

    const audioFile = new File([new Uint8Array(input.audioBuffer)], `audio.${ext}`, { type: mimeType });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);

    let response: OpenAI.Audio.Transcriptions.TranscriptionVerbose;
    try {
      response = await openai.audio.transcriptions.create(
        {
          file: audioFile,
          model: 'whisper-1',
          language: input.language || 'en',
          prompt: input.prompt || MEDICAL_CONTEXT_PROMPT,
          response_format: 'verbose_json',
          timestamp_granularities: ['segment'],
        },
        { signal: controller.signal },
      );
    } finally {
      clearTimeout(timeout);
    }

    const elapsed = (Date.now() - startTime) / 1000;

    logger.info('Audio transcribed successfully', {
      duration: `${elapsed}s`,
      textLength: response.text.length,
      language: response.language,
    });

    return {
      text: response.text,
      segments: response.segments?.map((seg) => ({
        start: seg.start,
        end: seg.end,
        text: seg.text,
      })),
      language: response.language || 'en',
      duration: response.duration || 0,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    const isAuthError =
      error instanceof OpenAI.APIError && (error.status === 401 || error.status === 403);

    logger.error('Failed to transcribe audio', {
      error: errorMessage,
      isTimeout,
      isAuthError,
      mimeType,
      bufferSize: input.audioBuffer.length,
      elapsedMs: Date.now() - startTime,
    });

    if (isTimeout) {
      throw new Error('Transcription timed out after 25 seconds. Try a shorter audio clip.');
    }
    if (isAuthError) {
      _openai = null;
      throw new Error('OpenAI API authentication failed. Check OPENAI_API_KEY configuration.');
    }
    throw new Error(`Transcription failed: ${errorMessage}`);
  }
}

/**
 * Simple speaker diarization based on turn-taking patterns
 * For production, consider using a dedicated diarization service
 */
export function detectSpeakers(
  segments: Array<{ start: number; end: number; text: string }>,
  providerName?: string,
  patientName?: string
): TranscriptionSegment[] {
  const result: TranscriptionSegment[] = [];
  let currentSpeaker: 'provider' | 'patient' | 'unknown' = 'provider';
  let segmentIndex = 0;

  // Heuristics for speaker detection
  const providerIndicators = [
    'how are you',
    'let me',
    'i recommend',
    'your dose',
    'we should',
    'the medication',
    'your weight',
    'your blood pressure',
    'any side effects',
    'follow up',
    'prescription',
    "i'm going to",
    "we'll",
  ];

  const patientIndicators = [
    'i feel',
    "i've been",
    'i noticed',
    'my weight',
    'i had',
    'it hurts',
    "i'm experiencing",
    'i took',
    'i forgot',
    'thank you',
    'okay',
    'yes',
    'no',
    'i think',
    "i don't",
  ];

  for (const segment of segments) {
    const lowerText = segment.text.toLowerCase().trim();

    // Detect speaker based on content
    const providerScore = providerIndicators.filter((ind) => lowerText.includes(ind)).length;
    const patientScore = patientIndicators.filter((ind) => lowerText.includes(ind)).length;

    // Check for name mentions
    if (providerName && lowerText.includes(providerName.toLowerCase())) {
      currentSpeaker = 'patient'; // Patient referring to provider
    } else if (patientName && lowerText.includes(patientName.toLowerCase())) {
      currentSpeaker = 'provider'; // Provider referring to patient
    } else if (providerScore > patientScore) {
      currentSpeaker = 'provider';
    } else if (patientScore > providerScore) {
      currentSpeaker = 'patient';
    }
    // Otherwise keep the current speaker (conversation flow)

    result.push({
      id: `seg-${segmentIndex++}`,
      speaker: currentSpeaker,
      text: segment.text.trim(),
      startTime: segment.start,
      endTime: segment.end,
      confidence: 0.85, // Base confidence
      timestamp: new Date(),
    });

    // Alternate speaker on significant pauses or question marks
    if (segment.text.includes('?') || segments[segmentIndex]?.start - segment.end > 2) {
      currentSpeaker = currentSpeaker === 'provider' ? 'patient' : 'provider';
    }
  }

  return result;
}

/**
 * Create a new transcription session
 */
export async function createTranscriptionSession(
  appointmentId: number | undefined,
  patientId: number,
  providerId: number,
  clinicId?: number
): Promise<TranscriptionSession> {
  const sessionId = `scribe-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const session: TranscriptionSession = {
    id: sessionId,
    appointmentId,
    patientId,
    providerId,
    status: 'active',
    startedAt: new Date(),
    segments: [],
  };

  await prisma.aIConversation.create({
    data: {
      sessionId,
      patientId,
      ...(clinicId ? { clinicId } : {}),
      userEmail: `provider-${providerId}`,
      isActive: true,
      lastMessageAt: new Date(),
    },
  });

  logger.info('Transcription session created', {
    sessionId,
    patientId,
    providerId,
    appointmentId,
    clinicId,
  });

  return session;
}

/**
 * Add transcription segment to session
 */
export async function addSegmentToSession(
  sessionId: string,
  segment: TranscriptionSegment
): Promise<void> {
  // Store as AI message for now
  const conversation = await prisma.aIConversation.findFirst({
    where: { sessionId },
  });

  if (!conversation) {
    throw new Error('Session not found');
  }

  await prisma.aIMessage.create({
    data: {
      conversationId: conversation.id,
      role: segment.speaker === 'provider' ? 'assistant' : 'user',
      content: segment.text,
      queryType: 'transcription',
      citations: {
        speaker: segment.speaker,
        startTime: segment.startTime,
        endTime: segment.endTime,
        confidence: segment.confidence,
      },
    },
  });

  // Update last message time
  await prisma.aIConversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });
}

/**
 * Complete a transcription session and generate full transcript
 */
export async function completeSession(sessionId: string): Promise<{
  transcript: string;
  segments: TranscriptionSegment[];
  duration: number;
}> {
  const conversation = await prisma.aIConversation.findFirst({
    where: { sessionId },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!conversation) {
    throw new Error('Session not found');
  }

  // Build segments from messages
  const segments: TranscriptionSegment[] = conversation.messages
    .filter((m: any) => m.queryType === 'transcription')
    .map(
      (m: any, idx: number) => {
        const citations = (m.citations as any) || {};
        return {
          id: `seg-${idx}`,
          speaker: citations.speaker || (m.role === 'assistant' ? 'provider' : 'patient'),
          text: m.content,
          startTime: citations.startTime || idx * 10,
          endTime: citations.endTime || (idx + 1) * 10,
          confidence: citations.confidence || 0.85,
          timestamp: m.createdAt,
        };
      }
    );

  // Build formatted transcript
  const transcript = segments
    .map((seg) => `[${seg.speaker.toUpperCase()}]: ${seg.text}`)
    .join('\n\n');

  // Calculate duration
  const duration =
    segments.length > 0 ? segments[segments.length - 1].endTime - segments[0].startTime : 0;

  // Mark session as completed
  await prisma.aIConversation.update({
    where: { id: conversation.id },
    data: { isActive: false },
  });

  logger.info('Transcription session completed', {
    sessionId,
    segmentCount: segments.length,
    duration,
  });

  return { transcript, segments, duration };
}

/**
 * Get active transcription session
 */
export async function getActiveSession(sessionId: string): Promise<{
  session: any;
  segments: TranscriptionSegment[];
} | null> {
  const conversation = await prisma.aIConversation.findFirst({
    where: { sessionId, isActive: true },
    include: {
      messages: {
        where: { queryType: 'transcription' },
        orderBy: { createdAt: 'asc' },
      },
      patient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  if (!conversation) {
    return null;
  }

  const segments: TranscriptionSegment[] = conversation.messages.map(
    (m: any, idx: number) => {
      const citations = (m.citations as any) || {};
      return {
        id: `seg-${idx}`,
        speaker: citations.speaker || (m.role === 'assistant' ? 'provider' : 'patient'),
        text: m.content,
        startTime: citations.startTime || idx * 10,
        endTime: citations.endTime || (idx + 1) * 10,
        confidence: citations.confidence || 0.85,
        timestamp: m.createdAt,
      };
    }
  );

  return {
    session: conversation,
    segments,
  };
}
