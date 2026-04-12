/**
 * AI Scribe - Transcription API
 *
 * Handles audio transcription requests
 */

import { NextRequest, NextResponse } from 'next/server';
import { withProviderAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import {
  transcribeAudio,
  detectSpeakers,
  createTranscriptionSession,
  addSegmentToSession,
  completeSession,
  getActiveSession,
} from '@/lib/ai-scribe/transcription.service';
import { prisma } from '@/lib/db';
import { decryptPHI } from '@/lib/security/phi-encryption';

const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25 MB — OpenAI Whisper limit

/**
 * POST /api/ai-scribe/transcribe
 * Transcribe audio chunk or complete audio file
 */
export const POST = withProviderAuth(async (req: NextRequest, user) => {
  try {
    const contentType = req.headers.get('content-type') || '';
    console.error('[SCRIBE_DIAG] handler entered', { contentType: contentType.slice(0, 60), userId: user.id, method: req.method });

    // Handle multipart form data (audio file upload)
    if (contentType.includes('multipart/form-data')) {
      console.error('[SCRIBE_DIAG] parsing formData...');
      let formData: globalThis.FormData;
      try {
        formData = (await req.formData()) as unknown as globalThis.FormData;
        console.error('[SCRIBE_DIAG] formData parsed OK');
      } catch (parseErr) {
        console.error('[SCRIBE_DIAG] formData FAILED', { error: parseErr instanceof Error ? parseErr.message : String(parseErr) });
        return NextResponse.json({ error: 'Failed to parse audio upload', details: parseErr instanceof Error ? parseErr.message : String(parseErr) }, { status: 500 });
      }
      const audioFile = formData.get('audio') as Blob | null;
      const sessionId = formData.get('sessionId') as string;
      const patientId = formData.get('patientId') as string;
      const providerId = formData.get('providerId') as string;
      const isChunk = formData.get('isChunk') === 'true';

      if (!audioFile || !(audioFile instanceof Blob)) {
        return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
      }

      if (audioFile.size > MAX_AUDIO_SIZE) {
        return NextResponse.json(
          { error: `Audio file too large (${Math.round(audioFile.size / 1024 / 1024)}MB). Max is 25MB.` },
          { status: 400 },
        );
      }

      if (providerId && Number(providerId) !== (user.providerId ?? user.id)) {
        return NextResponse.json({ error: 'Provider ID mismatch' }, { status: 403 });
      }

      const arrayBuffer = await audioFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      let providerName: string | undefined;
      let patientName: string | undefined;

      try {
        if (providerId) {
          const provider = await prisma.provider.findUnique({
            where: { id: parseInt(providerId) },
            select: { firstName: true, lastName: true },
          });
          if (provider) {
            providerName = `${provider.firstName} ${provider.lastName}`;
          }
        }

        if (patientId) {
          const patient = await prisma.patient.findUnique({
            where: { id: parseInt(patientId) },
            select: { firstName: true, lastName: true },
          });
          if (patient) {
            const firstName = decryptPHI(patient.firstName) ?? patient.firstName;
            const lastName = decryptPHI(patient.lastName) ?? patient.lastName;
            patientName = `${firstName} ${lastName}`;
          }
        }
      } catch {
        // Name lookups are optional hints for speaker diarization —
        // transcription works fine without them.
      }

      console.error('[SCRIBE_DIAG] calling transcribeAudio', { bufferSize: buffer.length, mimeType: audioFile.type || 'audio/webm' });
      const result = await transcribeAudio({
        audioBuffer: buffer,
        mimeType: audioFile.type || 'audio/webm',
      });
      console.error('[SCRIBE_DIAG] transcribeAudio OK', { textLen: result.text?.length, segCount: result.segments?.length });

      const segments = result.segments
        ? detectSpeakers(result.segments, providerName, patientName)
        : [];

      if (sessionId && isChunk) {
        console.error('[SCRIBE_DIAG] saving segments', { sessionId, count: segments.length });
        for (const segment of segments) {
          await addSegmentToSession(sessionId, segment);
        }
        console.error('[SCRIBE_DIAG] segments saved OK');
      }

      return NextResponse.json({
        success: true,
        text: result.text,
        segments,
        language: result.language,
        duration: result.duration,
      });
    }

    // Handle JSON request (session management)
    const body = await req.json();
    const { action, sessionId, patientId, providerId, appointmentId } = body;

    if (providerId && Number(providerId) !== (user.providerId ?? user.id)) {
      return NextResponse.json({ error: 'Provider ID mismatch' }, { status: 403 });
    }

    switch (action) {
      case 'start':
        if (!patientId || !providerId) {
          return NextResponse.json(
            { error: 'patientId and providerId are required' },
            { status: 400 },
          );
        }

        const session = await createTranscriptionSession(appointmentId, patientId, providerId, user.clinicId ?? undefined);

        return NextResponse.json(
          {
            success: true,
            session: {
              id: session.id,
              status: session.status,
              startedAt: session.startedAt,
            },
          },
          { status: 201 },
        );

      case 'status':
        if (!sessionId) {
          return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
        }

        const activeSession = await getActiveSession(sessionId);
        if (!activeSession) {
          return NextResponse.json({ error: 'Session not found or not active' }, { status: 404 });
        }

        return NextResponse.json({
          success: true,
          session: activeSession.session,
          segments: activeSession.segments,
          segmentCount: activeSession.segments.length,
        });

      case 'complete':
        if (!sessionId) {
          return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
        }

        const completed = await completeSession(sessionId);

        return NextResponse.json({
          success: true,
          transcript: completed.transcript,
          segments: completed.segments,
          duration: completed.duration,
        });

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use "start", "status", or "complete"' },
          { status: 400 },
        );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorName = error instanceof Error ? error.constructor.name : 'Unknown';

    const isConfig = errorMessage.includes('OPENAI_API_KEY') || errorMessage.includes('Missing credentials');
    const isTenant = errorMessage.includes('Tenant context');
    const isTimeout = errorMessage.includes('timed out');
    const status = isConfig ? 503 : isTimeout ? 504 : 500;

    logger.error('AI Scribe transcription error', {
      error: errorMessage,
      errorName,
      status,
      userId: user.id,
      isTenantError: isTenant,
      stack: error instanceof Error ? error.stack?.split('\n').slice(0, 4).join(' | ') : undefined,
    });

    return NextResponse.json(
      { error: 'Transcription failed', details: errorMessage },
      { status },
    );
  }
});

/**
 * GET /api/ai-scribe/transcribe
 * Get transcription session info
 */
export const GET = withProviderAuth(async (req: NextRequest, user) => {
  try {
    const searchParams = req.nextUrl.searchParams;
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    const session = await getActiveSession(sessionId);

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      session: session.session,
      segments: session.segments,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get transcription session', { error: errorMessage });
    return NextResponse.json({ error: 'Failed to get session' }, { status: 500 });
  }
});
