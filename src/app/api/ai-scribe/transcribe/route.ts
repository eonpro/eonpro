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

/**
 * POST /api/ai-scribe/transcribe
 * Transcribe audio chunk or complete audio file
 */
export const POST = withProviderAuth(async (req: NextRequest, user) => {
  try {
    const contentType = req.headers.get('content-type') || '';

    // Handle multipart form data (audio file upload)
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const audioFile = formData.get('audio') as File;
      const sessionId = formData.get('sessionId') as string;
      const patientId = formData.get('patientId') as string;
      const providerId = formData.get('providerId') as string;
      const isChunk = formData.get('isChunk') === 'true';

      if (!audioFile) {
        return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
      }

      // Convert file to buffer
      const arrayBuffer = await audioFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Get patient and provider names for speaker detection
      let providerName: string | undefined;
      let patientName: string | undefined;

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
          patientName = `${patient.firstName} ${patient.lastName}`;
        }
      }

      // Transcribe audio
      const result = await transcribeAudio({
        audioBuffer: buffer,
        mimeType: audioFile.type,
      });

      // Detect speakers
      const segments = result.segments
        ? detectSpeakers(result.segments, providerName, patientName)
        : [];

      // If this is part of a session, add to session
      if (sessionId && isChunk) {
        for (const segment of segments) {
          await addSegmentToSession(sessionId, segment);
        }
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

    switch (action) {
      case 'start':
        // Start a new transcription session
        if (!patientId || !providerId) {
          return NextResponse.json(
            { error: 'patientId and providerId are required' },
            { status: 400 }
          );
        }

        const session = await createTranscriptionSession(appointmentId, patientId, providerId);

        return NextResponse.json(
          {
            success: true,
            session: {
              id: session.id,
              status: session.status,
              startedAt: session.startedAt,
            },
          },
          { status: 201 }
        );

      case 'status':
        // Get session status
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
        // Complete and get full transcript
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
          { status: 400 }
        );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('AI Scribe transcription error', { error: errorMessage });
    return NextResponse.json(
      { error: 'Transcription failed', details: errorMessage },
      { status: 500 }
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
